import { describe, expect, it } from 'vitest'
import type { ExtractedDocumentData } from '../../../types/documentReview'
import type { DocSortFingerprint } from '../types'
import { matchSortedDocuments } from '../services/docSortMatcher'
import { invoiceDraftGroupsFromSort } from './invoiceDraftGroups'
import {
  matchSortedDocuments as edgeMatchSortedDocuments,
  invoiceDraftGroupsFromSort as edgeInvoiceDraftGroupsFromSort,
  type MatchFingerprint,
} from '../../../../supabase/functions/_shared/docSortMatch'

/**
 * Parity guard: supabase/functions/_shared/docSortMatch.ts is a Deno port of the
 * browser matching logic. If this test fails, the two implementations drifted —
 * fix the port (or port the new rule) so browser and edge produce identical packets.
 */

function extraction(partial: Partial<ExtractedDocumentData>): ExtractedDocumentData {
  return {
    documentType: 'other',
    hasSignature: false,
    confidence: 0.9,
    fieldsFound: [],
    ...partial,
  }
}

function fp(
  partial: Partial<DocSortFingerprint> & Pick<DocSortFingerprint, 'docId' | 'kind'>
): DocSortFingerprint {
  return {
    fileName: `${partial.docId}.pdf`,
    confidence: 0.9,
    loadNumbers: [],
    ...partial,
  }
}

/** Realistic batch: two multi-page scans split into pages + one standalone pair. */
function buildFixture(): DocSortFingerprint[] {
  const bolAuditBase = {
    destination_match: 'UNKNOWN',
    legibility: 'PASS',
    page_count: 'PASS',
    signatures: {
      carrier: 'PRESENT',
      shipper: 'PRESENT',
      receiver: 'PRESENT',
      receiver_date: 'PRESENT',
    },
    overall: 'APPROVED',
    flags: [],
  } as const

  return [
    // Scan family 14503 — load 2228137, delivers to Salem VA
    fp({
      docId: 'rc-14503',
      kind: 'rate_confirmation',
      fileName: '14503-p1.pdf',
      loadNumbers: ['2228137'],
      extract: extraction({
        documentType: 'rate_confirmation',
        rateConParse: {
          load_number: '2228137',
          destinations: [{ city: 'Salem', state: 'VA' }],
        },
      }),
    }),
    fp({
      docId: 'bol-14503',
      kind: 'bill_of_lading',
      fileName: '14503-p2.pdf',
      extract: extraction({
        documentType: 'bill_of_lading',
        bolAudit: { ...bolAuditBase, ship_to: 'Consignee Inc, Salem, VA 24153' },
      }),
    }),
    fp({ docId: 'inv-14503', kind: 'invoice', fileName: '14503-p3.pdf' }),

    // Scan family 14504 — different load, SAME destination city (family blocker case)
    fp({
      docId: 'rc-14504',
      kind: 'rate_confirmation',
      fileName: '14504-p1.pdf',
      loadNumbers: ['2228138'],
      extract: extraction({
        documentType: 'rate_confirmation',
        rateConParse: {
          load_number: '2228138',
          destinations: [{ city: 'Salem', state: 'VA' }],
        },
      }),
    }),
    fp({
      docId: 'bol-14504',
      kind: 'bill_of_lading',
      fileName: '14504-p2.pdf',
      extract: extraction({
        documentType: 'bill_of_lading',
        bolAudit: { ...bolAuditBase, ship_to: 'Warehouse Co, Salem, VA 24153' },
      }),
    }),

    // Standalone pair tied by a real reference number across different files
    fp({
      docId: 'rc-solo',
      kind: 'rate_confirmation',
      fileName: 'ratecon-91111978568.pdf',
      loadNumbers: ['91111978568'],
      extract: extraction({
        documentType: 'rate_confirmation',
        rateConParse: { load_number: '91111978568' },
      }),
    }),
    fp({
      docId: 'bol-solo',
      kind: 'bill_of_lading',
      fileName: 'scan-0042.pdf',
      extract: extraction({
        documentType: 'bill_of_lading',
        bolAudit: { ...bolAuditBase, reference_numbers: ['91111978568'] },
      }),
    }),

    // Support doc with a load number pointing at the solo pair
    fp({
      docId: 'lumper-solo',
      kind: 'lumper',
      fileName: 'lumper-91111978568.pdf',
      loadNumbers: ['91111978568'],
    }),
  ]
}

type Membership = {
  groups: Array<{ rateCons: string[]; bols: string[]; others: string[] }>
  unmatched: { rateCons: string[]; bols: string[]; other: string[] }
}

function membership(result: {
  groups: Array<{
    rateCons: Array<{ docId: string }>
    bols: Array<{ docId: string }>
    others?: Array<{ docId: string }>
  }>
  unmatched: {
    rateCons: Array<{ docId: string }>
    bols: Array<{ docId: string }>
    other: Array<{ docId: string }>
  }
}): Membership {
  const ids = (list: Array<{ docId: string }>) => list.map((f) => f.docId).sort()
  return {
    groups: result.groups
      .map((g) => ({
        rateCons: ids(g.rateCons),
        bols: ids(g.bols),
        others: ids(g.others ?? []),
      }))
      .sort((a, b) =>
        (a.rateCons[0] ?? a.bols[0] ?? '').localeCompare(b.rateCons[0] ?? b.bols[0] ?? '')
      ),
    unmatched: {
      rateCons: ids(result.unmatched.rateCons),
      bols: ids(result.unmatched.bols),
      other: ids(result.unmatched.other),
    },
  }
}

describe('docSortMatch edge/browser parity', () => {
  it('edge port groups documents exactly like the browser matcher', () => {
    const fixture = buildFixture()

    const browser = membership(invoiceDraftGroupsFromSort(matchSortedDocuments(fixture)))
    const edge = membership(
      edgeInvoiceDraftGroupsFromSort(
        edgeMatchSortedDocuments(fixture as unknown as MatchFingerprint[])
      )
    )

    expect(edge).toEqual(browser)
  })

  it('produces the expected packets for the fixture (sanity of both)', () => {
    const fixture = buildFixture()
    const { groups } = membership(invoiceDraftGroupsFromSort(matchSortedDocuments(fixture)))

    // Three packets: one per scan family + the ref-matched solo pair.
    expect(groups).toHaveLength(3)

    const byRc = new Map(groups.map((g) => [g.rateCons[0], g]))
    expect(byRc.get('rc-14503')?.bols).toEqual(['bol-14503'])
    expect(byRc.get('rc-14503')?.others).toEqual(['inv-14503'])
    expect(byRc.get('rc-14504')?.bols).toEqual(['bol-14504'])
    expect(byRc.get('rc-solo')?.bols).toEqual(['bol-solo'])
    expect(byRc.get('rc-solo')?.others).toEqual(['lumper-solo'])
  })
})
