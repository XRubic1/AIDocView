import { AI_REVIEW_CONFIG, getOpenAIApiKey, isAIReviewEnabled } from '../config/aiReview'
import { usageFromOpenAIResponse } from '../utils/reviewCost'

export interface ExplainChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

const CHAT_MODEL = AI_REVIEW_CONFIG.CHAT_MODEL

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
    throw new Error('Add VITE_OPENAI_API_KEY to your .env file to use the review assistant.')
  }

  const apiKey = getOpenAIApiKey()
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured.')
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

  const response = await fetch(AI_REVIEW_CONFIG.OPENAI_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      temperature: 0.3,
      messages,
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Assistant request failed (${response.status}): ${errorBody}`)
  }

  const payload = (await response.json()) as Record<string, unknown>
  const reply = (payload?.choices as Array<{ message?: { content?: string } }>)?.[0]?.message
    ?.content

  if (!reply?.trim()) {
    throw new Error('Assistant returned an empty response.')
  }

  const usage = usageFromOpenAIResponse(payload, CHAT_MODEL)

  return {
    reply: reply.trim(),
    estimatedCostUsd: usage.estimatedCostUsd,
  }
}

export function createChatMessage(role: ExplainChatMessage['role'], content: string): ExplainChatMessage {
  return {
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
  }
}
