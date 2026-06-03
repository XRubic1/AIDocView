/** Normalize broker/company names for fuzzy comparison. */
export function normalizeBrokerName(value?: string | null): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[.,']/g, '')
    .replace(/\b(inc|llc|ltd|corp|co|company|logistics|freight|global|solutions)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Token overlap score 0–1 for broker fuzzy match. */
export function brokerSimilarity(a?: string | null, b?: string | null): number {
  const left = normalizeBrokerName(a)
  const right = normalizeBrokerName(b)
  if (!left || !right) return 0
  if (left === right) return 1
  if (left.includes(right) || right.includes(left)) return 0.9

  const leftTokens = new Set(left.split(' ').filter((token) => token.length > 2))
  const rightTokens = new Set(right.split(' ').filter((token) => token.length > 2))
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0

  let overlap = 0
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) overlap += 1
  })

  return overlap / Math.max(leftTokens.size, rightTokens.size)
}

/** Collapse spaces so "JPPExpress" matches "JPP Express". */
export function compactCompanyName(value?: string | null): string {
  return normalizeBrokerName(value).replace(/\s/g, '')
}

/** Fuzzy match for broker/carrier names — handles spacing, suffixes, and OCR-style variants. */
export function companyNamesFuzzyMatch(a?: string | null, b?: string | null): boolean {
  if (brokersFuzzyMatch(a, b)) return true
  const compactA = compactCompanyName(a)
  const compactB = compactCompanyName(b)
  if (!compactA || !compactB) return false
  if (compactA === compactB) return true
  if (compactA.length >= 4 && compactB.length >= 4) {
    if (compactA.includes(compactB) || compactB.includes(compactA)) return true
  }
  return false
}

/** True when broker names are close enough per spec (abbreviations / slight variations). */
export function brokersFuzzyMatch(a?: string | null, b?: string | null, threshold = 0.55): boolean {
  return brokerSimilarity(a, b) >= threshold
}
