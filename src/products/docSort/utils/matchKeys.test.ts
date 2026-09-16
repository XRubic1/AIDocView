import { describe, expect, it } from 'vitest'
import type { DocSortFingerprint } from '../types'
import {
  clusterFingerprints,
  documentFamilyKey,
  primaryLoadLabel,
} from './matchKeys'
import { loadNumberFromFileName } from '../../../utils/extractBatchFields'
import { invoiceFieldsFromLoadGroup } from './formatRate'

function fp(
  partial: Partial<DocSortFingerprint> & Pick<DocSortFingerprint, 'docId' | 'fileName'>
): DocSortFingerprint {
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

describe('primaryLoadLabel', () => {
  it('prefers rate-con load # over a longer BOL PRO / reference number', () => {
    const rc = fp({
      docId: 'rc',
      fileName: 'RateConf_2004515639.pdf',
      loadNumbers: ['2004515639', '50000000016900593'],
      extract: {
        documentType: 'rate_confirmation',
        rateConParse: {
          load_number: '2004515639',
          bol_reference_numbers: ['50000000016900593'],
        },
      },
    })
    expect(primaryLoadLabel(rc)).toBe('2004515639')
  })
})

describe('invoiceFieldsFromLoadGroup', () => {
  it('prefills packet load from the rate con, not a sibling BOL PRO', () => {
    const group = {
      groupId: 'g1',
      label: '50000000016900593',
      rateCons: [
        fp({
          docId: 'rc',
          fileName: 'RateConf_2004515639.pdf',
          loadNumbers: ['2004515639', '50000000016900593'],
          broker: 'Werner Logistics',
          rateAmount: 2312.67,
          extract: {
            documentType: 'rate_confirmation',
            rateConParse: {
              load_number: '2004515639',
              bol_reference_numbers: ['50000000016900593'],
            },
          },
        }),
      ],
      bols: [
        fp({
          docId: 'bol',
          fileName: 'bol.jpg',
          kind: 'bill_of_lading' as const,
          loadNumbers: ['50000000016900593'],
          extract: {
            documentType: 'bill_of_lading' as const,
            bolAudit: {
              load_number: '2004515639',
              reference_numbers: ['50000000016900593'],
              signatures: {
                receiver: 'PRESENT' as const,
                driver: 'PRESENT' as const,
                shipper: 'PRESENT' as const,
              },
            },
          },
        }),
      ],
      matchScore: 90,
      matchReason: 'test',
    }
    expect(invoiceFieldsFromLoadGroup(group).loadNumber).toBe('2004515639')
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
