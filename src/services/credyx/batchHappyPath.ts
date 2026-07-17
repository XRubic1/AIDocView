/**
 * Optional happy-path automation after AI intake / verification review.
 * Credyx can always override via Ready to Post / Verification / AI tabs.
 */
import { getAllBatches, updateBatchStatus } from '../../data/mockBatches'
import { getInvoicesByBatchId, mockInvoices } from '../../data/mockInvoices'
import { sendPaperworkForBatch } from '../../utils/paperworkSender'
import { approveAdminInvoice } from '../adminInvoiceActions'
import { emailCredyxIntakeError, emailCredyxVerificationError } from './batchLifecycleEmails'
import { processVerifiedBatch } from './processBatch'
import type { InvoiceAiReviewOutcome } from './batchAiReviewService'

export interface HappyPathIntakeResult {
  ppwSent: number
  ppwFailed: number
  movedToVerification: boolean
  intakeErrorEmailed: boolean
}

/**
 * After AI batch submit: if clean (no unmatched docs, all brokers assigned),
 * send PPW and advance to verification. On issues, email Credyx.
 */
export async function runHappyPathAfterIntake(opts: {
  batchId: string
  batchNumber: string
  clientName: string
  unmatchedCount: number
}): Promise<HappyPathIntakeResult> {
  const result: HappyPathIntakeResult = {
    ppwSent: 0,
    ppwFailed: 0,
    movedToVerification: false,
    intakeErrorEmailed: false,
  }

  const invoices = getInvoicesByBatchId(opts.batchId)
  const missingBroker = invoices.filter((inv) => !inv.broker_id)
  const incompleteDocs = invoices.filter((inv) => !inv.documents_count)

  if (opts.unmatchedCount > 0 || missingBroker.length > 0 || incompleteDocs.length > 0) {
    const issues: string[] = []
    if (opts.unmatchedCount > 0) issues.push(`${opts.unmatchedCount} unmatched document(s)`)
    if (missingBroker.length > 0) issues.push(`${missingBroker.length} invoice(s) missing broker`)
    if (incompleteDocs.length > 0) issues.push(`${incompleteDocs.length} invoice(s) missing documents`)
    await emailCredyxIntakeError({
      batchNumber: opts.batchNumber,
      clientName: opts.clientName,
      issueMessage: issues.join('; '),
    })
    result.intakeErrorEmailed = true
    return result
  }

  const ppw = await sendPaperworkForBatch(
    invoices,
    opts.batchNumber,
    'system',
    'AI Happy Path',
    'System',
    { skipAlreadySent: true }
  )
  result.ppwSent = ppw.success
  result.ppwFailed = ppw.failed

  if (ppw.failed > 0) {
    await emailCredyxIntakeError({
      batchNumber: opts.batchNumber,
      clientName: opts.clientName,
      issueMessage: `PPW send failed for ${ppw.failed} invoice(s). Credyx can re-send from Ready to Post or AI tab.`,
    })
    result.intakeErrorEmailed = true
    return result
  }

  updateBatchStatus(opts.batchId, 'verification')
  result.movedToVerification = true
  return result
}

export interface HappyPathReviewResult {
  autoApproved: number
  processed: boolean
  verificationErrorEmailed: boolean
}

/**
 * After batch AI review: if all invoices are ready, auto-approve and process.
 * If any needs_work, email Credyx and leave for manual Verification.
 */
export async function runHappyPathAfterAiReview(opts: {
  batchId: string
  outcomes: InvoiceAiReviewOutcome[]
}): Promise<HappyPathReviewResult> {
  const result: HappyPathReviewResult = {
    autoApproved: 0,
    processed: false,
    verificationErrorEmailed: false,
  }

  const batch = getAllBatches().find((b) => b.id === opts.batchId)
  if (!batch) return result

  const needsWork = opts.outcomes.filter((o) => o.status === 'needs_work')
  if (needsWork.length > 0) {
    await emailCredyxVerificationError({
      batchNumber: batch.batch_number,
      issues: needsWork.map((o) => {
        const inv = mockInvoices.find((i) => i.id === o.invoiceId)
        return {
          invoiceNumber: o.invoiceNumber,
          loadNumber: inv?.load_number,
          message: o.detail || o.headline,
        }
      }),
    })
    result.verificationErrorEmailed = true
    return result
  }

  if (opts.outcomes.length === 0 || opts.outcomes.some((o) => o.status !== 'ready')) {
    return result
  }

  // Ensure batch is in verification before process
  if (batch.status === 'ready_to_post' || batch.status === 'approval') {
    updateBatchStatus(opts.batchId, 'verification')
  }

  for (const o of opts.outcomes) {
    approveAdminInvoice(o.invoiceId)
    result.autoApproved++
  }

  const processResult = await processVerifiedBatch({
    batchId: opts.batchId,
    batchNumber: batch.batch_number,
    clientId: batch.client_id,
    totalAmount: batch.total_amount,
    adminUserId: 'system',
    adminUserName: 'AI Happy Path',
  })

  result.processed = processResult.ok
  return result
}
