import { AI_REVIEW_CONFIG } from '../config/aiReview'
import { getOpenAIChatCompletionsHandler } from '../platform/openaiTransport'
import { requireSupabase } from '../lib/supabase'

const MAX_429_RETRIES = 8

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function parseOpenAIRetrySeconds(errorBody: string): number | undefined {
  const match = errorBody.match(/try again in ([\d.]+)s/i)
  if (!match) return undefined
  const seconds = Number.parseFloat(match[1])
  return Number.isFinite(seconds) ? seconds : undefined
}

function summarizePayload(payload: unknown): string {
  if (payload == null) return ''
  if (typeof payload === 'string') return payload
  try {
    return JSON.stringify(payload)
  } catch {
    return String(payload)
  }
}

/** Pull a human-readable error from OpenAI / Edge Function JSON. */
function extractErrorMessage(payload: unknown, fallback: string): string {
  if (!payload) return fallback
  if (typeof payload === 'string') {
    try {
      return extractErrorMessage(JSON.parse(payload), payload)
    } catch {
      return payload || fallback
    }
  }
  if (typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    const nested = record.error
    if (typeof nested === 'string') return nested
    if (nested && typeof nested === 'object') {
      const errObj = nested as Record<string, unknown>
      if (typeof errObj.message === 'string') return errObj.message
      return summarizePayload(nested)
    }
    if (typeof record.message === 'string') return record.message
    if (typeof record.detail === 'string') return `${record.error ?? fallback}: ${record.detail}`
  }
  return fallback
}

function isRateLimitPayload(payload: unknown, status: number): boolean {
  if (status === 429) return true
  const text = summarizePayload(payload).toLowerCase()
  return text.includes('rate_limit') || text.includes('too many requests')
}

function shouldRetryStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504
}

/**
 * Read FunctionsHttpError.context (Response) when supabase-js hides the real body.
 */
async function readInvokeFailure(
  error: { message?: string; context?: unknown },
  data: unknown
): Promise<{ status: number; body: string }> {
  const fallback = error.message || 'Edge Function invoke failed'
  const ctx = error.context

  if (ctx && typeof ctx === 'object') {
    const response = ctx as Response
    if (typeof response.text === 'function') {
      try {
        // Clone if possible — some runtimes only allow one body read.
        const text =
          typeof (response as Response & { clone?: () => Response }).clone === 'function'
            ? await response.clone().text()
            : await response.text()
        const status = typeof response.status === 'number' ? response.status : 502
        if (text) return { status, body: text }
        return { status, body: JSON.stringify({ error: fallback }) }
      } catch {
        /* fall through */
      }
    }
  }

  if (data != null) {
    return { status: 502, body: summarizePayload(data) }
  }

  return { status: 502, body: JSON.stringify({ error: fallback }) }
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
  let lastStatus = 502

  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt += 1) {
    const { data, error } = await supabase.functions.invoke('openai-proxy', { body })

    if (error) {
      const failure = await readInvokeFailure(error, data)
      lastErrorBody = failure.body
      lastStatus = failure.status

      // Auth / config mistakes should not burn retries.
      if (failure.status === 401 || failure.status === 403 || failure.status === 400) {
        const message = extractErrorMessage(failure.body, error.message)
        return new Response(JSON.stringify({ error: message, detail: failure.body }), {
          status: failure.status,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      if (!shouldRetryStatus(failure.status) || attempt >= MAX_429_RETRIES) {
        const message = extractErrorMessage(failure.body, error.message)
        return new Response(JSON.stringify({ error: message, detail: failure.body }), {
          status: failure.status || 502,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const retrySeconds = parseOpenAIRetrySeconds(failure.body) ?? attempt + 1
      // OpenAI TPM windows need a little headroom beyond the suggested wait.
      await sleep(Math.ceil(retrySeconds * 1000) + 750 + 250 * attempt)
      continue
    }

    const payload = typeof data === 'string' ? data : data
    const payloadText = summarizePayload(payload)
    // OpenAI error objects can arrive as 200 invoke + error JSON when the proxy
    // mishandles status; treat explicit rate-limit payloads as 429.
    const looksLikeRateLimit = isRateLimitPayload(payload, 200)
    const status = looksLikeRateLimit ? 429 : 200

    if (status === 429 && attempt < MAX_429_RETRIES) {
      lastErrorBody = payloadText
      lastStatus = 429
      const retrySeconds = parseOpenAIRetrySeconds(payloadText) ?? 3
      await sleep(Math.ceil(retrySeconds * 1000) + 750 + 250 * attempt)
      continue
    }

    // If the proxy somehow returned an OpenAI error object on HTTP 200, surface it.
    if (
      payload &&
      typeof payload === 'object' &&
      (payload as { error?: unknown }).error &&
      !looksLikeRateLimit
    ) {
      const message = extractErrorMessage(payload, 'OpenAI request failed')
      return new Response(JSON.stringify({ error: message, detail: payload }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(payloadText, {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(lastErrorBody || JSON.stringify({ error: 'Too Many Requests' }), {
    status: lastStatus || 429,
    statusText: 'Too Many Requests',
  })
}

export { AI_REVIEW_CONFIG }
