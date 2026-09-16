import { describe, expect, it } from 'vitest'
import type { CredyxInvoiceDraft } from '../types/credyxBatch'
import type { DocSortFingerprint } from '../products/docSort/types'
import { pruneUnmatchedAgainstAssigned } from './aiDraftDocOps'

function fp(
  partial: Pick<DocSortFingerprint, 'docId' | 'fileName' | 'kind'>
): DocSortFingerprint {
  return {
    confidence: 1,
    loadNumbers: [],
    ...partial,
  }
}

function invoice(
  partial: Partial<CredyxInvoiceDraft> & { draftId: string }
): CredyxInvoiceDraft {
  return {
    groupId: partial.draftId,
    invoice_number: '1',
    load_number: '',
    broker_name: '',
    broker_id: '',
    amount: 0,
    invoice_date: '2026-09-16',
    carrier_name: 'Carrier',
    rate_missing: false,
    confirmed: true,
    document_doc_ids: [],
    fingerprints: { rateCons: [], bols: [], other: [] },
    ...partial,
  }
}

describe('pruneUnmatchedAgainstAssigned', () => {
  it('drops unmatched entries that share an assigned doc id', () => {
    const bolId = '055d4834-0b5e-4a71-9bd2-111111111111'
    const invoices = [
      invoice({
        draftId: 'inv-1',
        fingerprints: {
          rateCons: [],
          bols: [fp({ docId: bolId, fileName: `${bolId}.pdf`, kind: 'bill_of_lading' })],
          other: [],
        },
        document_doc_ids: [bolId],
      }),
    ]
    const unmatched = {
      rateCons: [],
      bols: [],
      other: [fp({ docId: bolId, fileName: bolId, kind: 'other' })],
    }
    const pruned = pruneUnmatchedAgainstAssigned(unmatched, invoices)
    expect(pruned.other).toHaveLength(0)
  })

  it('drops duplicate rate cons that only match by file name', () => {
    const invoices = [
      invoice({
        draftId: 'inv-1',
        fingerprints: {
          rateCons: [
            fp({
              docId: 'assigned-rc-1',
              fileName: 'RateConf_2004538038.pdf',
              kind: 'rate_confirmation',
            }),
          ],
          bols: [],
          other: [],
        },
        document_doc_ids: ['assigned-rc-1'],
      }),
    ]
    const unmatched = {
      rateCons: [
        fp({
          docId: 'copy-rc-1',
          fileName: 'folder/RateConf_2004538038.PDF',
          kind: 'rate_confirmation',
        }),
        fp({
          docId: 'other-rc',
          fileName: 'RateConf_999.pdf',
          kind: 'rate_confirmation',
        }),
      ],
      bols: [],
      other: [],
    }
    const pruned = pruneUnmatchedAgainstAssigned(unmatched, invoices)
    expect(pruned.rateCons.map((r) => r.docId)).toEqual(['other-rc'])
  })

  it('drops unmatched when doc id matches an assigned file basename', () => {
    const uuid = '055d4834-0b5e-4a71-9bd2-222222222222'
    const invoices = [
      invoice({
        draftId: 'inv-1',
        fingerprints: {
          rateCons: [],
          bols: [fp({ docId: 'bol-row', fileName: `${uuid}.png`, kind: 'bill_of_lading' })],
          other: [],
        },
        document_doc_ids: ['bol-row'],
      }),
    ]
    const unmatched = {
      rateCons: [],
      bols: [],
      other: [fp({ docId: uuid, fileName: uuid, kind: 'other' })],
    }
    const pruned = pruneUnmatchedAgainstAssigned(unmatched, invoices)
    expect(pruned.other).toHaveLength(0)
  })
})
