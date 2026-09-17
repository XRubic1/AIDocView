/**
 * Lifecycle emails for batch intake errors, verification issues, and
 * carrier outcome notices after a batch is processed.
 */
import { sendTransactionalEmail } from '../emailService'
import type { Invoice } from '../../types/invoice'
import { hasPpwBeenSent } from '../../utils/ppwSent'
import { getAllClients } from '../clientRegistry'
import { isEmailLifecycleRuleEnabled } from '../../config/emailLifecycle'

const CREDYX_OPS_EMAIL = 'ops@credyx.net'

/** Resolve carrier/client contact email for outcome notices. */
export function getClientContactEmail(clientId: string): string | null {
  const client = getAllClients().find((c) => c.id === clientId)
  const email = client?.email?.trim()
  return email || null
}

/** Notify Credyx that intake/sort failed for a batch. */
export async function emailCredyxIntakeError(opts: {
  batchNumber: string
  clientName?: string
  issueMessage: string
}): Promise<{ ok: boolean; error?: string }> {
  if (!isEmailLifecycleRuleEnabled('credyx_ops_issues')) {
    return { ok: true, error: 'Ops issue emails disabled' }
  }
  return sendTransactionalEmail('credyx_batch_error', CREDYX_OPS_EMAIL, {
    batchNumber: opts.batchNumber,
    clientName: opts.clientName ?? '',
    issueMessage: opts.issueMessage,
    scope: 'intake',
  })
}

/** Notify Credyx that verification AI found issues on invoices. */
export async function emailCredyxVerificationError(opts: {
  batchNumber: string
  issues: Array<{ invoiceNumber: string; loadNumber?: string; message: string }>
}): Promise<{ ok: boolean; error?: string }> {
  if (!isEmailLifecycleRuleEnabled('credyx_ops_issues')) {
    return { ok: true, error: 'Ops issue emails disabled' }
  }
  const issueMessage = opts.issues
    .map(
      (i) =>
        `Inv# ${i.invoiceNumber}${i.loadNumber ? ` · Load# ${i.loadNumber}` : ''}: ${i.message}`
    )
    .join('\n')
  return sendTransactionalEmail('credyx_batch_error', CREDYX_OPS_EMAIL, {
    batchNumber: opts.batchNumber,
    issueMessage,
    scope: 'verification',
  })
}

/** Build PPW destination summary lines for carrier emails (from invoice history). */
export function buildPpwSummaryLines(invoices: Invoice[]): string {
  return invoices
    .filter(hasPpwBeenSent)
    .map((inv) => {
      const last = [...(inv.document_send_history ?? [])]
        .reverse()
        .find((r) => r.status === 'sent' || r.status === 'delivered')
      return `${inv.invoice_number}: sent to ${last?.email_address ?? 'broker'}`
    })
    .join('\n')
}

export interface PpwSendDetail {
  invoiceId: string
  invoiceNumber: string
  brokerEmail: string
  success: boolean
  error?: string
  skipped?: boolean
}

/** Format PPW batch send results for the carrier process email. */
export function buildPpwResultsSummary(details: PpwSendDetail[]): string {
  if (details.length === 0) {
    return 'No paperwork sends were attempted for this batch.'
  }
  return details
    .map((d) => {
      if (d.skipped) return `${d.invoiceNumber}: already sent (skipped)`
      if (d.success) return `${d.invoiceNumber}: sent to ${d.brokerEmail}`
      return `${d.invoiceNumber}: failed (${d.error ?? 'unknown error'}) → ${d.brokerEmail}`
    })
    .join('\n')
}

/** Format hold list for carrier emails. */
export function buildHoldList(heldInvoices: Invoice[]): string {
  return heldInvoices
    .map(
      (inv) =>
        `• ${inv.invoice_number}${inv.load_number ? ` (Load ${inv.load_number})` : ''}: ${inv.hold_reason?.trim() || 'On hold — see portal for details'}`
    )
    .join('\n')
}

/**
 * Email carrier that the batch was processed: includes holds (if any) and
 * broker paperwork send summary.
 */
export async function emailCarrierBatchProcessed(opts: {
  clientId: string
  batchNumber: string
  invoices: Invoice[]
  heldInvoices: Invoice[]
  ppwDetails?: PpwSendDetail[]
}): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  if (!isEmailLifecycleRuleEnabled('batch_processed_carrier')) {
    return { ok: true, skipped: true, error: 'Carrier batch emails disabled' }
  }
  const to = getClientContactEmail(opts.clientId)
  if (!to) return { ok: false, error: 'Client email not on file', skipped: true }

  const ppwSummary =
    opts.ppwDetails && opts.ppwDetails.length > 0
      ? buildPpwResultsSummary(opts.ppwDetails)
      : buildPpwSummaryLines(opts.invoices) || 'No paperwork sends were logged for this batch.'

  const holdList = buildHoldList(opts.heldInvoices)

  const result = await sendTransactionalEmail('carrier_batch_processed', to, {
    batchNumber: opts.batchNumber,
    invoiceCount: String(opts.invoices.length),
    holdCount: String(opts.heldInvoices.length),
    holdList: holdList || 'None',
    ppwSummary,
  })

  if (result.ok && opts.invoices[0]) {
    try {
      const { recordOutboundMessage } = await import('../emailLifecycleService')
      recordOutboundMessage({
        invoice: opts.invoices[0],
        to,
        subject: `Batch ${opts.batchNumber} processed — carrier notice`,
        body: [
          `Carrier notice for batch ${opts.batchNumber} (${opts.invoices.length} invoice(s)).`,
          ppwSummary,
          holdList ? `Holds:\n${holdList}` : null,
        ]
          .filter(Boolean)
          .join('\n\n'),
        templateId: 'carrier_batch_processed',
        messageId: result.id,
      })
    } catch (err) {
      console.warn('[batchLifecycleEmails] inbox log failed', err)
    }
  }

  return result
}

/** @deprecated Prefer emailCarrierBatchProcessed — kept for older call sites. */
export async function emailCarrierBatchVerified(opts: {
  clientId: string
  batchNumber: string
  invoices: Invoice[]
}): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  return emailCarrierBatchProcessed({
    clientId: opts.clientId,
    batchNumber: opts.batchNumber,
    invoices: opts.invoices,
    heldInvoices: [],
  })
}

/** @deprecated Prefer emailCarrierBatchProcessed — kept for older call sites. */
export async function emailCarrierBatchHolds(opts: {
  clientId: string
  batchNumber: string
  heldInvoices: Invoice[]
}): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  return emailCarrierBatchProcessed({
    clientId: opts.clientId,
    batchNumber: opts.batchNumber,
    invoices: opts.heldInvoices,
    heldInvoices: opts.heldInvoices,
  })
}
