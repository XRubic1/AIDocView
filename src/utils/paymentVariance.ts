import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import { isShortPayment } from '../types/payment'
import { formatCurrency } from './format'

export const AMOUNT_EPSILON = 0.01

const CONFIRMED_STATUSES = new Set<Payment['status']>(['confirmed'])

/** Net amount a confirmed payment contributes toward invoice received total. */
export function getEffectivePaymentAmount(payment: Payment): number {
  if (!CONFIRMED_STATUSES.has(payment.status)) return 0
  if (isShortPayment(payment)) return -payment.amount
  return payment.amount
}

/** Total confirmed cash applied to an invoice (partial pay field or payment rows). */
export function getInvoiceReceivedAmount(invoice: Invoice, payments: Payment[]): number {
  if (invoice.paid_amount != null && invoice.paid_amount > 0) {
    return invoice.paid_amount
  }

  return payments
    .filter((p) => p.invoice_id === invoice.id)
    .reduce((sum, p) => sum + getEffectivePaymentAmount(p), 0)
}

/** Remaining open A/R on an invoice (face amount − confirmed received, floored at 0). */
export function getInvoiceOpenArBalance(invoice: Invoice, payments: Payment[]): number {
  const received = getInvoiceReceivedAmount(invoice, payments)
  return Math.max(0, invoice.amount - received)
}
export function getShortfallAmount(invoice: Invoice, receivedAmount: number): number {
  return Math.max(0, invoice.amount - receivedAmount)
}

export function getOverageAmount(invoice: Invoice, receivedAmount: number): number {
  return Math.max(0, receivedAmount - invoice.amount)
}

export type InvoiceBalanceTone = 'short' | 'over' | 'zero' | 'open'

/** Current invoice balance for display — short (red), over (green), zero (neutral). */
export function getInvoiceBalanceState(
  invoiceAmount: number,
  received: number
): {
  tone: InvoiceBalanceTone
  label: string
  /** Positive = amount still due; negative magnitude = overpaid amount */
  signedBalance: number
} {
  if (received <= 0) {
    return { tone: 'open', label: 'Balance due', signedBalance: invoiceAmount }
  }
  if (received < invoiceAmount - AMOUNT_EPSILON) {
    return { tone: 'short', label: 'Short paid', signedBalance: invoiceAmount - received }
  }
  if (received > invoiceAmount + AMOUNT_EPSILON) {
    return { tone: 'over', label: 'Overpaid', signedBalance: -(received - invoiceAmount) }
  }
  return { tone: 'zero', label: 'Balance', signedBalance: 0 }
}

export type InvoiceBalanceState = ReturnType<typeof getInvoiceBalanceState>

/** Signed balance for UI — short/open as negative (red), over as positive (+). */
export function formatSignedInvoiceBalanceDisplay(state: InvoiceBalanceState): string {
  switch (state.tone) {
    case 'over':
      return `+${formatCurrency(Math.abs(state.signedBalance))}`
    case 'zero':
      return formatCurrency(0)
    case 'open':
    case 'short':
      return `-${formatCurrency(state.signedBalance)}`
    default:
      return formatCurrency(state.signedBalance)
  }
}

export type PaymentVarianceKind = 'full' | 'short' | 'over'

/** Classify cumulative received vs invoice amount (±$0.01 tolerance). */
export function classifyPaymentVariance(
  invoiceAmount: number,
  projectedTotal: number
): PaymentVarianceKind | null {
  if (!Number.isFinite(projectedTotal) || projectedTotal <= 0 || invoiceAmount <= 0) {
    return null
  }
  if (projectedTotal < invoiceAmount - AMOUNT_EPSILON) return 'short'
  if (projectedTotal > invoiceAmount + AMOUNT_EPSILON) return 'over'
  return 'full'
}

/**
 * Client-posted payments awaiting Credyx confirmation (not receipt confirmation).
 */
export function getClientPostedPendingTotal(invoiceId: string, payments: Payment[]): number {
  return payments
    .filter(
      (p) =>
        p.invoice_id === invoiceId &&
        p.status === 'pending' &&
        p.posted_source === 'client' &&
        !isShortPayment(p)
    )
    .reduce((sum, p) => sum + p.amount, 0)
}

/**
 * True when client-posted pending amount covers the remaining open balance —
 * client portal treats the invoice as closed until Credyx approves.
 */
export function isInvoiceAwaitingCredyxApproval(
  invoiceAmount: number,
  confirmedReceived: number,
  pendingClientPosted: number
): boolean {
  if (pendingClientPosted <= AMOUNT_EPSILON) return false
  return confirmedReceived + pendingClientPosted >= invoiceAmount - AMOUNT_EPSILON
}

/** Client list/detail balance — treat Credyx-pending full posts as settled ($0). */
export function getClientDisplayBalanceState(
  invoiceAmount: number,
  confirmedReceived: number,
  pendingClientPosted: number
): InvoiceBalanceState {
  if (isInvoiceAwaitingCredyxApproval(invoiceAmount, confirmedReceived, pendingClientPosted)) {
    return getInvoiceBalanceState(invoiceAmount, invoiceAmount)
  }
  return getInvoiceBalanceState(invoiceAmount, confirmedReceived)
}

/**
 * Client portal status from confirmed received vs face amount.
 * Fully covered / overpaid invoices show Paid even if DB status is still approved.
 * Client-posted pending that covers the invoice → Paid + Awaiting Credyx.
 * Partial pay → Open (or Overdue) + Short paid; overpay → Paid + Overpaid.
 */
export function getClientInvoiceStatusParts(
  invoice: { status: string; displayStatus?: string },
  balance: InvoiceBalanceState,
  options?: { pendingClientPosted?: number; confirmedReceived?: number; invoiceAmount?: number }
): {
  status: string
  variance: 'short_paid' | 'overpaid' | 'awaiting_credyx' | null
} {
  const raw = invoice.displayStatus || invoice.status

  if (
    raw === 'written_off' ||
    raw === 'write_off_pending' ||
    raw === 'force_closed' ||
    raw === 'rejected' ||
    raw === 'hold' ||
    raw === 'pending'
  ) {
    const status = raw === 'write_off_pending' ? 'written_off' : raw
    // Keep Short paid visible when a write-off closed a partially paid invoice.
    if (
      (raw === 'written_off' || raw === 'write_off_pending') &&
      (balance.tone === 'short' || balance.tone === 'open')
    ) {
      const confirmed = options?.confirmedReceived ?? 0
      if (confirmed > AMOUNT_EPSILON) {
        return { status, variance: 'short_paid' }
      }
    }
    return { status, variance: null }
  }

  const pending = options?.pendingClientPosted ?? 0
  const confirmed = options?.confirmedReceived ?? 0
  const amount = options?.invoiceAmount
  if (
    amount != null &&
    isInvoiceAwaitingCredyxApproval(amount, confirmed, pending)
  ) {
    return { status: 'paid', variance: 'awaiting_credyx' }
  }

  if (balance.tone === 'over') {
    return { status: 'paid', variance: 'overpaid' }
  }
  if (balance.tone === 'zero') {
    return { status: 'paid', variance: null }
  }
  if (balance.tone === 'short') {
    return {
      status: raw === 'overdue' ? 'overdue' : 'approved',
      variance: 'short_paid',
    }
  }

  // Nothing confirmed yet
  if (raw === 'paid') return { status: 'paid', variance: null }
  return { status: raw === 'overdue' ? 'overdue' : 'approved', variance: null }
}
