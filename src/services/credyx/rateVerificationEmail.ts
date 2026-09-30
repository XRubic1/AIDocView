/**
 * Ask the broker to confirm the rate and any advances or deductions.
 */
import type { Broker } from '../../types/broker'
import type { Invoice } from '../../types/invoice'
import { getInvoiceById, updateInvoice } from '../../data/mockInvoices'
import { sendTransactionalEmail } from '../emailService'
import { addAdminInvoiceNote } from '../adminInvoiceNoteActions'
import { recordOutboundMessage } from '../emailLifecycleService'
import { resolveBrokerPaperworkEmail } from '../../utils/paperworkSender'
import { formatCurrency } from '../../utils/format'
import { getDefaultEmailTemplate } from '../../config/emailTemplateDefaults'
import { RATE_VERIFICATION_TEMPLATE_ID } from '../../../supabase/functions/_shared/rateVerificationReply'

export async function sendBrokerRateVerification(opts: {
  invoice: Invoice
  broker?: Broker | null
  /** Spoke-with email on the verification card, when filled. */
  toOverride?: string
}): Promise<{ ok: boolean; error?: string; to?: string; invoice?: Invoice }> {
  const invoice = getInvoiceById(opts.invoice.id) ?? opts.invoice
  if (opts.broker?.verification_type === 'web') {
    return {
      ok: false,
      error: 'This broker’s verification type is Web. No email is sent.',
    }
  }
  const typed = opts.toOverride?.trim() ?? ''
  const to = typed.includes('@') ? typed : resolveBrokerPaperworkEmail(opts.broker ?? undefined)
  if (!to) {
    return { ok: false, error: 'No broker email on file.' }
  }

  const loadNumber = invoice.load_number || '—'
  const template = getDefaultEmailTemplate(RATE_VERIFICATION_TEMPLATE_ID)
  const sendResult = await sendTransactionalEmail(
    RATE_VERIFICATION_TEMPLATE_ID,
    to,
    {
      brokerName: opts.broker?.name || invoice.broker_name || 'there',
      invoiceNumber: invoice.invoice_number,
      loadNumber,
      clientName: invoice.client_name,
      amount: formatCurrency(invoice.amount),
    },
    {
      fromOverride: 'Credyx Billing <billing@credyx.net>',
      overrideSubject: template?.subject,
      overrideHtml: template?.body_html,
    }
  )
  if (!sendResult.ok) {
    return { ok: false, error: sendResult.error || 'Could not send the rate check.' }
  }

  const subject = `Rate confirmation — Invoice ${invoice.invoice_number} · Load ${loadNumber}`
  recordOutboundMessage({
    invoice,
    to,
    subject,
    body: `Please confirm the rate of ${formatCurrency(invoice.amount)} for load ${loadNumber} and whether there are any advances or deductions.`,
    templateId: RATE_VERIFICATION_TEMPLATE_ID,
    messageId: sendResult.id,
    fromAddress: 'billing@credyx.net',
  })

  const note = `Rate verification email sent to ${to}.`
  const noted = addAdminInvoiceNote(invoice.id, note, 'Credyx', { visibility: 'internal' })
  const updated = updateInvoice(noted?.id ?? invoice.id, {
    verification_status: 'Email',
    broker_contacted: true,
    last_broker_contact: new Date().toISOString(),
  })
  return { ok: true, to, invoice: updated ?? noted ?? invoice }
}
