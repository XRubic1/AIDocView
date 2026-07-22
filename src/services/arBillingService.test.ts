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
  getClientCollectedVolume,
  issueClientBill,
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
        fee_terms: {
          fee_type: 'percentage',
          fee_percentage: FEE_PCT,
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

  it('computes monthly bill from locked invoice fee terms', () => {
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

  it('waives platform fee while client is on trial but still charges billable locked invoices', async () => {
    await updateClient(clientId, {
      billing: {
        ...(getClientById(clientId)?.billing as NonNullable<ReturnType<typeof getClientById>>['billing']),
        subscription_status: 'trial',
      },
    })

    const bill = computeMonthlyBill(clientId, { year: 2026, month: 6 })
    expect(bill.isTrial).toBe(true)
    // Collection fee still due — invoice was locked as billable.
    expect(bill.arFee).toBeCloseTo((FEE_PCT / 100) * 5000, 2)
    expect(bill.total).toBeCloseTo(bill.arFee, 2)
    expect(bill.lineItems.some((li) => li.description.includes('platform fee waived'))).toBe(true)
  })

  it('does not charge collection fees for trial-locked invoices', () => {
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
        fee_terms: {
          fee_type: 'percentage',
          fee_percentage: FEE_PCT,
          billing_mode: 'trial',
          locked_at: '2026-06-01T00:00:00Z',
        },
      },
    ])

    const bill = computeMonthlyBill(clientId, { year: 2026, month: 6 })
    expect(bill.arFee).toBe(0)
    expect(bill.feeDisplay).toBe('Trial')
    expect(bill.total).toBe(PLATFORM_APP_FEE_MONTHLY)
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

  it('requires fee terms on collected invoices when client has none', async () => {
    await updateClient(clientId, { fee_terms: undefined })
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
    expect(() => computeMonthlyBill(clientId, { year: 2026, month: 6 })).toThrow(/Fee terms/)
  })
})
