/**
 * Keyword classification for broker replies (staff confirm before actions).
 */
import type { InboundClassification, ProposedAction } from '../types/emailLifecycle'

export interface ClassifyInboundInput {
  subject: string
  bodyText: string
}

export interface ClassifyInboundResult {
  classification: InboundClassification
  proposed_actions: ProposedAction[]
  summary: string
  confidence: number
}

export function proposedActionsForClassification(
  classification: InboundClassification
): ProposedAction[] {
  if (classification === 'paperwork_ok') return ['add_note', 'log_paperwork_good']
  if (classification === 'payment_ok') return ['add_note', 'log_payment_ok']
  if (classification === 'missing_docs') return ['add_note', 'hold_invoice', 'notify_carrier']
  if (classification === 'claim') return ['add_note', 'hold_invoice', 'notify_carrier']
  if (classification === 'negative') return ['add_note', 'notify_carrier']
  if (classification === 'non_response_paperwork' || classification === 'non_response_payment') {
    return ['staff_call']
  }
  return ['add_note']
}

export function classifyInboundBrokerReply(input: ClassifyInboundInput): ClassifyInboundResult {
  const text = `${input.subject} ${input.bodyText}`.toLowerCase()

  const missing =
    /missing|need(s|ed)?\s+(the\s+)?(pod|bol|lumper|scale|rate\s*con|photo|doc)|incomplete\s+(packet|paperwork|ppw)/i.test(
      text
    )
  const claim = /\bclaim\b|cargo\s+claim|freight\s+claim/i.test(text)
  const paperworkOk =
    /paperwork\s+(is\s+)?(good|complete|in order|ok|okay)|docs?\s+(are\s+)?(good|complete)|packet\s+(is\s+)?(good|complete)/i.test(
      text
    )
  const paymentOk =
    /will\s+pay|check\s+(was\s+)?mailed|ach\s+(sent|processed)|paid\b|eta\s+\d|expected\s+pay/i.test(
      text
    )
  const negative =
    /short\s*pay|will\s+not\s+pay|dispute|deduct|offset|no\s+funds/i.test(text) && !missing

  let classification: InboundClassification = 'unclear'
  let confidence = 0.35
  if (missing) {
    classification = 'missing_docs'
    confidence = 0.78
  } else if (claim) {
    classification = 'claim'
    confidence = 0.75
  } else if (negative) {
    classification = 'negative'
    confidence = 0.72
  } else if (paperworkOk) {
    classification = 'paperwork_ok'
    confidence = 0.7
  } else if (paymentOk) {
    classification = 'payment_ok'
    confidence = 0.7
  }

  return {
    classification,
    proposed_actions: proposedActionsForClassification(classification),
    summary: `Classified as ${classification} from broker reply.`,
    confidence,
  }
}
