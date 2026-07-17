/**
 * Future AI inbox adapters for collections@ and remittance@ mailboxes.
 *
 * Until IMAP/ingestion is wired, Credyx posts payment status and remittances
 * manually via Collections chase queue and Payment Posting. These stubs define
 * the contract so automation can plug in without changing admin workflows.
 */

export const COLLECTIONS_INBOX = 'collections@credyx.net'
export const REMITTANCE_INBOX = 'remittance@credyx.net'

export type InboxMailbox = 'collections' | 'remittance'

export interface InboundEmailMessage {
  id: string
  mailbox: InboxMailbox
  from: string
  subject: string
  receivedAt: string
  bodyText: string
  /** Raw message id for threading / idempotency */
  messageId?: string
}

export interface CollectionsInboxParseResult {
  invoiceNumber?: string
  loadNumber?: string
  expectedPaymentDate?: string
  statusNote?: string
  confidence: number
  rawSummary: string
}

export interface RemittanceInboxParseResult {
  invoiceNumber?: string
  amount?: number
  paymentMethod?: 'check' | 'ach' | 'wire' | 'credit_card'
  paymentDate?: string
  confidence: number
  rawSummary: string
}

/**
 * Poll / fetch unread messages from a Credyx mailbox.
 * Not implemented — returns empty until email ingestion is provisioned.
 */
export async function fetchInboxMessages(
  _mailbox: InboxMailbox
): Promise<InboundEmailMessage[]> {
  console.info(
    `[inboxAi] fetchInboxMessages(${_mailbox}) — not configured; Credyx should process manually.`
  )
  return []
}

/**
 * Parse a collections reply for payment status / ETA.
 * Placeholder for future LLM extraction.
 */
export async function parseCollectionsReply(
  message: InboundEmailMessage
): Promise<CollectionsInboxParseResult> {
  return {
    confidence: 0,
    rawSummary: `Manual review required for message from ${message.from}: ${message.subject}`,
  }
}

/**
 * Parse a remittance email into a draft payment post.
 * Placeholder — Credyx continues to use Payment Posting UI.
 */
export async function parseRemittanceEmail(
  message: InboundEmailMessage
): Promise<RemittanceInboxParseResult> {
  return {
    confidence: 0,
    rawSummary: `Manual remittance posting required for message from ${message.from}: ${message.subject}`,
  }
}

/**
 * Apply a high-confidence collections parse (future).
 * Today always returns skipped so Credyx uses setExpectedPaymentFromBrokerStatus manually.
 */
export async function applyCollectionsParseIfConfident(
  _parse: CollectionsInboxParseResult,
  opts: { minConfidence?: number } = {}
): Promise<{ applied: boolean; reason: string }> {
  const min = opts.minConfidence ?? 0.85
  if ((_parse.confidence ?? 0) < min) {
    return {
      applied: false,
      reason: 'Confidence below threshold — Credyx should set expected payment date manually.',
    }
  }
  return {
    applied: false,
    reason: 'Inbox AI apply path not enabled yet — use Collections chase queue.',
  }
}

/**
 * Apply a high-confidence remittance parse (future).
 * Today always skipped — use Payment Posting.
 */
export async function applyRemittanceParseIfConfident(
  _parse: RemittanceInboxParseResult,
  opts: { minConfidence?: number } = {}
): Promise<{ applied: boolean; reason: string }> {
  const min = opts.minConfidence ?? 0.85
  if ((_parse.confidence ?? 0) < min) {
    return {
      applied: false,
      reason: 'Confidence below threshold — Credyx should post remittance manually.',
    }
  }
  return {
    applied: false,
    reason: 'Remittance inbox AI not enabled yet — use Payment Posting.',
  }
}
