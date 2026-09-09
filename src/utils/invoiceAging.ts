import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import type { ClientCapabilities } from './clientCapabilities'
import { mockBrokers } from '../data/mockBrokers'
import {
  getBrokerPaymentTermsDays,
  parseLocalYmd,
  resolveEffectiveDueDate,
} from './invoiceDueDate'

/** Matches admin Settings defaults — overdue after 15 days past expected pay, force close at 90. */
export const AR_POLICY = {
  /** Days past expected payment date before invoice is overdue / enters collections */
  collectionsOverdueDays: 15,
  clientUrgentDays: 25,
  criticalDays: 60,
  forceCloseDays: 90,
  agingBuckets: [15, 30, 45, 60, 90] as const,
} as const

export type InvoiceDisplayStatus = Invoice['status'] | 'overdue'

export type OverdueSeverity = 'none' | 'overdue' | 'urgent' | 'critical' | 'force_close'

export type AgingBucket =
  | 'current'
  | '1_15'
  | '16_30'
  | '31_45'
  | '46_60'
  | '61_90'
  | 'over_91'
  | 'closed'

export interface EnrichedInvoice extends Invoice {
  invoiceAgeDays: number
  daysOutstanding: number
  isOverdue: boolean
  isForceCloseEligible: boolean
  overdueSeverity: OverdueSeverity
  agingBucket: AgingBucket
  displayStatus: InvoiceDisplayStatus
}

/** Open A/R — approved or on hold (hold is a status, not a closed invoice). */
export function isOpenArInvoice(invoice: Invoice): boolean {
  return invoice.status === 'approved' || invoice.status === 'hold'
}

/** Paid, written-off, or force-closed — still eligible for over/short posts. */
export function isClosedInvoiceForPayment(invoice: Invoice): boolean {
  return (
    invoice.status === 'paid' ||
    invoice.status === 'written_off' ||
    invoice.status === 'force_closed'
  )
}

/**
 * Invoices that can receive broker payments — open A/R, on hold, paid, force-closed,
 * and written-off (additional / short posts). Pending write-off approval stays blocked.
 */
export function isPostableForPayment(invoice: Invoice): boolean {
  if (invoice.status === 'write_off_pending') {
    return false
  }
  return (
    invoice.status === 'approved' ||
    invoice.status === 'hold' ||
    invoice.status === 'paid' ||
    invoice.status === 'force_closed' ||
    invoice.status === 'written_off'
  )
}

/**
 * Credyx admin posting — includes hold, paid, force-closed, and written-off for remittance /
 * short-payment corrections. Write-off pending stays blocked until Credyx decides.
 */
export function isAdminPostableForPayment(invoice: Invoice): boolean {
  if (invoice.status === 'write_off_pending') {
    return false
  }
  return (
    invoice.status === 'approved' ||
    invoice.status === 'hold' ||
    invoice.status === 'paid' ||
    invoice.status === 'force_closed' ||
    invoice.status === 'written_off'
  )
}

/** Days since invoice date (calendar age of the invoice). */
export function getInvoiceAgeDays(invoice: Invoice, asOf: Date = new Date()): number {
  if (!invoice.invoice_date) return 0

  const today = new Date(asOf)
  today.setHours(0, 0, 0, 0)
  const invoiceDate = new Date(invoice.invoice_date)
  invoiceDate.setHours(0, 0, 0, 0)
  return Math.max(0, Math.floor((today.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24)))
}

/** Paid, written-off, force-closed, or rejected — aging clock is stopped. */
export function invoiceHasStoppedAging(invoice: Pick<Invoice, 'status'>): boolean {
  return (
    invoice.status === 'paid' ||
    invoice.status === 'written_off' ||
    invoice.status === 'force_closed' ||
    invoice.status === 'write_off_pending' ||
    invoice.status === 'rejected'
  )
}

/** Latest confirmed received/pay date per invoice. */
export function buildConfirmedPayDateByInvoiceId(payments: Payment[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const payment of payments) {
    if (payment.status !== 'confirmed') continue
    const dateStr = payment.received_date || payment.payment_date
    if (!dateStr) continue
    const prev = map.get(payment.invoice_id)
    if (!prev || dateStr > prev) map.set(payment.invoice_id, dateStr)
  }
  return map
}

