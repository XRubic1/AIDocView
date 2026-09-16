import type { Invoice } from '../types/invoice'
import type { Broker } from '../types/broker'

/**
 * Resolve invoice due date from broker "Due by (days)".
 * 0 / missing → no automatic due date.
 * N > 0 → YYYY-MM-DD of (fromDate ?? today) + N days.
 */
export function resolveDueDateFromBroker(
  dueByDays?: number | null,
  fromDate: Date = new Date()
): string | undefined {
  const days = dueByDays == null ? 0 : Number(dueByDays)
  if (!Number.isFinite(days) || days <= 0) return undefined

  const base = new Date(fromDate)
  base.setHours(12, 0, 0, 0)
  base.setDate(base.getDate() + Math.floor(days))

  return toDateStr(base)
}

/** Pair of due + expected payment dates when broker due-by is set. */
export function resolveDueDatesFromBroker(
  dueByDays?: number | null,
  fromDate: Date = new Date()
): { due_date?: string; expected_payment_date?: string } {
  const due = resolveDueDateFromBroker(dueByDays, fromDate)
  if (!due) return {}
  return { due_date: due, expected_payment_date: due }
}

/**
 * Dates to upsert while some databases still require NOT NULL due_date.
 * Prefer broker-derived dates; otherwise stamp invoice_date (or today) so batch create can save.
 */
export function dueDatesForDatabase(
  invoice: Pick<Invoice, 'due_date' | 'expected_payment_date' | 'invoice_date'>
): { due_date: string; expected_payment_date: string } {
  const today = toDateStr(new Date())
  const due =
    invoice.due_date?.trim() ||
    invoice.expected_payment_date?.trim() ||
    invoice.invoice_date?.trim() ||
    today
  const expected =
    invoice.expected_payment_date?.trim() ||
    invoice.due_date?.trim() ||
    invoice.invoice_date?.trim() ||
    today
  return { due_date: due, expected_payment_date: expected }
}

const CLOSED_FOR_DUE_SYNC: ReadonlySet<Invoice['status']> = new Set([
  'paid',
  'rejected',
  'force_closed',
  'written_off',
  'write_off_pending',
])

/** Open invoices whose due date should follow broker Net terms. */
export function isInvoiceDueDateSyncable(invoice: Pick<Invoice, 'status'>): boolean {
  return !CLOSED_FOR_DUE_SYNC.has(invoice.status)
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** Parse YYYY-MM-DD as a local calendar day (avoids UTC day-shift). */
export function parseLocalYmd(value: string | undefined): Date | null {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0)
}

/** Add whole days to a YYYY-MM-DD string. */
export function addDaysToYmd(ymd: string, days: number): string | undefined {
  const base = parseLocalYmd(ymd)
  if (!base) return undefined
  base.setDate(base.getDate() + days)
  return toDateStr(base)
}

function daysPastExpected(expectedYmd: string, asOf: Date): number {
  const expected = parseLocalYmd(expectedYmd)
  if (!expected) return 0
  const today = new Date(asOf)
  today.setHours(0, 0, 0, 0)
  expected.setHours(0, 0, 0, 0)
  return Math.max(0, Math.floor((today.getTime() - expected.getTime()) / 86_400_000))
}

export interface BrokerTermsDueDatePatch {
  due_date: string | undefined
  expected_payment_date: string | undefined
  days_since_expected: number | undefined
}

/**
 * Recompute due / expected dates when broker Net terms change.
 * Prefer shifting the existing due date by (next − previous) so the original
 * clock is preserved; otherwise stamp invoice_date + next days.
 */
