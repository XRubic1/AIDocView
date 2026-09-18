/**
 * Optional happy-path automation after AI intake / verification review.
 * Credyx can always override via Ready to Post / Verification / AI tabs.
 *
 * PPW is never sent here — docs go out only when the batch is processed
 * (`processVerifiedBatch`) or via an explicit Send docs / Ready to Post action.
 */
import { getAllBatches, updateBatchStatus } from '../../data/mockBatches'
import { getInvoicesByBatchId, mockInvoices } from '../../data/mockInvoices'
import { emailCredyxIntakeError, emailCredyxVerificationError } from './batchLifecycleEmails'
import type { InvoiceAiReviewOutcome } from './batchAiReviewService'

export interface HappyPathIntakeResult {
  /** Always 0 — PPW is deferred until batch process. Kept for callers/types. */
  ppwSent: number
  ppwFailed: number
  movedToVerification: boolean
  intakeErrorEmailed: boolean
}

/**
 * After AI batch submit: if clean (no unmatched docs, all brokers assigned),
 * advance to verification. Does not send PPW — that waits for batch process.
 * On issues, email Credyx.
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

  // Clean intake: queue for verification. Broker docs wait until Process batch.
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
 * After batch AI review: if any needs_work, email Credyx.
 * If all ready, move to verification for human OK/Hold + Process — never auto-process.
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

  // Ensure batch is in verification for Credyx review — do not auto-approve or Process.
  // Brokers get docs only when Credyx clicks Process batch.
  if (batch.status === 'ready_to_post' || batch.status === 'approval') {
    updateBatchStatus(opts.batchId, 'verification')
  }

  return result
}
