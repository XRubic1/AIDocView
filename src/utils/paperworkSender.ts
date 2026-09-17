import { Invoice } from '../types/invoice'
import { DocumentSendRecord } from '../types/invoice'
import { mockBrokers } from '../data/mockBrokers'
import { updateInvoiceAsync } from '../data/mockInvoices'
import { logAuditEvent } from './auditLogger'
import {
  fileToEmailAttachment,
  sendTransactionalEmail,
  type EmailAttachment,
} from '../services/emailService'
import { hasPpwBeenSent } from './ppwSent'
import { isEmailLifecycleRuleEnabled } from '../config/emailLifecycle'
import { resolveInvoiceDocumentsAsync } from './resolveInvoiceDocuments'
import {
  getClientDocumentFile,
  getClientDocuments,
} from '../services/clientDocumentService'
import type { Broker } from '../types/broker'
import { getClientById } from '../services/clientRegistry'
import {
  buildCompanyLogoFallbackHtml,
  buildInlineCompanyLogoHtml,
  loadCompanyLogoAttachment,
} from './emailCompanyLogo'
import {
  brokerPacketPartNoteHtml,
  brokerPacketPartSuffix,
  partitionAttachmentsBySize,
  type NamedAttachment,
} from './brokerPacketParts'
import {
  BANK_PROOF_DOCUMENT_TYPES,
  DEFAULT_BROKER_PACKET_REMITTANCE_MESSAGE,
  buildRemittanceChangeNoteHtml,
  defaultSelectedVaultDocIds,
  detectRemittanceChanged,
  isBankProofDocumentType,
} from './carrierRemittance'

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

export interface BrokerPacketFile {
  id: string
  name: string
  file: File
  source: 'invoice' | 'vault_broker'
}

export type BrokerPacketCollectMode = 'defaults' | 'selected' | 'all_broker'

/**
 * Collect files for a broker packet.
 * - defaults: invoice docs + latest voided check / bank letter
 * - selected: invoice docs matching selectedInvoiceDocIds + vault ids in selectedVaultDocIds
 * - all_broker: invoice docs + all broker-category vault docs (legacy)
 */
export async function collectBrokerPacketFiles(
  invoice: Invoice,
  opts?: {
    mode?: BrokerPacketCollectMode
    selectedInvoiceDocIds?: string[]
    selectedVaultDocIds?: string[]
  }
): Promise<BrokerPacketFile[]> {
  const mode = opts?.mode ?? 'defaults'
  const collected: BrokerPacketFile[] = []
  const seenNames = new Set<string>()

  const pushUnique = (item: BrokerPacketFile) => {
    const key = item.name.toLowerCase()
    if (seenNames.has(key)) return
    seenNames.add(key)
    collected.push(item)
  }

  const invoiceDocs = await resolveInvoiceDocumentsAsync(invoice)
  for (const doc of invoiceDocs) {
    if (
      mode === 'selected' &&
      opts?.selectedInvoiceDocIds &&
      !opts.selectedInvoiceDocIds.includes(doc.id)
    ) {
      continue
    }
    pushUnique({
      id: doc.id,
      name: doc.name,
      file: doc.file,
      source: 'invoice',
    })
  }

  const vaultDocs = getClientDocuments(invoice.client_id).filter(
    (d) => d.category === 'broker' && d.approval_status === 'approved'
  )
  let vaultToAttach = vaultDocs

  if (mode === 'defaults') {
    const defaultIds = new Set(defaultSelectedVaultDocIds(invoice.client_id))
    vaultToAttach = vaultDocs.filter((d) => defaultIds.has(d.id))
  } else if (mode === 'selected') {
    const selected = new Set(opts?.selectedVaultDocIds ?? [])
    vaultToAttach = vaultDocs.filter((d) => selected.has(d.id))
  } else if (mode === 'all_broker') {
    vaultToAttach = vaultDocs
  }

  for (const vault of vaultToAttach) {
    const file = await getClientDocumentFile(vault.id)
    if (!file) continue
    pushUnique({
      id: vault.id,
      name: vault.file_name || vault.name,
      file,
      source: 'vault_broker',
    })
  }

  return collected
}

/** Build Resend attachments from collected packet files. */
export async function brokerPacketFilesToAttachments(
  files: BrokerPacketFile[]
): Promise<EmailAttachment[]> {
  const attachments: EmailAttachment[] = []
  for (const item of files) {
    attachments.push(await fileToEmailAttachment(item.file, item.name))
  }
  return attachments
}

export interface BrokerPacketSendResult {
  success: boolean
  error?: string
  sendRecord?: DocumentSendRecord
  /** All part records when the packet was split (includes sendRecord as last successful). */
  sendRecords?: DocumentSendRecord[]
  skipped?: boolean
  /** Number of emails sent when split across parts. */
  partCount?: number
  /** True when remittance changed vs prior invoice for this carrier. */
  remittanceChanged?: boolean
}

