/**
 * Process a verified batch → submitted.
 * PPW is expected earlier; this step skips already-sent invoices and emails the carrier.
 */
import { updateBatchStatus } from '../../data/mockBatches'
import { mockInvoices } from '../../data/mockInvoices'
import { logAuditEvent } from '../../utils/auditLogger'
import { sendPaperworkForBatch } from '../../utils/paperworkSender'
import { hasPpwBeenSent } from '../../utils/ppwSent'
import { lockBatchFeeTermsFromClient } from '../../utils/feeTermsLock'
import { getClientById } from '../clientRegistry'
import { notifyClientHoldsAfterBatchProcess } from '../adminInvoiceActions'
import { emailCarrierBatchProcessed } from './batchLifecycleEmails'

export interface ProcessBatchResult {
  ok: boolean
  error?: string
  paperwork: { success: number; failed: number; skipped: number }
  carrierEmail?: {
    ok: boolean
    kind: 'processed' | 'none'
    error?: string
    skipped?: boolean
  }
}

/**
 * Process batch when every invoice is approved or on hold.
 * Held invoices stay on hold; approved invoices are ready for collections.
 */
export async function processVerifiedBatch(opts: {
  batchId: string
  batchNumber: string
  clientId: string
  totalAmount: number
  adminUserId: string
  adminUserName: string
  /** When true, re-send PPW even if already logged (manual override). */
  forceResendPpw?: boolean
}): Promise<ProcessBatchResult> {
  const batchInvoices = mockInvoices.filter((inv) => inv.batch_id === opts.batchId)
  if (batchInvoices.length === 0) {
    return {
      ok: false,
      error: 'Batch has no invoices',
      paperwork: { success: 0, failed: 0, skipped: 0 },
    }
  }

  const unsettled = batchInvoices.filter(
    (inv) => inv.status !== 'approved' && inv.status !== 'hold'
  )
  if (unsettled.length > 0) {
    return {
      ok: false,
      error: `All invoices must be approved or on hold (${batchInvoices.length - unsettled.length}/${batchInvoices.length} settled).`,
      paperwork: { success: 0, failed: 0, skipped: 0 },
    }
  }

  const approved = batchInvoices.filter((inv) => inv.status === 'approved')
  const held = batchInvoices.filter((inv) => inv.status === 'hold')

  // Only send PPW for approved invoices that have not been sent yet (unless force).
  const toSend = opts.forceResendPpw
    ? approved
    : approved.filter((inv) => !hasPpwBeenSent(inv))
  const alreadySentSkipped = approved.length - toSend.length

  logAuditEvent(
    'batch_status_changed',
    'batch',
    opts.batchId,
    opts.batchNumber,
    `Processing batch ${opts.batchNumber} — moving to submitted`,
    opts.adminUserId,
    opts.adminUserName,
    'Admin',
    [{ field: 'status', old_value: 'verification', new_value: 'submitted' }],
    {
      total_invoices: batchInvoices.length,
      total_amount: opts.totalAmount,
      approved_count: approved.length,
      hold_count: held.length,
    },
    'info',
    true
  )

  const paperworkResults =
    toSend.length > 0
      ? await sendPaperworkForBatch(
          toSend,
          opts.batchNumber,
          opts.adminUserId,
          opts.adminUserName,
          'Admin',
          { skipAlreadySent: !opts.forceResendPpw }
        )
      : { success: 0, failed: 0, skipped: 0, details: [] }

  // Include already-sent approved invoices in the carrier PPW summary.
  const preSkippedDetails = approved
    .filter((inv) => !toSend.some((s) => s.id === inv.id))
    .map((inv) => ({
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number,
      brokerEmail: '—',
      success: true,
      skipped: true,
    }))

  const ppwDetails = [...preSkippedDetails, ...paperworkResults.details]
  const totalSkipped = alreadySentSkipped + paperworkResults.skipped

  updateBatchStatus(opts.batchId, 'submitted')

  // Freeze fee terms at process time so later client rate changes do not rewrite this batch.
  await lockBatchFeeTermsFromClient(opts.batchId, getClientById(opts.clientId))

  // Reveal hold outcomes to the client now that the batch is processed.
  notifyClientHoldsAfterBatchProcess(opts.batchId)

  // One carrier email: processed + holds (if any) + broker paperwork summary.
  let carrierEmail: ProcessBatchResult['carrierEmail'] = { ok: true, kind: 'none' }
  if (batchInvoices.length > 0) {
    const res = await emailCarrierBatchProcessed({
      clientId: opts.clientId,
      batchNumber: opts.batchNumber,
      invoices: batchInvoices,
      heldInvoices: held,
      ppwDetails,
    })
    carrierEmail = {
      ok: res.ok || Boolean(res.skipped),
      kind: 'processed',
      error: res.error,
      skipped: res.skipped,
    }
  }

  logAuditEvent(
    'batch_status_changed',
    'batch',
    opts.batchId,
    opts.batchNumber,
    `Batch ${opts.batchNumber} processed. PPW sent: ${paperworkResults.success}, failed: ${paperworkResults.failed}, skipped: ${totalSkipped}`,
    opts.adminUserId,
    opts.adminUserName,
    'Admin',
    undefined,
    {
      paperwork_sent: paperworkResults.success,
      paperwork_failed: paperworkResults.failed,
      paperwork_skipped: totalSkipped,
      carrier_email_kind: carrierEmail.kind,
      carrier_email_ok: carrierEmail.ok,
    },
    paperworkResults.failed > 0 || !carrierEmail.ok ? 'warning' : 'info',
    true
  )

  return {
    ok: true,
    paperwork: {
      success: paperworkResults.success,
      failed: paperworkResults.failed,
      skipped: totalSkipped,
    },
    carrierEmail,
  }
}
