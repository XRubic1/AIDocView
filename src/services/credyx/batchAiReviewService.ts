import { getBatchFiles } from '../../data/batchFileStore'
import { setInvoiceAiReviewCache } from '../../data/invoiceAiReviewCache'
import { getBatchById } from '../../data/mockBatches'
import { getInvoicesByBatchId, updateInvoice } from '../../data/mockInvoices'
import {
  assembleBatchReviewFromDocuments,
  reviewUploadedDocuments,
} from '../documentReviewService'
import { parseFingerprintCatalog } from '../../products/docSort/utils/docSortSnapshot'
import { reviewResultFromFingerprint } from '../../products/docSort/utils/docExtractJson'
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
  currentInvoiceId?: string
  currentInvoiceNumber?: string
  /** 0–100 how far this invoice's review has gone. Overlay fill is 100 − this. */
  invoiceProgress?: number
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
    const docProgress = new Map<string, number>()
    const emitInvoiceProgress = (progress: number) => {
      onProgress?.({
        completed: i,
        total: invoices.length,
        currentInvoiceId: inv.id,
        currentInvoiceNumber: inv.invoice_number,
        invoiceProgress: Math.max(0, Math.min(100, Math.round(progress))),
      })
    }

    onProgress?.({
      completed: i,
      total: invoices.length,
      currentInvoiceId: inv.id,
      currentInvoiceNumber: inv.invoice_number,
      invoiceProgress: 0,
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
      emitInvoiceProgress(100)
      continue
    }

    try {
      const catalog = parseFingerprintCatalog(getBatchById(batchId)?.doc_sort_snapshot)
      // Skip packets already finished by the edge worker / prior run.
      if (
        inv.ai_review_status === 'ready' ||
        inv.ai_review_status === 'needs_work'
      ) {
        outcomes.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoice_number,
          status: inv.ai_review_status,
          headline: inv.ai_review_summary || (inv.ai_review_status === 'ready' ? 'Good to go' : 'Needs additional work'),
          detail: inv.ai_review_summary || '',
        })
        emitInvoiceProgress(100)
        continue
      }

      const paperworkDocs = docs.filter((doc) => !doc.id.startsWith('invoice-pdf-'))
      const storedReviews = paperworkDocs.map((doc) => {
        const saved = catalog.get(doc.id)
        if (!saved?.extract) return null
        return reviewResultFromFingerprint({
          docId: doc.id,
          fileName: doc.name || saved.fileName,
          kind: saved.kind,
          confidence: 0.9,
          loadNumbers: saved.loadNumbers,
          broker: saved.broker,
          extract: saved.extract,
        })
      })
      const canReuseExtracts =
        paperworkDocs.length > 0 && storedReviews.every((item) => item != null)

      let result: BatchDocumentReviewResult
      if (canReuseExtracts) {
        emitInvoiceProgress(40)
        result = assembleBatchReviewFromDocuments(
          storedReviews.filter((item): item is NonNullable<typeof item> => item != null)
        )
        emitInvoiceProgress(90)
      } else {
        result = await reviewUploadedDocuments(docs, {
          onDocumentProgress: (event) => {
            docProgress.set(event.docId, event.progress)
            const totalDocs = Math.max(1, docs.length)
            let sum = 0
            for (const doc of docs) {
              sum += docProgress.get(doc.id) ?? 0
            }
            emitInvoiceProgress(sum / totalDocs)
          },
        })
      }
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
        emitInvoiceProgress(100)
        continue
      }
      const structured = buildStructuredLoadReview(primaryDoc, result, {
        packet: {
          loadNumber: inv.load_number,
          amount: inv.amount,
          brokerName: inv.broker_name,
          carrierName: inv.client_name,
        },
      })
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
      emitInvoiceProgress(100)
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
      emitInvoiceProgress(100)
    }
  }

  onProgress?.({ completed: invoices.length, total: invoices.length })
  return outcomes
}
