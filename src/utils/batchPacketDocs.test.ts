import { describe, expect, it } from 'vitest'
import { classifyPacketDoc, groupPacketDocuments } from './batchPacketDocs'
import type { CredyxInvoiceDraft } from '../types/credyxBatch'

describe('classifyPacketDoc', () => {
  it('keeps rate cons and BOLs by kind', () => {
    expect(classifyPacketDoc({ kind: 'rate_confirmation' })).toBe('rate_confirmation')
    expect(classifyPacketDoc({ kind: 'bill_of_lading' })).toBe('bol')
  })

  it('spots lumper, scale, and POD from file names', () => {
    expect(classifyPacketDoc({ fileName: 'Lumper-receipt.pdf' })).toBe('lumper')
    expect(classifyPacketDoc({ fileName: 'Scale Ticket 12.pdf' })).toBe('scale')
    expect(classifyPacketDoc({ fileName: 'POD Dallas.pdf' })).toBe('pod')
  })
})

describe('groupPacketDocuments', () => {
  it('puts the generated invoice first, then RC / BOL / other', () => {
    const invoicePdf = new File(['x'], 'Invoice-001.pdf', { type: 'application/pdf' })
    const rc = new File(['x'], 'rc.pdf', { type: 'application/pdf' })
    const inv: CredyxInvoiceDraft = {
      draftId: 'd1',
      groupId: 'g1',
      invoice_number: '001',
      load_number: '35217',
      broker_name: 'DSV',
      broker_id: 'b1',
      amount: 980,
      invoice_date: '2026-09-10',
      rate_missing: false,
      confirmed: true,
      document_doc_ids: ['rc1'],
      invoice_pdf: invoicePdf,
      fingerprints: {
        rateCons: [
          {
            docId: 'rc1',
            fileName: 'rc.pdf',
            kind: 'rate_confirmation',
            confidence: 0.9,
            loadNumbers: ['35217'],
          },
        ],
        bols: [],
        other: [
          {
            docId: 'lump1',
            fileName: 'lumper.pdf',
            kind: 'other',
            confidence: 0.5,
            loadNumbers: ['35217'],
          },
        ],
      },
    }
    const files = new Map<string, File>([
      ['rc1', rc],
      ['lump1', new File(['x'], 'lumper.pdf', { type: 'application/pdf' })],
    ])
    const groups = groupPacketDocuments(inv, files)
    expect(groups.map((g) => g.category)).toEqual(['invoice', 'rate_confirmation', 'lumper'])
    expect(groups[0].docs[0].generated).toBe(true)
  })
})
