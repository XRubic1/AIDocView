import type { BatchDocumentReviewResult, DocumentReviewResult } from '../types/documentReview'
import type { InvoiceAiReviewSnapshot } from '../types/invoiceAiReview'

export interface CachedInvoiceAiReview {
  snapshot: InvoiceAiReviewSnapshot
  primaryDoc?: DocumentReviewResult
  batchResult?: BatchDocumentReviewResult
}

const cache = new Map<string, CachedInvoiceAiReview>()

/** In-memory full review (lost on refresh; snapshot on invoice persists checks). */
export function setInvoiceAiReviewCache(invoiceId: string, data: CachedInvoiceAiReview): void {
  cache.set(invoiceId, data)
}

export function getInvoiceAiReviewCache(invoiceId: string): CachedInvoiceAiReview | undefined {
  return cache.get(invoiceId)
}

export function clearInvoiceAiReviewCache(invoiceId: string): void {
  cache.delete(invoiceId)
}
