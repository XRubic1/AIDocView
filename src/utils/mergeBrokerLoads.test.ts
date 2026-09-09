import { describe, expect, it } from 'vitest'
import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import { reassignLoadsToBroker } from './mergeBrokerLoads'

function invoice(partial: Partial<Invoice> & Pick<Invoice, 'id' | 'broker_id' | 'broker_name'>): Invoice {
  return {
    invoice_number: partial.id,
    client_id: 'c1',
    client_name: 'Carrier One',
    amount: 1000,
    invoice_date: '2026-01-01',
    status: 'pending',
    ...partial,
  } as Invoice
}

function payment(partial: Partial<Payment> & Pick<Payment, 'id' | 'invoice_id' | 'broker_name'>): Payment {
  return {
    invoice_number: partial.invoice_id,
    amount: 1000,
    payment_date: '2026-02-01',
    received_date: '2026-02-01',
    payment_method: 'ach',
    status: 'confirmed',
    ...partial,
  } as Payment
}

describe('reassignLoadsToBroker', () => {
  it('moves invoices and payments from the duplicate onto the keeper', () => {
    const invoices = [
      invoice({ id: 'i1', broker_id: 'ranger-2', broker_name: 'Landstar Ranger 2' }),
      invoice({ id: 'i2', broker_id: 'ranger-2', broker_name: 'Landstar Ranger 2' }),
      invoice({ id: 'i3', broker_id: 'ranger-2', broker_name: 'Landstar Ranger 2' }),
      invoice({ id: 'keep-inv', broker_id: 'ranger', broker_name: 'Landstar Ranger' }),
    ]
    const payments = [
      payment({ id: 'p1', invoice_id: 'i1', broker_name: 'Landstar Ranger 2' }),
      payment({ id: 'p-keep', invoice_id: 'keep-inv', broker_name: 'Landstar Ranger' }),
    ]

    const result = reassignLoadsToBroker(invoices, payments, 'ranger-2', 'Landstar Ranger 2', {
      id: 'ranger',
      name: 'Landstar Ranger',
    })

    expect(result).toEqual({ invoiceCount: 3, paymentCount: 1 })
    expect(invoices.filter((i) => i.broker_id === 'ranger').map((i) => i.id)).toEqual([
      'i1',
      'i2',
      'i3',
      'keep-inv',
    ])
    expect(invoices.every((i) => i.broker_id !== 'ranger-2')).toBe(true)
    expect(payments[0].broker_name).toBe('Landstar Ranger')
    expect(payments[1].broker_name).toBe('Landstar Ranger')
  })

  it('does nothing when source and keeper are the same catalog row', () => {
    const invoices = [invoice({ id: 'i1', broker_id: 'ranger', broker_name: 'Landstar Ranger' })]
    const result = reassignLoadsToBroker(invoices, [], 'ranger', 'Landstar Ranger', {
      id: 'ranger',
      name: 'Landstar Ranger',
    })
    expect(result.invoiceCount).toBe(0)
    expect(invoices[0].broker_id).toBe('ranger')
  })
})
