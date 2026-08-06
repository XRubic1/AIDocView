import { getBatchFiles } from '../../data/batchFileStore'
import { setInvoiceAiReviewCache } from '../../data/invoiceAiReviewCache'
import { getInvoicesByBatchId, updateInvoice } from '../../data/mockInvoices'
import { reviewUploadedDocuments } from '../documentReviewService'
import { buildInvoiceAiReviewSnapshot } from '../../utils/buildInvoiceAiReviewSnapshot'
import { buildStructuredLoadReview, getApprovalGateMessage } from '../../utils/loadReviewSummary'
import { isAIReviewEnabled } from '../../config/aiReview'
import type { BatchDocumentReviewResult } from '../../types/documentReview'
import type { InvoiceAiReviewSnapshot } from '../../types/invoiceAiReview'

export interface InvoiceAiReviewOutcome {
  invoiceId: string
  invoiceNumber: string
  status: 'ready' | 'needs_work'
  headline: string
  detail: string
  result?: BatchDocumentReviewResult
}

export interface BatchAiReviewProgress {
  completed: number
  total: number
  currentInvoiceNumber?: string
}

function minimalReviewSnapshot(
  headline: string,
  detail: string,
  issues: string[]
): InvoiceAiReviewSnapshot {
  return {
    headline,
    detail,
    ready: false,
    passCount: 0,
    requiredTotal: 0,
    requiredAll: [],
    requiredFailed: [],
    requiredPassed: [],
    additional: [],
    issues,
    warnings: [],
  }
}

/**
 * Run full AIDocView review per invoice in a batch (admin).
 */
export async function runBatchAiReview(
  batchId: string,
  onProgress?: (p: BatchAiReviewProgress) => void
): Promise<InvoiceAiReviewOutcome[]> {
  if (!isAIReviewEnabled()) {
    throw new Error(
      'AI review requires Supabase configuration. Deploy the openai-proxy Edge Function with OPENAI_API_KEY.'
    )
  }

  const invoices = getInvoicesByBatchId(batchId)
  const fileMap = getBatchFiles(batchId)
  const outcomes: InvoiceAiReviewOutcome[] = []

  for (let i = 0; i < invoices.length; i++) {
    const inv = invoices[i]
    onProgress?.({
      completed: i,
      total: invoices.length,
      currentInvoiceNumber: inv.invoice_number,
    })

    updateInvoice(inv.id, { ai_review_status: 'running' })

    const docIds = inv.document_doc_ids ?? []
    const docs = docIds
      .map((docId) => {
        const file = fileMap.get(docId)
        if (!file) return null
        return { id: docId, name: file.name, file }
      })
      .filter((d): d is { id: string; name: string; file: File } => d !== null)

    const invoicePdfId = `invoice-pdf-${inv.doc_sort_group_id}`
    const invPdf = inv.doc_sort_group_id ? fileMap.get(invoicePdfId) : undefined
    if (invPdf) {
      docs.push({
        id: invoicePdfId,
        name: invPdf.name,
        file: invPdf,
      })
    }

    if (docs.length === 0) {
      const headline = 'Needs additional work'
      const detail = 'No documents on file for AI review'
      const snapshot = minimalReviewSnapshot(headline, detail, [detail])
      updateInvoice(inv.id, {
        ai_review_status: 'needs_work',
        ai_review_summary: headline,
        ai_review_snapshot: JSON.stringify(snapshot),
      })
      outcomes.push({
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number,
        status: 'needs_work',
        headline,
        detail: 'No documents on file for AI review',
      })
      continue
    }

    try {
      const result = await reviewUploadedDocuments(docs)
      const primaryDoc =
        result.documents.find((d) => /rate|confirmation|rc/i.test(d.fileName)) ??
        result.documents[0]
      if (!primaryDoc) {
        const headline = 'Needs additional work'
        const detail = 'No review results returned'
        const snapshot = minimalReviewSnapshot(headline, detail, [detail])
        setInvoiceAiReviewCache(inv.id, { snapshot, batchResult: result })
        updateInvoice(inv.id, {
          ai_review_status: 'needs_work',
          ai_review_summary: headline,
          ai_review_snapshot: JSON.stringify(snapshot),
        })
        outcomes.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoice_number,
          status: 'needs_work',
          headline: 'Needs additional work',
          detail: 'No review results returned',
          result,
        })
        continue
      }
      const structured = buildStructuredLoadReview(primaryDoc, result)
      const gate = getApprovalGateMessage(
        structured.requiredPassed.length,
        structured.requiredTotal
      )
      const status = gate.ready ? 'ready' : 'needs_work'
      const headline = gate.ready ? 'Good to go' : 'Needs additional work'
      const snapshot = buildInvoiceAiReviewSnapshot(
        primaryDoc,
        result,
        structured,
        headline,
        gate.detail,
        gate.ready
      )
      setInvoiceAiReviewCache(inv.id, {
        snapshot,
        primaryDoc,
        batchResult: result,
      })
      updateInvoice(inv.id, {
        ai_review_status: status,
        ai_review_summary: headline,
        ai_review_snapshot: JSON.stringify(snapshot),
      })
      outcomes.push({
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number,
        status,
        headline,
        detail: gate.detail,
        result,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Review failed'
      const snapshot = minimalReviewSnapshot('Review failed', msg, [msg])
      updateInvoice(inv.id, {
        ai_review_status: 'needs_work',
        ai_review_summary: msg,
        ai_review_snapshot: JSON.stringify(snapshot),
      })
      outcomes.push({
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number,
        status: 'needs_work',
        headline: 'Review failed',
        detail: msg,
      })
    }
  }

  onProgress?.({ completed: invoices.length, total: invoices.length })
  return outcomes
}
