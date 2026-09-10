import type { Invoice } from '../types/invoice'

const CLOSED: ReadonlySet<Invoice['status']> = new Set([
  'paid',
  'force_closed',
  'written_off',
  'write_off_pending',
  'rejected',
])

const WILL_PAY_NOTE = /status:\s*will pay/i

function latestWillPayNoteDate(invoice: Pick<Invoice, 'notes_history'>): string | null {
  const notes = [...(invoice.notes_history ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  const hit = notes.find((note) => WILL_PAY_NOTE.test(note.note))
  if (!hit) return null
  const match = hit.note.match(/(\d{1,2}\/\d{1,2}\/\d{4})/)
  if (!match) return null
  const [month, day, year] = match[1].split('/').map(Number)
  if (!month || !day || !year) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Open A/R with a broker Will Pay (scheduled remittance). */
export function invoiceHasWillPayStatus(
  invoice: Pick<Invoice, 'status' | 'collection_status' | 'notes_history'>
): boolean {
  if (CLOSED.has(invoice.status)) return false
  if (invoice.collection_status === 'W/P') return true
  return (invoice.notes_history ?? []).some((note) => WILL_PAY_NOTE.test(note.note))
}

/** Scheduled payment date for Will Pay invoices. */
export function getWillPayScheduledDate(
  invoice: Pick<Invoice, 'collection_status' | 'collection_date' | 'notes_history'>
): string | null {
  if (invoice.collection_date?.trim() && invoice.collection_status === 'W/P') {
    return invoice.collection_date.trim()
  }
  return latestWillPayNoteDate(invoice)
}

export type ClientVisiblePayDateSource = 'confirmed' | 'pending' | 'scheduled'

/** Pay date shown on the carrier invoices list: cash first, else Will Pay schedule. */
export function getClientVisiblePayDate(
  invoice: Pick<Invoice, 'status' | 'collection_status' | 'collection_date' | 'notes_history'>,
  options?: { confirmedPayDate?: string | null; pendingPayDate?: string | null }
): { date: string; source: ClientVisiblePayDateSource } | null {
  const confirmed = options?.confirmedPayDate?.trim()
  if (confirmed) return { date: confirmed, source: 'confirmed' }
  const pending = options?.pendingPayDate?.trim()
  if (pending) return { date: pending, source: 'pending' }
  if (!invoiceHasWillPayStatus(invoice)) return null
  const scheduled = getWillPayScheduledDate(invoice)
  if (!scheduled) return null
  return { date: scheduled, source: 'scheduled' }
}

