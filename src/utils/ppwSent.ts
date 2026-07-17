import type { DocumentSendRecord, Invoice } from '../types/invoice'

/** True when paperwork was successfully sent at least once. */
export function hasPpwBeenSent(invoice: Invoice | { document_send_history?: DocumentSendRecord[] }): boolean {
  const history = invoice.document_send_history ?? []
  return history.some((r) => r.status === 'sent' || r.status === 'delivered')
}

/** Earliest successful PPW send timestamp, or null. */
export function getPpwSentAt(invoice: Invoice): string | null {
  const successful = (invoice.document_send_history ?? []).filter(
    (r) => r.status === 'sent' || r.status === 'delivered'
  )
  if (successful.length === 0) return null
  return successful.reduce((earliest, r) => (r.sent_at < earliest ? r.sent_at : earliest), successful[0].sent_at)
}

/** Days since PPW was first sent (floor). Null if never sent. */
export function getDaysSincePpwSent(invoice: Invoice, nowMs = Date.now()): number | null {
  const sentAt = getPpwSentAt(invoice)
  if (!sentAt) return null
  const t = new Date(sentAt).getTime()
  if (!Number.isFinite(t)) return null
  return Math.floor((nowMs - t) / (1000 * 60 * 60 * 24))
}
