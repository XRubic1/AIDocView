import { describe, expect, it } from 'vitest'
import type { Invoice } from '../types/invoice'
import { invoiceAiVerifyUi, isInvoiceReadyToProcess } from './invoiceAiVerificationStatus'

function stub(partial: Partial<Invoice>): Invoice {
  return {
    id: 'inv-1',
    invoice_number: '001',
    client_id: 'c1',
    client_name: 'Carrier',
    broker_id: 'b1',
    broker_name: 'RXO',
    amount: 100,
    invoice_date: '2026-09-14',
    due_date: '2026-10-14',
    expected_payment_date: '2026-10-14',
    status: 'pending',
    created_at: '2026-09-14T00:00:00Z',
    ...partial,
  }
}

describe('invoiceAiVerifyUi', () => {
  it('shows Reviewing before AI has a result', () => {
    expect(invoiceAiVerifyUi(stub({ ai_review_status: 'not_run' })).label).toBe('Reviewing')
    expect(invoiceAiVerifyUi(stub({ ai_review_status: 'running' })).label).toBe('Reviewing')
  })

  it('shows OK when AI is ready or the invoice is approved', () => {
    expect(invoiceAiVerifyUi(stub({ ai_review_status: 'ready' })).label).toBe('OK')
    expect(invoiceAiVerifyUi(stub({ status: 'approved', ai_review_status: 'needs_work' })).label).toBe(
      'OK'
    )
  })

  it('shows Needs review when AI flagged issues and the invoice is not approved', () => {
    const ui = invoiceAiVerifyUi(stub({ ai_review_status: 'needs_work', status: 'pending' }))
    expect(ui.status).toBe('needs_review')
    expect(ui.onHold).toBe(false)
  })

  it('shows Review for the Credyx review status (not Hold)', () => {
    const ui = invoiceAiVerifyUi(stub({ status: 'review', ai_review_status: 'needs_work' }))
    expect(ui.status).toBe('review')
    expect(ui.label).toBe('Review')
    expect(ui.onHold).toBe(false)
  })

  it('keeps hold as the list label', () => {
    const ui = invoiceAiVerifyUi(stub({ status: 'hold', ai_review_status: 'needs_work' }))
    expect(ui.onHold).toBe(true)
    expect(ui.label).toBe('Hold')
  })

  it('treats AI-ready pending invoices as processable', () => {
    expect(isInvoiceReadyToProcess(stub({ ai_review_status: 'ready', status: 'pending' }))).toBe(
      true
    )
    expect(isInvoiceReadyToProcess(stub({ ai_review_status: 'needs_work', status: 'pending' }))).toBe(
      false
    )
    expect(isInvoiceReadyToProcess(stub({ status: 'review', ai_review_status: 'ready' }))).toBe(
      false
    )
    expect(isInvoiceReadyToProcess(stub({ status: 'approved' }))).toBe(true)
    expect(isInvoiceReadyToProcess(stub({ status: 'hold' }))).toBe(true)
  })
})
