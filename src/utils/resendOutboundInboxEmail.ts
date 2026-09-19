/**
 * Resend an Inbox outbound email (PPW packet or chase template) to a chosen address.
 * Marks the invoice via send history / notes + inbox log.
 */
import { getInvoiceById } from '../data/mockInvoices'
import { mockBrokers } from '../data/mockBrokers'
import { addAdminInvoiceNote } from '../services/adminInvoiceNoteActions'
import { recordOutboundMessage } from '../services/emailLifecycleService'
import { sendTransactionalEmail } from '../services/emailService'
import { formatCurrency } from './format'
import { sendBrokerPacketForInvoice } from './paperworkSender'
import type { OutboundInboxRow } from './outboundInboxRows'
import type { EmailTemplateId } from '../config/emailTemplateDefaults'

function isEmailTemplateId(value: string): value is EmailTemplateId {
  return Boolean(value.trim())
}

/** Resend the selected inbox row to `to` (same or overridden address). */
export async function resendOutboundInboxEmail(opts: {
  row: OutboundInboxRow
  to: string
  sentBy: string
  userId?: string
}): Promise<{ ok: boolean; error?: string }> {
  const to = opts.to.trim()
  if (!to || !to.includes('@')) {
    return { ok: false, error: 'Enter a valid email address' }
  }
  if (!opts.row.invoiceId) {
    return { ok: false, error: 'This email is not linked to an invoice' }
  }

  const invoice = getInvoiceById(opts.row.invoiceId)
  if (!invoice) return { ok: false, error: 'Invoice not found' }

  const broker = mockBrokers.find((b) => b.id === invoice.broker_id)

  if (opts.row.kind === 'ppw' || opts.row.templateId === 'broker_packet') {
    const result = await sendBrokerPacketForInvoice(invoice, {
      recipientEmail: to,
      sentBy: opts.sentBy,
      userId: opts.userId,
      skipIfAlreadySent: false,
      message: `Resent from Credyx Inbox (original: ${opts.row.to}).`,
    })
    if (!result.success && !result.skipped) {
      return { ok: false, error: result.error || 'PPW resend failed' }
    }
    addAdminInvoiceNote(
      invoice.id,
      `Resent paperwork packet to ${to}${to !== opts.row.to ? ` (was ${opts.row.to})` : ''}.`,
      opts.sentBy,
      { visibility: 'internal' }
    )
    return { ok: true }
  }

  const templateId = opts.row.templateId
  if (!templateId || !isEmailTemplateId(templateId)) {
    return {
      ok: false,
      error: 'This email type cannot be resent automatically. Use Send docs or Collections instead.',
    }
  }

  const sendResult = await sendTransactionalEmail(templateId, to, {
    brokerName: broker?.name || invoice.broker_name,
    invoiceNumber: invoice.invoice_number,
    loadNumber: invoice.load_number || 'N/A',
    clientName: invoice.client_name,
    amount: formatCurrency(invoice.amount),
    message: opts.row.body || '',
  })

  if (!sendResult.ok) {
    return { ok: false, error: sendResult.error || 'Resend failed' }
  }

  recordOutboundMessage({
    invoice,
    to,
    subject: opts.row.subject.startsWith('Resend:')
      ? opts.row.subject
      : `Resend: ${opts.row.subject}`,
    body: [
      `Resent from Credyx Inbox to ${to}.`,
      to !== opts.row.to ? `Original recipient: ${opts.row.to}` : null,
      opts.row.body || null,
    ]
      .filter(Boolean)
      .join('\n'),
    templateId,
    messageId: sendResult.id,
  })

  addAdminInvoiceNote(
    invoice.id,
    `Resent “${opts.row.subject}” to ${to}${to !== opts.row.to ? ` (was ${opts.row.to})` : ''}.`,
    opts.sentBy,
    { visibility: 'internal' }
  )

  return { ok: true }
}
