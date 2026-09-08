import { describe, expect, it } from 'vitest'
import { computeBrokerPaymentHistory, fillMonthSeries } from './brokerPaymentHistory'
import { computeNetworkBrokerPaymentInsights } from './networkBrokerPaymentInsights'
import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import type { Broker } from '../types/broker'

function inv(partial: Partial<Invoice> & Pick<Invoice, 'id' | 'broker_id' | 'broker_name'>): Invoice {
  return {
    invoice_number: partial.id,
    client_id: 'c1',
    client_name: 'Carrier One',
    amount: 1000,
    invoice_date: '2026-01-01',
    status: 'paid',
    ...partial,
  } as Invoice
}

function pay(partial: Partial<Payment> & Pick<Payment, 'id' | 'invoice_id'>): Payment {
  return {
    invoice_number: '1',
    broker_name: 'TQL',
    amount: 1000,
    payment_date: '2026-02-01',
    received_date: '2026-02-01',
    payment_method: 'ach',
    status: 'confirmed',
    ...partial,
  } as Payment
}

describe('brokerPaymentHistory', () => {
  it('computes on-time rate vs Net terms', () => {
    const invoices = [
      inv({ id: 'i1', broker_id: 'b1', broker_name: 'TQL', invoice_date: '2026-01-01' }),
      inv({ id: 'i2', broker_id: 'b1', broker_name: 'TQL', invoice_date: '2026-01-01' }),
    ]
    const payments = [
      pay({ id: 'p1', invoice_id: 'i1', received_date: '2026-01-20' }),
      pay({ id: 'p2', invoice_id: 'i2', received_date: '2026-02-20' }),
    ]
    const history = computeBrokerPaymentHistory('b1', payments, invoices, {
      paymentTermsDays: 30,
      brokerName: 'TQL',
    })
    expect(history.lifetimeCount).toBe(2)
    expect(history.onTimeRate).toBe(50)
    expect(history.months).toHaveLength(2)
  })

  it('excludes hold invoices from avg days to pay', () => {
    const invoices = [
      inv({
        id: 'i1',
        broker_id: 'b1',
        broker_name: 'TQL',
        invoice_date: '2026-01-01',
        status: 'paid',
      }),
      inv({
        id: 'i2',
        broker_id: 'b1',
        broker_name: 'TQL',
        invoice_date: '2026-01-01',
        status: 'hold',
        hold_reason: 'Claim',
      }),
    ]
    const payments = [
      pay({ id: 'p1', invoice_id: 'i1', received_date: '2026-01-20' }),
      pay({ id: 'p2', invoice_id: 'i2', received_date: '2026-06-01' }),
    ]
    const history = computeBrokerPaymentHistory('b1', payments, invoices, {
      paymentTermsDays: 30,
      brokerName: 'TQL',
    })
    expect(history.lifetimeCount).toBe(1)
    expect(history.avgDaysToPay).toBe(19)
    expect(history.holdCount).toBe(1)
    expect(history.pausedInvoiceCount).toBe(1)
  })

  it('fills empty calendar months', () => {
    const filled = fillMonthSeries(
      [{ month: '2026-01', paidAmount: 10, paidCount: 1, avgDaysToPay: 10, onTimeCount: 1, lateCount: 0, onTimeRate: 100 }],
      3,
      new Date('2026-03-15')
    )
    expect(filled.map((m) => m.month)).toEqual(['2026-03', '2026-02', '2026-01'])
    expect(filled[0].paidCount).toBe(0)
    expect(filled[2].paidAmount).toBe(10)
  })
})

describe('networkBrokerPaymentInsights', () => {
  it('rolls the same broker across carriers into one row', () => {
    const invoices = [
      inv({
        id: 'i1',
        broker_id: 'b1',
        broker_name: 'TQL',
        client_id: 'c1',
        client_name: 'Carrier One',
        invoice_date: '2026-01-01',
      }),
      inv({
        id: 'i2',
        broker_id: 'b1',
        broker_name: 'TQL',
        client_id: 'c2',
        client_name: 'Carrier Two',
        invoice_date: '2026-01-01',
      }),
    ]
    const payments = [
      pay({ id: 'p1', invoice_id: 'i1', amount: 800, received_date: '2026-02-01' }),
      pay({ id: 'p2', invoice_id: 'i2', amount: 400, received_date: '2026-02-10' }),
    ]
    const brokers = [
      { id: 'b1', name: 'TQL', payment_terms_days: 30 },
    ] as Broker[]

    const rows = computeNetworkBrokerPaymentInsights(invoices, payments, brokers)
    expect(rows).toHaveLength(1)
    expect(rows[0].carrierCount).toBe(2)
    expect(rows[0].history.lifetimePaid).toBe(1200)
    expect(rows[0].carriers.map((c) => c.clientName).sort()).toEqual([
      'Carrier One',
      'Carrier Two',
    ])
  })

  it('flags a carrier with most loads on hold as an outlier', () => {
    const invoices = Array.from({ length: 8 }, (_, i) =>
      inv({
        id: `h${i}`,
        broker_id: 'b1',
        broker_name: 'TQL',
        client_id: 'c-hold',
        client_name: 'Claim Carrier',
        status: 'hold',
        hold_reason: 'Cargo claim',
        invoice_date: '2026-01-01',
      })
    ).concat([
      inv({
        id: 'ok1',
        broker_id: 'b1',
        broker_name: 'TQL',
        client_id: 'c-ok',
        client_name: 'Normal Carrier',
        status: 'paid',
        invoice_date: '2026-01-01',
      }),
    ])
    const payments = [pay({ id: 'p1', invoice_id: 'ok1', received_date: '2026-01-20' })]
    const brokers = [{ id: 'b1', name: 'TQL', payment_terms_days: 30 }] as Broker[]
    const rows = computeNetworkBrokerPaymentInsights(invoices, payments, brokers)
    expect(rows[0].outlierCarriers).toHaveLength(1)
    expect(rows[0].outlierCarriers[0].clientName).toBe('Claim Carrier')
    expect(rows[0].history.avgDaysToPay).toBe(19)
  })
})
