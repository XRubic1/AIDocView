import { isSupportDocKind, type DocSortFingerprint, type DocSortLoadGroup, type DocSortResult } from '../types'
import {
  allLoadKeys,
  clusterFingerprints,
  primaryLoadLabel,
} from '../utils/matchKeys'
import { BOL_RC_MATCH_THRESHOLD, scoreBolToRateCon } from '../utils/bolRateConMatch'

/**
 * Group rate cons with BOLs by RC destinations and reference numbers.
 */
export function matchSortedDocuments(fingerprints: DocSortFingerprint[]): DocSortResult {
  const rateCons = fingerprints.filter((f) => f.kind === 'rate_confirmation')
  const bols = fingerprints.filter((f) => f.kind === 'bill_of_lading')
  const otherDocuments = fingerprints.filter((f) => isSupportDocKind(f.kind))

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

  for (const bol of bols) {
    let bestGroup: DocSortLoadGroup | undefined
    let bestScore = 0
    let bestReason = ''
    let secondScore = 0

    for (const group of groups) {
      for (const anchor of group.rateCons) {
        const { score, reason } = scoreBolToRateCon(bol, anchor)
        if (score > bestScore) {
          secondScore = bestScore
          bestScore = score
          bestGroup = group
          bestReason = reason
        } else if (score > secondScore) {
          secondScore = score
        }
      }
    }

    const uniqueWinner = bestScore > secondScore
    if (bestGroup && bestScore >= BOL_RC_MATCH_THRESHOLD && uniqueWinner) {
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
