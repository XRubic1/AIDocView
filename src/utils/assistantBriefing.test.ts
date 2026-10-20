import { describe, expect, it } from 'vitest'
import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import { buildAssistantBriefing, estimatePayDate, buildBrokerInsights } from './assistantBriefing'

const TODAY = new Date(2026, 9, 20) // Oct 20, 2026

function inv(partial: Partial<Invoice> & Pick<Invoice, 'id' | 'invoice_number'>): Invoice {
  return {
    client_id: 'c1',
    client_name: 'Test Carrier',
    broker_id: 'b1',
    broker_name: 'ECHO',
    amount: 1000,
    invoice_date: '2026-10-17',
    status: 'approved',
    created_at: '2026-10-17T00:00:00Z',
    ...partial,
  } as Invoice
}

function paid(id: string, invoiceDate: string, paidOn: string, due?: string) {
  const invoice = inv({ id, invoice_number: id, status: 'paid', invoice_date: invoiceDate, due_date: due, amount: 500 })
  const payment = {
    id: `p-${id}`,
    invoice_id: id,
    invoice_number: id,
    broker_name: 'ECHO',
    amount: 500,
    payment_date: paidOn,
    received_date: paidOn,
    payment_method: 'ach',
    status: 'confirmed',
  } as Payment
  return { invoice, payment }
}

describe('assistant briefing', () => {
  it('asks the carrier to upload when docs are missing, and says why', () => {
    const b = buildAssistantBriefing(
      [inv({ id: 'a', invoice_number: '002', status: 'hold', hold_reason: 'Missing BOL page 2', amount: 4100 })],
      [],
      TODAY
    )
    expect(b.items[0]).toMatchObject({ kind: 'docs_needed', owner: 'you', action: { type: 'upload' } })
    expect(b.totals.waitingOnYouAmount).toBe(4100)
    expect(b.headline).toMatch(/need.*you today/)
  })

  it('does not ask for action when Credyx is reviewing', () => {
    const b = buildAssistantBriefing(
      [inv({ id: 'a', invoice_number: '001', status: 'hold', hold_reason: 'Rate mismatch under review' })],
      [],
      TODAY
    )
    expect(b.items[0].owner).toBe('credyx')
    expect(b.totals.needsYouCount).toBe(0)
    expect(b.headline).toBe('Nothing needed from you right now')
  })

  it('never reads internal notes', () => {
    const b = buildAssistantBriefing(
      [
        inv({
          id: 'a',
          invoice_number: '009',
          status: 'hold',
          notes_history: [
            {
              id: 'n1',
              note: 'INTERNAL: broker is a fraud risk',
              created_by: 'admin',
              created_at: '2026-10-18T00:00:00Z',
              type: 'hold_reason',
              visibility: 'internal',
            },
          ],
        }),
      ],
      [],
      TODAY
    )
    const text = JSON.stringify(b)
    expect(text).not.toMatch(/fraud/i)
  })

  it('uses a confirmed broker pay date with high confidence', () => {
    const est = estimatePayDate(
      inv({ id: 'a', invoice_number: '1', collection_status: 'W/P', collection_date: '2026-11-21' }),
      undefined,
      TODAY
    )
    expect(est).toMatchObject({ date: '2026-11-21', confidence: 'high' })
  })

  it('learns how a broker pays from history', () => {
    const rows = [paid('p1', '2026-08-01', '2026-08-21'), paid('p2', '2026-08-10', '2026-08-30')]
    const insights = buildBrokerInsights(
      rows.map((r) => r.invoice),
      rows.map((r) => r.payment)
    )
    expect(insights[0].avgDaysToPay).toBe(20)
    const est = estimatePayDate(
      inv({ id: 'x', invoice_number: 'x', invoice_date: '2026-10-10' }),
      insights[0],
      TODAY
    )
    expect(est).toMatchObject({ date: '2026-10-30', confidence: 'medium' })
  })

  it('keeps held money out of the expected cash', () => {
    const b = buildAssistantBriefing(
      [
        inv({ id: 'a', invoice_number: '1', amount: 1000, expected_payment_date: '2026-10-25' }),
        inv({ id: 'b', invoice_number: '2', amount: 4000, status: 'hold', hold_reason: 'Missing POD', expected_payment_date: '2026-10-25' }),
      ],
      [],
      TODAY
    )
    expect(b.forecast[0].expected).toBe(1000)
    expect(b.forecast[0].onHold).toBe(4000)
    expect(b.totals.expectedNext7Days).toBe(1000)
  })

  it('asks the carrier to confirm a posted payment', () => {
    const invoice = inv({ id: 'a', invoice_number: '5', amount: 800 })
    const payment = {
      id: 'pay1',
      invoice_id: 'a',
      invoice_number: '5',
      broker_name: 'ECHO',
      amount: 800,
      payment_date: '2026-10-19',
      received_date: '2026-10-19',
      payment_method: 'ach',
      status: 'awaiting_receipt',
    } as Payment
    const b = buildAssistantBriefing([invoice], [payment], TODAY)
    expect(b.items.some((i) => i.kind === 'confirm_payment' && i.owner === 'you')).toBe(true)
  })
})
