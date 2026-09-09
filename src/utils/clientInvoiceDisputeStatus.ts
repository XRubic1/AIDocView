import type { Invoice } from '../types/invoice'
import { isOpenArInvoice } from './invoiceAging'
import { getOpenDisputes } from '../services/clientInvoiceActions'
import { isReceiptDisputeHold } from '../services/paymentReceiptConfirmationService'
import { getInvoiceLifecycleStatusLabel } from './invoiceLifecycleSteps'

/**
 * Open A/R with an active dispute — never show "Open" / "Invoiced" as the invoice status.
 * Lifecycle step "Invoiced" stays on the stepper only.
 */
export function invoiceHasOpenDisputedStatus(
  invoice: Invoice,
  options?: { paymentDisputed?: boolean }
): boolean {
  const paymentDisputed =
    Boolean(options?.paymentDisputed) || isReceiptDisputeHold(invoice)

  const isOpenAr =
    isOpenArInvoice(invoice) ||
    invoice.status === 'pending' ||
    isReceiptDisputeHold(invoice)

  // Payment receipt disputes on Verified/Invoiced lifecycle = open A/R.
  if (paymentDisputed) {
    const stage = getInvoiceLifecycleStatusLabel(invoice)
    return stage === 'Invoiced' || stage === 'Verified'
  }

  if (getOpenDisputes(invoice).length > 0) {
    return isOpenAr
  }

  // Dispute logged on notes only (no structured disputes row).
  const disputeNotes = invoice.notes_history?.filter((n) => n.type === 'dispute') ?? []
  if (disputeNotes.length === 0) return false
  const latest = [...disputeNotes].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )[0]
  const closed = /resolved|closed/i.test(latest?.note || '')
  return !closed && isOpenAr
}

/** Client-facing status label — single pill, not Invoiced + Disputed. */
export function getOpenDisputedStatusLabel(): string {
  return 'Open Disputed'
}

/** Uppercase label for mobile list / overview pills. */
export function getOpenDisputedStatusLabelUpper(): string {
  return 'OPEN DISPUTED'
}

/**
 * Dispute note for overview — invoice dispute description, else payment dispute text.
 */
export function getInvoiceDisputeOverviewNote(
  invoice: Invoice,
  paymentDisputeDescription?: string | null,
  options?: { paymentDisputed?: boolean }
): { title: string; note: string } | null {
  const openDisputes = getOpenDisputes(invoice)
  if (openDisputes.length > 0) {
    const primary = openDisputes[0]
    const title =
      openDisputes.length === 1 ? 'Open dispute' : `${openDisputes.length} open disputes`
    return {
      title,
      note: primary.description?.trim() || 'Under review with Credyx',
    }
  }

  const paymentNote = paymentDisputeDescription?.trim()
  if (paymentNote) {
    return {
      title: 'Open dispute',
      note: paymentNote,
    }
  }

  if (options?.paymentDisputed || isReceiptDisputeHold(invoice)) {
    return {
      title: 'Open dispute',
      note: 'Payment receipt disputed — Credyx is reviewing.',
    }
  }

  return null
}
