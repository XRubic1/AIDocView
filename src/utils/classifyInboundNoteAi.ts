/**
 * AI classification for broker inbox notes. Falls back to keyword rules if the model is offline.
 */
import { AI_REVIEW_CONFIG } from '../config/aiReview'
import { isAiReviewConfigured } from './aiConfigured'
import { postOpenAIChatCompletions } from './openaiFetch'
import type { InboundClassification } from '../types/emailLifecycle'
import {
  classifyInboundBrokerReply,
  proposedActionsForClassification,
  type ClassifyInboundInput,
  type ClassifyInboundResult,
} from './classifyInboundBrokerReply'

const VALID: InboundClassification[] = [
  'paperwork_ok',
  'payment_ok',
  'negative',
  'missing_docs',
  'claim',
  'unclear',
]

const SYSTEM = `You classify broker replies for Credyx, an A/R back office for trucking carriers (not factoring).
Staff will confirm before any hold or dispute. Pick one classification.

Classifications:
- missing_docs: invoice on hold or missing paperwork (POD, BOL, lumper, scale ticket, rate con, photos, docs)
- paperwork_ok: paperwork/packet is complete / in order
- payment_ok: will pay, check mailed, ACH, ETA, paid
- claim: cargo/freight claim or they ask if a claim applies
- negative: short pay, deduction, dispute, not paying (not just missing docs)
- unclear: cannot tell

Return JSON only:
{"classification":"missing_docs","summary":"one sentence for staff","confidence":0.0}

summary: what the broker said and what Credyx should do. Mention lumper/POD/amount if present.
confidence: 0-1.`

export interface ClassifyInboundAiResult extends ClassifyInboundResult {
  source: 'ai' | 'rules'
}

function asClassification(value: unknown): InboundClassification | null {
  return typeof value === 'string' && VALID.includes(value as InboundClassification)
    ? (value as InboundClassification)
    : null
}

/** Parse model JSON into a classification result. */
export function parseInboxAiClassificationJson(raw: unknown): ClassifyInboundResult | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const classification = asClassification(row.classification)
  if (!classification) return null
  const summary =
    typeof row.summary === 'string' && row.summary.trim()
      ? row.summary.trim()
      : 'AI classified this broker note.'
  const confidence =
    typeof row.confidence === 'number' && Number.isFinite(row.confidence)
      ? Math.min(1, Math.max(0, row.confidence))
      : 0.7
  return {
    classification,
    proposed_actions: proposedActionsForClassification(classification),
    summary,
    confidence,
  }
}

/**
 * Classify a broker note with AI when configured; otherwise keyword rules.
 * If AI returns unclear but rules are confident, keep the rules result.
 */
export async function classifyInboundNoteWithAi(
  input: ClassifyInboundInput
): Promise<ClassifyInboundAiResult> {
  const rules = classifyInboundBrokerReply(input)
  if (!isAiReviewConfigured()) return { ...rules, source: 'rules' }

  try {
    const response = await postOpenAIChatCompletions({
      model: AI_REVIEW_CONFIG.CHAT_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `Subject: ${input.subject}\n\n${input.bodyText.slice(0, 8000)}`,
        },
      ],
    })
    if (!response.ok) return { ...rules, source: 'rules' }
    const payload = (await response.json()) as Record<string, unknown>
    const content = (payload?.choices as Array<{ message?: { content?: string } }>)?.[0]
      ?.message?.content
    if (!content) return { ...rules, source: 'rules' }
    const parsed = parseInboxAiClassificationJson(JSON.parse(content) as unknown)
    if (!parsed) return { ...rules, source: 'rules' }
    if (parsed.classification === 'unclear' && rules.confidence >= 0.65) {
      return { ...rules, source: 'rules' }
    }
    return { ...parsed, source: 'ai' }
  } catch {
    return { ...rules, source: 'rules' }
  }
}
