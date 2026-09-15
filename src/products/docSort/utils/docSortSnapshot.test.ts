import { describe, expect, it } from 'vitest'
import type { DocSortFingerprint, DocSortResult } from '../types'
import { buildDocSortSnapshot, parseFingerprintCatalog } from './docSortSnapshot'

function fp(partial: Partial<DocSortFingerprint> & Pick<DocSortFingerprint, 'docId' | 'kind'>): DocSortFingerprint {
  return {
    fileName: `${partial.docId}.pdf`,
    confidence: 0.9,
    loadNumbers: [],
    ...partial,
  }
}

describe('docSortSnapshot', () => {
  it('round-trips fingerprints so Packets can restore RC/BOL kinds', () => {
    const sort: DocSortResult = {
      sortedAt: '2026-09-14T00:00:00.000Z',
      groups: [
        {
          groupId: 'g1',
          label: '23784158',
          matchReason: 'load',
          matchScore: 1,
          rateCons: [
            fp({
              docId: 'rc1',
              kind: 'rate_confirmation',
              fileName: '07H IN-013580.pdf',
              loadNumbers: ['23784158'],
              broker: 'RXO',
            }),
          ],
          bols: [fp({ docId: 'bol1', kind: 'bill_of_lading', fileName: 'bol.pdf' })],
        },
      ],
      unmatchedRateCons: [],
      unmatchedBols: [],
      otherDocuments: [],
      totalDocuments: 2,
    }

    const catalog = parseFingerprintCatalog(buildDocSortSnapshot(sort))
    expect(catalog.get('rc1')?.kind).toBe('rate_confirmation')
    expect(catalog.get('rc1')?.fileName).toBe('07H IN-013580.pdf')
    expect(catalog.get('bol1')?.kind).toBe('bill_of_lading')
  })

  it('persists per-doc extract JSON for matching and verification', () => {
    const sort: DocSortResult = {
      sortedAt: '2026-09-14T00:00:00.000Z',
      groups: [],
      unmatchedRateCons: [
        fp({
          docId: 'rc1',
          kind: 'rate_confirmation',
          loadNumbers: ['91111978568'],
          broker: 'TQL',
          rateAmount: 390,
          extract: {
            documentType: 'rate_confirmation',
            hasSignature: false,
            confidence: 0.9,
            fieldsFound: ['load_number'],
            loadNumber: '91111978568',
            rate: 390,
            rateConParse: { load_number: '91111978568', rate_total: 390, broker_name: 'TQL' },
          },
        }),
      ],
      unmatchedBols: [],
      otherDocuments: [],
      totalDocuments: 1,
    }
    const catalog = parseFingerprintCatalog(buildDocSortSnapshot(sort))
    expect(catalog.get('rc1')?.extract?.rateConParse?.load_number).toBe('91111978568')
    expect(catalog.get('rc1')?.rateAmount).toBe(390)
  })

  it('returns an empty catalog for legacy snapshots without fingerprints', () => {
    const legacy = JSON.stringify({
      sortedAt: '2026-09-14T00:00:00.000Z',
      totalDocuments: 4,
      groupCount: 4,
    })
    expect(parseFingerprintCatalog(legacy).size).toBe(0)
  })
})
