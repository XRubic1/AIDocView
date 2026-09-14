import type { Invoice } from '../types/invoice'
import type { InvoiceAiReviewSnapshot } from '../types/invoiceAiReview'
import { getInvoiceAiReviewCache } from '../data/invoiceAiReviewCache'

/** Parse stored AI review JSON; returns null when missing or invalid. */
export function parseInvoiceAiReviewSnapshot(
  raw?: string | null
): InvoiceAiReviewSnapshot | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as InvoiceAiReviewSnapshot
  } catch {
    return null
  }
}

/** Snapshot from in-memory cache or persisted invoice JSON. */
export function invoiceAiReviewSnapshotFor(invoice: Invoice): InvoiceAiReviewSnapshot | null {
  return getInvoiceAiReviewCache(invoice.id)?.snapshot ?? parseInvoiceAiReviewSnapshot(invoice.ai_review_snapshot)
}
