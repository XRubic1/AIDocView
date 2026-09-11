import { describe, expect, it } from 'vitest'
import type { DocSortFingerprint, DocSortResult } from '../types'
import { invoiceDraftGroupsFromSort } from './invoiceDraftGroups'
import { invoiceFieldsFromLoadGroup } from './formatRate'

function fp(partial: Partial<DocSortFingerprint> & Pick<DocSortFingerprint, 'docId' | 'kind'>): DocSortFingerprint {
  return {
    fileName: `${partial.docId}.pdf`,
    confidence: 0.9,
    loadNumbers: [],
    ...partial,
  }
}

describe('invoiceDraftGroupsFromSort', () => {
  it('drafts an invoice from an unmatched rate con (no BOL required)', () => {
    const sort: DocSortResult = {
      sortedAt: '2026-09-10T00:00:00.000Z',
      groups: [],
      unmatchedRateCons: [
        fp({
          docId: 'rc1',
          kind: 'rate_confirmation',
          loadNumbers: ['4873729787'],
          broker: 'TQL',
          rateAmount: 4300,
        }),
      ],
      unmatchedBols: [],
      otherDocuments: [],
      totalDocuments: 1,
    }

    const { groups, unmatched } = invoiceDraftGroupsFromSort(sort)
    expect(groups).toHaveLength(1)
    expect(invoiceFieldsFromLoadGroup(groups[0])).toEqual({
      loadNumber: '4873729787',
      brokerName: 'TQL',
      carrierName: 'Carrier',
      rateAmount: 4300,
    })
    expect(unmatched.rateCons).toHaveLength(0)
  })

  it('attaches an other-doc rate to a matched load group', () => {
    const rc = fp({
      docId: 'rc1',
      kind: 'rate_confirmation',
      loadNumbers: ['111111'],
      broker: 'Landstar',
    })
    const bol = fp({
      docId: 'bol1',
      kind: 'bill_of_lading',
      loadNumbers: ['111111'],
    })
    const invoicePdf = fp({
      docId: 'inv1',
      kind: 'other',
      loadNumbers: ['111111'],
      rateAmount: 2100,
    })
    const sort: DocSortResult = {
      sortedAt: '2026-09-10T00:00:00.000Z',
      groups: [
        {
          groupId: 'load-111111',
          label: '111111',
          rateCons: [rc],
          bols: [bol],
          matchReason: 'load # 111111',
          matchScore: 50,
        },
      ],
      unmatchedRateCons: [],
      unmatchedBols: [],
      otherDocuments: [invoicePdf],
      totalDocuments: 3,
    }

    const { groups, unmatched } = invoiceDraftGroupsFromSort(sort)
    expect(groups).toHaveLength(1)
    expect(invoiceFieldsFromLoadGroup(groups[0]).rateAmount).toBe(2100)
    expect(invoiceFieldsFromLoadGroup(groups[0]).brokerName).toBe('Landstar')
    expect(unmatched.other).toHaveLength(0)
  })

  it('drafts from an other document that already has load and rate', () => {
    const sort: DocSortResult = {
      sortedAt: '2026-09-10T00:00:00.000Z',
      groups: [],
      unmatchedRateCons: [],
      unmatchedBols: [],
      otherDocuments: [
        fp({
          docId: 'scan1',
          kind: 'other',
          loadNumbers: ['999999'],
          broker: 'CH Robinson',
          rateAmount: 1500,
        }),
      ],
      totalDocuments: 1,
    }

    const { groups } = invoiceDraftGroupsFromSort(sort)
    expect(groups).toHaveLength(1)
    expect(invoiceFieldsFromLoadGroup(groups[0])).toMatchObject({
      loadNumber: '999999',
      brokerName: 'CH Robinson',
      rateAmount: 1500,
    })
  })

  it('keeps split rate-con pages as one invoice instead of empty extras', () => {
    const page1 = fp({
      docId: 'p1',
      kind: 'rate_confirmation',
      fileName: '15882.pdf',
      loadNumbers: ['99001'],
      broker: 'Southwire Co',
    })
    const page2 = fp({
      docId: 'p2',
      kind: 'rate_confirmation',
      fileName: '15882-2.pdf',
      loadNumbers: [],
    })
    const page3 = fp({
      docId: 'p3',
      kind: 'rate_confirmation',
      fileName: '15882-3.pdf',
      loadNumbers: [],
      rateAmount: 1100,
    })
    const page4 = fp({
      docId: 'p4',
      kind: 'other',
      fileName: '15882-4.pdf',
      loadNumbers: [],
    })
    const sort: DocSortResult = {
      sortedAt: '2026-09-10T00:00:00.000Z',
      groups: [],
      unmatchedRateCons: [page1, page2, page3],
      unmatchedBols: [],
      otherDocuments: [page4],
      totalDocuments: 4,
    }

    const { groups, unmatched } = invoiceDraftGroupsFromSort(sort)
    expect(groups).toHaveLength(1)
    expect(groups[0].rateCons).toHaveLength(3)
    expect(groups[0].others).toHaveLength(1)
    expect(invoiceFieldsFromLoadGroup(groups[0])).toMatchObject({
      brokerName: 'Southwire Co',
      rateAmount: 1100,
    })
    expect(unmatched.other).toHaveLength(0)
  })
})
