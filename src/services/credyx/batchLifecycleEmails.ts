/**
 * Lifecycle emails for batch intake errors, verification issues, and
 * carrier outcome notices after a batch is processed.
 */
import { sendTransactionalEmail } from '../emailService'
import type { Invoice } from '../../types/invoice'
import { hasPpwBeenSent } from '../../utils/ppwSent'
import { getAllClients } from '../clientRegistry'

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

/** Build PPW destination summary lines for carrier emails. */
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

/** Email carrier that all invoices verified cleanly (and PPW destinations). */
export async function emailCarrierBatchVerified(opts: {
  clientId: string
  batchNumber: string
  invoices: Invoice[]
}): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  const to = getClientContactEmail(opts.clientId)
  if (!to) return { ok: false, error: 'Client email not on file', skipped: true }

  const ppwSummary = buildPpwSummaryLines(opts.invoices)
  return sendTransactionalEmail('carrier_batch_verified', to, {
    batchNumber: opts.batchNumber,
    invoiceCount: String(opts.invoices.length),
    ppwSummary: ppwSummary || 'No paperwork sends were logged for this batch.',
  })
}

/** Email carrier listing held invoices + reasons (one email for the batch). */
export async function emailCarrierBatchHolds(opts: {
  clientId: string
  batchNumber: string
  heldInvoices: Invoice[]
}): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  const to = getClientContactEmail(opts.clientId)
  if (!to) return { ok: false, error: 'Client email not on file', skipped: true }

  const holdList = opts.heldInvoices
    .map(
      (inv) =>
        `• ${inv.invoice_number}${inv.load_number ? ` (Load ${inv.load_number})` : ''}: ${inv.hold_reason?.trim() || 'On hold — see portal for details'}`
    )
    .join('\n')

  return sendTransactionalEmail('carrier_batch_holds', to, {
    batchNumber: opts.batchNumber,
    holdCount: String(opts.heldInvoices.length),
    holdList,
  })
}
