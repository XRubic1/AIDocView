import type { Invoice } from '../types/invoice'
import { hasPpwBeenSent } from './ppwSent'

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
}

/**
 * Portal stepper: Submitted → Verified → Invoiced → Paid.
 *
 * - Submitted: invoice packet received by Credyx
 * - Verified: in verification / approved; On Hold → Verified flashes red
 * - Invoiced: PPW sent to broker (open A/R stays here until paid)
 * - Paid: payment confirmed — or yellow "Confirm" when awaiting receipt
 */
export function getInvoiceLifecycleSteps(
  invoice: Invoice,
  options: InvoiceLifecycleOptions = {}
): InvoiceLifecycleStep[] {
  const status = invoice.status
  const isPaid = status === 'paid'
  const isClosed = status === 'force_closed' || status === 'written_off'
  const isHold = status === 'hold'
  const isRejected = status === 'rejected'
  const isPending = status === 'pending'
  const ppwSent = hasPpwBeenSent(invoice)
  const awaitingReceipt = Boolean(options.awaitingReceipt)

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
              : 'Paid',
    },
  ]

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

  // Paid: full path complete (green).
  if (isPaid) {
    return labels.map((step) => ({ ...step, state: 'done' as const }))
  }

  // Force closed / written off: full path complete (gray closed bar).
  if (isClosed) {
    return labels.map((step) => ({ ...step, state: 'done' as const }))
  }

  // On hold — stop on Verified (alert). No Invoiced until PPW is sent.
  if (isHold) {
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

  const verifiedDone =
    Boolean(invoice.reviewed_at || invoice.approved_at) ||
    status === 'approved' ||
    status === 'force_closed' ||
    status === 'written_off' ||
    status === 'write_off_pending'

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

  // Verified but PPW not sent yet — Invoiced is the next/current step.
  if (verifiedDone) {
    return [
      { ...labels[0], state: 'done' },
      { ...labels[1], state: 'done' },
      { ...labels[2], state: 'current' },
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
