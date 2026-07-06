const STOP_WORDS = new Set(['INC', 'LLC', 'CO', 'CORP', 'LTD', 'THE', 'AND', 'LLP'])

/** Significant words from a company name (drops common suffixes). */
export function significantWords(name: string): string[] {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w))
  return words.length > 0 ? words : ['CLIENT']
}

/** Yield 4-letter batch code candidates in priority order. */
export function* batchCodeCandidates(name: string): Generator<string> {
  const words = significantWords(name)
  const w0 = words[0]
  const w1 = words[1] ?? w0
  const p3 = w0.slice(0, 3).padEnd(3, w0[0] ?? 'X')
  const p2 = w0.slice(0, 2).padEnd(2, w0[0] ?? 'X')

  // Primary pattern: ABC LOGISTICS → ABCL, ABCO, ABLO, ABLG
  if (words.length >= 2) {
    yield (p3 + w1[0]).slice(0, 4)
    if (w1.length > 1) yield (p3 + w1[1]).slice(0, 4)
    if (w1.length > 1) yield (p2 + w1[0] + w1[1]).slice(0, 4)
    if (w1.length > 2) yield (p2 + w1[0] + w1[2]).slice(0, 4)
  }

  for (let i = 0; i < w1.length; i++) {
    yield (p3 + w1[i]).slice(0, 4)
  }

  for (let i = 0; i < w1.length; i++) {
    for (let j = i; j < w1.length; j++) {
      yield (p2 + w1[i] + w1[j]).slice(0, 4)
    }
  }

  yield words
    .map((w) => w[0])
    .join('')
    .slice(0, 4)
    .padEnd(4, 'X')

  const flat = words.join('')
  for (let i = 0; i <= Math.max(0, flat.length - 4); i++) {
    yield flat.slice(i, i + 4).padEnd(4, flat[0] ?? 'X')
  }

  for (let n = 1; n < 100; n++) {
    yield (
      words
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .padEnd(2, 'X') + String(n).padStart(2, '0')
    ).slice(0, 4)
  }
}

/** Pick the first unused 4-letter code for a company name. */
export function pickAvailableBatchCode(name: string, taken: Set<string>): string {
  const takenUpper = new Set([...taken].map((c) => c.toUpperCase()))
  const seen = new Set<string>()

  for (const candidate of batchCodeCandidates(name)) {
    const code = candidate.toUpperCase().slice(0, 4)
    if (code.length < 4 || seen.has(code)) continue
    seen.add(code)
    if (!takenUpper.has(code)) return code
  }

  return `X${Date.now().toString(36).slice(-3).toUpperCase()}`.slice(0, 4).padEnd(4, 'X')
}
