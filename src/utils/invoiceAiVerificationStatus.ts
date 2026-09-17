import type { Invoice } from '../types/invoice'

/** Compact AI verification labels shown in the packet-style review workspace. */
export type InvoiceAiVerifyUiStatus = 'reviewing' | 'ok' | 'needs_review' | 'review' | 'hold'

export interface InvoiceAiVerifyUiMeta {
  status: InvoiceAiVerifyUiStatus
  label: string
  /** Extra verification hold — shown alongside the AI statuses. */
  onHold: boolean
}

/**
 * True when Process batch can include this invoice.
 * Human OK / Hold, or AI cleared (`ready`) without a Credyx Review flag.
 */
export function isInvoiceReadyToProcess(invoice: Invoice): boolean {
  if (invoice.status === 'approved' || invoice.status === 'hold') return true
  if (invoice.status === 'review') return false
  return invoice.ai_review_status === 'ready'
}

/**
 * Map stored invoice + AI review fields to Reviewing / OK / Review / Needs review / Hold.
 * Human OK and Hold win over the AI finding for the list badge.
 */
export function invoiceAiVerifyUi(invoice: Invoice): InvoiceAiVerifyUiMeta {
  const onHold = invoice.status === 'hold'
  if (onHold) {
    return { status: 'hold', label: 'Hold', onHold: true }
  }
  if (invoice.status === 'approved') {
    return { status: 'ok', label: 'OK', onHold: false }
  }
  if (invoice.status === 'review') {
    return { status: 'review', label: 'Review', onHold: false }
  }
  if (invoice.ai_review_status === 'ready') {
    return { status: 'ok', label: 'OK', onHold: false }
  }
  if (invoice.ai_review_status === 'needs_work') {
    return { status: 'needs_review', label: 'Needs review', onHold: false }
  }
  return { status: 'reviewing', label: 'Reviewing', onHold: false }
}

export function invoiceAiVerifyBadgeClass(status: InvoiceAiVerifyUiStatus, label?: string): string {
  if (status === 'hold' || label === 'Hold') return 'client-ai-verify__badge--hold'
  if (status === 'ok') return 'client-ai-verify__badge--ok'
  if (status === 'review' || label === 'Review') return 'client-ai-verify__badge--review'
  if (status === 'needs_review') return 'client-ai-verify__badge--needs'
  return 'client-ai-verify__badge--reviewing'
}
