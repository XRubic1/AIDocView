import { isSupportDocKind, type DocSortFingerprint, type DocSortLoadGroup, type DocSortResult } from '../types'
import {
  allLoadKeys,
  clusterFingerprints,
  fingerprintsBelongTogether,
  loadsOverlap,
  primaryLoadLabel,
} from './matchKeys'
import { bolBelongsWithRateCon } from './bolRateConMatch'
import { canUnpackFingerprint } from '../services/docSortUnpack'

export { loadsOverlap }

/** Combined RC+BOL+invoice PDFs must wait for Credyx Doc Splitter — never become packets. */
function isCombinedForSplitter(fp: DocSortFingerprint): boolean {
  return canUnpackFingerprint(fp)
}

function peelCombinedFingerprints(list: DocSortFingerprint[]): {
  clean: DocSortFingerprint[]
  combined: DocSortFingerprint[]
} {
  const clean: DocSortFingerprint[] = []
  const combined: DocSortFingerprint[] = []
  for (const fp of list) {
    if (isCombinedForSplitter(fp)) combined.push(fp)
    else clean.push(fp)
  }
  return { clean, combined }
}

function groupMembers(group: DocSortLoadGroup): DocSortFingerprint[] {
  return [...group.rateCons, ...group.bols, ...(group.others ?? [])]
}

function pairBelongsTogether(left: DocSortFingerprint, right: DocSortFingerprint): boolean {
  if (left.kind === 'bill_of_lading' && right.kind === 'rate_confirmation') {
    return bolBelongsWithRateCon(left, right)
  }
  if (right.kind === 'bill_of_lading' && left.kind === 'rate_confirmation') {
    return bolBelongsWithRateCon(right, left)
  }
  return fingerprintsBelongTogether(left, right)
}

function fingerprintOverlapsGroup(fp: DocSortFingerprint, group: DocSortLoadGroup): boolean {
  return groupMembers(group).some((member) => pairBelongsTogether(fp, member))
}

function groupsBelongTogether(a: DocSortLoadGroup, b: DocSortLoadGroup): boolean {
  return groupMembers(a).some((left) =>
    groupMembers(b).some((right) => pairBelongsTogether(left, right))
  )
}

function bestPacketLabel(fps: DocSortFingerprint[], fallback: string): string {
  const withBroker = fps.find((fp) => fp.broker?.trim())
  const withRate = fps.find((fp) => (fp.rateAmount ?? 0) > 0)
  const withLoad = fps.find((fp) => fp.loadNumbers.some((n) => n.trim()))
  const anchor = withBroker ?? withRate ?? withLoad ?? fps[0]
  return anchor ? primaryLoadLabel(anchor) : fallback
}

function mergeLoadGroups(a: DocSortLoadGroup, b: DocSortLoadGroup): DocSortLoadGroup {
  const rateCons = [...a.rateCons, ...b.rateCons]
  const bols = [...a.bols, ...b.bols]
  const others = [...(a.others ?? []), ...(b.others ?? [])]
  return {
    groupId: a.groupId,
    label: bestPacketLabel([...rateCons, ...bols, ...others], a.label),
    rateCons,
    bols,
    others,
    matchReason: a.matchReason || b.matchReason,
    matchScore: Math.max(a.matchScore, b.matchScore),
  }
}

function clusterLoadGroups(groups: DocSortLoadGroup[]): DocSortLoadGroup[] {
  if (groups.length <= 1) return groups
  const parent = groups.map((_, index) => index)
  const find = (index: number): number => {
    if (parent[index] !== index) parent[index] = find(parent[index])
    return parent[index]
  }
  const union = (left: number, right: number) => {
    const a = find(left)
    const b = find(right)
    if (a !== b) parent[a] = b
  }
  for (let i = 0; i < groups.length; i += 1) {
    for (let j = i + 1; j < groups.length; j += 1) {
      if (groupsBelongTogether(groups[i], groups[j])) union(i, j)
    }
  }
  const buckets = new Map<number, DocSortLoadGroup>()
  groups.forEach((group, index) => {
    const root = find(index)
    const existing = buckets.get(root)
    buckets.set(root, existing ? mergeLoadGroups(existing, group) : group)
  })
  return [...buckets.values()]
}

function isInvoiceWorthy(fps: DocSortFingerprint[]): boolean {
  return fps.some((fp) => {
    const hasLoad = allLoadKeys(fp).length > 0
    const hasRate = (fp.rateAmount ?? 0) > 0
    const hasBroker = Boolean(fp.broker?.trim())
    return hasLoad || hasRate || hasBroker
  })
}

function takeMatching(pool: DocSortFingerprint[], group: DocSortLoadGroup) {
  const taken: DocSortFingerprint[] = []
  const rest: DocSortFingerprint[] = []
  for (const fp of pool) {
    if (fingerprintOverlapsGroup(fp, group)) taken.push(fp)
    else rest.push(fp)
  }
  return { taken, rest }
}

/** Build a load group from one or more fingerprints for invoice drafting. */
export function toInvoiceLoadGroup(
  groupId: string,
  fps: DocSortFingerprint[],
  reason: string
): DocSortLoadGroup {
  const rateCons = fps.filter((f) => f.kind === 'rate_confirmation')
  const bols = fps.filter((f) => f.kind === 'bill_of_lading')
  const others = fps.filter((f) => isSupportDocKind(f.kind))
  const anchor = rateCons[0] ?? bols[0] ?? others[0]
  return {
    groupId,
    label: anchor ? primaryLoadLabel(anchor) : groupId,
    rateCons,
    bols,
    others,
    matchReason: reason,
    matchScore: 70,
  }
}