/** Freeze date for closed invoices: pay date, else collection/close date. */
export function getInvoiceAgeFreezeDate(
  invoice: Invoice,
  payDate?: string | null
): string {
  return (
    payDate ||
    invoice.collection_date ||
    invoice.updated_at ||
    invoice.invoice_date
  )
}

/**
 * Display age — open A/R ages to as-of; paid/closed freeze at pay (or close) date.
 */
export function getDisplayInvoiceAgeDays(
  invoice: Invoice,
  options?: { payDate?: string | null; asOf?: Date }
): number {
  if (invoiceHasStoppedAging(invoice)) {
    return getInvoiceAgeDays(invoice, new Date(getInvoiceAgeFreezeDate(invoice, options?.payDate)))
  }
  return getInvoiceAgeDays(invoice, options?.asOf ?? new Date())
}

/** Calendar days past a YYYY-MM-DD expected date (0 if not yet due). */
function daysPastYmd(ymd: string, asOf: Date): number {
  const expected = parseLocalYmd(ymd)
  if (!expected) return 0
  const today = new Date(asOf)
  today.setHours(0, 0, 0, 0)
  expected.setHours(0, 0, 0, 0)
  return Math.max(0, Math.floor((today.getTime() - expected.getTime()) / 86_400_000))
}

/**
 * Due date used for aging / overdue: invoice_date + live broker Net days when set.
 * Falls back to stored expected/due dates (not the stale days_since_expected snapshot).
 */
export function getEffectiveInvoiceDueDate(invoice: Invoice): string | undefined {
  const terms = getBrokerPaymentTermsDays(invoice, mockBrokers)
  return resolveEffectiveDueDate(invoice, terms)
}

/** Days past expected payment (0 if closed or not yet due). */
export function getDaysOutstanding(invoice: Invoice, asOf: Date = new Date()): number {
  if (
    invoice.status === 'paid' ||
    invoice.status === 'rejected' ||
    invoice.status === 'force_closed' ||
    invoice.status === 'written_off' ||
    invoice.status === 'write_off_pending'
  ) {
    return 0
  }

  const expected =
    getEffectiveInvoiceDueDate(invoice) ||
    invoice.expected_payment_date ||
    invoice.due_date

  if (expected) {
    return daysPastYmd(expected, asOf)
  }

  if (invoice.days_since_expected !== undefined) {
    return Math.max(0, invoice.days_since_expected)
  }

  return 0
}

/** Overdue = open A/R (including hold), 15+ days past expected payment date. */
export function isInvoiceOverdue(invoice: Invoice, asOf: Date = new Date()): boolean {
  if (!isOpenArInvoice(invoice)) return false
  return getDaysOutstanding(invoice, asOf) >= AR_POLICY.collectionsOverdueDays
}

/** Force close eligibility at 90+ days outstanding (admin force close workflow). */
export function isForceCloseEligible(invoice: Invoice, asOf: Date = new Date()): boolean {
  if (!isOpenArInvoice(invoice)) return false
  return getDaysOutstanding(invoice, asOf) >= AR_POLICY.forceCloseDays
}

/** Managed-tier clients only see force-close when eligible and capability allows. */
export function isForceCloseApplicable(
  invoice: Invoice,
  capabilities: Pick<ClientCapabilities, 'hasForceClose'>,
  asOf: Date = new Date()
): boolean {
  return capabilities.hasForceClose && isForceCloseEligible(invoice, asOf)
}

/**
 * Overdue severity for styling.
 * Pass hasForceClose=false for self-service so 90+ day invoices stay "critical"
 * instead of purple force-close framing.
 */
export function getOverdueSeverity(
  daysOutstanding: number,
  isOverdue: boolean,
  hasForceClose = true
): OverdueSeverity {
  if (!isOverdue) return 'none'
  if (daysOutstanding >= AR_POLICY.forceCloseDays) {
    return hasForceClose ? 'force_close' : 'critical'
  }
  if (daysOutstanding >= AR_POLICY.criticalDays) return 'critical'
  if (daysOutstanding >= AR_POLICY.clientUrgentDays) return 'urgent'
  return 'overdue'
}

export function getAgingBucket(invoice: Invoice, invoiceAgeDays: number): AgingBucket {
  if (invoiceHasStoppedAging(invoice)) {
    return 'closed'
  }
  if (invoiceAgeDays <= 0) return 'current'
  if (invoiceAgeDays <= 15) return '1_15'
  if (invoiceAgeDays <= 30) return '16_30'
  if (invoiceAgeDays <= 45) return '31_45'
  if (invoiceAgeDays <= 60) return '46_60'
  if (invoiceAgeDays <= 90) return '61_90'
  return 'over_91'
}

