/**
 * Derive a carrier-facing hold explanation from hold_reason + invoice notes.
 * Prefers the structured hold_reason, then missing-doc notes, and surfaces
 * carrier uploads that happened after Credyx asked for paperwork.
 */

import type { Invoice, InvoiceNote } from '../types/invoice'
import { clientVisibleNotesForInvoice } from './clientInvoiceView'

export type AssistantHoldExplanation = {
  /** Short reason line for lists / bullets. */
  reason: string
  /** One fuller sentence including upload-after-notice when relevant. */
  detail: string
  /** ISO timestamp of the latest missing-docs / hold notice, if any. */
  missingNoticeAt?: string
  missingNoticeText?: string
  /** ISO timestamp of the latest carrier upload / attach note, if any. */
  lastUploadAt?: string
  lastUploadText?: string
  /** True when the carrier uploaded after Credyx asked for missing docs. */
  carrierUploadedAfterNotice: boolean
}

const MISSING_DOC_RE =
  /\b(missing|still\s+need|need(?:s|ed)?\s+(?:the\s+)?(?:bol|pod|rate\s*con|doc|paper)|awaiting\s+(?:bol|pod|docs|paper)|incomplete\s+(?:bol|pod|packet|paper)|hold\s+reason)\b|\b(bol|pod|rate\s*con|lumper|scale\s*ticket)\b.{0,40}\b(missing|needed|required|incomplete)\b/i

const UPLOAD_RE =
  /\buploaded?\s+\d+\s+documents?\b|\bi\s+have\s+attached\b|\battached\s+the\s+missing\b|\buploaded?\b.{0,40}\b(bol|pod|pdf|png|jpg|jpeg|doc)\b/i

/** Sort notes newest → oldest. */
function sortNotesDesc(notes: InvoiceNote[]): InvoiceNote[] {
  return [...notes].sort((a, b) =>
    (b.created_at || '').localeCompare(a.created_at || '')
  )
}

function isUploadNote(n: InvoiceNote): boolean {
  return UPLOAD_RE.test(n.note || '')
}

function isMissingNotice(n: InvoiceNote): boolean {
  // Uploads often say “attached the missing BOL” — those are responses, not the notice.
  if (isUploadNote(n)) return false
  if (n.type === 'hold_reason') return true
  return MISSING_DOC_RE.test(n.note || '')
}

function formatShortDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function truncate(text: string, max = 160): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1).trimEnd()}…`
}

/**
 * Build a grounded hold explanation for one invoice.
 * @param inv Invoice (may or may not have hold_reason set)
 * @param mode client = carrier-visible notes only; admin = full history
 */
export function deriveHoldExplanation(
  inv: Invoice,
  mode: 'client' | 'admin' = 'client'
): AssistantHoldExplanation {
  const notes =
    mode === 'admin' ? inv.notes_history ?? [] : clientVisibleNotesForInvoice(inv)
  const sorted = sortNotesDesc(notes)

  const missingNotice = sorted.find(isMissingNotice)
  const lastUpload = sorted.find(isUploadNote)

  const carrierUploadedAfterNotice = Boolean(
    missingNotice?.created_at &&
      lastUpload?.created_at &&
      lastUpload.created_at >= missingNotice.created_at
  )

  const fromField = inv.hold_reason?.trim()
  const fromNote = missingNotice?.note?.trim()
  const reason =
    fromField ||
    (fromNote ? truncate(fromNote, 120) : '') ||
    'Hold reason not recorded — usually missing documents'

  let detail = reason
  const uploadWho = mode === 'client' ? 'You' : 'Carrier'
  if (carrierUploadedAfterNotice && lastUpload) {
    const when = formatShortDate(lastUpload.created_at)
    const what = truncate(lastUpload.note, 100)
    detail = `${reason} — ${uploadWho} uploaded after that notice (${when}: ${what}). Credyx may still be reviewing.`
  } else if (lastUpload && !fromField && !fromNote) {
    const when = formatShortDate(lastUpload.created_at)
    detail = `${reason} — Latest upload ${when}: ${truncate(lastUpload.note, 100)}.`
  }

  return {
    reason,
    detail,
    missingNoticeAt: missingNotice?.created_at,
    missingNoticeText: missingNotice?.note
      ? truncate(missingNotice.note, 160)
      : undefined,
    lastUploadAt: lastUpload?.created_at,
    lastUploadText: lastUpload?.note
      ? truncate(lastUpload.note, 160)
      : undefined,
    carrierUploadedAfterNotice,
  }
}

/**
 * Build a carrier-facing dispute draft from hold notes / uploads.
 * When the carrier already uploaded after a missing-docs notice, reason is "other"
 * (not "missing_documents") and the description asks Credyx to review the upload.
 */
export function buildDisputeDraftForInvoice(
  inv: Invoice,
  mode: 'client' | 'admin' = 'client'
): import('../types/assistant').AssistantDisputeDraft {
  const hold = deriveHoldExplanation(inv, mode)
  const youUploaded =
    hold.carrierUploadedAfterNotice || Boolean(hold.lastUploadAt && hold.lastUploadText)
  const when = formatShortDate(hold.lastUploadAt)
  const holdLine = hold.missingNoticeText || hold.reason

  let reason: import('../types/assistant').AssistantDisputeReason
  let description: string

  if (youUploaded) {
    // Do NOT use missing_documents — that reads as “you still owe paperwork.”
    reason = 'other'
    description = [
      `Invoice #${inv.invoice_number} is on hold for: ${holdLine}.`,
      `I already uploaded paperwork${when ? ` on ${when}` : ''}${
        hold.lastUploadText ? ` (${hold.lastUploadText})` : ''
      }.`,
      'Please review the upload and clear the hold.',
    ].join(' ')
  } else if (
    hold.missingNoticeText ||
    /missing|bol|pod|doc|paper/i.test(hold.reason)
  ) {
    reason = 'missing_documents'
    description = `Invoice #${inv.invoice_number} is on hold: ${holdLine}. Please confirm what documents are still needed so we can clear it.`
  } else {
    reason = 'other'
    description = hold.detail
      ? `Regarding invoice #${inv.invoice_number}: ${hold.detail}`
      : `I'd like to open a dispute on invoice #${inv.invoice_number}.`
  }

  return {
    invoiceId: inv.id,
    invoiceNumber: inv.invoice_number,
    brokerName: inv.broker_name,
    reason,
    description,
    youUploaded: youUploaded || undefined,
    uploadSummary: youUploaded ? hold.lastUploadText : undefined,
    uploadAt: youUploaded ? hold.lastUploadAt : undefined,
  }
}

/** Prefer notes that explain the hold when grounding the model. */
export function prioritizeHoldNotes(
  notes: InvoiceNote[],
  limit = 6
): InvoiceNote[] {
  const sorted = sortNotesDesc(notes)
  const priority = sorted.filter((n) => isMissingNotice(n) || isUploadNote(n))
  const rest = sorted.filter((n) => !priority.includes(n))
  return [...priority, ...rest].slice(0, limit)
}
