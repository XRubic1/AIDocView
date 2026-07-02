/** Eval-only env bootstrap — no imports from `src/` (AI_REVIEW_CONFIG reads env at first access). */

export const DEFAULT_EVAL_ENV: Record<string, string> = {
  VITE_OPENAI_API_KEY: process.env.VITE_OPENAI_API_KEY ?? 'eval-mock-key',
  VITE_AI_PARALLEL_DOCUMENTS: '1',
  VITE_AI_SIGNATURE_CONSENSUS: '1',
  VITE_AI_MAX_REVIEW_COST_USD: '5',
}

/** Apply case-level overrides; defaults only fill unset keys. */
export function applyEvalEnv(overrides?: Record<string, string>): void {
  Object.entries(DEFAULT_EVAL_ENV).forEach(([key, value]) => {
    if (!process.env[key]) process.env[key] = value
  })
  Object.entries(overrides ?? {}).forEach(([key, value]) => {
    process.env[key] = value
  })
}
