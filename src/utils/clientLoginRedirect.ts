/** Safe in-app path after client login (blocks open redirects). */
export function getSafeClientReturnPath(
  nextParam: string | null | undefined,
  stateFrom?: string
): string {
  const raw = (nextParam || stateFrom || '').trim()
  if (!raw.startsWith('/client/')) return '/client/dashboard'
  if (raw.startsWith('/client/login') || raw.startsWith('/client/setup-password')) return '/client/dashboard'
  if (raw.startsWith('//') || raw.includes('://')) return '/client/dashboard'
  return raw
}

/** Login URL that returns to a protected client path after sign-in. */
export function clientLoginPathWithReturn(fromPath: string): string {
  const next = getSafeClientReturnPath(fromPath)
  if (next === '/client/dashboard') return '/client/login'
  return `/client/login?next=${encodeURIComponent(next)}`
}

const DEFAULT_APP_ORIGIN = 'https://app.credyx.net'

/**
 * Absolute client-login URL for marketing-only deploys (links out to the product app).
 * Prefer VITE_PUBLIC_APP_URL; never use the marketing site origin as a fallback.
 */
export function getClientLoginHref(): string {
  const fromEnv =
    typeof import.meta !== 'undefined'
      ? (import.meta.env?.VITE_PUBLIC_APP_URL as string | undefined)?.replace(/\/$/, '')
      : ''
  const origin = fromEnv || DEFAULT_APP_ORIGIN
  return `${origin}/client/login`
}