export function enrichInvoice(
  invoice: Invoice,
  asOf: Date = new Date(),
  capabilities?: Pick<ClientCapabilities, 'hasForceClose'>
): EnrichedInvoice {
  const liveDue = getEffectiveInvoiceDueDate(invoice)
  const withLiveDue: Invoice = liveDue
    ? {
        ...invoice,
        due_date: liveDue,
        expected_payment_date: liveDue,
      }
    : invoice

  const invoiceAgeDays = getDisplayInvoiceAgeDays(withLiveDue, { asOf: asOf })
  const daysOutstanding = getDaysOutstanding(withLiveDue, asOf)
  const isOverdue = isInvoiceOverdue(withLiveDue, asOf)
  const hasForceClose = capabilities?.hasForceClose ?? true
  const isForceCloseEligibleFlag = isForceCloseEligible(withLiveDue, asOf)
  const overdueSeverity = getOverdueSeverity(daysOutstanding, isOverdue, hasForceClose)

  let displayStatus: InvoiceDisplayStatus = withLiveDue.status
  // Hold stays hold even when aging past due — overdue is tracked via isOverdue.
  if (isOverdue && withLiveDue.status !== 'hold') {
    displayStatus = 'overdue'
  }

  return {
    ...withLiveDue,
    invoiceAgeDays,
    daysOutstanding,
    isOverdue,
    isForceCloseEligible: isForceCloseEligibleFlag,
    overdueSeverity,
    agingBucket: getAgingBucket(withLiveDue, invoiceAgeDays),
    displayStatus,
  }
}

export function enrichInvoices(
  invoices: Invoice[],
  asOf: Date = new Date(),
  capabilities?: Pick<ClientCapabilities, 'hasForceClose'>
): EnrichedInvoice[] {
  return invoices.map((invoice) => enrichInvoice(invoice, asOf, capabilities))
}

export function getOverdueSeverityLabel(severity: OverdueSeverity): string {
  switch (severity) {
    case 'force_close':
      return 'Force close eligible'
    case 'critical':
      return 'Critical — 60+ days'
    case 'urgent':
      return 'Urgent — 25+ days'
    case 'overdue':
      return 'Overdue — 15+ days past expected pay'
    default:
      return ''
  }
}

/** Client-facing aging strip buckets — by invoice age (days since invoice date). */
export type DisplayAgingBucketId =
  | '0_15'
  | '16_30'
  | '31_45'
  | '46_60'
  | '61_90'
  | 'over_91'

export const DISPLAY_AGING_BUCKETS: readonly {
  id: DisplayAgingBucketId
  label: string
}[] = [
  { id: '0_15', label: '0–15' },
  { id: '16_30', label: '16–30' },
  { id: '31_45', label: '31–45' },
  { id: '46_60', label: '46–60' },
  { id: '61_90', label: '61–90' },
  { id: 'over_91', label: '91+' },
] as const

/** Map invoice age (not days past due) into a display aging bucket. */
export function getDisplayAgingBucketId(invoiceAgeDays: number): DisplayAgingBucketId {
  if (invoiceAgeDays <= 15) return '0_15'
  if (invoiceAgeDays <= 30) return '16_30'
  if (invoiceAgeDays <= 45) return '31_45'
  if (invoiceAgeDays <= 60) return '46_60'
  if (invoiceAgeDays <= 90) return '61_90'
  return 'over_91'
}

/** Aging A/R amount keys (admin + dashboard) from invoice age. */
export function getAgingArBucketKey(
  invoiceAgeDays: number
): '1_15' | '16_30' | '31_45' | '46_60' | '61_90' | 'over_91' {
  const id = getDisplayAgingBucketId(invoiceAgeDays)
  return id === '0_15' ? '1_15' : id
}

export function getDisplayAgingBucketLabel(id: DisplayAgingBucketId): string {
  return DISPLAY_AGING_BUCKETS.find((b) => b.id === id)?.label ?? id
}

export function getDaysOutstandingColor(severity: OverdueSeverity): string {
  switch (severity) {
    case 'force_close':
      return '#7C3AED'
    case 'critical':
      return '#DC2626'
    case 'urgent':
      return '#EA580C'
    case 'overdue':
      return '#D97706'
    default:
      return '#64748B'
  }
}
