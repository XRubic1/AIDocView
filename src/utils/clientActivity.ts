/**
 * Client-originated invoice activity that Credyx should review — uploads, notes,
 * payments, receipt disputes, write-offs. Sourced from unread admin notifications.
 */
import type { Invoice } from '../types/invoice'
import type { Notification } from '../types/notification'
import type { ClientWorkSeverity } from './clientWorkQueue'

export type ClientActivityKind =
  | 'upload'
  | 'note'
  | 'payment'
  | 'receipt_dispute'
  | 'receipt_confirmed'
  | 'write_off'

export type ClientActivity = {
  /** Notification id — mark it read to clear the activity. */
  id: string
  kind: ClientActivityKind
  label: string
  detail: string
  severity: ClientWorkSeverity
  clientId: string
  clientName: string
  invoiceId?: string
  invoiceNumber?: string
  at: string
}

const TITLE_KIND: Record<string, ClientActivityKind> = {
  'PPW uploaded — review documents': 'upload',
  'Client note on invoice': 'note',
  'Payment posted': 'payment',
  'Payment receipt dispute': 'receipt_dispute',
  'Payment receipt confirmed': 'receipt_confirmed',
  'Write-off posted': 'write_off',
}

const KIND_LABEL: Record<ClientActivityKind, string> = {
  upload: 'Documents uploaded',
  note: 'Client note',
  payment: 'Payment posted',
  receipt_dispute: 'Receipt disputed',
  receipt_confirmed: 'Receipt confirmed',
  write_off: 'Write-off posted',
}

const KIND_SEVERITY: Record<ClientActivityKind, ClientWorkSeverity> = {
  upload: 'high',
  receipt_dispute: 'high',
  write_off: 'high',
  note: 'medium',
  payment: 'medium',
  receipt_confirmed: 'low',
}

export function clientActivityLabel(kind: ClientActivityKind): string {
  return KIND_LABEL[kind]
}

function metaString(n: Notification, key: string): string {
  const value = n.metadata?.[key]
  return typeof value === 'string' ? value.trim() : ''
}

/** Short reviewer-facing detail; falls back to the bell message. */
function activityDetail(kind: ClientActivityKind, n: Notification): string {
  if (kind === 'note') {
    const text = metaString(n, 'note_text')
    const author = metaString(n, 'author_name')
    if (text) return author ? `${author}: ${text}` : text
  }
  if (kind === 'upload') {
    const files = n.metadata?.file_names
    if (Array.isArray(files) && files.length) {
      const names = files.filter((f): f is string => typeof f === 'string')
      return names.length <= 2
        ? names.join(', ')
        : `${names.slice(0, 2).join(', ')} +${names.length - 2} more`
    }
  }
  return n.message
}

/** Unread client activity, newest first, resolved to its carrier and invoice. */
export function buildClientActivity(
  notifications: Notification[],
  invoices: Invoice[]
): ClientActivity[] {
  const byId = new Map(invoices.map((inv) => [inv.id, inv]))
  const byNumber = new Map(invoices.map((inv) => [inv.invoice_number, inv]))
  const out: ClientActivity[] = []

  for (const n of notifications) {
    if (n.read) continue
    const kind = TITLE_KIND[n.title]
    if (!kind) continue
    const invoice =
      (n.invoice_id ? byId.get(n.invoice_id) : undefined) ??
      (n.invoice_number ? byNumber.get(n.invoice_number) : undefined)
    const clientId = invoice?.client_id || metaString(n, 'client_id')
    if (!clientId) continue
    out.push({
      id: n.id,
      kind,
      label: KIND_LABEL[kind],
      detail: activityDetail(kind, n),
      severity: KIND_SEVERITY[kind],
      clientId,
      clientName: invoice?.client_name || metaString(n, 'client_name'),
      invoiceId: invoice?.id ?? n.invoice_id,
      invoiceNumber: invoice?.invoice_number ?? n.invoice_number,
      at: n.timestamp,
    })
  }

  return out.sort((a, b) => b.at.localeCompare(a.at))
}
