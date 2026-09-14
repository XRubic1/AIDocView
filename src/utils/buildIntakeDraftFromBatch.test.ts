import { describe, expect, it } from 'vitest'
import type { Invoice } from '../types/invoice'
import { invoiceToCredyxDraft } from './buildIntakeDraftFromBatch'
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
