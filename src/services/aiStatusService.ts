/**
 * Ping OpenAI via openai-proxy to verify the live model path still works.
 * Skips spend caps (healthCheck flag) so admins can diagnose outages even when AI is paused.
 */

import { AI_POLICY } from '../config/aiPolicy'
import { AI_REVIEW_CONFIG, isAIReviewEnabled } from '../config/aiReview'
import { isSupabaseConfigured } from '../lib/supabase'
import { postOpenAIChatCompletions } from '../utils/openaiFetch'

export type AiStatusLevel = 'ok' | 'degraded' | 'down' | 'disabled'

export type AiStatusCheckResult = {
  level: AiStatusLevel
  ok: boolean
  /** Short headline for the UI. */
  headline: string
  detail: string
  latencyMs: number | null
  model: string
  checkedAt: string
  /** Platform master switch. */
  policyEnabled: boolean
  proxyConfigured: boolean
}

/** Run a 1-token chat completion against the primary extract model. */
export async function checkAiModelStatus(): Promise<AiStatusCheckResult> {
  const checkedAt = new Date().toISOString()
  const model = AI_REVIEW_CONFIG.PRIMARY_MODEL
  const policyEnabled = AI_POLICY.aiEnabled !== false
  const proxyConfigured = isAIReviewEnabled() && isSupabaseConfigured()

  if (!proxyConfigured) {
    return {
      level: 'down',
      ok: false,
      headline: 'AI proxy not configured',
      detail:
        'Supabase / openai-proxy is not available. Deploy the Edge Function with OPENAI_API_KEY.',
      latencyMs: null,
      model,
      checkedAt,
      policyEnabled,
      proxyConfigured: false,
    }
  }

  if (!policyEnabled) {
    // Still probe the model so admins know OpenAI itself is healthy while spend is paused.
  }

  const started = performance.now()
  try {
    const response = await postOpenAIChatCompletions({
      model,
      temperature: 0,
      max_tokens: 5,
      messages: [
        {
          role: 'user',
          content: 'Reply with exactly: OK',
        },
      ],
      _credyx: { healthCheck: true },
    })

    const latencyMs = Math.round(performance.now() - started)
    const text = await response.text()
    let parsed: { error?: unknown; choices?: unknown[]; model?: string } = {}
    try {
      parsed = JSON.parse(text) as typeof parsed
    } catch {
      /* non-JSON */
    }

    if (!response.ok) {
      const errMsg =
        typeof parsed.error === 'string'
          ? parsed.error
          : parsed.error && typeof parsed.error === 'object'
            ? JSON.stringify(parsed.error)
            : text.slice(0, 240) || `HTTP ${response.status}`
      return {
        level: 'down',
        ok: false,
        headline: 'Model check failed',
        detail: errMsg,
        latencyMs,
        model,
        checkedAt,
        policyEnabled,
        proxyConfigured: true,
      }
    }

    if (parsed.error) {
      return {
        level: 'down',
        ok: false,
        headline: 'Model returned an error',
        detail: typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error),
        latencyMs,
        model,
        checkedAt,
        policyEnabled,
        proxyConfigured: true,
      }
    }

    const replyModel = typeof parsed.model === 'string' ? parsed.model : model
    if (!policyEnabled) {
      return {
        level: 'disabled',
        ok: true,
        headline: 'OpenAI is reachable — platform AI is paused',
        detail: `Model responded in ${latencyMs}ms, but the master AI switch is off. Uploads still work; packets/review stay manual.`,
        latencyMs,
        model: replyModel,
        checkedAt,
        policyEnabled,
        proxyConfigured: true,
      }
    }

    if (latencyMs > 8000) {
      return {
        level: 'degraded',
        ok: true,
        headline: 'AI is slow but responding',
        detail: `Primary model replied in ${latencyMs}ms. OpenAI may be under load.`,
        latencyMs,
        model: replyModel,
        checkedAt,
        policyEnabled,
        proxyConfigured: true,
      }
    }

    return {
      level: 'ok',
      ok: true,
      headline: 'AI is online',
      detail: `Primary model responded in ${latencyMs}ms.`,
      latencyMs,
      model: replyModel,
      checkedAt,
      policyEnabled,
      proxyConfigured: true,
    }
  } catch (err) {
    const latencyMs = Math.round(performance.now() - started)
    return {
      level: 'down',
      ok: false,
      headline: 'Could not reach AI',
      detail: err instanceof Error ? err.message : String(err),
      latencyMs,
      model,
      checkedAt,
      policyEnabled,
      proxyConfigured: true,
    }
  }
}
