import { describe, expect, it } from 'vitest'
import {
  getInvoiceAppliedForVariance,
  isShortPaymentInvoice,
  listShortPayments,
} from './shortPayments'
import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'

function inv(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-2305',
    invoice_number: '2305',
    client_id: 'c1',
    client_name: 'Demo',
    broker_id: 'b1',
    broker_name: 'TQL',
    amount: 3000,
    invoice_date: '2026-07-01',
    due_date: '2026-07-30',
    expected_payment_date: '2026-07-30',
    status: 'approved',
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  }
}

function pay(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'pay-1',
    invoice_id: 'inv-2305',
    invoice_number: '2305',
    broker_name: 'TQL',
    amount: 2550,
    payment_date: '2026-07-28',
    received_date: '2026-07-28',
    payment_method: 'ach',
    status: 'awaiting_receipt',
    payment_kind: 'normal',
    ...overrides,
  }
}

describe('shortPayments — list all variances', () => {
  it('includes partial remittance awaiting confirmation', () => {
    const invoice = inv()
    const payments = [pay()]
    expect(getInvoiceAppliedForVariance(invoice, payments)).toBe(2550)
    expect(isShortPaymentInvoice(invoice, payments)).toBe(true)
    const rows = listShortPayments([invoice], payments)
    expect(rows).toHaveLength(1)
    expect(rows[0].shortfall_amount).toBe(450)
  })

  it('excludes unpaid open invoices with no remittance', () => {
    expect(isShortPaymentInvoice(inv(), [])).toBe(false)
    expect(listShortPayments([inv()], [])).toHaveLength(0)
  })

  it('includes confirmed short pays', () => {
    const invoice = inv()
    const payments = [pay({ status: 'confirmed', amount: 2000 })]
    const rows = listShortPayments([invoice], payments)
    expect(rows).toHaveLength(1)
    expect(rows[0].shortfall_amount).toBe(1000)
  })
})
