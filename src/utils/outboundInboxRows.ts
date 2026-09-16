/**
 * Build Credyx Inbox "Sent" rows from outbound messages + PPW history fallback.
 */
import {
  getEmailThreadById,
  listOutboundEmailMessages,
} from '../data/emailInboxStore'
import { mockInvoices } from '../data/mockInvoices'
import type { EmailMessage } from '../types/emailLifecycle'

export type OutboundInboxKind = 'ppw' | 'chase' | 'other'

export interface OutboundInboxRow {
  id: string
  sentAt: string
  to: string
  subject: string
  body: string
  templateId?: string
  kind: OutboundInboxKind
  invoiceId: string
  invoiceNumber: string
  loadNumber?: string
  clientId: string
  clientName: string
  brokerId: string
  brokerName: string
  /** True when synthesized from document_send_history (pre-inbox logging). */
  fromSendHistory?: boolean
}

function kindFromTemplate(templateId?: string): OutboundInboxKind {
  if (!templateId) return 'other'
  if (templateId === 'broker_packet') return 'ppw'
  if (
    templateId.includes('paperwork') ||
    templateId.includes('payment_status') ||
    templateId.includes('claim')
  ) {
    return 'chase'
  }
  return 'other'
}

/** Outbound Credyx emails for the Inbox Sent tab (newest first). */
export function listOutboundInboxRows(): OutboundInboxRow[] {
  const rows: OutboundInboxRow[] = []
  const seenPpwKeys = new Set<string>()

  for (const msg of listOutboundEmailMessages()) {
    const thread = getEmailThreadById(msg.thread_id)
    const invoice = thread ? mockInvoices.find((i) => i.id === thread.invoice_id) : undefined
    const invoiceId = thread?.invoice_id ?? invoice?.id ?? ''
    const kind = kindFromTemplate(msg.template_id)
    if (kind === 'ppw' && invoiceId) {
      seenPpwKeys.add(`${invoiceId}|${msg.to_address.toLowerCase()}`)
    }
    rows.push({
      id: msg.id,
      sentAt: msg.sent_at,
      to: msg.to_address,
      subject: msg.subject,
      body: msg.body_text,
      templateId: msg.template_id,
      kind,
      invoiceId,
      invoiceNumber: invoice?.invoice_number ?? '—',
      loadNumber: invoice?.load_number,
      clientId: thread?.client_id ?? invoice?.client_id ?? '',
      clientName: invoice?.client_name ?? '—',
      brokerId: thread?.broker_id ?? invoice?.broker_id ?? '',
      brokerName: invoice?.broker_name ?? '—',
    })
  }

  // Backfill older PPW sends that predate inbox logging.
  for (const inv of mockInvoices) {
    for (const rec of inv.document_send_history ?? []) {
      if (rec.status !== 'sent' && rec.status !== 'delivered') continue
      const key = `${inv.id}|${(rec.email_address || '').toLowerCase()}|${rec.sent_at}`
      const softKey = `${inv.id}|${(rec.email_address || '').toLowerCase()}`
      if (seenPpwKeys.has(softKey)) continue
      if (rows.some((r) => r.id === `ppw-hist-${key}`)) continue
      rows.push({
        id: `ppw-hist-${key}`,
        sentAt: rec.sent_at,
        to: rec.email_address,
        subject: `Paperwork packet — Invoice ${inv.invoice_number}${
          inv.load_number ? ` · Load ${inv.load_number}` : ''
        }`,
        body: [
          `Broker packet sent to ${rec.email_address}.`,
          rec.documents_sent?.length
            ? `Documents: ${rec.documents_sent.join(', ')}`
            : null,
          rec.note || null,
        ]
          .filter(Boolean)
          .join('\n'),
        templateId: 'broker_packet',
        kind: 'ppw',
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number,
        loadNumber: inv.load_number,
        clientId: inv.client_id,
        clientName: inv.client_name,
        brokerId: inv.broker_id,
        brokerName: inv.broker_name,
        fromSendHistory: true,
      })
      seenPpwKeys.add(softKey)
    }
  }

  return rows.sort((a, b) => b.sentAt.localeCompare(a.sentAt))
}

export type { EmailMessage }
