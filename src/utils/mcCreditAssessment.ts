import type {
  McCreditAssessment,
  McCreditRecord,
  McCreditSearchResponse,
  McCreditVerdict,
} from '../types/mcCreditLookup'

function num(value: string | number | undefined | null): number | null {
  if (value == null || value === '' || value === '—') return null
  const n = Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

/** 0 means the portal had no figure. Days to pay must not be reused as a score. */
export function creditMetrics(row: McCreditRecord): { score: number | null; days: number | null } {
  const rawScore = num(row.creditScore)
  const rawDays = num(row.paydex)
  const days = rawDays != null && rawDays > 0 ? rawDays : null
  const score =
    rawScore != null && rawScore > 0 && rawScore !== days ? rawScore : null
  return { score, days }
}

function hasStolenId(row: McCreditRecord): boolean {
  const blob = [row.company, row.warning, row.creditNote, row.noBuy]
    .filter(Boolean)
    .join(' ')
    .toUpperCase()
  return /STOLEN\s*ID|STOLEN\s*IDENTITY|CALL\s*TO\s*VERIFY/.test(blob)
}

const THIN_HISTORY = /not enough|insufficient|no rating|not rated|new account|too new|limited history|no experience|no payment/i

function invoiceCount(row: McCreditRecord): number | null {
  const raw = row.calcInvCount?.all ?? row.calcInvCount?.days90 ?? row.calcInvCount?.days60
  const count = num(raw)
  return count != null && count >= 0 ? count : null
}

/**
 * N is often a file with too little payment history to grade.
 * A real invoice count, or a note that explains the N another way, leaves the score and days in charge.
 */
function nRatingGap(rows: McCreditRecord[], letterRatings: string[]): string | null {
  if (!letterRatings.includes('N')) return null
  if (letterRatings.some((rating) => ['A', 'B', 'C', 'D'].includes(rating))) return null

  const nRows = rows.filter((row) => (row.creditRating || '').toUpperCase().trim() === 'N')
  const notes = nRows.map((row) => [row.creditNote, row.warning, row.noBuy].filter(Boolean).join(' ').trim())
  if (notes.some((note) => THIN_HISTORY.test(note))) {
    return 'Not enough payment history to grade this broker.'
  }
  if (notes.some((note) => note.length > 0)) return null

  const counts = nRows.map(invoiceCount).filter((count): count is number => count != null)
  if (counts.length && Math.max(...counts) >= 5) return null
  if (counts.length) {
    const count = Math.max(...counts)
    if (count === 0) return 'No invoices on file, so this N rating is not a payment grade.'
    return `Only ${count} invoice${count === 1 ? '' : 's'} on file, so this N rating is not a solid payment grade.`
  }
  return 'Rated N. Payment history may be too thin to treat this score as solid.'
}

function isNoBuy(row: McCreditRecord): boolean {
  const blob = [row.noBuy, row.creditRating].filter(Boolean).join(' ').toUpperCase()
  return blob.includes('NO BUY') || row.creditRating?.toUpperCase() === 'F'
}

/** Work-with verdict from the credit check. */
export function assessMcCredit(data: McCreditSearchResponse): McCreditAssessment {
  const rows = data.results
  const sourceCount = rows.length

  if (rows.length === 0) {
    return {
      verdict: 'unknown',
      title: 'Not enough data',
      summary: 'No credit record was found for this MC.',
      company: '—',
      mc: data.mc,
      reasons: ['This check did not return a matching broker.'],
      positives: [],
      sourceCount: 0,
    }
  }

  const company =
    rows.find((r) => r.company)?.company?.replace(/\s*\(STOLEN ID.*$/i, '').trim() ||
    'Unknown broker'

  const reasons: string[] = []
  const positives: string[] = []
  let avoidScore = 0
  let goodScore = 0

  if (rows.some(isNoBuy)) {
    avoidScore += 4
    reasons.push('Marked No Buy.')
  }

  if (rows.some(hasStolenId)) {
    avoidScore += 5
    reasons.push('Identity-theft / stolen-ID warning on file — verify before hauling.')
  }

  const letterRatings = rows
    .map((r) => (r.creditRating || '').toUpperCase().trim())
    .filter((r) => ['A', 'B', 'C', 'D', 'F', 'N'].includes(r))

  if (letterRatings.includes('D')) {
    reasons.push('Credit rating includes D.')
  }
  const thinHistory = nRatingGap(rows, letterRatings)
  if (thinHistory) reasons.push(thinHistory)
  if (letterRatings.some((r) => ['A', 'B'].includes(r))) {
    goodScore += 2
    positives.push(
      `Solid letter rating(s): ${[...new Set(letterRatings.filter((r) => ['A', 'B', 'C'].includes(r)))].join(', ')}`
    )
  } else if (letterRatings.includes('C')) {
    goodScore += 1
    positives.push('Credit rating includes C.')
  }

  const scores = rows.map((row) => creditMetrics(row).score).filter((n): n is number => n != null)
  if (scores.length) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    if (avg >= 85) {
      goodScore += 2
      positives.push(`Strong credit scores (avg ${avg.toFixed(0)}).`)
    } else if (avg >= 70) {
      goodScore += 1
      positives.push(`Moderate credit scores (avg ${avg.toFixed(0)}).`)
    } else {
      reasons.push(`Lower credit scores (avg ${avg.toFixed(0)}).`)
    }
  }

  const days = rows.map((row) => creditMetrics(row).days).filter((n): n is number => n != null)
  if (days.length) {
    const avgDays = days.reduce((a, b) => a + b, 0) / days.length
    if (avgDays <= 30) {
      goodScore += 2
      positives.push(`Pays quickly (avg ~${avgDays.toFixed(0)} days).`)
    } else if (avgDays <= 40) {
      goodScore += 1
      positives.push(`Average payment around ${avgDays.toFixed(0)} days.`)
    } else {
      reasons.push(`Slower payment pace (avg ~${avgDays.toFixed(0)} days).`)
    }
  }

  const faster = rows
    .map((r) => num(r.payFasterPercent))
    .filter((n): n is number => n != null)
  if (faster.length) {
    const pct = Math.max(...faster)
    if (pct >= 60) {
      reasons.push(`${pct}% of similar brokers pay faster than this one.`)
    } else if (pct <= 30) {
      goodScore += 1
      positives.push(`Only ${pct}% of similar brokers pay faster.`)
    }
  }

  let verdict: McCreditVerdict = 'unknown'
  let title = 'Review carefully'
  let summary = 'Signals are mixed. Review the details before booking.'

  if (avoidScore >= 4) {
    verdict = 'avoid'
    title = 'Not recommended'
    summary =
      'Hard risk flags found. Do not treat this broker as safe to work without direct verification.'
  } else if (reasons.length > 0) {
    verdict = 'caution'
    title = 'Work with caution'
    summary = 'Some positives, but risk or payment concerns exist. Verify before hauling.'
  } else if (positives.length > 0 || goodScore > 0) {
    verdict = 'good'
    title = 'Good to work with'
    summary = 'Credit signals look solid. Still confirm load details as usual.'
  }

  return {
    verdict,
    title,
    summary,
    company,
    mc: data.mc,
    reasons,
    positives,
    sourceCount,
  }
}

const VENDOR_NAME = /factors\s*network|compass(?:\s*cfs)?|trufunding/gi

/** Drop wording that would tell a carrier where a figure came from. */
export function redactVendorText(value: string | undefined): string | undefined {
  if (!value) return undefined
  const cleaned = value.replace(VENDOR_NAME, '').replace(/\s{2,}/g, ' ').trim()
  if (!cleaned || /location records|distribution report/i.test(value)) return undefined
  return cleaned
}