export function buildBrokerTermsDueDatePatch(
  invoice: Pick<Invoice, 'invoice_date' | 'created_at' | 'due_date' | 'expected_payment_date'>,
  nextDays: number | null | undefined,
  previousDays?: number | null,
  asOf: Date = new Date()
): BrokerTermsDueDatePatch {
  const next = nextDays == null ? 0 : Number(nextDays)
  if (!Number.isFinite(next) || next <= 0) {
    return {
      due_date: undefined,
      expected_payment_date: undefined,
      days_since_expected: undefined,
    }
  }

  // Prefer shifting the existing due date by (next − previous) so the original clock holds.
  const prev = previousDays == null ? 0 : Number(previousDays)
  const existingDue = invoice.due_date?.trim()
  if (
    existingDue &&
    Number.isFinite(prev) &&
    prev > 0 &&
    Number.isFinite(next)
  ) {
    const delta = Math.floor(next) - Math.floor(prev)
    const shifted = addDaysToYmd(existingDue, delta)
    if (shifted) {
      return {
        due_date: shifted,
        expected_payment_date: shifted,
        days_since_expected: daysPastExpected(shifted, asOf),
      }
    }
  }

  const base =
    parseLocalYmd(invoice.invoice_date) ??
    parseLocalYmd(invoice.created_at) ??
    asOf
  const due = resolveDueDateFromBroker(next, base)

  return {
    due_date: due,
    expected_payment_date: due,
    days_since_expected: due ? daysPastExpected(due, asOf) : undefined,
  }
}

/** Compact list label for broker Net terms (`45d` or `—`). */
export function formatBrokerDueDays(days?: number | null): string {
  if (days == null || !Number.isFinite(days) || days <= 0) return '—'
  return `${Math.floor(days)}d`
}

/**
 * Live broker Due by (days) only — does not infer from stored invoice dates.
 */
export function getBrokerPaymentTermsDays(
  invoice: Pick<Invoice, 'broker_id' | 'broker_name'>,
  brokers: Pick<Broker, 'id' | 'name' | 'payment_terms_days'>[]
): number | null {
  const broker =
    brokers.find((b) => b.id && b.id === invoice.broker_id) ??
    brokers.find((b) => b.name && b.name === invoice.broker_name)
  const terms = broker?.payment_terms_days
  if (terms != null && Number.isFinite(terms) && terms > 0) return Math.floor(terms)
  return null
}

/**
 * Broker Due by (days) for an invoice — live broker terms, then stored due − invoice date.
 */
export function getInvoiceBrokerDueDays(
  invoice: Pick<Invoice, 'broker_id' | 'broker_name' | 'invoice_date' | 'due_date'>,
  brokers: Pick<Broker, 'id' | 'name' | 'payment_terms_days'>[]
): number | null {
  const live = getBrokerPaymentTermsDays(invoice, brokers)
  if (live != null) return live

  const invoiceDay = parseLocalYmd(invoice.invoice_date)
  const dueDay = parseLocalYmd(invoice.due_date)
  if (!invoiceDay || !dueDay) return null
  invoiceDay.setHours(0, 0, 0, 0)
  dueDay.setHours(0, 0, 0, 0)
  const diff = Math.round((dueDay.getTime() - invoiceDay.getTime()) / 86_400_000)
  return diff > 0 ? diff : null
}

/**
 * True when due/expected is the invoice or create day — a DB placeholder
 * used when the broker has no Net terms, not a real payment-due date.
 */
export function isPlaceholderPaymentDueDate(
  invoice: Pick<Invoice, 'invoice_date' | 'created_at' | 'due_date' | 'expected_payment_date'>,
  dueYmd?: string | null
): boolean {
  const due = (dueYmd || invoice.due_date || invoice.expected_payment_date || '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return true
  const origin = (invoice.invoice_date || invoice.created_at || '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(origin)) return false
  return due <= origin
}
export function resolveEffectiveDueDate(
  invoice: Pick<Invoice, 'status' | 'invoice_date' | 'created_at' | 'due_date' | 'expected_payment_date'>,
  dueByDays?: number | null
): string | undefined {
  if (!isInvoiceDueDateSyncable(invoice)) {
    return invoice.due_date || invoice.expected_payment_date || undefined
  }
  if (dueByDays != null && dueByDays > 0) {
    const base =
      parseLocalYmd(invoice.invoice_date) ?? parseLocalYmd(invoice.created_at)
    if (base) return resolveDueDateFromBroker(dueByDays, base)
  }
  return invoice.expected_payment_date || invoice.due_date || undefined
}
