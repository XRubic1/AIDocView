import type { DocSortFingerprint, DocSortLoadGroup, DocSortResult } from '../types'
import {
  allLoadKeys,
  lanesOverlap,
  loadKeysMatch,
  namesOverlap,
  primaryLoadLabel,
} from '../utils/matchKeys'

function scoreBolToRateCon(bol: DocSortFingerprint, rateCon: DocSortFingerprint): {
  score: number
  reason: string
} {
  const bolKeys = allLoadKeys(bol)
  const rcKeys = allLoadKeys(rateCon)
  let score = 0
  const reasons: string[] = []

  for (const bk of bolKeys) {
    for (const rk of rcKeys) {
      if (loadKeysMatch(bk, rk)) {
        score += 50
        reasons.push(`load # ${bk}`)
        break
      }
    }
  }

  if (namesOverlap(bol.broker, rateCon.broker)) {
    score += 15
    reasons.push('broker')
  }
  if (namesOverlap(bol.carrier, rateCon.carrier)) {
    score += 10
    reasons.push('carrier')
  }
  if (lanesOverlap(bol.pickup, rateCon.pickup)) {
    score += 12
    reasons.push('pickup')
  }
  if (lanesOverlap(bol.delivery, rateCon.delivery)) {
    score += 15
    reasons.push('delivery')
  }

  return {
    score,
    reason: reasons.length > 0 ? reasons.join(' + ') : 'weak match',
  }
}

/**
 * Group rate cons with BOLs by load # and lane hints — no verification checks.
 */
export function matchSortedDocuments(fingerprints: DocSortFingerprint[]): DocSortResult {
  const rateCons = fingerprints.filter((f) => f.kind === 'rate_confirmation')
  const bols = fingerprints.filter((f) => f.kind === 'bill_of_lading')
  const otherDocuments = fingerprints.filter((f) => f.kind === 'other')

  const groups: DocSortLoadGroup[] = []
  const groupByKey = new Map<string, DocSortLoadGroup>()

  rateCons.forEach((rc, index) => {
    const label = primaryLoadLabel(rc)
    const key = allLoadKeys(rc)[0] ?? `rc-${index}`
    const existing = groupByKey.get(key)
    if (existing) {
      existing.rateCons.push(rc)
    } else {
      const group: DocSortLoadGroup = {
        groupId: `load-${key}`,
        label,
        rateCons: [rc],
        bols: [],
        matchScore: 100,
        matchReason: 'rate confirmation anchor',
      }
      groupByKey.set(key, group)
      groups.push(group)
    }
  })

  const unmatchedBols: DocSortFingerprint[] = []
  const MATCH_THRESHOLD = 25

  for (const bol of bols) {
    let bestGroup: DocSortLoadGroup | undefined
    let bestScore = 0
    let bestReason = ''

    for (const group of groups) {
      const anchor = group.rateCons[0]
      if (!anchor) continue
      const { score, reason } = scoreBolToRateCon(bol, anchor)
      if (score > bestScore) {
        bestScore = score
        bestGroup = group
        bestReason = reason
      }
    }

    if (bestGroup && bestScore >= MATCH_THRESHOLD) {
      bestGroup.bols.push(bol)
      bestGroup.matchScore = Math.min(bestGroup.matchScore, bestScore)
      if (bestReason !== 'rate confirmation anchor') {
        bestGroup.matchReason = bestReason
      }
    } else {
      unmatchedBols.push(bol)
    }
  }

  const matchedGroups = groups.filter((g) => g.bols.length > 0)
  const unmatchedRateCons = groups.filter((g) => g.bols.length === 0).flatMap((g) => g.rateCons)

  return {
    sortedAt: new Date().toISOString(),
    groups: matchedGroups,
    unmatchedRateCons,
    unmatchedBols,
    otherDocuments,
    totalDocuments: fingerprints.length,
  }
}
