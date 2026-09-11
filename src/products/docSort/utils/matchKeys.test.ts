import { describe, expect, it } from 'vitest'
import type { DocSortFingerprint } from '../types'
import { clusterFingerprints, documentFamilyKey } from './matchKeys'
import { loadNumberFromFileName } from '../../../utils/extractBatchFields'

function fp(partial: Partial<DocSortFingerprint> & Pick<DocSortFingerprint, 'docId' | 'fileName'>): DocSortFingerprint {
  return {
    kind: 'rate_confirmation',
    confidence: 0.9,
    loadNumbers: [],
    ...partial,
  }
}

describe('documentFamilyKey', () => {
  it('groups scanner page suffixes on the same load', () => {
    expect(documentFamilyKey('15882-2.pdf')).toBe('15882')
    expect(documentFamilyKey('15882-3.pdf')).toBe('15882')
    expect(documentFamilyKey('15882_p4.pdf')).toBe('15882')
    expect(documentFamilyKey('15882-2.jpg')).toBe('15882')
    expect(documentFamilyKey('15882-3.PNG')).toBe('15882')
  })

  it('does not treat invoice date suffixes as page numbers', () => {
    expect(documentFamilyKey('Invoice_001_9-11-2026.pdf')).toBe('')
  })
})

describe('filename load keys', () => {
  it('uses the broker load # not a shared unit code like 0040', () => {
    expect(loadNumberFromFileName('2.27...#0040...TX-MS...544534292.pdf')).toBe('544534292')
    expect(loadNumberFromFileName('3.12..#0040...IL-IL....546681695.pdf')).toBe('546681695')
    expect(loadNumberFromFileName('15882-2.pdf')).toBe('15882')
  })
})

describe('clusterFingerprints', () => {
  it('keeps different CH Robinson loads in separate packets', () => {
    const clusters = clusterFingerprints([
      fp({
        docId: 'a',
        fileName: '2.27...#0040...TX-MS...544534292.pdf',
        loadNumbers: [],
        broker: 'C.H. Robinson',
        deliveryDate: '2026-02-27',
      }),
      fp({
        docId: 'b',
        fileName: '3.12..#0040...IL-IL....546681695.pdf',
        loadNumbers: [],
        broker: 'C.H. Robinson',
        deliveryDate: '2026-03-12',
      }),
    ])
    expect(clusters).toHaveLength(2)
  })

  it('merges pages that share a filename family even when AI load keys differ', () => {
    const clusters = clusterFingerprints([
      fp({ docId: 'a', fileName: '15882.pdf', loadNumbers: ['99001'] }),
      fp({ docId: 'b', fileName: '15882-2.pdf', loadNumbers: [] }),
      fp({ docId: 'c', fileName: '15882-3.pdf', loadNumbers: [], rateAmount: 1100 }),
    ])
    expect(clusters).toHaveLength(1)
    expect(clusters[0].map((item) => item.docId)).toEqual(['a', 'b', 'c'])
  })
})
