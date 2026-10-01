/**
 * Admin Inbox “Received” rows — inbound messages (+ unmatched pending reviews).
 */
import {
  getEmailThreadById,
  listEmailReviews,
  listInboundEmailMessages,
} from '../data/emailInboxStore'
import { getInvoiceById } from '../data/mockInvoices'
import type { EmailMessage, EmailReviewItem } from '../types/emailLifecycle'
import { guessInboundInvoiceMatch } from '../utils/guessInboundInvoiceMatch'
import { findReplyDate, replyStatusFromClassification } from './brokerReplyReading'

export type InboundInboxRow = {
  id: string
  kind: 'message' | 'review_only'
  from: string
  to: string
  subject: string
  body: string
  sentAt: string
  invoiceId: string | null
  invoiceNumber: string
  loadNumber: string
  clientName: string
  brokerName: string
  /** Inv# … · Load# … · Carrier … */
  matchLabel: string
  matchConfirmed: boolean
  reviewId: string | null
  pendingReview: boolean
  replyStatus: 'confirmed' | 'rejected' | 'unknown' | null
  /** Broker verification, paperwork status, payment status, remittance, or not classified. */
  classifiedAs: string
  /** Invoice, load, sender, pay date, and the reader summary. */
  pulled: string
  payDate: string | null
}

function classifiedAsLabel(review: EmailReviewItem | null): string {
  if (!review) return 'Not classified'
  const summary = review.summary ?? ''
  if (
    review.confirmed_by === 'Rate verification' ||
    /broker verification|rate verification|rate confirmation/i.test(summary)
  ) {
    return 'Broker verification'
  }
  if (/remittance/i.test(summary)) return 'Remittance'
  if (
    review.outbound_kind === 'paperwork' ||
    review.classification === 'paperwork_ok' ||
    review.classification === 'missing_docs' ||
    review.classification === 'non_response_paperwork'
  ) {
    return 'Paperwork status'
  }
  if (
    review.outbound_kind === 'payment' ||
    review.classification === 'payment_ok' ||
    review.classification === 'non_response_payment'
  ) {
    return 'Payment status'
  }
  if (review.classification === 'unclear') return 'Unclear'
  return 'Not classified'
}

function pulledLine(input: {
  invoiceNumber?: string
  loadNumber?: string
  from?: string
  payDate?: string | null
  summary?: string
}): string {
  const bits = [
    input.invoiceNumber && input.invoiceNumber !== '—' ? `Invoice ${input.invoiceNumber}` : '',
    input.loadNumber ? `Load ${input.loadNumber}` : '',
    input.from?.trim() ?? '',
    input.payDate ? `Pay ${input.payDate}` : '',
    input.summary?.trim() ?? '',
  ].filter(Boolean)
  return bits.join(' · ') || 'Nothing pulled'
}

export function listInboundInboxRows(): InboundInboxRow[] {
  const messages = listInboundEmailMessages()
  const reviews = listEmailReviews()
  const latestByThread = new Map<string, EmailReviewItem>()
  for (const review of reviews) {
    if (review.thread_id && !latestByThread.has(review.thread_id)) {
      latestByThread.set(review.thread_id, review)
    }
  }
  const pending = reviews.filter((r) => r.status === 'pending_review')

  const rows: InboundInboxRow[] = []
  const coveredReviewIds = new Set<string>()

  for (const m of messages) {
    const thread = getEmailThreadById(m.thread_id)
    const inv = thread?.invoice_id ? getInvoiceById(thread.invoice_id) : undefined
    const review = latestByThread.get(m.thread_id) ?? null
    if (review) coveredReviewIds.add(review.id)
    rows.push(rowFromMessage(m, inv, review))
  }

  for (const r of pending) {
    if (coveredReviewIds.has(r.id)) continue
    const guess = guessInboundInvoiceMatch({
      subject: r.subject,
      body: r.body_text,
      invoiceId: r.invoice_id,
      invoiceNumber: r.invoice_number,
      loadNumber: r.load_number,
    })
    const payDate = findReplyDate(`${r.subject ?? ''} ${r.body_text ?? ''}`)
    rows.push({
      id: `review:${r.id}`,
      kind: 'review_only',
      from: r.from_address || 'unknown',
      to: r.to_address || '',
      subject: r.subject || '(no subject)',
      body: r.body_text || '',
      sentAt: r.created_at,
      invoiceId: guess.invoiceId,
      invoiceNumber: guess.invoiceNumber,
      loadNumber: guess.loadNumber,
      clientName: guess.carrierName,
      brokerName: guess.brokerName,
      matchLabel: guess.label,
      matchConfirmed: guess.matched,
      reviewId: r.id,
      pendingReview: true,
      replyStatus: r.reply_status ?? replyStatusFromClassification(r.classification),
      classifiedAs: classifiedAsLabel(r),
      payDate,
      pulled: pulledLine({
        invoiceNumber: guess.invoiceNumber,
        loadNumber: guess.loadNumber,
        from: r.from_address,
        payDate,
        summary: r.summary,
      }),
    })
  }

  return rows.sort((a, b) => b.sentAt.localeCompare(a.sentAt))
}

function rowFromMessage(
  m: EmailMessage,
  inv:
    | {
        id: string
        invoice_number: string
        load_number?: string
        client_name: string
        broker_name: string
      }
    | undefined,
  review: EmailReviewItem | null
): InboundInboxRow {
  const guess = guessInboundInvoiceMatch({
    subject: m.subject,
    body: m.body_text,
    invoiceId: inv?.id ?? review?.invoice_id ?? null,
    invoiceNumber: inv?.invoice_number ?? review?.invoice_number,
    loadNumber: inv?.load_number ?? review?.load_number,
  })
  const payDate = findReplyDate(`${m.subject} ${m.body_text}`)
  const invoiceNumber = guess.invoiceNumber
  const loadNumber = guess.loadNumber
  return {
    id: m.id,
    kind: 'message',
    from: m.from_address,
    to: m.to_address,
    subject: m.subject,
    body: m.body_text,
    sentAt: m.sent_at,
    invoiceId: guess.invoiceId,
    invoiceNumber: guess.invoiceNumber,
    loadNumber: guess.loadNumber,
    clientName: guess.carrierName || inv?.client_name || '',
    brokerName: guess.brokerName || inv?.broker_name || '',
    matchLabel: guess.label,
    matchConfirmed: guess.matched,
    reviewId: review?.id ?? null,
    pendingReview: review?.status === 'pending_review',
    replyStatus: review
      ? review.reply_status ?? replyStatusFromClassification(review.classification)
      : null,
    classifiedAs: classifiedAsLabel(review),
    payDate,
    pulled: pulledLine({
      invoiceNumber,
      loadNumber,
      from: m.from_address,
      payDate,
      summary: review?.summary,
    }),
  }
}