/** Send broker paperwork email with real attachments and persist send history. */
export async function sendBrokerPacketForInvoice(
  invoice: Invoice,
  opts: {
    recipientEmail: string
    /** Optional override; when omitted, files are collected automatically. */
    documentNames?: string[]
    attachments?: EmailAttachment[]
    /** Collect mode when attachments are not provided. */
    collectMode?: BrokerPacketCollectMode
    selectedInvoiceDocIds?: string[]
    selectedVaultDocIds?: string[]
    /** Optional free-text note appended in the {{message}} placeholder. */
    message?: string
    sentBy: string
    userId?: string
    automatic?: boolean
    batchNumber?: string
    /** Skip when PPW already logged successfully. */
    skipIfAlreadySent?: boolean
  }
): Promise<BrokerPacketSendResult> {
  if (!isEmailLifecycleRuleEnabled('batch_processed_broker_ppw')) {
    return { success: true, skipped: true, error: 'Broker paperwork emails disabled' }
  }
  if (opts.skipIfAlreadySent && hasPpwBeenSent(invoice)) {
    return { success: true, skipped: true }
  }

  const broker = mockBrokers.find((b) => b.id === invoice.broker_id)
  if (!opts.recipientEmail.trim()) {
    return { success: false, error: 'Recipient email required' }
  }

  let documentNames = opts.documentNames
  let attachments = opts.attachments

  if (!attachments?.length) {
    const files = await collectBrokerPacketFiles(invoice, {
      mode: opts.collectMode ?? 'defaults',
      selectedInvoiceDocIds: opts.selectedInvoiceDocIds,
      selectedVaultDocIds: opts.selectedVaultDocIds,
    })
    if (files.length === 0) {
      return {
        success: false,
        error:
          'No attachable documents found (invoice files or selected vault docs). Upload or select docs before sending.',
      }
    }
    documentNames = files.map((f) => f.name)
    attachments = await brokerPacketFilesToAttachments(files)
  }

  if (!documentNames?.length || !attachments?.length) {
    return { success: false, error: 'No attachable documents found for broker packet' }
  }

  if (documentNames.length !== attachments.length) {
    documentNames = attachments.map((a, i) => a.filename || documentNames![i] || `file-${i + 1}`)
  }

  const named: NamedAttachment[] = attachments.map((attachment, i) => ({
    name: documentNames![i] || attachment.filename || `file-${i + 1}`,
    attachment,
  }))

  const partitioned = partitionAttachmentsBySize(named)
  if ('error' in partitioned) {
    return { success: false, error: partitioned.error }
  }

  const { parts } = partitioned
  const partTotal = parts.length

  const client = getClientById(invoice.client_id)
  const { fingerprint, changed: remittanceChanged } = detectRemittanceChanged(client, invoice)
  const remittanceMessage = DEFAULT_BROKER_PACKET_REMITTANCE_MESSAGE
  const remittanceChangeNoteHtml = buildRemittanceChangeNoteHtml(remittanceChanged)

  const logoAttachment = await loadCompanyLogoAttachment()
  const companyLogoHtml = logoAttachment
    ? buildInlineCompanyLogoHtml()
    : buildCompanyLogoFallbackHtml()

  const to = opts.recipientEmail.trim()
  const baseMessage = opts.message?.trim() ?? ''
  const history: DocumentSendRecord[] = [...(invoice.document_send_history ?? [])]
  const newRecords: DocumentSendRecord[] = []

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    const partNumber = i + 1
    const partSuffix = brokerPacketPartSuffix(partNumber, partTotal)
    const partNoteHtml = brokerPacketPartNoteHtml(partNumber, partTotal)
    const splitNote =
      partTotal > 1
        ? `Sent separately as Part ${partNumber} of ${partTotal} (attachment size).`
        : undefined

    const partMessage =
      partTotal > 1
        ? [splitNote, baseMessage].filter(Boolean).join('\n\n')
        : baseMessage

    const emailAttachments = logoAttachment
      ? [logoAttachment, ...part.attachments]
      : part.attachments

    const sendRecord: DocumentSendRecord = {
      email_address: to,
      sent_at: new Date().toISOString(),
      sent_by: opts.sentBy,
      status: 'delivered',
      documents_sent: part.names,
      note: splitNote,
      part_number: partTotal > 1 ? partNumber : undefined,
      part_total: partTotal > 1 ? partTotal : undefined,
    }

    const emailResult = await sendTransactionalEmail(
      'broker_packet',
      to,
      {
        invoiceNumber: invoice.invoice_number,
        loadNumber: invoice.load_number?.trim() || 'N/A',
        brokerName: broker?.name ?? invoice.broker_name,
        clientName: invoice.client_name,
        documentList: part.names.join(', '),
        companyLogoHtml,
        remittanceMessage,
        remittanceChangeNoteHtml,
        message: partMessage,
        partSuffix,
        partNoteHtml,
      },
      emailAttachments
    )

    if (!emailResult.ok) {
      sendRecord.status = 'failed'
      history.push(sendRecord)
      newRecords.push(sendRecord)
      await updateInvoiceAsync(invoice.id, {
        document_send_history: history,
        remittance_snapshot: fingerprint,
      })

      logAuditEvent(
        'document_sent',
        'invoice',
        invoice.id,
        invoice.invoice_number,
        `Failed to send paperwork for ${invoice.invoice_number}${partSuffix}: ${emailResult.error}`,
        opts.userId ?? 'admin-portal',
        opts.sentBy,
        'Admin',
        undefined,
        {
          broker_email: opts.recipientEmail,
          error: emailResult.error,
          part_number: partNumber,
          part_total: partTotal,
        },
        'error',
        false
      )

      const partial =
        newRecords.filter((r) => r.status === 'delivered' || r.status === 'sent').length > 0
      return {
        success: false,
        error: partial
          ? `Part ${partNumber} of ${partTotal} failed: ${emailResult.error}. Earlier part(s) were sent — check Send history.`
          : emailResult.error,
        sendRecord,
        sendRecords: newRecords,
        partCount: partTotal,
        remittanceChanged,
      }
    }

    history.push(sendRecord)
    newRecords.push(sendRecord)
  }

  await updateInvoiceAsync(invoice.id, {
    document_send_history: history,
    remittance_snapshot: fingerprint,
  })

  // Log PPW in Credyx Inbox (invoice / client / broker thread).
  try {
    const { recordOutboundMessage } = await import('../services/emailLifecycleService')
    const docList = newRecords
      .filter((r) => r.status === 'delivered' || r.status === 'sent')
      .flatMap((r) => r.documents_sent ?? [])
    const uniqueDocs = [...new Set(docList)]
    recordOutboundMessage({
      invoice,
      to,
      subject: `Paperwork packet — Invoice ${invoice.invoice_number}${
        invoice.load_number ? ` · Load ${invoice.load_number}` : ''
      }`,
      body: [
        `Broker packet sent to ${to}.`,
        uniqueDocs.length > 0 ? `Documents: ${uniqueDocs.join(', ')}` : null,
        partTotal > 1 ? `Sent in ${partTotal} parts.` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      templateId: 'broker_packet',
    })
  } catch (err) {
    console.warn('[paperworkSender] inbox log failed', err)
  }

  // Start paperwork chase clock so calendar + auto-chase know when the first ask is due.
  try {
    const { startPaperworkTrack } = await import('../services/emailLifecycleTrack')
    await startPaperworkTrack(invoice.id, new Date().toISOString())
  } catch (err) {
    console.warn('[paperworkSender] paperwork track start failed', err)
  }

  logAuditEvent(
    'document_sent',
    'invoice',
    invoice.id,
    invoice.invoice_number,
    partTotal > 1
      ? `Paperwork sent to ${to} for invoice ${invoice.invoice_number} in ${partTotal} parts`
      : `Paperwork sent to ${to} for invoice ${invoice.invoice_number}`,
    opts.userId ?? 'admin-portal',
    opts.sentBy,
    'Admin',
    undefined,
    {
      batch_number: opts.batchNumber,
      broker_id: invoice.broker_id,
      broker_name: invoice.broker_name,
      broker_email: opts.recipientEmail,
      documents_sent: documentNames,
      automatic: opts.automatic ?? false,
      part_total: partTotal,
      remittance_changed: remittanceChanged,
    },
    'info',
    true
  )

  return {
    success: true,
    sendRecord: newRecords[newRecords.length - 1],
    sendRecords: newRecords,
    partCount: partTotal,
    remittanceChanged,
  }
}

/**
 * Send paperwork for invoices in a batch.
 * Batch path uses defaults (invoice docs + bank proof) — full picker is on Send docs.
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
  details: Array<{
    invoiceId: string
    invoiceNumber: string
    brokerEmail: string
    success: boolean
    error?: string
    skipped?: boolean
  }>
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

    const sent = await sendBrokerPacketForInvoice(invoice, {
      recipientEmail: brokerEmail,
      sentBy: userName,
      userId,
      automatic: true,
      batchNumber,
      skipIfAlreadySent: skipAlreadySent,
      collectMode: 'defaults',
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

/** Exported for UI warnings / docs. */
export { BANK_PROOF_DOCUMENT_TYPES, isBankProofDocumentType }
