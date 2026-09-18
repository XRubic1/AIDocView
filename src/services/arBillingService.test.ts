import { describe, expect, it, beforeEach, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: () => false,
  getSupabase: () => null,
  requireSupabase: () => {
    throw new Error('Supabase not configured')
  },
}))

import { hydrateInvoices, clearInvoices } from '../data/mockInvoices'
import { hydratePayments, clearPayments } from '../data/mockPayments'
import { PLATFORM_APP_FEE_MONTHLY } from '../config/arBillingRates'
import { createClient, getClientById, updateClient } from '../services/clientRegistry'
import {
  clearClientBills,
  computeMonthlyBill,
  formatBillingPeriod,
  billingDueAtForPeriod,
  getClientCollectedVolume,
  getPeriodBilledInvoices,
  issueClientBill,
  normalizePaymentUrl,
} from '../services/arBillingService'
import {
  clearReimbursementLedger,
  getReimbursementLedger,
  recordManualBillingCredit,
} from '../services/reimbursementAccountService'

const FEE_PCT = 2.5

describe('arBillingService', () => {
  let clientId = ''

  beforeEach(async () => {
    clearInvoices()
    clearPayments()
    clearClientBills()
    clearReimbursementLedger()
    const client = await createClient({
      name: 'Test Carrier',
      service_tier: 'self_service',
      status: 'active',
    })
    clientId = client.id
    await updateClient(clientId, {
      fee_terms: { fee_type: 'percentage', fee_percentage: FEE_PCT },
      ...(client.billing
        ? { billing: { ...client.billing, subscription_status: 'active' as const } }
        : {}),
    })
    hydrateInvoices([
      {
        id: 'inv-1',
        invoice_number: 'INV-1',
        client_id: clientId,
        client_name: 'Test Carrier',
        broker_id: 'b1',
        broker_name: 'Broker',
        amount: 5000,
        invoice_date: '2026-06-01',
        due_date: '2026-07-01',
        expected_payment_date: '2026-07-01',
        status: 'paid',
        created_at: '2026-06-01T00:00:00Z',
      },
    ])
    hydratePayments([
      {
        id: 'pay-1',
        invoice_id: 'inv-1',
        invoice_number: 'INV-1',
        broker_name: 'Broker',
        amount: 5000,
        payment_date: '2026-06-15',
        received_date: '2026-06-15',
        payment_method: 'ach',
        status: 'confirmed',
        confirmed_at: '2026-06-15T12:00:00Z',
        posted_source: 'credyx',
        posted_by: 'Admin',
      },
    ])
  })

  it('sums confirmed payments in billing period', () => {
    const volume = getClientCollectedVolume(clientId, { year: 2026, month: 6 })
    expect(volume).toBe(5000)
  })

  it('computes monthly bill from client fee_terms', () => {
    const bill = computeMonthlyBill(clientId, { year: 2026, month: 6 })
    const expectedFee = (FEE_PCT / 100) * 5000
    expect(bill.collectedVolume).toBe(5000)
    expect(bill.appFee).toBe(PLATFORM_APP_FEE_MONTHLY)
    expect(bill.ratePct).toBe(FEE_PCT)
    expect(bill.feeDisplay).toBe(`${FEE_PCT}%`)
    expect(bill.arFee).toBeCloseTo(expectedFee, 2)
    expect(bill.total).toBeCloseTo(PLATFORM_APP_FEE_MONTHLY + expectedFee, 2)
    expect(bill.isTrial).toBe(false)
    expect(formatBillingPeriod({ year: 2026, month: 6 })).toBe('2026-06')
  })

  it('omits the $99 software fee when includeAppFee is false', () => {
    const bill = computeMonthlyBill(clientId, { year: 2026, month: 6 }, { includeAppFee: false })
    expect(bill.includeAppFee).toBe(false)
    expect(bill.appFee).toBe(0)
    expect(bill.lineItems.some((li) => li.description.includes('Platform'))).toBe(false)
    expect(bill.total).toBeCloseTo((FEE_PCT / 100) * 5000, 2)
  })

  it('lists paid invoices and marks force-closed loads as closed by Credyx', async () => {
    hydrateInvoices([
      {
        id: 'inv-1',
        invoice_number: 'INV-1',
        client_id: clientId,
        client_name: 'Test Carrier',
        broker_id: 'b1',
        broker_name: 'Broker',
        amount: 5000,
        invoice_date: '2026-06-01',
        due_date: '2026-07-01',
        expected_payment_date: '2026-07-01',
        status: 'paid',
        created_at: '2026-06-01T00:00:00Z',
      },
      {
        id: 'inv-2',
        invoice_number: 'INV-2',
        client_id: clientId,
        client_name: 'Test Carrier',
        broker_id: 'b1',
        broker_name: 'Broker',
        amount: 2000,
        invoice_date: '2026-06-02',
        status: 'force_closed',
        created_at: '2026-06-02T00:00:00Z',
        updated_at: '2026-06-20T00:00:00Z',
      },
    ])

    const rows = getPeriodBilledInvoices(clientId, { year: 2026, month: 6 })
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.invoiceNumber === 'INV-1')?.closedByCredyx).toBe(false)
    expect(rows.find((r) => r.invoiceNumber === 'INV-2')?.closedByCredyx).toBe(true)
  })

  it('shows waived gross fees for trial clients but charges $0', async () => {
    await updateClient(clientId, {
      billing: {
        ...(getClientById(clientId)?.billing as NonNullable<ReturnType<typeof getClientById>>['billing']),
        subscription_status: 'trial',
      },
    })

    const bill = computeMonthlyBill(clientId, { year: 2026, month: 6 })
    expect(bill.isTrial).toBe(true)
    expect(bill.total).toBe(0)
    expect(bill.arFee).toBe(0)
    expect(bill.grossSubtotal).toBeGreaterThan(0)
    expect(bill.lineItems.some((li) => li.description.includes('Trial'))).toBe(true)
  })

  it('applies reimbursement credit on next bill and never goes negative', async () => {
    const before = computeMonthlyBill(clientId, { year: 2026, month: 6 })
    const oversizedCredit = before.total + 25

    await recordManualBillingCredit({
      clientId,
      amount: oversizedCredit,
      creditType: 'invoice_fee_reimbursement',
      reason: 'Fee on invoice that was not closed',
      invoiceId: 'inv-1',
      invoiceNumber: 'INV-1',
    })

    const clientAfterCredit = getClientById(clientId)
    expect(clientAfterCredit?.reimbursement_balance).toBeCloseTo(oversizedCredit, 2)

    const preview = computeMonthlyBill(clientId, { year: 2026, month: 6 })
    expect(preview.total).toBe(0)

    const issued = await issueClientBill(clientId, { year: 2026, month: 6 })
    expect(issued.amount).toBe(0)

    const clientAfterIssue = getClientById(clientId)
    expect(clientAfterIssue?.reimbursement_balance).toBeCloseTo(25, 2)

    const ledger = getReimbursementLedger(clientId)
    expect(ledger.some((e) => e.status === 'applied')).toBe(true)
    expect(ledger.some((e) => e.status === 'pending' && e.fee_credit_amount === 25)).toBe(true)
  })

  it('deducts a small invoice-fee reimbursement from the next bill', async () => {
    await recordManualBillingCredit({
      clientId,
      amount: 5,
      creditType: 'invoice_fee_reimbursement',
      reason: 'Reimburse $5 fee on unclosed invoice',
    })

    const beforeCredit = PLATFORM_APP_FEE_MONTHLY + (FEE_PCT / 100) * 5000
    const preview = computeMonthlyBill(clientId, { year: 2026, month: 6 })
    expect(preview.total).toBeCloseTo(beforeCredit - 5, 2)

    const issued = await issueClientBill(clientId, { year: 2026, month: 6 })
    expect(issued.amount).toBeCloseTo(beforeCredit - 5, 2)
    expect(getClientById(clientId)?.reimbursement_balance).toBe(0)
  })

  it('bills at live client fee even when invoices were locked at a different rate', async () => {
    hydrateInvoices([
      {
        id: 'inv-1',
        invoice_number: 'INV-1',
        client_id: clientId,
        client_name: 'Test Carrier',
        broker_id: 'b1',
        broker_name: 'Broker',
        amount: 10000,
        invoice_date: '2026-06-01',
        due_date: '2026-07-01',
        expected_payment_date: '2026-07-01',
        status: 'paid',
        created_at: '2026-06-01T00:00:00Z',
        fee_terms: {
          fee_type: 'percentage',
          fee_percentage: 1,
          billing_mode: 'billable',
          locked_at: '2026-06-01T00:00:00Z',
        },
      },
    ])
    hydratePayments([
      {
        id: 'pay-1',
        invoice_id: 'inv-1',
        invoice_number: 'INV-1',
        broker_name: 'Broker',
        amount: 10000,
        payment_date: '2026-06-15',
        received_date: '2026-06-15',
        payment_method: 'ach',
        status: 'confirmed',
        confirmed_at: '2026-06-15T12:00:00Z',
        posted_source: 'credyx',
        posted_by: 'Admin',
      },
    ])
    await updateClient(clientId, {
      fee_terms: { fee_type: 'percentage', fee_percentage: 0.6 },
    })

    const bill = computeMonthlyBill(clientId, { year: 2026, month: 6 }, { includeAppFee: false })
    expect(bill.feeDisplay).toBe('0.6%')
    expect(bill.arFee).toBeCloseTo(60, 2)
    expect(bill.lineItems.some((li) => /0\.6%/.test(li.description))).toBe(true)
    expect(bill.lineItems.some((li) => /(?<![\d.])1%/.test(li.description))).toBe(false)
  })

  it('applies feeOverride percentage for the whole period', async () => {
    await updateClient(clientId, {
      fee_terms: { fee_type: 'percentage', fee_percentage: 1 },
    })
    const bill = computeMonthlyBill(clientId, { year: 2026, month: 6 }, {
      includeAppFee: false,
      feeOverride: { fee_type: 'percentage', fee_percentage: 0.6 },
    })
    expect(bill.feeDisplay).toBe('0.6%')
    expect(bill.arFee).toBeCloseTo(30, 2) // 0.6% of 5000
  })

  it('requires fee terms when client has none', async () => {
    await updateClient(clientId, { fee_terms: undefined })
    expect(() => computeMonthlyBill(clientId, { year: 2026, month: 6 })).toThrow(/Fee terms/)
  })

  it('sets pay-by to end of the month after the billing period', async () => {
    // August → September 30
    expect(billingDueAtForPeriod({ year: 2026, month: 8 }).slice(0, 10)).toBe('2026-09-30')
    // September → October 31
    expect(billingDueAtForPeriod({ year: 2026, month: 9 }).slice(0, 10)).toBe('2026-10-31')
    // December → January 31 next year
    expect(billingDueAtForPeriod({ year: 2026, month: 12 }).slice(0, 10)).toBe('2027-01-31')

    const issued = await issueClientBill(clientId, { year: 2026, month: 8 })
    expect(issued.due_at.slice(0, 10)).toBe('2026-09-30')
  })

  it('normalizes payment URLs', () => {
    expect(normalizePaymentUrl('pay.example.com/x')).toBe('https://pay.example.com/x')
    expect(normalizePaymentUrl('https://pay.example.com/x')).toBe('https://pay.example.com/x')
    expect(normalizePaymentUrl('not a url')).toBe('')
    expect(normalizePaymentUrl('')).toBe('')
  })
})
