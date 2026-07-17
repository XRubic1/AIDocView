import { Invoice } from '../types/invoice'
import { DocumentSendRecord } from '../types/invoice'
import { mockBrokers } from '../data/mockBrokers'
import { updateInvoiceAsync } from '../data/mockInvoices'
import { logAuditEvent } from './auditLogger'
import { sendTransactionalEmail } from '../services/emailService'
import { hasPpwBeenSent } from './ppwSent'
import type { Broker } from '../types/broker'

/** Prefer paperwork category, then accounting, then legacy email. */
export function resolveBrokerPaperworkEmail(broker: Broker | undefined): string | null {
  if (!broker) return null
  const paperwork = broker.emails?.find((e) => e.category === 'paperwork')?.email?.trim()
  if (paperwork) return paperwork
  const accounting = broker.emails?.find((e) => e.category === 'accounting')?.email?.trim()
  if (accounting) return accounting
  const legacy = broker.email?.trim()
  return legacy || null
}

export interface BrokerPacketSendResult {
  success: boolean
  error?: string
  sendRecord?: DocumentSendRecord
  skipped?: boolean
}

/** Send broker paperwork email and persist document_send_history on the invoice. */
export async function sendBrokerPacketForInvoice(
  invoice: Invoice,
  opts: {
    recipientEmail: string
    documentNames: string[]
    sentBy: string
    userId?: string
    automatic?: boolean
    batchNumber?: string
    /** Skip when PPW already logged successfully. */
    skipIfAlreadySent?: boolean
  }
): Promise<BrokerPacketSendResult> {
  if (opts.skipIfAlreadySent && hasPpwBeenSent(invoice)) {
    return { success: true, skipped: true }
  }

  const broker = mockBrokers.find((b) => b.id === invoice.broker_id)
  if (!opts.recipientEmail.trim()) {
    return { success: false, error: 'Recipient email required' }
  }

  const sendRecord: DocumentSendRecord = {
    email_address: opts.recipientEmail.trim(),
    sent_at: new Date().toISOString(),
    sent_by: opts.sentBy,
    status: 'delivered',
    documents_sent: opts.documentNames,
  }

  const emailResult = await sendTransactionalEmail('broker_packet', opts.recipientEmail.trim(), {
    invoiceNumber: invoice.invoice_number,
    brokerName: broker?.name ?? invoice.broker_name,
    clientName: invoice.client_name,
    documentList: opts.documentNames.join(', '),
  })

  if (!emailResult.ok) {
    sendRecord.status = 'failed'
    logAuditEvent(
      'document_sent',
      'invoice',
      invoice.id,
      invoice.invoice_number,
      `Failed to send paperwork for ${invoice.invoice_number}: ${emailResult.error}`,
      opts.userId ?? 'admin-portal',
      opts.sentBy,
      'Admin',
      undefined,
      { broker_email: opts.recipientEmail, error: emailResult.error },
      'error',
      false
    )
    return { success: false, error: emailResult.error, sendRecord }
  }

  const history = [...(invoice.document_send_history ?? []), sendRecord]
  await updateInvoiceAsync(invoice.id, { document_send_history: history })

  logAuditEvent(
    'document_sent',
    'invoice',
    invoice.id,
    invoice.invoice_number,
    `Paperwork sent to ${opts.recipientEmail} for invoice ${invoice.invoice_number}`,
    opts.userId ?? 'admin-portal',
    opts.sentBy,
    'Admin',
    undefined,
    {
      batch_number: opts.batchNumber,
      broker_id: invoice.broker_id,
      broker_name: invoice.broker_name,
      broker_email: opts.recipientEmail,
      documents_sent: opts.documentNames,
      automatic: opts.automatic ?? false,
    },
    'info',
    true
  )

  return { success: true, sendRecord }
}

/**
 * Send paperwork for invoices in a batch.
 * Prefer paperwork-category emails; skip invoices that already have successful PPW
 * unless skipAlreadySent is false.
 */
export async function sendPaperworkForBatch(
  invoices: Invoice[],
  batchNumber: string,
  userId: string = 'system',
  userName: string = 'System',
  userRole: string = 'System',
  options: { skipAlreadySent?: boolean } = {}
): Promise<{
  success: number
  failed: number
  skipped: number
  details: Array<{ invoiceId: string; invoiceNumber: string; brokerEmail: string; success: boolean; error?: string; skipped?: boolean }>
}> {
  const skipAlreadySent = options.skipAlreadySent ?? true
  const results = {
    success: 0,
    failed: 0,
    skipped: 0,
    details: [] as Array<{
      invoiceId: string
      invoiceNumber: string
      brokerEmail: string
      success: boolean
      error?: string
      skipped?: boolean
    }>,
  }

  for (const invoice of invoices) {
    if (skipAlreadySent && hasPpwBeenSent(invoice)) {
      results.skipped++
      results.details.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        brokerEmail: '—',
        success: true,
        skipped: true,
      })
      continue
    }

    const broker = mockBrokers.find((b) => b.id === invoice.broker_id)
    const brokerEmail = resolveBrokerPaperworkEmail(broker)

    if (!brokerEmail) {
      results.failed++
      results.details.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        brokerEmail: 'N/A',
        success: false,
        error: broker ? 'Broker paperwork email not available' : 'Broker not found',
      })
      continue
    }

    const documentNames: string[] = []
    if (invoice.documents_count && invoice.documents_count > 0) {
      for (let i = 0; i < invoice.documents_count; i++) {
        documentNames.push(`Document_${i + 1}.pdf`)
      }
    } else {
      documentNames.push('Invoice.pdf', 'BOL.pdf')
    }

    const sent = await sendBrokerPacketForInvoice(invoice, {
      recipientEmail: brokerEmail,
      documentNames,
      sentBy: userName,
      userId,
      automatic: true,
      batchNumber,
      skipIfAlreadySent: skipAlreadySent,
    })

    if (sent.skipped) {
      results.skipped++
      results.details.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        brokerEmail,
        success: true,
        skipped: true,
      })
    } else if (sent.success) {
      results.success++
      results.details.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        brokerEmail,
        success: true,
      })
    } else {
      results.failed++
      results.details.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        brokerEmail,
        success: false,
        error: sent.error,
      })
    }
  }

  if (results.success > 0 || results.failed > 0 || results.skipped > 0) {
    logAuditEvent(
      'document_sent',
      'batch',
      null,
      batchNumber,
      `Paperwork sending for batch ${batchNumber}: ${results.success} sent, ${results.failed} failed, ${results.skipped} skipped`,
      userId,
      userName,
      userRole,
      undefined,
      {
        batch_number: batchNumber,
        total_invoices: invoices.length,
        successful: results.success,
        failed: results.failed,
        skipped: results.skipped,
        details: results.details,
      },
      results.failed > 0 ? 'warning' : 'info',
      results.failed === 0
    )
  }

  return results
}
