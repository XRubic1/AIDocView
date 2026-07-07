import { AI_REVIEW_CONFIG } from '../config/aiReview'
import { getOpenAIChatCompletionsHandler } from '../platform/openaiTransport'
import { requireSupabase } from '../lib/supabase'

const MAX_429_RETRIES = 5

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function parseOpenAIRetrySeconds(errorBody: string): number | undefined {
  const match = errorBody.match(/try again in ([\d.]+)s/i)
  if (!match) return undefined
  const seconds = Number.parseFloat(match[1])
  return Number.isFinite(seconds) ? seconds : undefined
}

/**
 * POST to OpenAI chat/completions via Supabase Edge Function proxy.
 */
export async function postOpenAIChatCompletions(
  body: Record<string, unknown>
): Promise<Response> {
  const override = getOpenAIChatCompletionsHandler()
  if (override) {
    return override(body)
  }

  const supabase = requireSupabase()
  let lastErrorBody = ''

  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt += 1) {
    const { data, error } = await supabase.functions.invoke('openai-proxy', { body })

    if (error) {
      if (attempt >= MAX_429_RETRIES) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 502,
          statusText: 'Bad Gateway',
        })
      }
      await sleep(1000 * (attempt + 1))
      continue
    }

    const payload = typeof data === 'string' ? data : JSON.stringify(data)
    const status = (data as { error?: unknown })?.error ? 429 : 200

    if (status === 429 && attempt < MAX_429_RETRIES) {
      lastErrorBody = payload
      const retrySeconds = parseOpenAIRetrySeconds(lastErrorBody) ?? 3
      await sleep(Math.ceil(retrySeconds * 1000) + 250 * attempt)
      continue
    }

    return new Response(payload, {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(lastErrorBody, { status: 429, statusText: 'Too Many Requests' })
}

export { AI_REVIEW_CONFIG }
