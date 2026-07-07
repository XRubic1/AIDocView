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
import { lookupArRatePct, PLATFORM_APP_FEE_MONTHLY } from '../config/arBillingRates'
import { createClient, updateClient } from '../services/clientRegistry'
import {
  computeMonthlyBill,
  formatBillingPeriod,
  getClientCollectedVolume,
} from '../services/arBillingService'

describe('arBillingService', () => {
  let clientId = ''

  beforeEach(async () => {
    clearInvoices()
    clearPayments()
    const client = await createClient({
      name: 'Test Carrier',
      service_tier: 'self_service',
      status: 'active',
    })
    clientId = client.id
    if (client.billing) {
      await updateClient(clientId, {
        billing: { ...client.billing, subscription_status: 'active' },
      })
    }
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

  it('computes monthly bill with platform fee and AR rate', () => {
    const bill = computeMonthlyBill(clientId, { year: 2026, month: 6 })
    const expectedRate = lookupArRatePct(5000, false)
    expect(bill.collectedVolume).toBe(5000)
    expect(bill.appFee).toBe(PLATFORM_APP_FEE_MONTHLY)
    expect(bill.arFee).toBeCloseTo((expectedRate / 100) * 5000, 2)
    expect(bill.total).toBeCloseTo(PLATFORM_APP_FEE_MONTHLY + bill.arFee, 2)
    expect(formatBillingPeriod({ year: 2026, month: 6 })).toBe('2026-06')
  })
})
