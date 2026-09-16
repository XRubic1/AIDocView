/**
 * Return the domain after @ (lowercased), or null if missing/invalid.
 */
export function extractEmailDomain(email: string): string | null {
  const at = email.lastIndexOf('@')
  if (at < 0) return null
  const domain = email.slice(at + 1).trim().toLowerCase()
  // Require a real-looking domain (e.g. broker.com)
  if (!domain || !domain.includes('.')) return null
  return normalizeEmailDomain(domain)
}

/** Lowercase domain and strip a leading www. */
export function normalizeEmailDomain(domain: string): string | null {
  const trimmed = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  const host = trimmed.replace(/^www\./, '')
  if (!host || !host.includes('.')) return null
  return host
}

/**
 * Keep the local-part the user typed and append `@domain`.
 * If local-part is empty, returns '' so the field stays blank until they type.
 */
export function applyEmailDomain(value: string, domain: string): string {
  const at = value.indexOf('@')
  const local = (at >= 0 ? value.slice(0, at) : value).replace(/@/g, '').trim()
  if (!local) return ''
  return `${local}@${domain}`
}

/**
 * Show a gray `@domain` suggestion when the user has typed a local-part
 * but has not entered `@` yet.
 */
export function canSuggestEmailDomain(
  value: string,
  domain: string | null | undefined,
  enabled: boolean
): boolean {
  if (!enabled || !domain) return false
  const trimmed = value.trim()
  if (!trimmed) return false
  return !trimmed.includes('@')
}
