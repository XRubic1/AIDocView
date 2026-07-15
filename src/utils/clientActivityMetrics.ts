// Pure helpers that summarise recent client activity for the dashboard
// "Today's Activity" panel. Kept UI-free so the logic stays testable and
// reusable across pages.

import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import type { Batch } from '../data/mockBatches'
import { getAwaitingReceiptPayments } from './paymentStatus'

/** Visual tone reused from the shared dashboard panel icon palette. */
export type ActivityTone = 'green' | 'blue' | 'amber' | 'red' | 'slate'

/** A single row rendered inside the activity panel. */
export interface ActivityMetric {
  key: string
  label: string
  /** Primary numeric value shown on the right of the row. */
  count: number
  /** Short supporting context (amount, timeframe, etc.). */
  detail: string
  tone: ActivityTone
  /** Optional route the row links to when clicked. */
  navigateTo?: string
  /**
   * Underlying invoice ids for standing metrics (held/overdue). Used to detect
   * newly-added items so the card can flag them until the user interacts.
   */
  ids?: string[]
}

export interface ActivityMetricsInput {
  invoices: Invoice[]
  payments: Payment[]
  batches: Batch[]
}

export interface ActivityMetricsResult {
  /** Rolling window (in days) the summary covers. */
  windowDays: number
  /** Total number of new actions inside the window. */
  totalActions: number
  /** Ordered metric rows for display. */
  metrics: ActivityMetric[]
}

const DAY_MS = 1000 * 60 * 60 * 24
const BATCH_PROCESSED_STATUSES = new Set<Batch['status']>([
  'ready_to_post',
  'verification',
  'approval',
  'submitted',
  'processing',
  'documents_uploaded',
])

/**
 * Returns true when the ISO timestamp falls inside the rolling window ending now.
 * Guards against missing/invalid dates so callers can pass optional fields safely.
 */
function isWithinWindow(iso: string | undefined, windowStartMs: number): boolean {
  if (!iso) return false
  const time = new Date(iso).getTime()
  return Number.isFinite(time) && time >= windowStartMs
}

/**
 * Formats a currency-free compact money string (e.g. "$12.4k") for row details.
 * Keeps the panel scannable without leaning on the full formatter.
 */
