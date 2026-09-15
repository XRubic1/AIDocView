import { describe, expect, it } from 'vitest'
import type { ExtractedDocumentData } from '../../../types/documentReview'
import type { DocSortFingerprint } from '../types'
import { scoreBolToRateCon, sharedReferenceNumbers } from './bolRateConMatch'

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

describe('bolRateConMatch', () => {
  it('scores destination matches high enough to assign without a shared load #', () => {
    const rc = fp({
      docId: 'rc',
      kind: 'rate_confirmation',
      extract: extraction({
        documentType: 'rate_confirmation',
        rateConParse: {
          load_number: '91111978568',
          destinations: [{ city: 'Salem', state: 'VA' }],
        },
      }),
    })
    const bol = fp({
      docId: 'bol',
      kind: 'bill_of_lading',
      extract: extraction({
        documentType: 'bill_of_lading',
        bolAudit: {
          destination_match: 'UNKNOWN',
          legibility: 'PASS',
          page_count: 'PASS',
          signatures: { carrier: 'PRESENT', shipper: 'PRESENT', receiver: 'PRESENT', receiver_date: 'PRESENT' },
          ship_to: 'Consignee Inc, Salem, VA 24153',
          overall: 'APPROVED',
          flags: [],
        },
      }),
    })
    const { score, reason } = scoreBolToRateCon(bol, rc)
    expect(score).toBeGreaterThanOrEqual(70)
    expect(reason).toMatch(/destination/i)
  })

  it('matches RC BOL/PO refs to BOL reference numbers', () => {
    const rc = fp({
      docId: 'rc',
      kind: 'rate_confirmation',
      extract: extraction({
        documentType: 'rate_confirmation',
        rateConParse: {
          load_number: 'T01633053',
          bol_reference_numbers: ['88221901'],
        },
      }),
    })
    const bol = fp({
      docId: 'bol',
      kind: 'bill_of_lading',
      extract: extraction({
        documentType: 'bill_of_lading',
        bolAudit: {
          destination_match: 'UNKNOWN',
          legibility: 'PASS',
          page_count: 'PASS',
          signatures: { carrier: 'PRESENT', shipper: 'PRESENT', receiver: 'PRESENT', receiver_date: 'PRESENT' },
          reference_numbers: ['88221901'],
          overall: 'APPROVED',
          flags: [],
        },
      }),
    })
    expect(sharedReferenceNumbers(rc, bol)).toEqual(['88221901'])
    expect(scoreBolToRateCon(bol, rc).score).toBeGreaterThanOrEqual(90)
  })
})
