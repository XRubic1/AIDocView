import type { BatchIntakeDraft, CredyxInvoiceDraft } from '../../../types/credyxBatch'
import type { DocSortFingerprint } from '../types'
import { allLoadKeys, explainFingerprintsLink, normalizeDocDate } from './matchKeys'

export interface AssignmentDebugDoc {
  docId: string
  fileName: string
  kind: string
  loadKeys: string[]
  broker?: string
  pickup?: string
  delivery?: string
  pickupDate?: string
  deliveryDate?: string
  rateAmount?: number
  packetLabel: string
  joinReasons: string[]
  rejected: Array<{ packetLabel: string; blockers: string[] }>
}

function draftFingerprints(inv: CredyxInvoiceDraft): DocSortFingerprint[] {
  return [...inv.fingerprints.rateCons, ...inv.fingerprints.bols, ...(inv.fingerprints.other ?? [])]
}

function packetLabel(inv: CredyxInvoiceDraft): string {
  return `Inv #${inv.invoice_number} · Load ${inv.load_number || '—'} · ${inv.broker_name || 'no broker'}`
}

function allDraftDocs(draft: BatchIntakeDraft): Array<{
  fp: DocSortFingerprint
  packet: CredyxInvoiceDraft | null
}> {
  const rows: Array<{ fp: DocSortFingerprint; packet: CredyxInvoiceDraft | null }> = []
  draft.invoices.forEach((inv) => {
    draftFingerprints(inv).forEach((fp) => rows.push({ fp, packet: inv }))
  })
  ;[
    ...draft.unmatched.rateCons,
    ...draft.unmatched.bols,
    ...draft.unmatched.other,
  ].forEach((fp) => rows.push({ fp, packet: null }))
  return rows
}

/** Per-document reasons for current packet assignment (live, after user moves). */
export function buildAssignmentDebug(draft: BatchIntakeDraft): AssignmentDebugDoc[] {
  const rows = allDraftDocs(draft)
  return rows.map(({ fp, packet }) => {
    const mates = packet
      ? draftFingerprints(packet).filter((other) => other.docId !== fp.docId)
      : []
    const joinReasons = mates.flatMap((mate) => {
      const link = explainFingerprintsLink(fp, mate)
      return link.linked ? link.reasons.map((reason) => `${reason} with ${mate.fileName}`) : []
    })
    const uniqueJoins = [...new Set(joinReasons)]
    if (packet && uniqueJoins.length === 0 && mates.length === 0) {
      uniqueJoins.push('only document in this packet')
    }

    const rejected = draft.invoices
      .filter((inv) => inv.draftId !== packet?.draftId)
      .map((inv) => {
        const links = draftFingerprints(inv).map((mate) => explainFingerprintsLink(fp, mate))
        const blockers = [
          ...new Set(links.flatMap((link) => (link.linked ? [] : link.blockers))),
        ]
        return { packetLabel: packetLabel(inv), blockers }
      })
      .filter((row) => row.blockers.length > 0)

    return {
      docId: fp.docId,
      fileName: fp.fileName,
      kind: fp.kind,
      loadKeys: allLoadKeys(fp),
      broker: fp.broker,
      pickup: fp.pickup,
      delivery: fp.delivery,
      pickupDate: normalizeDocDate(fp.pickupDate) || undefined,
      deliveryDate: normalizeDocDate(fp.deliveryDate) || undefined,
      rateAmount: fp.rateAmount,
      packetLabel: packet ? packetLabel(packet) : 'Unassigned',
      joinReasons: uniqueJoins,
      rejected,
    }
  })
}
