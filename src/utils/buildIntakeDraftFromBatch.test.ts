import { describe, expect, it } from 'vitest'
import type { Invoice } from '../types/invoice'
import type { DocSortFingerprint } from '../products/docSort/types'
import {
  invoiceToCredyxDraft,
  omitExplodedParentFingerprints,
  partitionUnmatchedByKind,
} from './buildIntakeDraftFromBatch'
import type { PersistedDocFingerprint } from '../products/docSort/utils/docSortSnapshot'

function stubInvoice(partial: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    invoice_number: '001',
    client_id: 'c1',
    client_name: 'Admin User',
    broker_id: 'b1',
    broker_name: 'RXO',
    amount: 3300,
    invoice_date: '2026-09-14',
    due_date: '2026-10-14',
    expected_payment_date: '2026-10-14',
    status: 'pending',
    load_number: '23784158',
    created_at: '2026-09-14T00:00:00Z',
    document_doc_ids: ['doc-a'],
    ...partial,
  }
}

describe('invoiceToCredyxDraft', () => {
  it('restores RC/BOL kinds from the snapshot catalog even when the file name is generic', () => {
    const catalog = new Map<string, PersistedDocFingerprint>([
      [
        'doc-a',
        {
          docId: 'doc-a',
          fileName: '07H IN-013580.pdf',
          kind: 'rate_confirmation',
          loadNumbers: ['23784158'],
          broker: 'RXO',
        },
      ],
    ])
    const fileNameById = new Map([['doc-a', '07H IN-013580.pdf']])
    const draft = invoiceToCredyxDraft(stubInvoice(), new Map(), [], fileNameById, catalog)
    expect(draft.fingerprints.rateCons).toHaveLength(1)
    expect(draft.fingerprints.bols).toHaveLength(0)
    expect(draft.fingerprints.other).toEqual([])
    expect(draft.fingerprints.rateCons[0].fileName).toBe('07H IN-013580.pdf')
  })

  it('does not treat a stub fileName equal to the docId as the display name when catalog has one', () => {
    const catalog = new Map<string, PersistedDocFingerprint>([
      [
        'doc-a',
        {
          docId: 'doc-a',
          fileName: 'rate-con.pdf',
          kind: 'bill_of_lading',
          loadNumbers: [],
        },
      ],
    ])
    const draft = invoiceToCredyxDraft(stubInvoice(), new Map(), [], new Map(), catalog)
    expect(draft.fingerprints.bols[0].fileName).toBe('rate-con.pdf')
  })

  it('promotes unlabeled docs to RC/BOL when no snapshot catalog exists', () => {
    const inv = stubInvoice({ document_doc_ids: ['a', 'b', 'c'] })
    const names = new Map([
      ['a', '07H IN-013580.pdf'],
      ['b', '07H IN-013580-7.pdf'],
      ['c', 'lumper.pdf'],
    ])
    const draft = invoiceToCredyxDraft(inv, new Map(), [], names, new Map())
    expect(draft.fingerprints.rateCons[0].docId).toBe('a')
    expect(draft.fingerprints.bols[0].docId).toBe('b')
    expect(draft.fingerprints.other?.map((fp) => fp.docId)).toEqual(['c'])
  })
})

describe('partitionUnmatchedByKind', () => {
  const fp = (
    docId: string,
    kind: DocSortFingerprint['kind'],
    fileName = `${docId}.pdf`
  ): DocSortFingerprint => ({
    docId,
    fileName,
    kind,
    confidence: 1,
    loadNumbers: [],
  })

  it('keeps Doc Split RC/BOL/INV marks when there are zero packets', () => {
    const partitioned = partitionUnmatchedByKind([
      fp('p2', 'rate_confirmation', '10023-p2.pdf'),
      fp('p3', 'rate_confirmation', '10023-p3.pdf'),
      fp('p5', 'bill_of_lading', '10023-p5.pdf'),
      fp('p1', 'invoice', '10023-p1.pdf'),
      fp('parent', 'invoice', 'handoff-parent'),
    ])
    expect(partitioned.rateCons.map((d) => d.docId)).toEqual(['p2', 'p3'])
    expect(partitioned.bols.map((d) => d.docId)).toEqual(['p5'])
    expect(partitioned.other.map((d) => d.docId)).toEqual(['p1', 'parent'])
    expect(partitioned.other.every((d) => d.kind === 'invoice')).toBe(true)
  })
})

describe('omitExplodedParentFingerprints', () => {
  const fp = (
    docId: string,
    kind: DocSortFingerprint['kind'],
    fileName: string
  ): DocSortFingerprint => ({
    docId,
    fileName,
    kind,
    confidence: 1,
    loadNumbers: [],
  })

  it('drops combined parents when page-split children are present', () => {
    const kept = omitExplodedParentFingerprints([
      fp('handoff-0', 'invoice', '10023.pdf'),
      fp('p1', 'invoice', '10023-p1.pdf'),
      fp('p2', 'rate_confirmation', '10023-p2.pdf'),
    ])
    expect(kept.map((d) => d.docId)).toEqual(['p1', 'p2'])
  })

  it('drops handoff stubs when the live File name matches page-split children', () => {
    const fileById = new Map<string, File>([
      ['handoff-0', new File([new Uint8Array([1])], '10023.pdf', { type: 'application/pdf' })],
    ])
    const kept = omitExplodedParentFingerprints(
      [
        fp('handoff-0', 'invoice', 'handoff-0'),
        fp('p2', 'rate_confirmation', '10023-p2.pdf'),
      ],
      fileById
    )
    expect(kept.map((d) => d.docId)).toEqual(['p2'])
  })
})
