import type { Invoice } from '../types/invoice'
import { hasPpwBeenSent } from './ppwSent'
import { isReceiptDisputeHold } from '../services/paymentReceiptConfirmationService'

export type InvoiceLifecycleStepId = 'submitted' | 'verified' | 'invoiced' | 'paid'
/**
 * done = completed
 * current = active step (in progress)
 * hold = verification blocked / on hold (Verified step flashes red)
 * confirm = payment posted, awaiting carrier confirmation (Paid step flashes yellow)
 * upcoming = not reached yet
 */
export type InvoiceLifecycleStepState = 'done' | 'current' | 'hold' | 'confirm' | 'upcoming'

export interface InvoiceLifecycleStep {
  id: InvoiceLifecycleStepId
  label: string
  state: InvoiceLifecycleStepState
}

export interface InvoiceLifecycleOptions {
  /** Credyx posted payment — carrier must confirm receipt. */
  awaitingReceipt?: boolean
  /**
   * Partial short pay — advance to the Paid step, labeled "Short paid"
   * (Invoiced stays "Invoiced" and is marked done).
   */
  isShortPaid?: boolean
  /** Carrier disputed a Credyx-posted remittance — not a paperwork hold. */
  paymentDisputed?: boolean
}

/**
 * Lifecycle stage label for stepper / paid-dispute stacks (Verified / Invoiced / Paid).
 * Open A/R client status must use Open / Open Disputed — never this as list status.
 * Receipt-dispute holds are treated as open A/R past verification, not Verified-on-hold.
 */
export function getInvoiceLifecycleStatusLabel(invoice: Invoice): string {
  const receiptHold = isReceiptDisputeHold(invoice)
  const status = receiptHold ? 'approved' : invoice.status

  if (status === 'paid') return 'Paid'
  if (status === 'force_closed') return 'Force closed'
  if (status === 'written_off' || status === 'write_off_pending') return 'Written off'
  if (status === 'rejected') return 'Rejected'
  // Paperwork hold stays on the stage already reached (Invoiced if PPW was sent).
  if (status === 'hold') {
    return hasPpwBeenSent(invoice) ? 'Invoiced' : 'Verified'
  }
  // Invoiced once PPW went to the broker (receipt-dispute legacy hold counts as invoiced).
  if (hasPpwBeenSent(invoice) || receiptHold) return 'Invoiced'
  // Pending or approved without PPW — still on Verified.
  return 'Verified'
}

/**
 * Portal stepper: Submitted → Verified → Invoiced → Paid/Short paid.
 *
 * - Submitted: invoice packet received by Credyx
 * - Verified: in verification / approved; On Hold before PPW → Verified flashes red
 * - Invoiced: PPW sent to broker; On Hold after PPW → Invoiced flashes red (does not roll back)
 * - Paid: payment confirmed — or "Short paid" when partially short, or yellow "Confirm" when awaiting receipt
 */
