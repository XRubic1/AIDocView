/**
 * Process a verified batch → submitted.
 * Sends PPW for approved invoices that have not been sent yet, then emails the carrier.
 */
import { updateBatch, updateBatchStatus } from '../../data/mockBatches'
import { mockInvoices } from '../../data/mockInvoices'
import { logAuditEvent } from '../../utils/auditLogger'
import { sendPaperworkForBatch } from '../../utils/paperworkSender'
import { hasPpwBeenSent } from '../../utils/ppwSent'
import { lockBatchFeeTermsFromClient } from '../../utils/feeTermsLock'
import { getClientById } from '../clientRegistry'
import { approveAdminInvoice, notifyClientHoldsAfterBatchProcess } from '../adminInvoiceActions'
import { notifyTenantDataUpdated } from '../supabase/tenantDataLiveSync'
import { emailCarrierBatchProcessed } from './batchLifecycleEmails'
import { emitCredyxEvent } from '../credyxEvents'

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
 * Process batch when every invoice is approved, on hold, or AI-cleared (ready).
 * AI-ready invoices are auto-approved at process time. Held invoices stay on hold.
 * Approved invoices get PPW (when not already sent) and the batch moves to submitted.
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

  // AI "OK" (ready) invoices still have status pending until Process — approve them now.
  for (const inv of batchInvoices) {
    if (inv.status === 'approved' || inv.status === 'hold') continue
    if (inv.status === 'review') continue
    if (inv.ai_review_status === 'ready') {
      approveAdminInvoice(inv.id, opts.adminUserName)
    }
  }

  const liveInvoices = mockInvoices.filter((inv) => inv.batch_id === opts.batchId)
  const unsettled = liveInvoices.filter(
    (inv) => inv.status !== 'approved' && inv.status !== 'hold'
  )
  if (unsettled.length > 0) {
    return {
      ok: false,
      error: `All invoices must be OK, AI-cleared, or on hold (${liveInvoices.length - unsettled.length}/${liveInvoices.length} settled).`,
      paperwork: { success: 0, failed: 0, skipped: 0 },
    }
  }

  const approved = liveInvoices.filter((inv) => inv.status === 'approved')
  const held = liveInvoices.filter((inv) => inv.status === 'hold')

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
      total_invoices: liveInvoices.length,
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

  // Submitted + clear AI/rework attention so the batch leaves the AI Verify queue.
  const moved = updateBatch(opts.batchId, {
    status: 'submitted',
    sort_status: 'ready',
    unmatched_doc_ids: [],
  })
  if (!moved) {
    updateBatchStatus(opts.batchId, 'submitted')
  } else {
    notifyTenantDataUpdated(['batches', 'invoices'], opts.clientId)
  }

  // Freeze fee terms at process time so later client rate changes do not rewrite this batch.
  await lockBatchFeeTermsFromClient(opts.batchId, getClientById(opts.clientId))

  // Reveal hold outcomes to the client now that the batch is processed.
  notifyClientHoldsAfterBatchProcess(opts.batchId)

  // One carrier email: processed + holds + PPW summary — unless a Live
  // batch blueprint Then-do owns that email (avoids double-send).
  let carrierEmail: ProcessBatchResult['carrierEmail'] = { ok: true, kind: 'none' }
  if (liveInvoices.length > 0) {
    const { shouldSkipSettingsBatchCarrierEmail } = await import(
      '../../components/blueprints/blueprintBatchCarrierEmail'
    )
    if (shouldSkipSettingsBatchCarrierEmail(opts.batchId)) {
      carrierEmail = {
        ok: true,
        kind: 'processed',
        skipped: true,
        error: 'Blueprint owns carrier batch email',
      }
    } else {
      const res = await emailCarrierBatchProcessed({
        clientId: opts.clientId,
        batchNumber: opts.batchNumber,
        invoices: liveInvoices,
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

  emitCredyxEvent('batch.processed', opts.batchId, {
    batchNumber: opts.batchNumber,
    clientId: opts.clientId,
  })
  queueMicrotask(() => {
    void import('../../components/blueprints/blueprintBatchRunner')
      .then((m) => {
        m.ensureBatchBlueprintListener()
        m.onBatchProcessed(opts.batchId)
      })
      .catch(() => undefined)
  })

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
