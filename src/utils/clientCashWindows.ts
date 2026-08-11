import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import { AMOUNT_EPSILON, getInvoiceOpenArBalance } from './paymentVariance'

export type CashWindowBucket = {
  amount: number
  count: number
}

export type ComingDueItem = {
  id: string
  invoiceNumber: string
  brokerName: string
  amount: number
  expectedDate: string
  daysOut: number
}

export type ConfirmedPaidItem = {
  id: string
  invoiceNumber: string
  brokerName: string
  amount: number
  payDate: string
  daysOut: number
}

function startOfDayMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function parseDayMs(raw: string | undefined): number | null {
  if (!raw) return null
  const day = startOfDayMs(new Date(raw))
  return Number.isNaN(day) ? null : day
}

/** Broker confirmed a pay date (Will Pay) — invoice leaves Coming due. */
export function hasBrokerConfirmedPayDate(
  invoice: Pick<Invoice, 'collection_status' | 'collection_date'>
): boolean {
  return invoice.collection_status === 'W/P' && Boolean(invoice.collection_date)
}

function emptyWindows() {
  return {
    next7: { amount: 0, count: 0 },
    next14: { amount: 0, count: 0 },
    next30: { amount: 0, count: 0 },
  }
}

function bucketByDaysOut(
  dayMs: number,
  today: number,
  end7: number,
  end14: number,
  end30: number,
  amount: number,
  acc: { next7: CashWindowBucket; next14: CashWindowBucket; next30: CashWindowBucket }
): number | null {
  if (dayMs < today || dayMs > end30) return null
  const daysOut = Math.round((dayMs - today) / (24 * 60 * 60 * 1000))
  acc.next30.amount += amount
  acc.next30.count += 1
  if (dayMs <= end14) {
    acc.next14.amount += amount
    acc.next14.count += 1
  }
  if (dayMs <= end7) {
    acc.next7.amount += amount
    acc.next7.count += 1
  }
  return daysOut
}

/**
 * Open A/R coming due in the next 7 / 14 / 30 days — due date only.
 * Invoices with a broker-confirmed pay date (Will Pay) are excluded.
 */
export function buildComingDueWindows(
  invoices: Invoice[],
  payments: Payment[]
): {
  next7: CashWindowBucket
  next14: CashWindowBucket
  next30: CashWindowBucket
  items: ComingDueItem[]
} {
  const today = startOfDayMs(new Date())
  const dayMs = 24 * 60 * 60 * 1000
  const end7 = today + 7 * dayMs
  const end14 = today + 14 * dayMs
  const end30 = today + 30 * dayMs
  const acc = emptyWindows()
  const items: ComingDueItem[] = []

  for (const inv of invoices) {
    if (inv.status !== 'approved' && inv.status !== 'hold') continue
    if (hasBrokerConfirmedPayDate(inv)) continue
    const balance = getInvoiceOpenArBalance(inv, payments)
    if (balance <= AMOUNT_EPSILON) continue

    const dueDay = parseDayMs(inv.due_date)
    if (dueDay == null) continue
    const daysOut = bucketByDaysOut(dueDay, today, end7, end14, end30, balance, acc)
    if (daysOut == null) continue

    items.push({
      id: inv.id,
      invoiceNumber: inv.invoice_number,
      brokerName: inv.broker_name || '—',
      amount: balance,
      expectedDate: inv.due_date as string,
      daysOut,
    })
  }

  items.sort((a, b) => {
    if (a.daysOut !== b.daysOut) return a.daysOut - b.daysOut
    return b.amount - a.amount
  })

  return { ...acc, items }
}

/**
 * Open invoices with a broker-confirmed pay date (Will Pay) in the next 7 / 14 / 30 days.
 */
export function buildConfirmedPaidWindows(
  invoices: Invoice[],
  payments: Payment[]
): {
  next7: CashWindowBucket
  next14: CashWindowBucket
  next30: CashWindowBucket
  items: ConfirmedPaidItem[]
} {
  const today = startOfDayMs(new Date())
  const dayMs = 24 * 60 * 60 * 1000
  const end7 = today + 7 * dayMs
  const end14 = today + 14 * dayMs
  const end30 = today + 30 * dayMs
  const acc = emptyWindows()
  const items: ConfirmedPaidItem[] = []

  for (const inv of invoices) {
    if (inv.status !== 'approved' && inv.status !== 'hold') continue
    if (!hasBrokerConfirmedPayDate(inv)) continue
    const balance = getInvoiceOpenArBalance(inv, payments)
    if (balance <= AMOUNT_EPSILON) continue

    const payDay = parseDayMs(inv.collection_date)
    if (payDay == null) continue
    const daysOut = bucketByDaysOut(payDay, today, end7, end14, end30, balance, acc)
    if (daysOut == null) continue

    items.push({
      id: inv.id,
      invoiceNumber: inv.invoice_number,
      brokerName: inv.broker_name || '—',
      amount: balance,
      payDate: inv.collection_date as string,
      daysOut,
    })
  }

  items.sort((a, b) => {
    if (a.daysOut !== b.daysOut) return a.daysOut - b.daysOut
    return b.amount - a.amount
  })

  return { ...acc, items }
}
