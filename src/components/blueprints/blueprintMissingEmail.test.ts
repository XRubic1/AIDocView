import { beforeEach, describe, expect, it } from 'vitest'
import { hydrateBrokers } from '../../data/mockBrokers'
import { missingBrokerEmailReason } from './blueprintRunnerActions'
import type { Invoice } from '../../types/invoice'

function invoice(partial: Partial<Invoice>): Invoice {
  return {
    id: 'inv-1',
    invoice_number: '013',
    client_id: 'c1',
    client_name: 'Carrier',
    broker_id: '',
    broker_name: 'ECOGISTICS',
    amount: 3000,
    invoice_date: '2026-10-01',
    status: 'approved',
    created_at: '2026-10-01T00:00:00Z',
    ...partial,
  }
}

describe('missingBrokerEmailReason', () => {
  beforeEach(() => {
    hydrateBrokers([])
  })

  it('explains a broker that is not in the directory', () => {
    expect(missingBrokerEmailReason(invoice({ broker_name: 'ECOGISTICS' }))).toMatch(
      /not in the Credyx directory/i
    )
  })

  it('explains a directory broker with no email', () => {
    hydrateBrokers([{ id: 'b1', name: 'ECOGISTICS' }])
    expect(
      missingBrokerEmailReason(invoice({ broker_id: 'b1', broker_name: 'ECOGISTICS' }))
    ).toMatch(/No broker email on file for ECOGISTICS/i)
  })

  it('is clear when an email is on file', () => {
    hydrateBrokers([{ id: 'b1', name: 'ECOGISTICS', email: 'ap@ecogistics.example' }])
    expect(
      missingBrokerEmailReason(invoice({ broker_id: 'b1', broker_name: 'ECOGISTICS' }))
    ).toBeNull()
  })
})
