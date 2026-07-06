import { Invoice } from '../types/invoice'

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

/** Approved open A/R — excludes paid and force closed. */
export function isOpenArInvoice(invoice: Invoice): boolean {
  return invoice.status === 'approved'
}

/**
 * Invoices that can receive broker payments — approved (incl. short-paid) and paid in full.
 * Written-off and force-closed invoices are excluded from open payment posting.
 */
export function isPostableForPayment(invoice: Invoice): boolean {
  if (invoice.status === 'force_closed' || invoice.status === 'written_off') return false
  return invoice.status === 'approved' || invoice.status === 'paid'
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

/** Days past expected payment (0 if closed or not yet due). */
export function getDaysOutstanding(invoice: Invoice, asOf: Date = new Date()): number {
  if (
    invoice.status === 'paid' ||
    invoice.status === 'rejected' ||
    invoice.status === 'force_closed' ||
    invoice.status === 'written_off'
  ) {
    return 0
  }

  if (invoice.days_since_expected !== undefined) {
    return Math.max(0, invoice.days_since_expected)
  }

  if (invoice.expected_payment_date) {
    const today = new Date(asOf)
    today.setHours(0, 0, 0, 0)
    const expected = new Date(invoice.expected_payment_date)
    expected.setHours(0, 0, 0, 0)
    const days = Math.floor((today.getTime() - expected.getTime()) / (1000 * 60 * 60 * 24))
    return Math.max(0, days)
  }

  return 0
}

/** Overdue = approved open A/R, 15+ days past expected payment date (payment terms). */
export function isInvoiceOverdue(invoice: Invoice, asOf: Date = new Date()): boolean {
  if (!isOpenArInvoice(invoice)) return false
  return getDaysOutstanding(invoice, asOf) >= AR_POLICY.collectionsOverdueDays
}

/** Force close eligibility at 90+ days outstanding (admin force close workflow). */
export function isForceCloseEligible(invoice: Invoice, asOf: Date = new Date()): boolean {
  if (!isOpenArInvoice(invoice)) return false
  return getDaysOutstanding(invoice, asOf) >= AR_POLICY.forceCloseDays
}

export function getOverdueSeverity(daysOutstanding: number, isOverdue: boolean): OverdueSeverity {
  if (!isOverdue) return 'none'
  if (daysOutstanding >= AR_POLICY.forceCloseDays) return 'force_close'
  if (daysOutstanding >= AR_POLICY.criticalDays) return 'critical'
  if (daysOutstanding >= AR_POLICY.clientUrgentDays) return 'urgent'
  return 'overdue'
}

export function getAgingBucket(invoice: Invoice, daysOutstanding: number): AgingBucket {
  if (
    invoice.status === 'paid' ||
    invoice.status === 'force_closed' ||
    invoice.status === 'written_off'
  ) {
    return 'closed'
  }
  if (daysOutstanding <= 0) return 'current'
  if (daysOutstanding <= 15) return '1_15'
  if (daysOutstanding <= 30) return '16_30'
  if (daysOutstanding <= 45) return '31_45'
  if (daysOutstanding <= 60) return '46_60'
  if (daysOutstanding <= 90) return '61_90'
  return 'over_91'
}

export function enrichInvoice(invoice: Invoice, asOf: Date = new Date()): EnrichedInvoice {
  const invoiceAgeDays = getInvoiceAgeDays(invoice, asOf)
  const daysOutstanding = getDaysOutstanding(invoice, asOf)
  const isOverdue = isInvoiceOverdue(invoice, asOf)
  const isForceCloseEligibleFlag = isForceCloseEligible(invoice, asOf)
  const overdueSeverity = getOverdueSeverity(daysOutstanding, isOverdue)

  let displayStatus: InvoiceDisplayStatus = invoice.status
  if (isOverdue) {
    displayStatus = 'overdue'
  }

  return {
    ...invoice,
    invoiceAgeDays,
    daysOutstanding,
    isOverdue,
    isForceCloseEligible: isForceCloseEligibleFlag,
    overdueSeverity,
    agingBucket: getAgingBucket(invoice, daysOutstanding),
    displayStatus,
  }
}

export function enrichInvoices(invoices: Invoice[], asOf: Date = new Date()): EnrichedInvoice[] {
  return invoices.map((invoice) => enrichInvoice(invoice, asOf))
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

/** Client-facing aging strip buckets (0–15 includes not-yet-due / current). */
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

export function getDisplayAgingBucketId(daysOutstanding: number): DisplayAgingBucketId {
  if (daysOutstanding <= 15) return '0_15'
  if (daysOutstanding <= 30) return '16_30'
  if (daysOutstanding <= 45) return '31_45'
  if (daysOutstanding <= 60) return '46_60'
  if (daysOutstanding <= 90) return '61_90'
  return 'over_91'
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
