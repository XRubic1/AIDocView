import { getInvoiceById, updateInvoice } from '../data/mockInvoices'
import type { Invoice, InvoiceNote } from '../types/invoice'
import { formatDate } from '../utils/format'
import { notifyClientInvoiceNote } from '../data/mockNotifications'
import { notifyTenantDataUpdated } from './supabase/tenantDataLiveSync'

export type AdminNoteVisibility = 'client' | 'internal'

export type InvoiceStatusNoteKind =
  | 'will_pay'
  | 'call_back'
  | 'payment_confirmed'
  | 'set_due_date'

const STATUS_NOTE_LABELS: Record<InvoiceStatusNoteKind, string> = {
  will_pay: 'Will Pay',
  call_back: 'Call Back',
  payment_confirmed: 'Payment status confirmed',
  set_due_date: 'Due date set',
}

export function getInvoiceStatusNoteLabel(kind: InvoiceStatusNoteKind): string {
  return STATUS_NOTE_LABELS[kind]
}

export function collectionStatusLabel(status?: Invoice['collection_status']): string | null {
  if (status === 'W/P') return 'Will Pay'
  if (status === 'C/B') return 'Call Back'
  return null
}

function appendNote(
  invoice: Invoice,
  note: InvoiceNote
): { notes_history: InvoiceNote[]; notes: string } {
  const notes_history = [...(invoice.notes_history || []), note]
  // Keep legacy flat notes client-facing only (internal stays out of the concatenated string).
  const notes =
    note.visibility === 'internal'
      ? invoice.notes || ''
      : invoice.notes
        ? `${invoice.notes}\n${note.note}`
        : note.note
  return { notes_history, notes }
}

/**
 * Credyx free-text notes and status notes (Will Pay / Call Back / Payment confirmed).
 * Carrier notes, disputes, and system lifecycle entries are not removable this way.
 */
export function isCredyxRemovableNote(note: InvoiceNote): boolean {
  const type = note.type || 'note'
  return type === 'note' || type === 'status_update'
}

/** Rebuild legacy flat `notes` from remaining carrier-visible history. */
function flattenClientVisibleNotes(notes: InvoiceNote[]): string {
  return notes
    .filter((n) => n.visibility !== 'internal')
    .map((n) => n.note)
    .join('\n')
}

/**
 * Credyx-authored free-text note.
 * Default visibility is `client` (carrier can see); set `internal` for Credyx-only.
 */
export function addAdminInvoiceNote(
  invoiceId: string,
  noteText: string,
  authorName: string,
  options?: { visibility?: AdminNoteVisibility }
): Invoice | undefined {
  const invoice = getInvoiceById(invoiceId)
  if (!invoice || !noteText.trim()) return undefined

  const visibility = options?.visibility ?? 'client'
  const newNote: InvoiceNote = {
    id: `note-admin-${Date.now()}`,
    note: noteText.trim(),
    created_by: authorName,
    created_at: new Date().toISOString(),
    type: 'note',
    visibility,
  }

  const updated = updateInvoice(invoiceId, appendNote(invoice, newNote))
  if (updated && visibility === 'client' && updated.client_id) {
    notifyClientInvoiceNote({
      clientId: updated.client_id,
      invoiceId: updated.id,
      invoiceNumber: updated.invoice_number,
      authorName,
      noteText: newNote.note,
      source: 'credyx',
      batchId: updated.batch_id,
      batchNumber: updated.batch_number,
    })
  }
  return updated
}

/**
 * Remove a Credyx free-text or status note from an invoice.
 * Returns undefined when the note is missing or not Credyx-removable.
 * Removing Call Back / Will Pay status notes clears matching collection fields.
 */
export function removeAdminInvoiceNote(
  invoiceId: string,
  noteId: string
): Invoice | undefined {
  const invoice = getInvoiceById(invoiceId)
  if (!invoice || !noteId) return undefined

  const history = invoice.notes_history || []
  const target = history.find((n) => n.id === noteId)
  if (!target || !isCredyxRemovableNote(target)) return undefined

  const notes_history = history.filter((n) => n.id !== noteId)
  const patch: Partial<Invoice> = {
    notes_history,
    notes: flattenClientVisibleNotes(notes_history),
  }

  // Undo scheduled collection status when its status note is removed.
  if (target.type === 'status_update') {
    if (invoice.collection_status === 'C/B' && /call back/i.test(target.note)) {
      patch.collection_status = undefined
      patch.collection_date = undefined
    } else if (invoice.collection_status === 'W/P' && /will pay/i.test(target.note)) {
      patch.collection_status = undefined
      patch.collection_date = undefined
    }
  }

  const updated = updateInvoice(invoiceId, patch)
  if (updated) {
    // Ensure cleared fields stick when Object.assign left prior values via undefined skip… 
    // Object.assign does copy undefined; wipe explicitly if needed.
    if ('collection_status' in patch && patch.collection_status === undefined) {
      delete updated.collection_status
      delete updated.collection_date
    }
    notifyTenantDataUpdated(['invoices'], updated.client_id)
  }
  return updated
}

export interface PostInvoiceStatusNoteInput {
  kind: InvoiceStatusNoteKind
  authorName: string
  /** Required for Will Pay / Call Back. */
  collectionDate?: string
  /** Optional extra context shown after the status label (carrier-visible). */
  extraNote?: string
}

/**
 * Post an internal collection status with a carrier-visible status note.
 * Will Pay / Call Back update `collection_status` + `collection_date`.
 * Set due date updates invoice due_date + expected_payment_date.
 * Payment confirmed is a status note only (does not mark the invoice paid).
 */
export function postInvoiceStatusNote(
  invoiceId: string,
  input: PostInvoiceStatusNoteInput
): Invoice | undefined {
  const invoice = getInvoiceById(invoiceId)
  if (!invoice) return undefined

  const label = STATUS_NOTE_LABELS[input.kind]
  const extra = input.extraNote?.trim()
  const date = input.collectionDate?.trim()

  if (
    (input.kind === 'will_pay' ||
      input.kind === 'call_back' ||
      input.kind === 'set_due_date') &&
    !date
  ) {
    return undefined
  }

  let body = `Status: ${label}`
  // Include date on all dated status posts (Will Pay / Call Back / Set due date require it).
  if (date) {
    body += ` · ${formatDate(date)}`
  }
  if (extra) body += ` — ${extra}`

  const newNote: InvoiceNote = {
    id: `note-status-${Date.now()}`,
    note: body,
    created_by: input.authorName,
    created_at: new Date().toISOString(),
    type: 'status_update',
    visibility: 'client',
  }

  const { notes_history, notes } = appendNote(invoice, newNote)
  const patch: Partial<Invoice> = { notes_history, notes }

  if (input.kind === 'will_pay') {
    patch.collection_status = 'W/P'
    patch.collection_date = date
  } else if (input.kind === 'call_back') {
    patch.collection_status = 'C/B'
    patch.collection_date = date
  } else if (input.kind === 'set_due_date' && date) {
    patch.due_date = date
    patch.expected_payment_date = date
  }

  const updated = updateInvoice(invoiceId, patch)
  if (updated) {
    notifyTenantDataUpdated(['invoices'], updated.client_id)
  }
  return updated
}
