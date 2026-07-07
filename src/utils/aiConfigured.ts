import { isSupabaseConfigured } from '../lib/supabase'
import { getRuntimeEnvString } from '../platform/runtimeEnv'
import { getOpenAIChatCompletionsHandler } from '../platform/openaiTransport'

/** True when AI review can run (Supabase proxy or eval override). */
export function isAiReviewConfigured(): boolean {
  if (getOpenAIChatCompletionsHandler()) return true
  return isSupabaseConfigured()
}

export function requireAiReviewConfigured(): void {
  if (!isAiReviewConfigured()) {
    throw new Error(
      'AI review requires Supabase configuration. Deploy the openai-proxy Edge Function with OPENAI_API_KEY.'
    )
  }
}

/** @deprecated Client-side key — dev/eval only. */
export function hasLegacyOpenAiKey(): boolean {
  return Boolean(getRuntimeEnvString('VITE_OPENAI_API_KEY'))
}
