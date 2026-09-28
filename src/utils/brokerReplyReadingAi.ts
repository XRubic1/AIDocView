/**
 * AI read of a Credyx outbound email plus the broker reply.
 * Falls back to the keyword reader when AI is offline.
 */
import { AI_REVIEW_CONFIG } from '../config/aiReview'
import { isAiReviewConfigured } from './aiConfigured'
import { postOpenAIChatCompletions } from './openaiFetch'
import {
  classificationForReply,
  detectCredyxOutboundKind,
  findReplyDate,
  readBrokerReplyRules,
  type BrokerReplyReading,
  type BrokerReplyStatus,
  type CredyxOutboundKind,
} from './brokerReplyReading'
import { proposedActionsForClassification } from './classifyInboundBrokerReply'

const SYSTEM = `You read emails for Credyx, an A/R back office for trucking carriers.
You see the email Credyx sent and the broker's reply.

outboundKind is what Credyx asked:
- paperwork: paperwork, packet, PPW, documents
- payment: payment status or when they will pay
- other: anything else

status is the broker reply:
- confirmed: good to go, paperwork good, will pay, or they gave a date
- rejected: not received, missing pages, missing lumper, missing POD/BOL, incomplete packet
- unknown: you cannot tell

Return JSON only:
{"outboundKind":"paperwork","status":"confirmed","summary":"one short sentence"}`

function asKind(value: unknown): CredyxOutboundKind | null {
  return value === 'paperwork' || value === 'payment' || value === 'other' ? value : null
}

function asStatus(value: unknown): BrokerReplyStatus | null {
  return value === 'confirmed' || value === 'rejected' || value === 'unknown' ? value : null
}

export async function readBrokerReplyWithAi(input: {
  replySubject?: string
  replyBody: string
  outboundSubject?: string
  outboundBody?: string
  templateId?: string
}): Promise<BrokerReplyReading> {
  const outboundKind = detectCredyxOutboundKind({
    templateId: input.templateId,
    subject: input.outboundSubject,
    body: input.outboundBody,
  })
  const rules = readBrokerReplyRules({
    replySubject: input.replySubject,
    replyBody: input.replyBody,
    outboundKind,
  })
  if (!isAiReviewConfigured()) return rules

  try {
    const response = await postOpenAIChatCompletions({
      model: AI_REVIEW_CONFIG.CHAT_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `Credyx email subject: ${input.outboundSubject || '(none)'}
Credyx email body:
${(input.outboundBody || '(no prior Credyx email on this invoice)').slice(0, 4000)}

Broker reply subject: ${input.replySubject || '(none)'}
Broker reply:
${input.replyBody.slice(0, 4000)}`,
        },
      ],
    })
    if (!response.ok) return rules
    const payload = (await response.json()) as Record<string, unknown>
    const content = (payload?.choices as Array<{ message?: { content?: string } }>)?.[0]?.message
      ?.content
    if (!content) return rules
    const row = JSON.parse(content) as Record<string, unknown>
    const status = asStatus(row.status)
    const kind = asKind(row.outboundKind) ?? outboundKind
    if (!status) return rules
    if (status === 'unknown' && rules.status !== 'unknown') return rules
    const reply = `${input.replySubject ?? ''} ${input.replyBody}`
    const classification = classificationForReply(status, kind, reply)
    const summary =
      typeof row.summary === 'string' && row.summary.trim()
        ? row.summary.trim()
        : rules.summary
    return {
      status,
      outboundKind: kind,
      payDate: findReplyDate(reply),
      classification,
      proposed_actions: proposedActionsForClassification(classification),
      summary,
    }
  } catch {
    return rules
  }
}
