import { describe, expect, it } from 'vitest'
import type { DocSortFingerprint } from '../types'
import {
  fingerprintNeedsDocSplitter,
  listCombinedFingerprintIds,
} from '../services/docSortUnpack'
import { refinePageClassifications } from '../../../utils/refinePageClassifications'
import type { PageClassification } from '../../../types/documentReview'

function page(
  pageNumber: number,
  pageType: PageClassification['pageType']
): PageClassification {
  return {
    pageNumber,
    pageType,
    confidence: 0.9,
    isLegible: true,
    skipped: false,
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

describe('fingerprintNeedsDocSplitter', () => {
  it('does not flag multi-page rate con with other/terms pages', () => {
    const doc = fp({
      docId: 'rc1',
      kind: 'rate_confirmation',
      fileName: 'RateConf_2004538038.pdf',
      extract: {
        documentType: 'rate_confirmation',
        pageClassifications: [
          page(1, 'rate_confirmation'),
          page(2, 'rate_confirmation'),
          page(3, 'other'),
        ],
      },
    })
    expect(fingerprintNeedsDocSplitter(doc)).toBe(false)
  })

  it('does not flag rate con with legacy page-1 invoice rewrite and no BOL', () => {
    const doc = fp({
      docId: 'rc1',
      kind: 'rate_confirmation',
      fileName: 'RateConf_2004536646.pdf',
      extract: {
        documentType: 'rate_confirmation',
        pageClassifications: [
          page(1, 'invoice'),
          page(2, 'rate_confirmation'),
          page(3, 'rate_confirmation'),
        ],
      },
    })
    expect(fingerprintNeedsDocSplitter(doc)).toBe(false)
  })

  it('flags true combined RC + BOL in one PDF', () => {
    const doc = fp({
      docId: 'combo',
      kind: 'other',
      fileName: 'packet.pdf',
      extract: {
        documentType: 'other',
        pageClassifications: [
          page(1, 'rate_confirmation'),
          page(2, 'bill_of_lading'),
        ],
      },
    })
    expect(fingerprintNeedsDocSplitter(doc)).toBe(true)
  })

  it('flags RC + invoice when fingerprint is not a rate_confirmation kind', () => {
    const doc = fp({
      docId: 'combo',
      kind: 'other',
      fileName: 'scan.pdf',
      extract: {
        documentType: 'other',
        pageClassifications: [page(1, 'invoice'), page(2, 'rate_confirmation')],
      },
    })
    expect(fingerprintNeedsDocSplitter(doc)).toBe(true)
  })

  it('listCombinedFingerprintIds skips standalone rate cons', () => {
    const ids = listCombinedFingerprintIds([
      fp({
        docId: 'rc1',
        kind: 'rate_confirmation',
        fileName: 'RateConf_1.pdf',
        extract: {
          documentType: 'rate_confirmation',
          pageClassifications: [page(1, 'invoice'), page(2, 'rate_confirmation')],
        },
      }),
      fp({
        docId: 'combo',
        kind: 'other',
        fileName: 'mixed.pdf',
        extract: {
          documentType: 'other',
          pageClassifications: [page(1, 'rate_confirmation'), page(2, 'bill_of_lading')],
        },
      }),
    ])
    expect(ids).toEqual(['combo'])
  })
})

describe('refinePageClassifications carrier order', () => {
  it('does not rewrite page 1 to invoice on multi-page rate con without BOL', () => {
    const refined = refinePageClassifications([
      page(1, 'rate_confirmation'),
      page(2, 'rate_confirmation'),
      page(3, 'rate_confirmation'),
    ])
    expect(refined[0].pageType).toBe('rate_confirmation')
  })

  it('classifies an invoice after the first page as a lumper', () => {
    const refined = refinePageClassifications([
      page(1, 'invoice'),
      page(2, 'rate_confirmation'),
      page(6, 'invoice'),
    ])
    expect(refined.find((row) => row.pageNumber === 1)?.pageType).toBe('invoice')
    expect(refined.find((row) => row.pageNumber === 6)?.pageType).toBe('lumper')
  })

  it('still rewrites page 1 to invoice when BOL follows in the same file', () => {
    const refined = refinePageClassifications([
      page(1, 'rate_confirmation'),
      page(2, 'rate_confirmation'),
      page(3, 'bill_of_lading'),
    ])
    expect(refined[0].pageType).toBe('invoice')
  })
})
