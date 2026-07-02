import { AI_REVIEW_CONFIG } from '../config/aiReview'
import { getRuntimeEnvString } from '../platform/runtimeEnv'
import { getOpenAIChatCompletionsHandler } from '../platform/openaiTransport'

const MAX_429_RETRIES = 5

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getKey(): string {
  const key = getRuntimeEnvString('VITE_OPENAI_API_KEY')
  if (!key) {
    throw new Error('OpenAI API key is not configured. Add VITE_OPENAI_API_KEY to your .env file.')
  }
  return key
}

/** Parse "Please try again in 2.586s" from OpenAI 429 bodies. */
export function parseOpenAIRetrySeconds(errorBody: string): number | undefined {
  const match = errorBody.match(/try again in ([\d.]+)s/i)
  if (!match) return undefined
  const seconds = Number.parseFloat(match[1])
  return Number.isFinite(seconds) ? seconds : undefined
}

/**
 * POST to OpenAI chat/completions with automatic backoff on 429 rate limits.
 */
export async function postOpenAIChatCompletions(
  body: Record<string, unknown>
): Promise<Response> {
  const override = getOpenAIChatCompletionsHandler()
  if (override) {
    return override(body)
  }

  let lastErrorBody = ''

  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt += 1) {
    const response = await fetch(AI_REVIEW_CONFIG.OPENAI_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (response.status !== 429 || attempt >= MAX_429_RETRIES) {
      return response
    }

    lastErrorBody = await response.text()
    const retrySeconds = parseOpenAIRetrySeconds(lastErrorBody) ?? 3
    const waitMs = Math.ceil(retrySeconds * 1000) + 250 * attempt
    await sleep(waitMs)
  }

  return new Response(lastErrorBody, { status: 429, statusText: 'Too Many Requests' })
}
