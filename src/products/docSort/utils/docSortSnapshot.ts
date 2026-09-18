import type { DocSortFingerprint, DocSortKind, DocSortResult } from '../types'
import type { CredyxInvoiceDraft } from '../../../types/credyxBatch'
import { fingerprintNeedsDocSplitter } from '../services/docSortUnpack'

/** Fingerprint + extract JSON stored on the batch for matching and AI verification. */
export interface PersistedDocFingerprint {
  docId: string
  fileName: string
  kind: DocSortKind
  loadNumbers: string[]
  broker?: string
  carrier?: string
  pickup?: string
  delivery?: string
  pickupDate?: string
  deliveryDate?: string
  rateAmount?: number
  rateCurrency?: string
  invoiceNumber?: string
  extract?: DocSortFingerprint['extract']
}

function compactFp(fp: DocSortFingerprint): PersistedDocFingerprint {
  return {
    docId: fp.docId,
    fileName: fp.fileName,
    kind: fp.kind,
    loadNumbers: [...fp.loadNumbers],
    broker: fp.broker,
    carrier: fp.carrier,
    pickup: fp.pickup,
    delivery: fp.delivery,
    pickupDate: fp.pickupDate,
    deliveryDate: fp.deliveryDate,
    rateAmount: fp.rateAmount,
    rateCurrency: fp.rateCurrency,
    invoiceNumber: fp.invoiceNumber,
    extract: fp.extract,
  }
}

function collectDraftFingerprints(drafts: CredyxInvoiceDraft[]): DocSortFingerprint[] {
  return drafts.flatMap((draft) => [
    ...draft.fingerprints.rateCons,
    ...draft.fingerprints.bols,
    ...(draft.fingerprints.other ?? []),
  ])
}

/** JSON snapshot written to batch.doc_sort_snapshot on submit / packet save. */
export function buildDocSortSnapshot(
  sortResult: DocSortResult,
  drafts: CredyxInvoiceDraft[] = []
): string {
  const byId = new Map<string, PersistedDocFingerprint>()
  const sources = [
    ...sortResult.groups.flatMap((g) => [...g.rateCons, ...g.bols, ...(g.others ?? [])]),
    ...sortResult.unmatchedRateCons,
    ...sortResult.unmatchedBols,
    ...sortResult.otherDocuments,
    ...collectDraftFingerprints(drafts),
  ]
  sources.forEach((fp) => {
    if (!byId.has(fp.docId)) byId.set(fp.docId, compactFp(fp))
  })

  return JSON.stringify({
    sortedAt: sortResult.sortedAt,
    totalDocuments: sortResult.totalDocuments,
    groupCount: sortResult.groups.length,
    fingerprints: [...byId.values()],
    needsDocSplit: Boolean(
      [...byId.values()].some((fp) =>
        fingerprintNeedsDocSplitter({
          docId: fp.docId,
          fileName: fp.fileName,
          kind: fp.kind,
          loadNumbers: fp.loadNumbers,
          extract: fp.extract,
          confidence: 0,
        })
      )
    ),
  })
}

/** Read persisted fingerprints from a batch snapshot (legacy snapshots return empty). */
export function parseFingerprintCatalog(raw?: string | null): Map<string, PersistedDocFingerprint> {
  const map = new Map<string, PersistedDocFingerprint>()
  if (!raw) return map
  try {
    const parsed = JSON.parse(raw) as {
      fingerprints?: PersistedDocFingerprint[]
      sortResult?: { fingerprints?: PersistedDocFingerprint[] }
    }
    const list = parsed.fingerprints ?? parsed.sortResult?.fingerprints ?? []
    if (!Array.isArray(list)) return map
    list.forEach((fp) => {
      if (fp?.docId && fp.kind) map.set(fp.docId, fp)
    })
  } catch {
    /* ignore */
  }
  return map
}
