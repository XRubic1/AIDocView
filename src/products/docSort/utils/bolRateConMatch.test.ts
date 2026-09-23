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

  it('blocks destination-only match when pages come from different source scans', () => {
    // BOL page split from 14504.pdf must not attach to the RC split from 14503.pdf
    // just because both loads deliver to the same city.
    const rc = fp({
      docId: 'rc',
      kind: 'rate_confirmation',
      fileName: '14503-p3.pdf',
      extract: extraction({
        documentType: 'rate_confirmation',
        rateConParse: {
          load_number: '2228137',
          destinations: [{ city: 'Salem', state: 'VA' }],
        },
      }),
    })
    const bol = fp({
      docId: 'bol',
      kind: 'bill_of_lading',
      fileName: '14504-p2.pdf',
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
    expect(score).toBe(0)
    expect(reason).toMatch(/different source documents/i)
  })

  it('still matches across scans when a real reference number ties them', () => {
    const rc = fp({
      docId: 'rc',
      kind: 'rate_confirmation',
      fileName: '14503-p3.pdf',
      extract: extraction({
        documentType: 'rate_confirmation',
        rateConParse: { load_number: '2228137' },
      }),
    })
    const bol = fp({
      docId: 'bol',
      kind: 'bill_of_lading',
      fileName: '14504-p2.pdf',
      extract: extraction({
        documentType: 'bill_of_lading',
        bolAudit: {
          destination_match: 'UNKNOWN',
          legibility: 'PASS',
          page_count: 'PASS',
          signatures: { carrier: 'PRESENT', shipper: 'PRESENT', receiver: 'PRESENT', receiver_date: 'PRESENT' },
          reference_numbers: ['2228137'],
          overall: 'APPROVED',
          flags: [],
        },
      }),
    })
    expect(scoreBolToRateCon(bol, rc).score).toBeGreaterThanOrEqual(90)
  })

  it('pages of the same scanned document match strongly even without refs', () => {
    const rc = fp({
      docId: 'rc',
      kind: 'rate_confirmation',
      fileName: '14503-p3.pdf',
    })
    const bol = fp({
      docId: 'bol',
      kind: 'bill_of_lading',
      fileName: '14503-p2.pdf',
    })
    const { score, reason } = scoreBolToRateCon(bol, rc)
    expect(score).toBeGreaterThanOrEqual(90)
    expect(reason).toMatch(/same scanned document/i)
  })
})
