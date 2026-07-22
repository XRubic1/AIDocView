/**
 * Process a verified batch → submitted.
 * PPW is expected earlier; this step skips already-sent invoices and emails the carrier.
 */
import { updateBatchStatus } from '../../data/mockBatches'
import { mockInvoices } from '../../data/mockInvoices'
import { logAuditEvent } from '../../utils/auditLogger'
import { sendPaperworkForBatch } from '../../utils/paperworkSender'
import { hasPpwBeenSent } from '../../utils/ppwSent'
import { notifyClientHoldsAfterBatchProcess } from '../adminInvoiceActions'
import {
  emailCarrierBatchHolds,
  emailCarrierBatchVerified,
} from './batchLifecycleEmails'

export interface ProcessBatchResult {
  ok: boolean
  error?: string
  paperwork: { success: number; failed: number; skipped: number }
  carrierEmail?: { ok: boolean; kind: 'verified' | 'holds' | 'none'; error?: string }
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
  const skipped = approved.length - toSend.length

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

  updateBatchStatus(opts.batchId, 'submitted')

  // Reveal hold outcomes to the client now that the batch is processed.
  notifyClientHoldsAfterBatchProcess(opts.batchId)

  // Carrier outcome email: holds take precedence when any invoice is held.
  let carrierEmail: ProcessBatchResult['carrierEmail'] = { ok: true, kind: 'none' }
  if (held.length > 0) {
    const res = await emailCarrierBatchHolds({
      clientId: opts.clientId,
      batchNumber: opts.batchNumber,
      heldInvoices: held,
    })
    carrierEmail = {
      ok: res.ok,
      kind: 'holds',
      error: res.error,
    }
  } else if (approved.length > 0) {
    const res = await emailCarrierBatchVerified({
      clientId: opts.clientId,
      batchNumber: opts.batchNumber,
      invoices: batchInvoices,
    })
    carrierEmail = {
      ok: res.ok || Boolean(res.skipped),
      kind: 'verified',
      error: res.error,
    }
  }

  logAuditEvent(
    'batch_status_changed',
    'batch',
    opts.batchId,
    opts.batchNumber,
    `Batch ${opts.batchNumber} processed. PPW sent: ${paperworkResults.success}, failed: ${paperworkResults.failed}, skipped: ${skipped}`,
    opts.adminUserId,
    opts.adminUserName,
    'Admin',
    undefined,
    {
      paperwork_sent: paperworkResults.success,
      paperwork_failed: paperworkResults.failed,
      paperwork_skipped: skipped,
      carrier_email_kind: carrierEmail.kind,
    },
    paperworkResults.failed > 0 ? 'warning' : 'info',
    true
  )

  return {
    ok: true,
    paperwork: {
      success: paperworkResults.success,
      failed: paperworkResults.failed,
      skipped,
    },
    carrierEmail,
  }
}
