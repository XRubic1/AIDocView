import { describe, expect, it } from 'vitest'
import type { CredyxInvoiceDraft } from '../types/credyxBatch'
import { invoiceDraftBlocker, isInvoiceDraftReady } from './invoiceDraftReady'

function draft(partial: Partial<CredyxInvoiceDraft> = {}): CredyxInvoiceDraft {
  return {
    draftId: 'd1',
    groupId: 'g1',
    invoice_number: '001',
    load_number: '4873',
    broker_name: 'TQL',
    broker_id: 'b1',
    amount: 1200,
    invoice_date: '2026-09-10',
    rate_missing: false,
    confirmed: false,
    document_doc_ids: [],
    fingerprints: { rateCons: [], bols: [] },
    ...partial,
  }
}

describe('invoiceDraftBlocker', () => {
  it('allows a complete AI draft', () => {
    expect(isInvoiceDraftReady(draft())).toBe(true)
    expect(invoiceDraftBlocker(draft())).toBeNull()
  })

  it('blocks missing rate, load, or broker', () => {
    expect(invoiceDraftBlocker(draft({ amount: 0 }))).toMatch(/Rate/)
    expect(invoiceDraftBlocker(draft({ load_number: '' }))).toMatch(/Load/)
    expect(invoiceDraftBlocker(draft({ broker_id: '', broker_name: '' }))).toMatch(/Broker/)
  })
})
