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

/** Run `fn` with job auth attached; clears afterward. */
export async function withOpenAiJobAuth<T>(
  auth: OpenAiJobAuth | null,
  fn: () => Promise<T>
): Promise<T> {
  const prev = jobAuth
  jobAuth = auth
  try {
    return await fn()
  } finally {
    jobAuth = prev
  }
}
