import type { Invoice } from '../types/invoice'
import { isOpenArInvoice } from './invoiceAging'
import {
  getInvoiceDisputeRowBadge,
  getOpenDisputes,
} from '../services/clientInvoiceActions'
import { isReceiptDisputeHold } from '../services/paymentReceiptConfirmationService'
import { getInvoiceLifecycleStatusLabel } from './invoiceLifecycleSteps'

/**
 * Open A/R with an active dispute — never show "Invoiced" as the invoice status.
 * Lifecycle step "Invoiced" stays on the stepper only.
 * "Response ready" stays a companion badge (not Open Disputed).
 */
export function invoiceHasOpenDisputedStatus(
  invoice: Invoice,
  options?: { paymentDisputed?: boolean }
): boolean {
  const paymentDisputed =
    Boolean(options?.paymentDisputed) || isReceiptDisputeHold(invoice)

  // Payment receipt disputes on Verified/Invoiced lifecycle = open A/R.
  if (paymentDisputed) {
    const stage = getInvoiceLifecycleStatusLabel(invoice)
    return stage === 'Invoiced' || stage === 'Verified'
  }

  // Invoice-level disputes: only when the row badge would be Disputed (not Response ready).
  const disputeBadge = getInvoiceDisputeRowBadge(invoice)
  if (disputeBadge?.variant !== 'open') return false

  return isOpenArInvoice(invoice) || isReceiptDisputeHold(invoice)
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
