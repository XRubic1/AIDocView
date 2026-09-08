/** Safe in-app path after client login (blocks open redirects). */
export function getSafeClientReturnPath(
  nextParam: string | null | undefined,
  stateFrom?: string
): string {
  const raw = (nextParam || stateFrom || '').trim()
  if (!raw.startsWith('/client/')) return '/client/dashboard'
  if (raw.startsWith('/client/login')) return '/client/dashboard'
  if (raw.startsWith('//') || raw.includes('://')) return '/client/dashboard'
  return raw
}

/** Login URL that returns to a protected client path after sign-in. */
export function clientLoginPathWithReturn(fromPath: string): string {
  const next = getSafeClientReturnPath(fromPath)
  if (next === '/client/dashboard') return '/client/login'
  return `/client/login?next=${encodeURIComponent(next)}`
}
