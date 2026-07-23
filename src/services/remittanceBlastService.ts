import { mockBrokers } from '../data/mockBrokers'
import { getClientById } from './clientRegistry'
import {
  fileToEmailAttachment,
  sendTransactionalEmail,
  type EmailAttachment,
} from './emailService'
import {
  getClientDocumentFile,
  getClientDocuments,
} from './clientDocumentService'
import {
  buildCompanyLogoFallbackHtml,
  buildInlineCompanyLogoHtml,
  loadCompanyLogoAttachment,
} from '../utils/emailCompanyLogo'
import {
  defaultSelectedVaultDocIds,
  listBrokersWorkedWithCarrier,
} from '../utils/carrierRemittance'
import { resolveBrokerPaperworkEmail } from '../utils/paperworkSender'
import { logAuditEvent } from '../utils/auditLogger'

export interface RemittanceBlastBrokerRow {
  broker_id: string
  broker_name: string
  email: string | null
}

/** Brokers this carrier has invoiced with, plus resolved paperwork email. */
export function listRemittanceBlastRecipients(clientId: string): RemittanceBlastBrokerRow[] {
  return listBrokersWorkedWithCarrier(clientId).map(({ broker_id, broker_name }) => {
    const broker = mockBrokers.find((b) => b.id === broker_id)
    return {
      broker_id,
      broker_name: broker?.name ?? broker_name,
      email: resolveBrokerPaperworkEmail(broker),
    }
  })
}

/** Default vault attachment IDs for a remittance blast (bank proof). */
export function defaultRemittanceBlastVaultIds(clientId: string): string[] {
  return defaultSelectedVaultDocIds(clientId)
}

/**
 * Email all brokers that have worked with this carrier about a remittance change.
 * Does not put bank numbers in the email body; attaches selected vault docs.
 */
export async function sendRemittanceUpdatedToBrokers(opts: {
  clientId: string
  selectedVaultDocIds?: string[]
  message?: string
  effectiveDate?: string
  sentBy: string
  userId?: string
}): Promise<{
  success: number
  failed: number
  skipped: number
  details: Array<{
    broker_id: string
    broker_name: string
    email: string | null
    success: boolean
    skipped?: boolean
    error?: string
  }>
}> {
  const client = getClientById(opts.clientId)
  if (!client) {
    return {
      success: 0,
      failed: 1,
      skipped: 0,
      details: [
        {
          broker_id: '',
          broker_name: '',
          email: null,
          success: false,
          error: 'Carrier not found',
        },
      ],
    }
  }

  const recipients = listRemittanceBlastRecipients(opts.clientId)
  const vaultIds = opts.selectedVaultDocIds ?? defaultRemittanceBlastVaultIds(opts.clientId)

  const attachments: EmailAttachment[] = []
  const vaultDocs = getClientDocuments(opts.clientId).filter((d) => vaultIds.includes(d.id))
  for (const doc of vaultDocs) {
    try {
      const file = await getClientDocumentFile(doc.id)
      if (!file) continue
      attachments.push(await fileToEmailAttachment(file, doc.file_name || doc.name))
    } catch {
      // Skip missing vault files; still send the notice.
    }
  }

  const logoAttachment = await loadCompanyLogoAttachment()
  const companyLogoHtml = logoAttachment
    ? buildInlineCompanyLogoHtml()
    : buildCompanyLogoFallbackHtml()

  const emailAttachments = logoAttachment
    ? [logoAttachment, ...attachments]
    : attachments

  const effectiveDate =
    opts.effectiveDate?.trim() ||
    client.remittance_updated_at?.slice(0, 10) ||
    new Date().toISOString().slice(0, 10)

  const results = {
    success: 0,
    failed: 0,
    skipped: 0,
    details: [] as Array<{
      broker_id: string
      broker_name: string
      email: string | null
      success: boolean
      skipped?: boolean
      error?: string
    }>,
  }

  for (const row of recipients) {
    if (!row.email) {
      results.skipped++
      results.details.push({
        ...row,
        success: false,
        skipped: true,
        error: 'No paperwork email on file',
      })
      continue
    }

    const emailResult = await sendTransactionalEmail(
      'broker_remittance_updated',
      row.email,
      {
        companyLogoHtml,
        carrierName: client.name,
        effectiveDate,
        brokerName: row.broker_name,
        message: opts.message?.trim() ?? '',
      },
      emailAttachments.length ? emailAttachments : undefined
    )

    if (emailResult.ok) {
      results.success++
      results.details.push({ ...row, success: true })
    } else {
      results.failed++
      results.details.push({
        ...row,
        success: false,
        error: emailResult.error ?? 'Send failed',
      })
    }
  }

  logAuditEvent(
    'document_sent',
    'client',
    opts.clientId,
    client.name,
    `Remittance update notice: ${results.success} sent, ${results.failed} failed, ${results.skipped} skipped`,
    opts.userId ?? 'admin-portal',
    opts.sentBy,
    'Admin',
    undefined,
    {
      client_id: opts.clientId,
      effective_date: effectiveDate,
      vault_doc_ids: vaultIds,
      details: results.details,
    },
    results.failed > 0 ? 'warning' : 'info',
    results.failed === 0
  )

  return results
}
