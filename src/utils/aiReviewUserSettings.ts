import { getRuntimeEnvInt } from '../platform/runtimeEnv'

const STORAGE_KEY = 'aidocview-ai-review-settings'

export interface AiReviewUserSettings {
  tpmLimit?: number
}

const ENV_DEFAULT_TPM_LIMIT = 30_000

function readSettings(): AiReviewUserSettings {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as AiReviewUserSettings
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeSettings(settings: AiReviewUserSettings): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

/** TPM limit from `.env` (no user override). */
export function getEnvTpmLimit(): number {
  return getRuntimeEnvInt('VITE_AI_TPM_LIMIT', ENV_DEFAULT_TPM_LIMIT)
}

/** User-saved TPM limit, if set in Settings. */
export function getUserTpmLimit(): number | undefined {
  const { tpmLimit } = readSettings()
  if (typeof tpmLimit !== 'number' || !Number.isFinite(tpmLimit) || tpmLimit <= 0) {
    return undefined
  }
  return Math.round(tpmLimit)
}

/** Active TPM limit: user override, then env, then default. */
export function getEffectiveTpmLimit(): number {
  return getUserTpmLimit() ?? getEnvTpmLimit()
}

/** Persist TPM limit for batch planning and pre-run estimates. */
export function setUserTpmLimit(limit: number): void {
  const normalized = Math.round(limit)
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error('TPM limit must be a positive number.')
  }
  writeSettings({ ...readSettings(), tpmLimit: normalized })
}

/** Remove user override and fall back to env / default. */
export function clearUserTpmLimit(): void {
  const settings = readSettings()
  delete settings.tpmLimit
  writeSettings(settings)
}

export function hasUserTpmLimitOverride(): boolean {
  return getUserTpmLimit() !== undefined
}
