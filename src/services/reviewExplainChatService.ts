import { AI_REVIEW_CONFIG, isAIReviewEnabled } from '../config/aiReview'
import { postOpenAIChatCompletions } from '../utils/openaiFetch'
import { usageFromOpenAIResponse } from '../utils/reviewCost'

export interface ExplainChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

const CHAT_MODEL = AI_REVIEW_CONFIG.CHAT_MODEL

/** Build a chat row for the explain panel. */
export function createChatMessage(role: 'user' | 'assistant', content: string): ExplainChatMessage {
  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    role,
    content,
    createdAt: new Date().toISOString(),
  }
}

const SYSTEM_PROMPT = `You are a trucking document review assistant for dispatchers using AIDocView.

You explain HOW the AI reached its conclusions — field extraction, page classification, BOL signature checks, cross-validation flags, Excel matching, APPROVED/REJECTED status, and verification cost.

Rules:
- Answer ONLY from the REVIEW CONTEXT JSON the user message includes. Do not invent field values.
- Reference specific values (load #, broker, flags, page types, signature status).
- Explain pipeline steps when relevant: classify pages → rate con extract → BOL audit → Excel cross-check → required documents.
- If context is empty or the user has not run a review, tell them to run "Full Load Review" first.
- Be concise, plain language, bullet points when listing multiple items.
- If asked about a flag, quote the flag message and explain the rule behind it.`

/** Send a follow-up question about the current load review. */
export async function sendReviewExplainMessage(
  reviewContextJson: string,
  history: ExplainChatMessage[],
  userMessage: string
): Promise<{ reply: string; estimatedCostUsd: number }> {
  if (!isAIReviewEnabled()) {
    throw new Error(
      'AI review requires Supabase configuration. Deploy the openai-proxy Edge Function with OPENAI_API_KEY.'
    )
  }

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content: `${SYSTEM_PROMPT}\n\n--- REVIEW CONTEXT (JSON) ---\n${reviewContextJson}`,
    },
  ]

  history.slice(-10).forEach((message) => {
    messages.push({ role: message.role, content: message.content })
  })

  messages.push({ role: 'user', content: userMessage })

  const response = await postOpenAIChatCompletions({
    model: CHAT_MODEL,
    temperature: 0.3,
    messages,
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Chat request failed: ${errText}`)
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const reply = data.choices?.[0]?.message?.content?.trim()
  if (!reply) {
    throw new Error('Empty response from review assistant.')
  }

  const estimatedCostUsd = usageFromOpenAIResponse(data as Record<string, unknown>, CHAT_MODEL).estimatedCostUsd

  return { reply, estimatedCostUsd }
}
