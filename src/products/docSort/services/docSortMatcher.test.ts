import { describe, expect, it } from 'vitest'
import type { DocSortFingerprint } from '../types'
import type { ExtractedDocumentData } from '../../../types/documentReview'
import { matchSortedDocuments } from './docSortMatcher'

function extraction(partial: Partial<ExtractedDocumentData>): ExtractedDocumentData {
  return {
    documentType: 'other',
    hasSignature: false,
    confidence: 0.9,
    fieldsFound: [],
    ...partial,
  }
}

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

  it('assigns a BOL to the rate con when destinations match and load numbers do not', () => {
    const result = matchSortedDocuments([
      fp({
        docId: 'rc1',
        kind: 'rate_confirmation',
        loadNumbers: ['91111978568'],
        extract: extraction({
          documentType: 'rate_confirmation',
          rateConParse: {
            load_number: '91111978568',
            origin: { city: 'Vandalia', state: 'OH' },
            destinations: [{ city: 'Salem', state: 'VA' }],
          },
        }),
      }),
      fp({
        docId: 'bol1',
        kind: 'bill_of_lading',
        loadNumbers: [],
        extract: extraction({
          documentType: 'bill_of_lading',
          bolAudit: {
            destination_match: 'UNKNOWN',
            legibility: 'PASS',
            page_count: 'PASS',
            signatures: { carrier: 'PRESENT', shipper: 'PRESENT', receiver: 'PRESENT', receiver_date: 'PRESENT' },
            ship_from: 'Vandalia, OH 45377',
            ship_to: 'Salem, VA 24153',
            reference_numbers: [],
            overall: 'APPROVED',
            flags: [],
          },
        }),
      }),
    ])

    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].bols.map((item) => item.docId)).toEqual(['bol1'])
    expect(result.unmatchedBols).toHaveLength(0)
    expect(result.groups[0].matchReason).toMatch(/destination/i)
  })

  it('assigns a BOL when an RC reference number appears on the bill', () => {
    const result = matchSortedDocuments([
      fp({
        docId: 'rc1',
        kind: 'rate_confirmation',
        loadNumbers: ['T01633053'],
        extract: extraction({
          documentType: 'rate_confirmation',
          rateConParse: {
            load_number: 'T01633053',
            bol_reference_numbers: ['BOL-88221', 'PO 44910'],
            destinations: [{ city: 'Dallas', state: 'TX' }],
          },
        }),
      }),
      fp({
        docId: 'bol1',
        kind: 'bill_of_lading',
        loadNumbers: [],
        extract: extraction({
          documentType: 'bill_of_lading',
          bolAudit: {
            destination_match: 'UNKNOWN',
            legibility: 'PASS',
            page_count: 'PASS',
            signatures: { carrier: 'PRESENT', shipper: 'PRESENT', receiver: 'PRESENT', receiver_date: 'PRESENT' },
            ship_to: 'Houston, TX',
            reference_numbers: ['BOL-88221'],
            overall: 'APPROVED',
            flags: [],
          },
        }),
      }),
    ])

    expect(result.groups[0].bols).toHaveLength(1)
    expect(result.groups[0].matchReason).toMatch(/ref/i)
  })

  it('matches a multi-stop rate con to the BOL for the second destination', () => {
    const result = matchSortedDocuments([
      fp({
        docId: 'rc1',
        kind: 'rate_confirmation',
        loadNumbers: ['555001'],
        extract: extraction({
          documentType: 'rate_confirmation',
          rateConParse: {
            load_number: '555001',
            destinations: [
              { city: 'Chicago', state: 'IL', stop_number: 1 },
              { city: 'Indianapolis', state: 'IN', stop_number: 2 },
            ],
          },
        }),
      }),
      fp({
        docId: 'bol1',
        kind: 'bill_of_lading',
        loadNumbers: [],
        extract: extraction({
          documentType: 'bill_of_lading',
          bolAudit: {
            destination_match: 'UNKNOWN',
            legibility: 'PASS',
            page_count: 'PASS',
            signatures: { carrier: 'PRESENT', shipper: 'PRESENT', receiver: 'PRESENT', receiver_date: 'PRESENT' },
            ship_to: 'Indianapolis, IN 46204',
            reference_numbers: [],
            overall: 'APPROVED',
            flags: [],
          },
        }),
      }),
    ])

    expect(result.groups[0].bols.map((item) => item.docId)).toEqual(['bol1'])
  })

  it('leaves a BOL unmatched when two rate cons share the same destination and no refs', () => {
    const rc = (id: string, load: string) =>
      fp({
        docId: id,
        kind: 'rate_confirmation',
        loadNumbers: [load],
        extract: extraction({
          documentType: 'rate_confirmation',
          rateConParse: {
            load_number: load,
            destinations: [{ city: 'Dallas', state: 'TX' }],
          },
        }),
      })
    const result = matchSortedDocuments([
      rc('rc1', '111111'),
      rc('rc2', '222222'),
      fp({
        docId: 'bol1',
        kind: 'bill_of_lading',
        loadNumbers: [],
        extract: extraction({
          documentType: 'bill_of_lading',
          bolAudit: {
            destination_match: 'UNKNOWN',
            legibility: 'PASS',
            page_count: 'PASS',
            signatures: { carrier: 'PRESENT', shipper: 'PRESENT', receiver: 'PRESENT', receiver_date: 'PRESENT' },
            ship_to: 'Dallas, TX',
            reference_numbers: [],
            overall: 'APPROVED',
            flags: [],
          },
        }),
      }),
    ])

    expect(result.unmatchedBols.map((item) => item.docId)).toEqual(['bol1'])
    expect(result.groups).toHaveLength(0)
  })
})
