import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as tenantPersist from '../services/supabase/tenantPersist'
import { hydrateBrokers } from '../data/mockBrokers'
import { hydrateInvoices } from '../data/mockInvoices'
import { linkPendingInvoicesToBroker } from '../services/linkPendingNewBroker'
import type { Invoice } from '../types/invoice'
import { getInvoiceById } from '../data/mockInvoices'
import {
  listPendingNewBrokers,
  normalizeBrokerNameKey,
  STANDARD_NEW_BROKER_PAY_TERMS_DAYS,
} from './pendingNewBrokers'

function stubInvoice(
  partial: Partial<Invoice> & Pick<Invoice, 'id' | 'invoice_number' | 'broker_name'>
): Invoice {
  return {
    client_id: 'client-a',
    client_name: 'Alpha Carrier',
    broker_id: '',
    amount: 1000,
    invoice_date: '2026-03-01',
    status: 'pending',
    created_at: '2026-03-01T00:00:00Z',
    ...partial,
  }
}

describe('listPendingNewBrokers', () => {
  it('groups loads whose broker is not in the directory', () => {
    const items = listPendingNewBrokers(
      [
        stubInvoice({ id: '1', invoice_number: '100', broker_name: 'acme freight' }),
        stubInvoice({
          id: '2',
          invoice_number: '101',
          broker_name: 'ACME FREIGHT',
          client_name: 'Beta Carrier',
          client_id: 'client-b',
          amount: 500,
        }),
        stubInvoice({
          id: '3',
          invoice_number: '102',
          broker_name: 'TQL',
          broker_id: 'broker-tql',
        }),
      ],
      [{ id: 'broker-tql', name: 'TQL' }]
    )

    expect(items).toHaveLength(1)
    expect(items[0].name).toBe('acme freight')
    expect(items[0].loadCount).toBe(2)
    expect(items[0].totalAmount).toBe(1500)
    expect(items[0].clientNames).toEqual(['Alpha Carrier', 'Beta Carrier'])
  })

  it('keeps unlinked loads when the name already matches the catalog', () => {
    const items = listPendingNewBrokers(
      [stubInvoice({ id: '1', invoice_number: '100', broker_name: 'landstar ranger' })],
      [{ id: 'broker-landstar', name: 'LANDSTAR RANGER' }]
    )
    expect(items).toHaveLength(1)
    expect(items[0].catalogMatch).toEqual({ id: 'broker-landstar', name: 'LANDSTAR RANGER' })
    expect(normalizeBrokerNameKey('  landstar   ranger ')).toBe('LANDSTAR RANGER')
  })
})

describe('linkPendingInvoicesToBroker', () => {
  beforeEach(() => {
    hydrateBrokers([])
    hydrateInvoices([])
    vi.spyOn(tenantPersist, 'persistInvoice').mockResolvedValue(undefined)
  })

  it('attaches matching loads and stamps Net 30 from the invoice date', async () => {
    hydrateInvoices([
      stubInvoice({ id: 'inv-1', invoice_number: '100', broker_name: 'New Haul Co' }),
      stubInvoice({
        id: 'inv-2',
        invoice_number: '101',
        broker_name: 'Already Known',
        broker_id: 'broker-known',
      }),
    ])

    const linked = await linkPendingInvoicesToBroker({
      requestedName: 'new haul co',
      broker: {
        id: 'broker-new',
        name: 'NEW HAUL CO',
        payment_terms_days: STANDARD_NEW_BROKER_PAY_TERMS_DAYS,
      },
    })

    expect(linked).toBe(1)
    const updated = getInvoiceById('inv-1')
    expect(updated?.broker_id).toBe('broker-new')
    expect(updated?.broker_name).toBe('NEW HAUL CO')
    expect(updated?.due_date).toBe('2026-03-31')
    expect(updated?.expected_payment_date).toBe('2026-03-31')
    expect(getInvoiceById('inv-2')?.broker_id).toBe('broker-known')
  })
})
