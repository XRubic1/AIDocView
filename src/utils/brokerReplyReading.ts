/**
 * Simple broker-reply reading.
 * Looks at what Credyx sent, then marks the reply confirmed, rejected, or unknown.
 */
import type { InboundClassification, ProposedAction } from '../types/emailLifecycle'
import { proposedActionsForClassification } from './classifyInboundBrokerReply'

export type BrokerReplyStatus = 'confirmed' | 'rejected' | 'unknown'
export type CredyxOutboundKind = 'paperwork' | 'payment' | 'other'

export type BrokerReplyReading = {
  status: BrokerReplyStatus
  outboundKind: CredyxOutboundKind
  summary: string
  classification: InboundClassification
  proposed_actions: ProposedAction[]
  /** YYYY-MM-DD when the broker gave a pay date. */
  payDate: string | null
}

const REJECTED =
  /not\s+received|did\s*n[o']t\s+receive|never\s+received|missing|no\s+lumper|lumper|missing\s+pages?|pages?\s+missing|incomplete|need(?:s|ed)?\s+(?:the\s+)?(?:pod|bol|rate\s*con|scale)|short\s*pay|will\s+not\s+pay|not\s+paying/i

const CONFIRMED =
  /good\s+to\s+go|\bg2g\b|all\s+set|looks\s+good|all\s+good|paperwork\s+(?:is\s+)?(?:good|ok|okay|complete|received)|packet\s+(?:is\s+)?(?:good|complete|received)|docs?\s+(?:are\s+)?(?:good|complete)|will\s+pay|paying\s+on|pay\s+date|check\s+(?:was\s+)?mailed|ach\s+(?:sent|processed)/i

export function findReplyDate(text: string): string | null {
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const us = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/)
  if (!us) return null
  const month = us[1].padStart(2, '0')
  const day = us[2].padStart(2, '0')
  const year = us[3].length === 2 ? `20${us[3]}` : us[3]
  return `${year}-${month}-${day}`
}

function looksLikeDateOnly(text: string): boolean {
  const trimmed = text.trim()
  if (!findReplyDate(trimmed)) return false
  const rest = trimmed.replace(/\b20\d{2}-\d{2}-\d{2}\b/, '').replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/, '')
  return rest.replace(/[\s.,]+/g, '').length < 8
}

/** What Credyx asked, from the outbound template, subject, and body. */
export function detectCredyxOutboundKind(input: {
  templateId?: string
  subject?: string
  body?: string
}): CredyxOutboundKind {
  const template = (input.templateId || '').toLowerCase()
  if (template.includes('payment')) return 'payment'
  if (template.includes('paperwork') || template.includes('packet') || template === 'broker_packet') {
    return 'paperwork'
  }
  const text = `${input.subject ?? ''} ${input.body ?? ''}`.toLowerCase()
  if (/payment status|when will you pay|remit|pay date/.test(text)) return 'payment'
  if (/paperwork|ppw|packet|pod|bol|rate con/.test(text)) return 'paperwork'
  return 'other'
}

export function readBrokerReplyRules(input: {
  replySubject?: string
  replyBody: string
  outboundKind: CredyxOutboundKind
}): BrokerReplyReading {
  const reply = `${input.replySubject ?? ''} ${input.replyBody}`.trim()
  const payDate = findReplyDate(reply)
  let status: BrokerReplyStatus = 'unknown'
  if (REJECTED.test(reply)) status = 'rejected'
  else if (CONFIRMED.test(reply) || looksLikeDateOnly(reply) || (payDate && input.outboundKind === 'payment')) {
    status = 'confirmed'
  }

  const outboundLabel =
    input.outboundKind === 'paperwork'
      ? 'paperwork status'
      : input.outboundKind === 'payment'
        ? 'payment status'
        : 'a Credyx email'
  const statusLabel = status === 'confirmed' ? 'Confirmed' : status === 'rejected' ? 'Rejected' : 'Unknown'
  const classification = classificationForReply(status, input.outboundKind, reply)
  return {
    status,
    outboundKind: input.outboundKind,
    payDate,
    classification,
    proposed_actions: proposedActionsForClassification(classification),
    summary: `${statusLabel} · Credyx asked ${outboundLabel}.`,
  }
}

export function classificationForReply(
  status: BrokerReplyStatus,
  outboundKind: CredyxOutboundKind,
  replyText: string
): InboundClassification {
  if (status === 'unknown') return 'unclear'
  if (status === 'rejected') {
    return /missing|lumper|pages|not\s+received|did\s*n[o']t\s+receive|incomplete|pod|bol/i.test(replyText)
      ? 'missing_docs'
      : 'negative'
  }
  if (outboundKind === 'payment') return 'payment_ok'
  if (outboundKind === 'paperwork') return 'paperwork_ok'
  if (/will\s+pay|pay\s+date|ach|check\s+mailed/i.test(replyText) || findReplyDate(replyText)) {
    return 'payment_ok'
  }
  return 'paperwork_ok'
}

export function replyStatusFromClassification(classification: string | undefined): BrokerReplyStatus {
  if (classification === 'confirmed' || classification === 'paperwork_ok' || classification === 'payment_ok') {
    return 'confirmed'
  }
  if (
    classification === 'rejected' ||
    classification === 'missing_docs' ||
    classification === 'negative' ||
    classification === 'claim'
  ) {
    return 'rejected'
  }
  return 'unknown'
}

/** Which blueprint track a confirmed reply should update. */
export function confirmedTrack(reading: BrokerReplyReading): 'paperwork' | 'payment' {
  return reading.classification === 'payment_ok' ? 'payment' : 'paperwork'
}
