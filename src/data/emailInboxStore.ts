/**
 * In-memory email inbox (threads, messages, staff review). Hydrate from Supabase when configured.
 */
import type { EmailMessage, EmailReviewItem, EmailThread } from '../types/emailLifecycle'

const threads: EmailThread[] = []
const messages: EmailMessage[] = []
const reviews: EmailReviewItem[] = []

export function listEmailThreads(): EmailThread[] {
  return [...threads]
}

export function listEmailMessagesForThread(threadId: string): EmailMessage[] {
  return messages.filter((m) => m.thread_id === threadId).sort((a, b) => a.sent_at.localeCompare(b.sent_at))
}

export function listEmailMessagesForInvoice(invoiceId: string): EmailMessage[] {
  const ids = new Set(threads.filter((t) => t.invoice_id === invoiceId).map((t) => t.id))
  return messages.filter((m) => ids.has(m.thread_id)).sort((a, b) => a.sent_at.localeCompare(b.sent_at))
}

export function listEmailReviews(status?: EmailReviewItem['status']): EmailReviewItem[] {
  const rows = status ? reviews.filter((r) => r.status === status) : [...reviews]
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export function getEmailReviewById(id: string): EmailReviewItem | undefined {
  return reviews.find((r) => r.id === id)
}

export function upsertEmailThread(thread: EmailThread): EmailThread {
  const i = threads.findIndex((t) => t.id === thread.id)
  if (i >= 0) threads[i] = thread
  else threads.push(thread)
  return thread
}

export function addEmailMessage(message: EmailMessage): EmailMessage {
  messages.push(message)
  return message
}

export function upsertEmailReview(item: EmailReviewItem): EmailReviewItem {
  const i = reviews.findIndex((r) => r.id === item.id)
  if (i >= 0) reviews[i] = item
  else reviews.push(item)
  return item
}

export function findThreadForInvoice(invoiceId: string): EmailThread | undefined {
  return threads.find((t) => t.invoice_id === invoiceId)
}

/** Point inbox threads/reviews at the keeper after a broker merge. */
export function reassignEmailInboxBrokerId(sourceBrokerId: string, keepBrokerId: string): void {
  if (sourceBrokerId === keepBrokerId) return
  for (const thread of threads) {
    if (thread.broker_id === sourceBrokerId) thread.broker_id = keepBrokerId
  }
  for (const review of reviews) {
    if (review.broker_id === sourceBrokerId) review.broker_id = keepBrokerId
  }
}

export function hydrateEmailInbox(payload: {
  threads?: EmailThread[]
  messages?: EmailMessage[]
  reviews?: EmailReviewItem[]
}): void {
  if (payload.threads) {
    threads.splice(0, threads.length, ...payload.threads)
  }
  if (payload.messages) {
    messages.splice(0, messages.length, ...payload.messages)
  }
  if (payload.reviews) {
    reviews.splice(0, reviews.length, ...payload.reviews)
  }
}
