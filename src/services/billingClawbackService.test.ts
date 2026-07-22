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
import { createClient, updateClient } from '../services/clientRegistry'
import {
  clearClientBills,
  hydrateClientBills,
  issueClientBill,
} from '../services/arBillingService'
import { clearReimbursementLedger } from '../services/reimbursementAccountService'
import {
  approveBillingFeeClawback,
  listBillingFeeClawbackSuggestions,
} from '../services/billingClawbackService'

describe('billingClawbackService', () => {
  let clientId = ''

  beforeEach(async () => {
    clearInvoices()
    clearPayments()
    clearClientBills()
    clearReimbursementLedger()
    const client = await createClient({
      name: 'Clawback Carrier',
      service_tier: 'self_service',
      status: 'active',
    })
    clientId = client.id
    await updateClient(clientId, {
      fee_terms: { fee_type: 'percentage', fee_percentage: 2 },
      billing: client.billing
        ? { ...client.billing, subscription_status: 'active' }
        : undefined,
    })

    hydrateInvoices([
      {
        id: 'inv-c1',
        invoice_number: 'INV-C1',
        client_id: clientId,
        client_name: 'Clawback Carrier',
        broker_id: 'b1',
        broker_name: 'Broker',
        amount: 1000,
        invoice_date: '2026-06-01',
        due_date: '2026-07-01',
        expected_payment_date: '2026-07-01',
        status: 'approved',
        created_at: '2026-06-01T00:00:00Z',
      },
    ])
    hydratePayments([
      {
        id: 'pay-c1',
        invoice_id: 'inv-c1',
        invoice_number: 'INV-C1',
        broker_name: 'Broker',
        amount: 1000,
        payment_date: '2026-06-15',
        received_date: '2026-06-15',
        payment_method: 'ach',
        status: 'reversed',
        confirmed_at: '2026-06-15T12:00:00Z',
        reversed_at: '2026-08-10T12:00:00Z',
        reversal_type: 'unprocessed',
        reversal_reason: 'Broker requested funds returned',
        posted_source: 'credyx',
        posted_by: 'Admin',
      },
    ])
  })

  it('suggests clawback only after Credyx bill for confirm period was issued', async () => {
    expect(listBillingFeeClawbackSuggestions(clientId)).toHaveLength(0)

    await issueClientBill(clientId, { year: 2026, month: 6 })
    // Bill issued_at is "now" which is after reversed_at in fixture — force issued_at earlier.
    hydrateClientBills([
      {
        id: `bill-${clientId}-2026-06`,
        client_id: clientId,
        period: '2026-06',
        issued_at: '2026-07-01T00:00:00Z',
        due_at: '2026-07-31T00:00:00Z',
        amount: 119,
        status: 'paid',
        line_items: [],
        fee_terms_snapshot: { fee_type: 'percentage', fee_percentage: 2 },
      },
    ])

    const suggestions = listBillingFeeClawbackSuggestions(clientId)
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].feeCreditAmount).toBe(20) // 2% of 1000
    expect(suggestions[0].billedFeeLabel).toBe('2%')
    expect(suggestions[0].billedPeriod).toBe('2026-06')
    expect(suggestions[0].reimbursed).toBe(false)
    expect(suggestions[0].systemNote).toMatch(/unprocessed/)
    expect(suggestions[0].systemNote).toMatch(/Fee at bill time: 2%/)
  })

  it('uses fee terms locked on the bill when current Fee Terms change', async () => {
    hydrateClientBills([
      {
        id: `bill-${clientId}-2026-06`,
        client_id: clientId,
        period: '2026-06',
        issued_at: '2026-07-01T00:00:00Z',
        due_at: '2026-07-31T00:00:00Z',
        amount: 119,
        status: 'paid',
        line_items: [],
        fee_terms_snapshot: { fee_type: 'percentage', fee_percentage: 1 },
      },
    ])

    // Current terms changed after the bill — clawback must still use 1%.
    await updateClient(clientId, {
      fee_terms: { fee_type: 'percentage', fee_percentage: 1.25 },
    })

    const suggestions = listBillingFeeClawbackSuggestions(clientId)
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].feeCreditAmount).toBe(10) // 1% of 1000, not 1.25%
    expect(suggestions[0].billedFeeLabel).toBe('1%')
  })

  it('marks suggestion reimbursed after approve', async () => {
    hydrateClientBills([
      {
        id: `bill-${clientId}-2026-06`,
        client_id: clientId,
        period: '2026-06',
        issued_at: '2026-07-01T00:00:00Z',
        due_at: '2026-07-31T00:00:00Z',
        amount: 119,
        status: 'paid',
        line_items: [],
        fee_terms_snapshot: { fee_type: 'percentage', fee_percentage: 2 },
      },
    ])

    const [suggestion] = listBillingFeeClawbackSuggestions(clientId)
    await approveBillingFeeClawback(suggestion.id)
    const after = listBillingFeeClawbackSuggestions(clientId)
    expect(after[0].reimbursed).toBe(true)
  })
})
