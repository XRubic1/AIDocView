import { describe, expect, it } from 'vitest'
import type { DocSortFingerprint } from '../types'
import { matchSortedDocuments } from './docSortMatcher'

function fp(partial: Partial<DocSortFingerprint> & Pick<DocSortFingerprint, 'docId' | 'kind'>): DocSortFingerprint {
  return {
    fileName: `${partial.docId}.pdf`,
    confidence: 0.9,
    loadNumbers: [],
    ...partial,
  }
}

describe('matchSortedDocuments', () => {
  it('keeps split rate-con files with their BOL in one load group', () => {
    const result = matchSortedDocuments([
      fp({
        docId: 'p1',
        kind: 'rate_confirmation',
        fileName: '15882.pdf',
        loadNumbers: ['99001'],
        broker: 'Southwire',
      }),
      fp({
        docId: 'p2',
        kind: 'rate_confirmation',
        fileName: '15882-2.pdf',
        loadNumbers: [],
      }),
      fp({
        docId: 'p3',
        kind: 'rate_confirmation',
        fileName: '15882-3.pdf',
        loadNumbers: [],
        rateAmount: 1100,
      }),
      fp({
        docId: 'bol1',
        kind: 'bill_of_lading',
        fileName: 'bol-99001.pdf',
        loadNumbers: ['99001'],
      }),
    ])

    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].rateCons).toHaveLength(3)
    expect(result.groups[0].bols).toHaveLength(1)
    expect(result.unmatchedRateCons).toHaveLength(0)
  })
})
