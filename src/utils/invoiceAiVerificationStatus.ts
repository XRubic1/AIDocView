import type { Invoice } from '../types/invoice'

/** Compact AI verification labels shown in the packet-style review workspace. */
export type InvoiceAiVerifyUiStatus = 'reviewing' | 'ok' | 'needs_review'

export interface InvoiceAiVerifyUiMeta {
  status: InvoiceAiVerifyUiStatus
  label: string
  /** Extra verification hold — shown alongside the three AI statuses. */
  onHold: boolean
}

/**
 * Map stored invoice + AI review fields to Reviewing / OK / Needs review.
 * Human approve (OK) and hold win over the AI finding for the list badge.
 */
export function invoiceAiVerifyUi(invoice: Invoice): InvoiceAiVerifyUiMeta {
  const onHold = invoice.status === 'hold'
  if (onHold) {
    return { status: 'needs_review', label: 'Hold', onHold }
  }
  if (invoice.status === 'approved') {
    return { status: 'ok', label: 'OK', onHold }
  }
  if (invoice.ai_review_status === 'ready') {
    return { status: 'ok', label: 'OK', onHold }
  }
  if (invoice.ai_review_status === 'needs_work') {
    return { status: 'needs_review', label: 'Needs review', onHold }
  }
  return { status: 'reviewing', label: 'Reviewing', onHold }
}

export function invoiceAiVerifyBadgeClass(status: InvoiceAiVerifyUiStatus, label?: string): string {
  if (label === 'Hold') return 'client-ai-verify__badge--hold'
  if (status === 'ok') return 'client-ai-verify__badge--ok'
  if (status === 'needs_review') return 'client-ai-verify__badge--needs'
  return 'client-ai-verify__badge--reviewing'
}