export function getInvoiceLifecycleSteps(
  invoice: Invoice,
  options: InvoiceLifecycleOptions = {}
): InvoiceLifecycleStep[] {
  const receiptHold = isReceiptDisputeHold(invoice)
  const paymentDisputed = Boolean(options.paymentDisputed) || receiptHold
  // Payment receipt disputes must not look like verification holds.
  const status = receiptHold ? 'approved' : invoice.status
  const isPaid = status === 'paid'
  const isClosed = status === 'force_closed' || status === 'written_off'
  const isHold = status === 'hold' && !paymentDisputed
  const isRejected = status === 'rejected'
  const isPending = status === 'pending'
  const ppwSent = hasPpwBeenSent(invoice) || receiptHold
  const awaitingReceipt = Boolean(options.awaitingReceipt)
  const isShortPaid = Boolean(options.isShortPaid)

  const labels: { id: InvoiceLifecycleStepId; label: string }[] = [
    { id: 'submitted', label: 'Submitted' },
    { id: 'verified', label: 'Verified' },
    { id: 'invoiced', label: 'Invoiced' },
    {
      id: 'paid',
      label:
        status === 'force_closed'
          ? 'Force closed'
          : status === 'written_off'
            ? 'Written off'
            : awaitingReceipt
              ? 'Confirm'
              : isShortPaid
                ? 'Short paid'
                : 'Paid',
    },
  ]

  // Payment disputed (not confirmed): stay on the stage already reached.
  // Without PPW → Verified; after PPW → Invoiced. List/detail show Open Disputed.
  if (paymentDisputed && !isClosed && !awaitingReceipt && !isPaid) {
    if (ppwSent) {
      return [
        { ...labels[0], state: 'done' },
        { ...labels[1], state: 'done' },
        { ...labels[2], state: 'current' },
        { ...labels[3], state: 'upcoming' },
      ]
    }
    return [
      { ...labels[0], state: 'done' },
      { ...labels[1], state: 'current' },
      { ...labels[2], state: 'upcoming' },
      { ...labels[3], state: 'upcoming' },
    ]
  }

  // Awaiting receipt: path through Invoiced is done; Paid flashes yellow Confirm
  // (includes short corrections on already-paid invoices).
  if (awaitingReceipt && !isClosed) {
    return [
      { ...labels[0], state: 'done' },
      { ...labels[1], state: 'done' },
      { ...labels[2], state: 'done' },
      { ...labels[3], state: 'confirm' },
    ]
  }

  // Short paid — same position as Paid, labeled Short paid (red current).
  if (isShortPaid && !isClosed && !isPaid) {
    return [
      { ...labels[0], state: 'done' },
      { ...labels[1], state: 'done' },
      { ...labels[2], state: 'done' },
      { ...labels[3], state: 'current' },
    ]
  }

  // Paid: full path complete (green). Still label Short paid when applicable.
  if (isPaid) {
    return labels.map((step) => ({
      ...step,
      label: step.id === 'paid' && isShortPaid ? 'Short paid' : step.label,
      state: 'done' as const,
    }))
  }

  // Force closed / written off: full path complete (gray closed bar).
  if (isClosed) {
    return labels.map((step) => ({ ...step, state: 'done' as const }))
  }

  // On hold — flash the current stage red; do not roll Invoiced back to Verified.
  if (isHold) {
    if (ppwSent) {
      return [
        { ...labels[0], state: 'done' },
        { ...labels[1], state: 'done' },
        { ...labels[2], state: 'hold' },
        { ...labels[3], state: 'upcoming' },
      ]
    }
    return [
      { ...labels[0], state: 'done' },
      { ...labels[1], state: 'hold' },
      { ...labels[2], state: 'upcoming' },
      { ...labels[3], state: 'upcoming' },
    ]
  }

  // Rejected at verification — Verified blocked.
  if (isRejected) {
    return [
      { ...labels[0], state: 'done' },
      { ...labels[1], state: 'hold' },
      { ...labels[2], state: 'upcoming' },
      { ...labels[3], state: 'upcoming' },
    ]
  }

  // Still pending verification — Verified is current.
  if (isPending) {
    return [
      { ...labels[0], state: 'done' },
      { ...labels[1], state: 'current' },
      { ...labels[2], state: 'upcoming' },
      { ...labels[3], state: 'upcoming' },
    ]
  }

  // force_closed / written_off already returned above via isClosed.
  const verifiedDone =
    Boolean(invoice.reviewed_at || invoice.approved_at) ||
    status === 'approved' ||
    status === 'write_off_pending' ||
    receiptHold

  // PPW sent → stay on Invoiced (awaiting payment). Do NOT advance current to Paid.
  if (ppwSent) {
    return [
      { ...labels[0], state: 'done' },
      { ...labels[1], state: verifiedDone ? 'done' : 'current' },
      {
        ...labels[2],
        state: verifiedDone ? 'current' : 'upcoming',
      },
      { ...labels[3], state: 'upcoming' },
    ]
  }

  // Verified / approved but paperwork not sent — stay on Verified; do not mark Invoiced.
  if (verifiedDone) {
    return [
      { ...labels[0], state: 'done' },
      { ...labels[1], state: 'current' },
      { ...labels[2], state: 'upcoming' },
      { ...labels[3], state: 'upcoming' },
    ]
  }

  // Fallback: still working through verification.
  return [
    { ...labels[0], state: 'done' },
    { ...labels[1], state: 'current' },
    { ...labels[2], state: 'upcoming' },
    { ...labels[3], state: 'upcoming' },
  ]
}
