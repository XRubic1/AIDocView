import type { DocSortFingerprint, DocSortLoadGroup, DocSortResult } from '../types'
import {
  allLoadKeys,
  clusterFingerprints,
  explainFingerprintsLink,
  lanesOverlap,
  primaryLoadLabel,
} from '../utils/matchKeys'

function scoreBolToRateCon(bol: DocSortFingerprint, rateCon: DocSortFingerprint): {
  score: number
  reason: string
} {
  const link = explainFingerprintsLink(bol, rateCon)
  const hardBlock = link.blockers.filter(
    (item) => item.startsWith('different brokers') || item.startsWith('different dates')
  )
  if (hardBlock.length > 0) {
    return { score: 0, reason: hardBlock.join(' + ') }
  }
  if (link.linked) {
    return { score: 80, reason: link.reasons.join(' + ') }
  }

  let score = 0
  const reasons: string[] = []
  const pickupHit = lanesOverlap(bol.pickup, rateCon.pickup)
  const deliveryHit = lanesOverlap(bol.delivery, rateCon.delivery)
  if (pickupHit) {
    score += 20
    reasons.push('pickup')
  }
  if (deliveryHit) {
    score += 20
    reasons.push('delivery')
  }

  if (pickupHit && deliveryHit) {
    score = Math.max(score, 55)
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

  clusterFingerprints(rateCons).forEach((cluster, index) => {
    const label = primaryLoadLabel(
      cluster.find((rc) => rc.broker?.trim()) ??
        cluster.find((rc) => (rc.rateAmount ?? 0) > 0) ??
        cluster[0]
    )
    const key = allLoadKeys(cluster[0])[0] ?? `rc-${index}`
    groups.push({
      groupId: `load-${key}-${index}`,
      label,
      rateCons: cluster,
      bols: [],
      matchScore: 100,
      matchReason: cluster.length > 1 ? 'rate confirmation pages' : 'rate confirmation anchor',
    })
  })

  const unmatchedBols: DocSortFingerprint[] = []
  const MATCH_THRESHOLD = 50

  for (const bol of bols) {
    let bestGroup: DocSortLoadGroup | undefined
    let bestScore = 0
    let bestReason = ''

    for (const group of groups) {
      for (const anchor of group.rateCons) {
        const { score, reason } = scoreBolToRateCon(bol, anchor)
        if (score > bestScore) {
          bestScore = score
          bestGroup = group
          bestReason = reason
        }
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
