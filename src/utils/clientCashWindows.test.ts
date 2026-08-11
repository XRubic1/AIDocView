import { describe, expect, it } from 'vitest'
import type { Invoice } from '../types/invoice'
import {
  buildComingDueWindows,
  buildConfirmedPaidWindows,
  hasBrokerConfirmedPayDate,
} from './clientCashWindows'

function ymdOffset(days: number): string {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function invoice(partial: Partial<Invoice> & Pick<Invoice, 'id' | 'invoice_number'>): Invoice {
  return {
    client_id: 'c1',
    client_name: 'Carrier',
    broker_id: 'b1',
    broker_name: 'AGL GROUP',
    amount: 1000,
    invoice_date: ymdOffset(-20),
    status: 'approved',
    created_at: new Date().toISOString(),
    ...partial,
  }
}

describe('clientCashWindows', () => {
  it('treats Will Pay as a confirmed pay date', () => {
    expect(
      hasBrokerConfirmedPayDate({ collection_status: 'W/P', collection_date: ymdOffset(8) })
    ).toBe(true)
    expect(hasBrokerConfirmedPayDate({ collection_status: 'C/B', collection_date: ymdOffset(8) })).toBe(
      false
    )
  })

  it('keeps due-date invoices in coming due and moves Will Pay out', () => {
    const dueSoon = invoice({
      id: 'due',
      invoice_number: 'DUE-1',
      due_date: ymdOffset(5),
      amount: 400,
    })
    const willPay = invoice({
      id: 'wp',
      invoice_number: '1111',
      due_date: ymdOffset(5),
      collection_status: 'W/P',
      collection_date: ymdOffset(8),
      amount: 900,
    })

    const coming = buildComingDueWindows([dueSoon, willPay], [])
    const confirmed = buildConfirmedPaidWindows([dueSoon, willPay], [])

    expect(coming.items.map((i) => i.invoiceNumber)).toEqual(['DUE-1'])
    expect(coming.next7.count).toBe(1)
    expect(coming.next7.amount).toBe(400)

    expect(confirmed.items.map((i) => i.invoiceNumber)).toEqual(['1111'])
    expect(confirmed.next14.count).toBe(1)
    expect(confirmed.next14.amount).toBe(900)
    expect(confirmed.next7.count).toBe(0)
  })
})
