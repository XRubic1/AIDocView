import type { Invoice, InvoiceNote } from '../types/invoice'
import { clientVisibleNotes } from './clientInvoiceView'

export const HOLD_DOCS_REVIEWING_MARKER =
  'Credyx is reviewing and will advise if further action is required.'
export const HOLD_DOCS_ACCEPTED_PREFIX = 'Documents accepted'
export const HOLD_DOCS_REJECTED_PREFIX = 'Documents rejected'

export type HoldPaperworkReviewStatus = 'pending' | 'accepted' | 'rejected'

export interface HoldPaperworkReview {
  status: HoldPaperworkReviewStatus
  at: string
  note: string
  /** Rejection reason when status is rejected. */
  reason?: string
}

function noteTime(note: InvoiceNote): number {
  const ms = new Date(note.created_at).getTime()
  return Number.isNaN(ms) ? 0 : ms
}

function rejectionReasonFromNote(text: string): string {
  const stripped = text.replace(new RegExp(`^${HOLD_DOCS_REJECTED_PREFIX}\\s*[—:-]\\s*`, 'i'), '')
  return stripped.trim() || text.trim()
}

/**
 * Latest paperwork-review event from invoice notes.
 * A newer accept/reject/upload-review note replaces the previous one.
 */
export function getHoldPaperworkReview(invoice: Pick<Invoice, 'notes_history'>): HoldPaperworkReview | null {
  const notes = [...clientVisibleNotes(invoice.notes_history)].sort(
    (a, b) => noteTime(b) - noteTime(a)
  )

  for (const note of notes) {
    const text = note.note?.trim() || ''
    if (!text) continue
    if (new RegExp(`^${HOLD_DOCS_ACCEPTED_PREFIX}`, 'i').test(text)) {
      return { status: 'accepted', at: note.created_at, note: text }
    }
    if (new RegExp(`^${HOLD_DOCS_REJECTED_PREFIX}`, 'i').test(text)) {
      return {
        status: 'rejected',
        at: note.created_at,
        note: text,
        reason: rejectionReasonFromNote(text),
      }
    }
    if (text.includes(HOLD_DOCS_REVIEWING_MARKER) || /credyx is reviewing/i.test(text)) {
      return { status: 'pending', at: note.created_at, note: text }
    }
  }

  return null
}

/** Carrier (or anyone) uploaded files onto the invoice. */
export function isCarrierDocumentUploadNote(note: string): boolean {
  return /^uploaded \d+\s+document/i.test(note.trim())
}

/**
 * Overview copy after a document upload.
 * Hold + pending review stays until Credyx accepts or rejects.
 * Direct uploads stay visible while the upload is still the latest note.
 */
export function getDocumentUploadOverviewMessage(
  invoice: Pick<Invoice, 'status' | 'notes_history'>
): string | null {
  const notes = [...clientVisibleNotes(invoice.notes_history)].sort(
    (a, b) => noteTime(b) - noteTime(a)
  )
  const latest = notes[0]
  const review = getHoldPaperworkReview(invoice)
  if (review?.status === 'pending') {
    return HOLD_DOCS_REVIEWING_MARKER
  }

  if (latest?.note && isCarrierDocumentUploadNote(latest.note)) {
    return 'Credyx has been notified.'
  }
  return null
}

/** True when the carrier uploaded docs and Credyx has not accepted or rejected yet. */
export function invoiceHasPendingHoldPaperworkReview(
  invoice: Pick<Invoice, 'notes_history'>
): boolean {
  return getHoldPaperworkReview(invoice)?.status === 'pending'
}
