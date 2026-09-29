import { describe, expect, it } from 'vitest'
import type { Invoice } from '../types/invoice'
import { STANDARD_BROKER_PACKET } from '../../supabase/functions/_shared/standardBlueprints'
import { getCarrierInvoiceJourney } from './carrierInvoiceJourney'
import { isInvoiceListUrgent } from './invoiceListUrgent'

function invoice(over: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    invoice_number: 'INV-1',
    client_id: 'c1',
    client_name: 'Carrier',
    broker_id: 'b1',
    broker_name: 'Broker',
    amount: 1000,
    status: 'approved',
    invoice_date: '2026-01-01',
    due_date: '2026-01-31',
    created_at: '2026-01-01T00:00:00.000Z',
    documents_count: 1,
    ...over,
  }
}

describe('hands-off invoice path', () => {
  it('sends the paperwork packet from system@credyx.net', () => {
    const node = STANDARD_BROKER_PACKET.nodes.find((item) => item.id === 'n-packet')
    const cfg = (node?.data.actionConfigs as { email_broker_packet?: { fromEmail?: string } } | undefined)
      ?.email_broker_packet
    expect(cfg?.fromEmail).toBe('system@credyx.net')
  })

  it('shows the carrier each step without changing the invoice status', () => {
    const open = invoice({
      document_send_history: [
        { email_address: 'ap@broker.test', sent_at: '2026-01-02T00:00:00.000Z', status: 'sent', sent_by: 'Credyx', documents_sent: ['ppw.pdf'] },
      ],
      email_lifecycle: { paperwork_status: 'good' },
    })
    const journey = getCarrierInvoiceJourney(open)
    expect(open.status).toBe('approved')
    expect(journey.steps.map((step) => step.state)).toEqual(['done', 'done', 'current', 'upcoming'])
    expect(journey.headline).toMatch(/2026-01-31/)
  })

  it('marks Urgent beside an open invoice when the broker net date is long past', () => {
    const open = invoice({
      due_date: '2020-01-01',
      document_send_history: [
        { email_address: 'ap@broker.test', sent_at: '2020-01-02T00:00:00.000Z', status: 'sent', sent_by: 'Credyx', documents_sent: ['ppw.pdf'] },
      ],
      email_lifecycle: { paperwork_status: 'good' },
    })
    expect(isInvoiceListUrgent(open)).toBe(true)
    expect(open.status).toBe('approved')
  })

  it('does not mark a paid invoice urgent', () => {
    const paid = invoice({
      status: 'paid',
      due_date: '2020-01-01',
      collections_needs_attention: true,
    })
    expect(isInvoiceListUrgent(paid)).toBe(false)
    expect(paid.status).toBe('paid')
  })
})
