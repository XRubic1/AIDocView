/**
 * Carrier "Needs attention" requests posted by Credyx from the admin note box.
 * The latest note with `client_attention` decides: `open` = waiting on the carrier.
 */
import type { Invoice } from '../types/invoice'

export type ClientAttentionRequest = {
  noteId: string
  message: string
  createdAt: string
  createdBy: string
}

export function getOpenClientAttention(
  invoice: Pick<Invoice, 'notes_history'>
): ClientAttentionRequest | null {
  const flagged = (invoice.notes_history ?? [])
    .filter((n) => n.client_attention)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  const latest = flagged[0]
  if (!latest || latest.client_attention !== 'open') return null
  return {
    noteId: latest.id,
    message: latest.attention_message?.trim() || latest.note,
    createdAt: latest.created_at,
    createdBy: latest.created_by,
  }
}
