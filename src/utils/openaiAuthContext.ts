/**
 * Auth helpers for OpenAI proxy calls.
 * Batch jobs can run without a live UI session (account switch / future integrations).
 */

export type OpenAiJobAuth = {
  batchId: string
  jobId: string
}

let jobAuth: OpenAiJobAuth | null = null
let cachedAccessToken: string | null = null
let cachedAtMs = 0
/** Carrier whose AI spend should be attributed (batch / portal). */
let spendClientId: string | null = null
let spendFeature: string | null = null

const TOKEN_TTL_MS = 55 * 60 * 1000

/** Remember the signed-in access token for in-flight AI work. */
export function rememberOpenAiAccessToken(token: string | null | undefined): void {
  if (!token) {
    cachedAccessToken = null
    cachedAtMs = 0
    return
  }
  cachedAccessToken = token
  cachedAtMs = Date.now()
}

/** Last known user JWT (survives brief getSession null during account switch). */
export function getCachedOpenAiAccessToken(): string | null {
  if (!cachedAccessToken) return null
  if (Date.now() - cachedAtMs > TOKEN_TTL_MS) return null
  return cachedAccessToken
}

/** Bind OpenAI calls in this async chain to a running batch processing job. */
export function setOpenAiJobAuth(next: OpenAiJobAuth | null): void {
  jobAuth = next
}

export function getOpenAiJobAuth(): OpenAiJobAuth | null {
  return jobAuth
}

/** Run work with job-bound OpenAI auth; restores prior binding afterward. */
export async function withOpenAiJobAuth<T>(
  next: OpenAiJobAuth | null,
  fn: () => Promise<T>
): Promise<T> {
  const previous = jobAuth
  jobAuth = next
  try {
    return await fn()
  } finally {
    jobAuth = previous
  }
}

/** Attribute token spend to a carrier (and optional feature label). */
export function setOpenAiSpendContext(next: {
  clientId?: string | null
  feature?: string | null
} | null): void {
  if (!next) {
    spendClientId = null
    spendFeature = null
    return
  }
  if (next.clientId !== undefined) spendClientId = next.clientId || null
  if (next.feature !== undefined) spendFeature = next.feature || null
}

export function getOpenAiSpendClientId(): string | null {
  return spendClientId
}

export function getOpenAiSpendFeature(): string | null {
  return spendFeature
}
