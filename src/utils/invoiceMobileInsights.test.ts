import { describe, expect, it } from 'vitest'
import {
  getInvoiceMobileInsights,
  getMobileInvoiceStatusLabel,
} from './invoiceMobileInsights'
import { enrichInvoice } from './invoiceAging'
import type { Invoice } from '../types/invoice'
import { getInvoiceNotice, getInvoiceStatusBadge } from '../components/client/invoiceDetailShared'
import { getInvoiceLifecycleSteps, getInvoiceLifecycleStatusLabel } from './invoiceLifecycleSteps'

function baseInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-2403',
    invoice_number: '2403',
    client_id: 'c1',
    client_name: 'Demo Carrier',
    broker_id: 'b1',
    broker_name: 'New Age Logistics',
    amount: 3400,
    invoice_date: '2026-07-12',
    due_date: '2026-07-23',
    expected_payment_date: '2026-07-23',
    status: 'approved',
    created_at: '2026-07-12T00:00:00Z',
    ...overrides,
  }
}

describe('getInvoiceMobileInsights — short paid', () => {
  it('does not show Short paid on unpaid open invoices', () => {
    const invoice = baseInvoice()
    const insights = getInvoiceMobileInsights({
      invoice,
      enriched: enrichInvoice(invoice),
      shortfallAmount: 3400,
    })
    expect(insights.some((i) => i.id === 'short-paid')).toBe(false)
  })

  it('shows Short paid when a real partial remittance left a gap', () => {
    const invoice = baseInvoice()
    const insights = getInvoiceMobileInsights({
      invoice,
      enriched: enrichInvoice(invoice),
      shortfallAmount: 450,
      shortPayReason: 'Broker remitted less than face',
    })
    const row = insights.find((i) => i.id === 'short-paid')
    expect(row).toBeTruthy()
    expect(row?.title).toMatch(/\$450/)
  })

  it('does not duplicate Short paid when awaiting receipt already covers it', () => {
    const invoice = baseInvoice()
    const insights = getInvoiceMobileInsights({
      invoice,
      enriched: enrichInvoice(invoice),
      hasAwaitingReceipt: true,
      shortfallAmount: 450,
      receiptDaysLeft: 3,
    })
    expect(insights.some((i) => i.id === 'short-paid')).toBe(false)
    expect(insights.some((i) => i.id === 'awaiting-receipt')).toBe(true)
  })

  it('shows a clickable high-risk broker row', () => {
    const invoice = baseInvoice()
    const insights = getInvoiceMobileInsights({
      invoice,
      enriched: enrichInvoice(invoice),
      brokerRiskLevel: 'high',
    })
    const row = insights.find((i) => i.id === 'broker-risk')
    expect(row?.title).toBe('High risk broker')
    expect(row?.action).toBe('broker_risk')
    expect(row?.subtitle).toMatch(/Brokers tab/)
  })

  it('hides broker risk row for low / unrated brokers', () => {
    const invoice = baseInvoice()
    expect(
      getInvoiceMobileInsights({
        invoice,
        enriched: enrichInvoice(invoice),
        brokerRiskLevel: 'low',
      }).some((i) => i.id === 'broker-risk')
    ).toBe(false)
  })

  it('shows Overpayment when remittance exceeds face amount', () => {
    const invoice = baseInvoice()
    const insights = getInvoiceMobileInsights({
      invoice,
      enriched: enrichInvoice(invoice),
      overageAmount: 200,
    })
    const row = insights.find((i) => i.id === 'overpaid')
    expect(row).toBeTruthy()
    expect(row?.title).toMatch(/Overpayment/)
    expect(row?.title).toMatch(/\$200/)
    expect(row?.icon).toBe('over_pay')
    expect(row?.tone).toBe('success')
    expect(row?.subtitle).toMatch(/more than the invoice total/i)
  })

  it('shows Short paid confirm card for awaiting short correction with note', () => {
    const invoice = baseInvoice({ status: 'paid', paid_amount: 1650 })
    const insights = getInvoiceMobileInsights({
      invoice,
      enriched: enrichInvoice(invoice),
      hasAwaitingReceipt: true,
      awaitingShortAmount: 100,
      shortPayReason: 'Short payment — chargeback $100.00',
      receiptDaysLeft: 30,
      payDate: '2026-07-28',
    })
    const row = insights.find((i) => i.id === 'short-paid-awaiting')
    expect(row).toBeTruthy()
    expect(row?.title).toBe('Short paid · $100.00')
    expect(row?.subtitle).toMatch(/chargeback/i)
    expect(row?.subtitle).toMatch(/30 days until auto-confirm/)
    expect(row?.icon).toBe('short_pay')
    expect(row?.action).toBe('confirm_payment')
    expect(insights.some((i) => i.id === 'awaiting-receipt')).toBe(false)
  })
})

describe('force closed invoice messaging', () => {
  it('surfaces Force closed status, insight, notice, and stepper label', () => {
    const invoice = baseInvoice({ status: 'force_closed' })
    const enriched = enrichInvoice(invoice)

    expect(getMobileInvoiceStatusLabel(enriched, invoice)).toBe('FORCE CLOSED')

    const insights = getInvoiceMobileInsights({ invoice, enriched })
    const row = insights.find((i) => i.id === 'force-closed')
    expect(row?.title).toMatch(/force closed/i)
    expect(row?.subtitle).toMatch(/broker did not remit/i)

    const notice = getInvoiceNotice(invoice, enriched, 0, false)
    expect(notice?.type).toBe('force_closed')
    expect(notice?.message).toMatch(/force closed/i)

    const steps = getInvoiceLifecycleSteps(invoice)
    expect(steps.find((s) => s.id === 'paid')?.label).toBe('Force closed')

    // Badge text for list/detail pills
    const badge = getInvoiceStatusBadge('force_closed')
    expect(badge.props.children).toBe('Force closed')
  })
})

describe('hold invoice lifecycle', () => {
  it('keeps Invoiced as the current stage when PPW was already sent', () => {
    const invoice = baseInvoice({
      status: 'hold',
      hold_reason: 'Missing lumper',
      approved_at: '2026-07-13T00:00:00Z',
      document_send_history: [
        {
          email_address: 'broker@example.com',
          sent_at: '2026-07-14T00:00:00Z',
          sent_by: 'Credyx',
          status: 'sent',
        },
      ],
    })
    expect(getInvoiceLifecycleStatusLabel(invoice)).toBe('Invoiced')
    const steps = getInvoiceLifecycleSteps(invoice)
    expect(steps.find((s) => s.id === 'verified')?.state).toBe('done')
    expect(steps.find((s) => s.id === 'invoiced')?.state).toBe('hold')
  })

  it('stays on Verified when held before PPW is sent', () => {
    const invoice = baseInvoice({
      status: 'hold',
      hold_reason: 'Missing POD',
    })
    expect(getInvoiceLifecycleStatusLabel(invoice)).toBe('Verified')
    const steps = getInvoiceLifecycleSteps(invoice)
    expect(steps.find((s) => s.id === 'verified')?.state).toBe('hold')
    expect(steps.find((s) => s.id === 'invoiced')?.state).toBe('upcoming')
  })
})