/**
 * Credyx invoice drafts from a DocSort run: matched RC+BOL groups, unmatched rate
 * cons (rate / broker / load still create an invoice), and other docs that already
 * have a load # and payable rate (e.g. a broker invoice PDF).
 * Combined multi-kind PDFs are never turned into packets — they go to unmatched
 * for Credyx Doc Splitter.
 */
export function invoiceDraftGroupsFromSort(sort: DocSortResult): {
  groups: DocSortLoadGroup[]
  unmatched: {
    rateCons: DocSortFingerprint[]
    bols: DocSortFingerprint[]
    other: DocSortFingerprint[]
  }
} {
  const peeledGroups: DocSortLoadGroup[] = []
  const combinedHeld: DocSortFingerprint[] = []

  for (const group of sort.groups) {
    const rc = peelCombinedFingerprints(group.rateCons)
    const bol = peelCombinedFingerprints(group.bols)
    const oth = peelCombinedFingerprints(group.others ?? [])
    combinedHeld.push(...rc.combined, ...bol.combined, ...oth.combined)
    if (rc.clean.length === 0 && bol.clean.length === 0 && oth.clean.length === 0) continue
    peeledGroups.push({
      ...group,
      rateCons: rc.clean,
      bols: bol.clean,
      others: oth.clean,
    })
  }

  const peeledUnmatchedRc = peelCombinedFingerprints(sort.unmatchedRateCons)
  const peeledUnmatchedBol = peelCombinedFingerprints(sort.unmatchedBols)
  const peeledOther = peelCombinedFingerprints(sort.otherDocuments)
  combinedHeld.push(
    ...peeledUnmatchedRc.combined,
    ...peeledUnmatchedBol.combined,
    ...peeledOther.combined
  )

  let others = [...peeledOther.clean]
  const groups: DocSortLoadGroup[] = []

  for (const group of peeledGroups) {
    const { taken, rest } = takeMatching(others, group)
    others = rest
    groups.push(
      taken.length > 0
        ? { ...group, others: [...(group.others ?? []), ...taken] }
        : { ...group, others: [...(group.others ?? [])] }
    )
  }

  const leftoverRcs: DocSortFingerprint[] = []
  for (const rc of peeledUnmatchedRc.clean) {
    const host = groups.find((group) => fingerprintOverlapsGroup(rc, group))
    if (host) host.rateCons.push(rc)
    else leftoverRcs.push(rc)
  }

  for (const cluster of clusterFingerprints(leftoverRcs)) {
    if (!isInvoiceWorthy(cluster)) {
      others.push(...cluster)
      continue
    }
    const seed = toInvoiceLoadGroup(
      `solo-rc-${cluster[0].docId}`,
      cluster,
      cluster.length > 1 ? 'rate confirmation pages' : 'rate confirmation'
    )
    seed.label = bestPacketLabel(cluster, seed.label)
    const { taken, rest } = takeMatching(others, seed)
    others = rest
    groups.push(
      taken.length > 0
        ? { ...seed, others: [...(seed.others ?? []), ...taken] }
        : seed
    )
  }

  const leftoverBols: DocSortFingerprint[] = []
  for (const bol of peeledUnmatchedBol.clean) {
    const host = groups.find((group) => fingerprintOverlapsGroup(bol, group))
    if (host) {
      host.bols.push(bol)
    } else {
      leftoverBols.push(bol)
    }
  }

  const unmatchedBols: DocSortFingerprint[] = []
  for (const cluster of clusterFingerprints(leftoverBols)) {
    const seed = toInvoiceLoadGroup(
      `solo-bol-${cluster[0].docId}`,
      cluster,
      cluster.length > 1 ? 'matched from extract JSON' : 'bill of lading'
    )
    seed.label = bestPacketLabel(cluster, seed.label)
    const { taken, rest } = takeMatching(others, seed)
    if (taken.length === 0) {
      unmatchedBols.push(...cluster)
      continue
    }
    others = rest
    groups.push({ ...seed, others: [...(seed.others ?? []), ...taken] })
  }

  const leftoverOthers: DocSortFingerprint[] = []
  for (const fp of others) {
    const host = groups.find((group) => fingerprintOverlapsGroup(fp, group))
    if (host) {
      host.others = [...(host.others ?? []), fp]
      continue
    }
    const hasLoad = allLoadKeys(fp).length > 0
    const hasRate = (fp.rateAmount ?? 0) > 0
    // Never invent a packet from a carrier invoice PDF alone when it still looks combined —
    // already peeled, but keep the rule: load+rate others only if single-kind.
    if (hasLoad && hasRate && !isCombinedForSplitter(fp)) {
      groups.push(toInvoiceLoadGroup(`solo-other-${fp.docId}`, [fp], 'extracted from document'))
    } else {
      leftoverOthers.push(fp)
    }
  }

  return {
    groups: clusterLoadGroups(groups),
    unmatched: {
      rateCons: [],
      bols: unmatchedBols,
      other: [...leftoverOthers, ...combinedHeld],
    },
  }
}
