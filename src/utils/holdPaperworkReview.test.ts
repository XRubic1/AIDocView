import { describe, expect, it } from 'vitest'
import type { Invoice } from '../types/invoice'
import {
  getDocumentUploadOverviewMessage,
  getHoldPaperworkReview,
  invoiceHasPendingHoldPaperworkReview,
} from './holdPaperworkReview'

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    invoice_number: 'D30-08',
    client_id: 'c1',
    client_name: 'Demo',
    broker_id: 'b1',
    broker_name: 'AGL GROUP',
    amount: 2890,
    invoice_date: '2026-07-12',
    status: 'hold',
    hold_reason: 'Missing lumper',
    created_at: '2026-07-12T00:00:00Z',
    ...overrides,
  }
}

describe('holdPaperworkReview', () => {
  it('treats a hold upload as pending review', () => {
    const inv = invoice({
      notes_history: [
        {
          id: 'n1',
          note: 'Uploaded 1 document: lumper.pdf. Credyx is reviewing and will advise if further action is required.',
          created_by: 'Carrier',
          created_at: '2026-09-10T21:00:00Z',
          type: 'client_note',
        },
      ],
    })
    expect(getHoldPaperworkReview(inv)?.status).toBe('pending')
    expect(invoiceHasPendingHoldPaperworkReview(inv)).toBe(true)
  })

  it('lets accept override the pending upload', () => {
    const inv = invoice({
      status: 'approved',
      notes_history: [
        {
          id: 'n1',
          note: 'Uploaded 1 document: lumper.pdf. Credyx is reviewing and will advise if further action is required.',
          created_by: 'Carrier',
          created_at: '2026-09-10T21:00:00Z',
          type: 'client_note',
        },
        {
          id: 'n2',
          note: 'Documents accepted — packet sent to broker.',
          created_by: 'Credyx',
          created_at: '2026-09-10T22:00:00Z',
          type: 'status_update',
        },
      ],
    })
    expect(getHoldPaperworkReview(inv)?.status).toBe('accepted')
    expect(invoiceHasPendingHoldPaperworkReview(inv)).toBe(false)
  })

  it('lets reject override the pending upload', () => {
    const inv = invoice({
      notes_history: [
        {
          id: 'n1',
          note: 'Uploaded 1 document: lumper.pdf. Credyx is reviewing and will advise if further action is required.',
          created_by: 'Carrier',
          created_at: '2026-09-10T21:00:00Z',
          type: 'client_note',
        },
        {
          id: 'n2',
          note: 'Documents rejected — Broker said the lumper is for a different load.',
          created_by: 'Credyx',
          created_at: '2026-09-10T22:00:00Z',
          type: 'hold_reason',
        },
      ],
    })
    expect(getHoldPaperworkReview(inv)?.status).toBe('rejected')
    expect(getHoldPaperworkReview(inv)?.reason).toMatch(/different load/)
  })

  it('treats a direct (non-hold) upload as pending Credyx review', () => {
    const inv = invoice({
      status: 'approved',
      notes_history: [
        {
          id: 'n1',
          note: 'Uploaded 1 document: pod.pdf. Credyx is reviewing and will advise if further action is required.',
          created_by: 'Carrier',
          created_at: '2026-09-10T21:00:00Z',
          type: 'client_note',
        },
      ],
    })
    expect(invoiceHasPendingHoldPaperworkReview(inv)).toBe(true)
    expect(getDocumentUploadOverviewMessage(inv)).toBe(
      'Credyx is reviewing and will advise if further action is required.'
    )
  })
})
