import { getRuntimeEnvInt } from '../platform/runtimeEnv'

const STORAGE_KEY = 'aidocview-ai-review-settings'

export interface AiReviewUserSettings {
  /** OpenAI org tokens-per-minute cap (matches platform.openai.com rate limits). */
  tpmLimit?: number
  /** Max DocSort / batch AI scans started per minute. */
  docsPerMinute?: number
  /** How many DocSort files may scan at the same time (1 = safest). */
  docSortParallel?: number
}

const ENV_DEFAULT_TPM_LIMIT = 30_000
const ENV_DEFAULT_DOCS_PER_MINUTE = 6
const ENV_DEFAULT_DOCSORT_PARALLEL = 1

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

function positiveInt(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  return Math.round(value)
}

/** TPM limit from `.env` (no user override). */
export function getEnvTpmLimit(): number {
  return getRuntimeEnvInt('VITE_AI_TPM_LIMIT', ENV_DEFAULT_TPM_LIMIT)
}

export function getEnvDocsPerMinute(): number {
  return getRuntimeEnvInt('VITE_AI_DOCS_PER_MINUTE', ENV_DEFAULT_DOCS_PER_MINUTE)
}

export function getEnvDocSortParallel(): number {
  return getRuntimeEnvInt('VITE_DOCSORT_PARALLEL', ENV_DEFAULT_DOCSORT_PARALLEL)
}

/** User-saved TPM limit, if set in Settings. */
export function getUserTpmLimit(): number | undefined {
  return positiveInt(readSettings().tpmLimit)
}

export function getUserDocsPerMinute(): number | undefined {
  return positiveInt(readSettings().docsPerMinute)
}

export function getUserDocSortParallel(): number | undefined {
  return positiveInt(readSettings().docSortParallel)
}

/** Active TPM limit: user override, then env, then default. */
export function getEffectiveTpmLimit(): number {
  return getUserTpmLimit() ?? getEnvTpmLimit()
}

/** Active docs/minute cap for DocSort and batch AI scanning. */
export function getEffectiveDocsPerMinute(): number {
  return getUserDocsPerMinute() ?? getEnvDocsPerMinute()
}

/** Active DocSort concurrency (clamped 1–8). */
export function getEffectiveDocSortParallel(): number {
  const raw = getUserDocSortParallel() ?? getEnvDocSortParallel()
  return Math.max(1, Math.min(8, raw))
}

/** Persist TPM limit for batch planning and pre-run estimates. */
export function setUserTpmLimit(limit: number): void {
  const normalized = Math.round(limit)
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error('TPM limit must be a positive number.')
  }
  writeSettings({ ...readSettings(), tpmLimit: normalized })
}

export function setUserDocsPerMinute(limit: number): void {
  const normalized = Math.round(limit)
  if (!Number.isFinite(normalized) || normalized < 1) {
    throw new Error('Docs per minute must be at least 1.')
  }
  if (normalized > 120) {
    throw new Error('Docs per minute cannot exceed 120.')
  }
  writeSettings({ ...readSettings(), docsPerMinute: normalized })
}

export function setUserDocSortParallel(limit: number): void {
  const normalized = Math.round(limit)
  if (!Number.isFinite(normalized) || normalized < 1) {
    throw new Error('Parallel scans must be at least 1.')
  }
  if (normalized > 8) {
    throw new Error('Parallel scans cannot exceed 8.')
  }
  writeSettings({ ...readSettings(), docSortParallel: normalized })
}

/** Save TPM + DocSort pacing in one write (Settings form). */
export function setAiRateLimitSettings(input: {
  tpmLimit: number
  docsPerMinute: number
  docSortParallel: number
}): void {
  setUserTpmLimit(input.tpmLimit)
  setUserDocsPerMinute(input.docsPerMinute)
  setUserDocSortParallel(input.docSortParallel)
}

/** Remove user overrides and fall back to env / defaults. */
export function clearAiRateLimitSettings(): void {
  const settings = readSettings()
  delete settings.tpmLimit
  delete settings.docsPerMinute
  delete settings.docSortParallel
  writeSettings(settings)
}

/** @deprecated Prefer clearAiRateLimitSettings */
export function clearUserTpmLimit(): void {
  const settings = readSettings()
  delete settings.tpmLimit
  writeSettings(settings)
}

export function hasUserTpmLimitOverride(): boolean {
  return getUserTpmLimit() !== undefined
}

export function hasAiRateLimitOverrides(): boolean {
  const s = readSettings()
  return (
    positiveInt(s.tpmLimit) !== undefined ||
    positiveInt(s.docsPerMinute) !== undefined ||
    positiveInt(s.docSortParallel) !== undefined
  )
}

/** Minimum ms between starting DocSort scans from docs/minute. */
export function getDocSortStartIntervalMs(): number {
  const perMin = getEffectiveDocsPerMinute()
  return Math.ceil(60_000 / Math.max(1, perMin))
}