function formatCompactAmount(amount: number): string {
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(amount >= 10000 ? 0 : 1)}k`
  }
  return `$${Math.round(amount)}`
}

/**
 * Builds the "Today's Activity" summary for the client dashboard.
 *
 * @param input     Client-scoped invoices, payments, and batches.
 * @param windowDays Rolling window to summarise (defaults to 7 days).
 * @returns Ordered metric rows plus a total action count for the window.
 */
export function computeActivityMetrics(
  { invoices, payments, batches }: ActivityMetricsInput,
  windowDays = 7
): ActivityMetricsResult {
  const windowStartMs = Date.now() - windowDays * DAY_MS

  // Confirmed payments that landed inside the window.
  const recentPayments = payments.filter(
    (payment) =>
      payment.status === 'confirmed' && isWithinWindow(payment.received_date, windowStartMs)
  )
  const paymentsAmount = recentPayments.reduce((sum, payment) => sum + payment.amount, 0)

  // Batches that moved past draft (were processed/submitted) inside the window.
  const recentBatches = batches.filter(
    (batch) =>
      BATCH_PROCESSED_STATUSES.has(batch.status) &&
      isWithinWindow(batch.submitted_at, windowStartMs)
  )

  // Invoices approved inside the window (an action the client can review).
  const recentApprovals = invoices.filter((invoice) =>
    isWithinWindow(invoice.approved_at, windowStartMs)
  )

  // Current standing invoices (not windowed) that still need attention.
  const heldInvoiceIds = invoices
    .filter((invoice) => invoice.status === 'hold')
    .map((invoice) => invoice.id)
  const overdueInvoiceIds = invoices
    .filter((invoice) => {
      if (invoice.status === 'paid' || invoice.status === 'force_closed') return false
      const due = new Date(invoice.due_date).getTime()
      return Number.isFinite(due) && due < Date.now()
    })
    .map((invoice) => invoice.id)
  const heldInvoices = heldInvoiceIds.length
  const overdueInvoices = overdueInvoiceIds.length

  const awaitingReceipt = getAwaitingReceiptPayments(payments)
  const awaitingReceiptIds = awaitingReceipt.map((p) => p.id)
  const awaitingReceiptAmount = awaitingReceipt.reduce((sum, p) => sum + p.amount, 0)

  const totalActions =
    recentPayments.length + recentBatches.length + recentApprovals.length

  const metrics: ActivityMetric[] = [
    {
      key: 'payments',
      label: 'Payments received',
      count: recentPayments.length,
      detail:
        recentPayments.length > 0
          ? `${formatCompactAmount(paymentsAmount)} · last ${windowDays}d`
          : `Last ${windowDays} days`,
      tone: 'green',
      navigateTo: '/client/payments',
    },
    {
      key: 'payment_confirmation',
      label: 'Pending confirmation',
      count: awaitingReceipt.length,
      detail:
        awaitingReceipt.length > 0
          ? `${formatCompactAmount(awaitingReceiptAmount)} · confirm receipt`
          : 'None awaiting',
      tone: 'amber',
      navigateTo: '/client/payments?status=awaiting_receipt',
      ids: awaitingReceiptIds,
    },
    {
      key: 'batches',
      label: 'Batches processed',
      count: recentBatches.length,
      detail:
        recentBatches.length > 0
          ? `Processed · last ${windowDays}d`
          : `Last ${windowDays} days`,
      tone: 'blue',
      navigateTo: '/client/batches',
    },
    {
      key: 'held',
      label: 'Held invoices',
      count: heldInvoices,
      detail: heldInvoices > 0 ? 'Awaiting action · all time' : 'None on hold',
      tone: 'amber',
      navigateTo: '/client/invoices?status=hold',
      ids: heldInvoiceIds,
    },
    {
      key: 'overdue',
      label: 'Overdue invoices',
      count: overdueInvoices,
      detail: overdueInvoices > 0 ? 'Past due · all time' : 'None overdue',
      tone: 'red',
      navigateTo: '/client/invoices?status=overdue',
      ids: overdueInvoiceIds,
    },
  ]

  return { windowDays, totalActions, metrics }
}

/** A single client-facing to-do that still needs attention. */
export interface RequiredAction {
  id: string
  /** Stable category used for styling and empty-state copy. */
  type: 'confirm_payment' | 'held_invoice' | 'overdue_invoice'
  /** Primary line shown in the actions table. */
  label: string
  /** Secondary context (broker, amount, etc.). */
  detail: string
  tone: ActivityTone
  navigateTo: string
}

export interface RequiredActionsOptions {
  /** Include payment-receipt confirmation rows (managed clients). */
  includePaymentConfirmation?: boolean
  /** Max rows to return (most urgent first). */
  limit?: number
}

/**
 * Builds the dashboard "Required Actions" list: confirm payments, resolve held
 * invoices, and address overdue balances — ordered by urgency.
 */
export function computeRequiredActions(
  { invoices, payments }: Pick<ActivityMetricsInput, 'invoices' | 'payments'>,
  options: RequiredActionsOptions = {}
): RequiredAction[] {
  const { includePaymentConfirmation = true, limit = 8 } = options
  const actions: RequiredAction[] = []

  if (includePaymentConfirmation) {
    for (const payment of getAwaitingReceiptPayments(payments)) {
      actions.push({
        id: `confirm-${payment.id}`,
        type: 'confirm_payment',
        label: `Confirm payment · ${payment.invoice_number}`,
        detail: `${formatCompactAmount(payment.amount)} · ${payment.broker_name}`,
        tone: 'amber',
        navigateTo: `/client/payments?status=awaiting_receipt&paymentId=${encodeURIComponent(payment.id)}`,
      })
    }
  }

  for (const invoice of invoices.filter((inv) => inv.status === 'hold')) {
    actions.push({
      id: `held-${invoice.id}`,
      type: 'held_invoice',
      label: `Held invoice · ${invoice.invoice_number}`,
      detail: `${formatCompactAmount(invoice.amount)} · ${invoice.broker_name}`,
      tone: 'amber',
      navigateTo: `/client/invoices?status=hold&highlight_invoice=${encodeURIComponent(invoice.id)}`,
    })
  }

  const now = Date.now()
  for (const invoice of invoices) {
    if (invoice.status === 'paid' || invoice.status === 'force_closed' || invoice.status === 'hold') {
      continue
    }
    const due = new Date(invoice.due_date).getTime()
    if (!Number.isFinite(due) || due >= now) continue
    actions.push({
      id: `overdue-${invoice.id}`,
      type: 'overdue_invoice',
      label: `Overdue invoice · ${invoice.invoice_number}`,
      detail: `${formatCompactAmount(invoice.amount)} · ${invoice.broker_name}`,
      tone: 'red',
      navigateTo: `/client/invoices?status=overdue&highlight_invoice=${encodeURIComponent(invoice.id)}`,
    })
  }

  return actions.slice(0, limit)
}
