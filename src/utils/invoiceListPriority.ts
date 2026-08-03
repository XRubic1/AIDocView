/**
 * Canonical client invoice list order + display buckets.
 *
 * Confirm payment (blue) → Short paid (red) → Open (gray) → On hold (amber) → Overdue (red) → other
 */

export type InvoiceListPriorityBucket =
  | 'confirm'
  | 'short_paid'
  | 'open'
  | 'hold'
  | 'overdue'
  | 'other'

export type InvoiceListPriorityInput = {
  /** Credyx posted payment — carrier must confirm receipt. */
  awaitingReceipt?: boolean
  /** Partial payment received — remaining open balance. */
  isShortPaid?: boolean
  status?: string
  displayStatus?: string
  isOverdue?: boolean
}

/** Lower rank sorts first in every client invoice list. */
const PRIORITY_RANK: Record<InvoiceListPriorityBucket, number> = {
  confirm: 0,
  short_paid: 1,
  open: 2,
  hold: 3,
  overdue: 4,
  other: 5,
}

/**
 * Resolve the exclusive list/display bucket for an invoice.
 * Confirm → Short paid → Open → On hold → Overdue → other.
 */
export function getInvoiceListPriorityBucket(
  input: InvoiceListPriorityInput
): InvoiceListPriorityBucket {
  if (input.awaitingReceipt) return 'confirm'

  const raw = (input.displayStatus || input.status || '').toLowerCase()
  if (raw === 'hold' || raw === 'on_hold' || raw === 'on-hold') return 'hold'

  // Short paid sits directly under Confirm (still open A/R with a partial payment).
  if (input.isShortPaid) return 'short_paid'

  if (input.isOverdue || raw === 'overdue') return 'overdue'
  if (raw === 'approved' || raw === 'open') return 'open'
  return 'other'
}

/** Numeric rank for sorting (0 = highest priority). */
export function invoiceListPriorityRank(input: InvoiceListPriorityInput): number {
  return PRIORITY_RANK[getInvoiceListPriorityBucket(input)]
}

/**
 * Compare two invoices by list priority.
 * Returns negative when `a` should appear before `b`.
 */
export function compareInvoicesByListPriority(
  a: InvoiceListPriorityInput,
  b: InvoiceListPriorityInput
): number {
  return invoiceListPriorityRank(a) - invoiceListPriorityRank(b)
}

/** CSS / status-key suffix used on mobile cards and overview pills. */
export function invoiceListPriorityStatusKey(
  input: InvoiceListPriorityInput
): string {
  const bucket = getInvoiceListPriorityBucket(input)
  if (bucket === 'confirm') return 'confirm-payment'
  if (bucket === 'short_paid') return 'short-paid'
  if (bucket === 'hold') return 'hold'
  if (bucket === 'overdue') return 'overdue'
  if (bucket === 'open') return 'approved'
  return (input.displayStatus || input.status || 'pending').replace(/_/g, '-')
}

/** Uppercase label for mobile list status chips. */
export function invoiceListPriorityStatusLabel(
  input: InvoiceListPriorityInput
): string {
  const bucket = getInvoiceListPriorityBucket(input)
  if (bucket === 'confirm') return 'CONFIRM PAYMENT'
  if (bucket === 'short_paid') return 'SHORT PAID'
  if (bucket === 'hold') return 'ON HOLD'
  if (bucket === 'overdue') return 'OVERDUE'
  if (bucket === 'open') return 'OPEN'
  const raw = (input.displayStatus || input.status || '').replace(/_/g, ' ')
  if (raw === 'write off pending') return 'WRITE-OFF'
  if (raw === 'force closed') return 'FORCE CLOSED'
  if (raw === 'written off') return 'WRITTEN OFF'
  return raw.toUpperCase() || 'PENDING'
}
