import { AI_REVIEW_CONFIG } from '../config/aiReview'
import { getOpenAIChatCompletionsHandler } from '../platform/openaiTransport'
import { getSupabase, requireSupabase } from '../lib/supabase'
import {
  getCachedOpenAiAccessToken,
  getOpenAiJobAuth,
  rememberOpenAiAccessToken,
} from './openaiAuthContext'

const MAX_429_RETRIES = 12
/** After repeated TPM hits, park for this long so the per-minute window resets. */
const RATE_LIMIT_LONG_WAIT_MS = 100_000
const RATE_LIMIT_MIN_WAIT_MS = 1_000

/**
 * Shared cooldown: one 429 pauses every OpenAI call in this tab, so parallel
 * workers stop burning the same tokens-per-minute budget while we wait.
 */
let rateLimitCooldownUntil = 0

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForRateLimitCooldown(): Promise<void> {
  for (;;) {
    const remaining = rateLimitCooldownUntil - Date.now()
    if (remaining <= 0) return
    await sleep(Math.min(remaining, 5_000))
  }
}

/** Surface long waits in the batch's live activity so the job doesn't look stuck. */
function notifyRateLimitWait(waitMs: number): void {
  const seconds = Math.round(waitMs / 1000)
  console.warn(
    `[openaiFetch] OpenAI rate limit hit — pausing AI calls for ${seconds}s, then resuming from checkpoint`
  )
  if (waitMs < 10_000) return
  const auth = getOpenAiJobAuth()
  if (!auth?.batchId) return
  void import('./batchLiveActivity')
    .then(({ updateBatchLiveActivity }) => {
      updateBatchLiveActivity(auth.batchId, {
        thinking:
          'OpenAI tokens-per-minute limit reached — waiting for the window to reset, then continuing from the last successful step.',
        doing: `Rate limited — waiting ${seconds}s…`,
      })
    })
    .catch(() => {})
}

/**
 * 429 backoff: honor OpenAI's suggested wait for the first hits; once the org
 * TPM budget keeps rejecting us, park all AI calls for 100s so the minute
 * window resets, then continue (work resumes from its checkpoint — nothing
 * already completed is redone).
 */
async function pauseForRateLimit(attempt: number, retrySeconds: number | undefined): Promise<void> {
  const suggestedMs = Math.ceil((retrySeconds ?? 3) * 1000) + 750 + 250 * attempt
  const waitMs =
    attempt >= 2 ? RATE_LIMIT_LONG_WAIT_MS : Math.max(suggestedMs, RATE_LIMIT_MIN_WAIT_MS)
  rateLimitCooldownUntil = Math.max(rateLimitCooldownUntil, Date.now() + waitMs)
  notifyRateLimitWait(waitMs)
  await waitForRateLimitCooldown()
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

/** Resolve a user JWT when available; otherwise rely on batch job auth on the proxy. */
async function resolveAccessToken(): Promise<string | null> {
  const supabase = getSupabase()
  if (!supabase) return getCachedOpenAiAccessToken()

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (session?.access_token) {
    rememberOpenAiAccessToken(session.access_token)
    return session.access_token
  }

  const { data: refreshed } = await supabase.auth.refreshSession()
  if (refreshed.session?.access_token) {
    rememberOpenAiAccessToken(refreshed.session.access_token)
    return refreshed.session.access_token
  }

  return getCachedOpenAiAccessToken()
}

/**
 * POST to OpenAI chat/completions via Supabase Edge Function proxy.
 * Uses user JWT when signed in; otherwise attaches active batch job auth
 * so intake / integrations can run without a human session.
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

  const accessToken = await resolveAccessToken()
  const jobAuth = getOpenAiJobAuth()

  if (!accessToken && !jobAuth) {
    return new Response(
      JSON.stringify({
        error: 'Unauthorized',
        detail:
          'AI is waiting on an active batch job or a signed-in session. Re-submit the batch or stay on this page while processing runs.',
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const invokeHeaders: Record<string, string> = {}
  if (accessToken) {
    invokeHeaders.Authorization = `Bearer ${accessToken}`
  }

  const payloadBody =
    jobAuth != null
      ? {
          ...body,
          _credyx: { batchId: jobAuth.batchId, jobId: jobAuth.jobId },
        }
      : body

  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt += 1) {
    // Respect a cooldown another concurrent request may have started.
    await waitForRateLimitCooldown()

    const { data, error } = await supabase.functions.invoke('openai-proxy', {
      body: payloadBody,
      headers: invokeHeaders,
    })

    if (error) {
      const failure = await readInvokeFailure(error, data)
      lastErrorBody = failure.body
      lastStatus = failure.status

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

      if (failure.status === 429 || isRateLimitPayload(failure.body, failure.status)) {
        await pauseForRateLimit(attempt, parseOpenAIRetrySeconds(failure.body))
        continue
      }

      const retrySeconds = parseOpenAIRetrySeconds(failure.body) ?? attempt + 1
      await sleep(Math.ceil(retrySeconds * 1000) + 750 + 250 * attempt)
      continue
    }

    const payload = typeof data === 'string' ? data : data
    const payloadText = summarizePayload(payload)
    const looksLikeRateLimit = isRateLimitPayload(payload, 200)
    const status = looksLikeRateLimit ? 429 : 200

    if (status === 429 && attempt < MAX_429_RETRIES) {
      lastErrorBody = payloadText
      lastStatus = 429
      await pauseForRateLimit(attempt, parseOpenAIRetrySeconds(payloadText))
      continue
    }

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
