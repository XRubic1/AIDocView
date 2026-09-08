import { describe, expect, it } from 'vitest'
import {
  collectTermsPaymentSignals,
  daysPastTerms,
  evaluateRiskFromSignals,
  isCarrierVisibleReviewStatus,
  resolveInvoiceTermsDueDate,
  classifyDelayCauses,
  extractInvoiceNotesForRisk,
  buildBrokerIssueVerdict,
  localDateIso,
  BROKER_RISK_POLICY,
} from './brokerRiskPolicy'
import {
  carrierVisibleRiskLevel,
  reviewStatusForComputedLevel,
} from './computeBrokerRiskProfile'
import { preferBrokerRiskProfile } from '../data/brokerRiskStore'
import type { BrokerRiskProfile } from '../types/brokerRisk'
import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'

function inv(partial: Partial<Invoice> & Pick<Invoice, 'id' | 'invoice_date'>): Invoice {
  return {
    invoice_number: '1',
    client_id: 'c1',
    client_name: 'Carrier',
    broker_id: 'b1',
    broker_name: 'Broker Co',
    amount: 1000,
    status: 'approved',
    load_number: 'L1',
    created_at: '2026-01-01T00:00:00Z',
    due_date: '',
    expected_payment_date: '',
    ...partial,
  } as Invoice
}

function pay(
  partial: Partial<Payment> & Pick<Payment, 'id' | 'invoice_id' | 'received_date'>
): Payment {
  return {
    client_id: 'c1',
    broker_name: 'Broker Co',
    amount: 1000,
    status: 'confirmed',
    ...partial,
  } as Payment
}

describe('brokerRiskPolicy terms-aware', () => {
  it('treats Net 45 paying on day 45 as on time', () => {
    const invoice = inv({
      id: 'i1',
      invoice_date: '2026-01-01',
      due_date: '',
      expected_payment_date: '',
    })
    const due = resolveInvoiceTermsDueDate(invoice, 45)
    expect(due).toBe('2026-02-15')
    expect(daysPastTerms(invoice, '2026-02-15', 45)).toBe(0)
    expect(daysPastTerms(invoice, '2026-02-20', 45)).toBe(5)
  })

  it('does not flag Net 45 on-time history as medium/high', () => {
    const invoices = [
      inv({ id: 'i1', invoice_date: '2026-01-01', status: 'paid' }),
      inv({ id: 'i2', invoice_date: '2026-02-01', status: 'paid' }),
    ]
    const payments = [
      pay({ id: 'p1', invoice_id: 'i1', received_date: '2026-02-15' }),
      pay({ id: 'p2', invoice_id: 'i2', received_date: '2026-03-18' }),
    ]
    const signals = collectTermsPaymentSignals({
      invoices,
      payments,
      paymentTermsDays: 45,
      asOf: new Date('2026-04-01'),
    })
    expect(signals.late_payment_count).toBe(0)
    const evaluation = evaluateRiskFromSignals({
      hasWorked: true,
      signals,
      noteFlagCount: 0,
    })
    expect(evaluation.computed_level).toBe('low')
    expect(evaluation.pay_rating).toBe('green')
  })

  it('flags Net 30 with two late payments as medium', () => {
    const invoices = [
      inv({ id: 'i1', invoice_date: '2026-01-01', status: 'paid' }),
      inv({ id: 'i2', invoice_date: '2026-02-01', status: 'paid' }),
    ]
    const payments = [
      pay({ id: 'p1', invoice_id: 'i1', received_date: '2026-02-20' }), // 20d past Net 30
      pay({ id: 'p2', invoice_id: 'i2', received_date: '2026-03-20' }), // ~17d past
    ]
    const signals = collectTermsPaymentSignals({
      invoices,
      payments,
      paymentTermsDays: 30,
      asOf: new Date('2026-04-01'),
    })
    expect(signals.late_payment_count).toBe(2)
    const evaluation = evaluateRiskFromSignals({
      hasWorked: true,
      signals,
      noteFlagCount: 0,
    })
    expect(evaluation.computed_level).toBe('medium')
  })

  it('Needs review at 15d past due; urgent High at 21d (not day-1 after due)', () => {
    const openInv = inv({
      id: 'i1',
      invoice_date: '2026-03-01',
      status: 'approved',
      due_date: '2026-03-31',
      expected_payment_date: '2026-03-31',
    })

    // 5 days past due — still within grace, not for review
    const day5 = collectTermsPaymentSignals({
      invoices: [openInv],
      payments: [],
      paymentTermsDays: 30,
      asOf: new Date(2026, 3, 5), // Apr 5 local
    })
    expect(day5.open_overdue_past_terms).toBe(0)
    expect(
      evaluateRiskFromSignals({ hasWorked: true, signals: day5, noteFlagCount: 0 })
        .computed_level
    ).toBe('low')

    // 15 days past due — Needs review (Medium)
    const day15 = collectTermsPaymentSignals({
      invoices: [openInv],
      payments: [],
      paymentTermsDays: 30,
      asOf: new Date(2026, 3, 15),
    })
    expect(day15.open_overdue_past_terms).toBe(1)
    expect(day15.max_days_past_terms).toBe(15)
    expect(day15.open_urgent_past_terms).toBe(0)
    expect(
      evaluateRiskFromSignals({ hasWorked: true, signals: day15, noteFlagCount: 0 })
        .computed_level
    ).toBe('medium')

    // 21 days past due — Urgent review (High)
    const day21 = collectTermsPaymentSignals({
      invoices: [openInv],
      payments: [],
      paymentTermsDays: 30,
      asOf: new Date(2026, 3, 21),
    })
    expect(day21.open_urgent_past_terms).toBe(1)
    expect(day21.max_days_past_terms).toBe(21)
    expect(
      evaluateRiskFromSignals({ hasWorked: true, signals: day21, noteFlagCount: 0 })
        .computed_level
    ).toBe('high')
  })

  it('does not treat open invoices as overdue until collections grace (15d)', () => {
    const invoices = [
      inv({
        id: 'i1',
        invoice_date: '2026-03-01',
        status: 'approved',
        due_date: '2026-03-31',
        expected_payment_date: '2026-03-31',
      }),
    ]
    // 5 days past due — still within Credyx collections grace
    const early = collectTermsPaymentSignals({
      invoices,
      payments: [],
      paymentTermsDays: 30,
      asOf: new Date('2026-04-05'),
    })
    expect(early.open_overdue_past_terms).toBe(0)

    // 16 days past due — collections overdue / Needs review
    const late = collectTermsPaymentSignals({
      invoices,
      payments: [],
      paymentTermsDays: 30,
      asOf: new Date('2026-04-16'),
    })
    expect(late.open_overdue_past_terms).toBe(1)

    const evaluation = evaluateRiskFromSignals({
      hasWorked: true,
      signals: early,
      noteFlagCount: 0,
    })
    expect(evaluation.computed_level).toBe('low')

    expect(
      evaluateRiskFromSignals({ hasWorked: true, signals: late, noteFlagCount: 0 })
        .computed_level
    ).toBe('medium')
  })

  it('ignores remittance lag under the 15-day review gate', () => {
    const invoices = [
      inv({ id: 'i1', invoice_date: '2026-01-01', status: 'paid' }),
      inv({ id: 'i2', invoice_date: '2026-02-01', status: 'paid' }),
    ]
    const payments = [
      pay({ id: 'p1', invoice_id: 'i1', received_date: '2026-02-01' }), // 1d past Net 30
      pay({ id: 'p2', invoice_id: 'i2', received_date: '2026-03-10' }), // ~7d past
    ]
    const signals = collectTermsPaymentSignals({
      invoices,
      payments,
      paymentTermsDays: 30,
      asOf: new Date('2026-04-01'),
    })
    expect(signals.late_payment_count).toBe(0)
    expect(
      evaluateRiskFromSignals({ hasWorked: true, signals, noteFlagCount: 0 }).computed_level
    ).toBe('low')
  })

  it('ignores pending invoices when counting open overdue', () => {
    const invoices = [
      inv({
        id: 'i1',
        invoice_date: '2026-01-01',
        status: 'pending',
        due_date: '2026-01-31',
        expected_payment_date: '2026-01-31',
      }),
    ]
    const signals = collectTermsPaymentSignals({
      invoices,
      payments: [],
      paymentTermsDays: 30,
      asOf: new Date('2026-04-01'),
    })
    expect(signals.open_overdue_past_terms).toBe(0)
  })

  it('excludes hold and dispute invoices from overdue and avg pay', () => {
    const holdInv = inv({
      id: 'h1',
      invoice_date: '2026-01-01',
      status: 'hold',
      hold_reason: 'Cargo claim',
      due_date: '2026-01-31',
      expected_payment_date: '2026-01-31',
    })
    const disputeInv = inv({
      id: 'd1',
      invoice_date: '2026-01-01',
      status: 'approved',
      due_date: '2026-01-31',
      expected_payment_date: '2026-01-31',
      disputes: [
        {
          id: 'ds1',
          reason: 'claim',
          description: 'Cargo claim',
          status: 'open',
          created_by: 'carrier',
          created_at: '2026-02-01T00:00:00Z',
        },
      ],
    })
    const cleanInv = inv({
      id: 'c1',
      invoice_date: '2026-03-01',
      status: 'paid',
      due_date: '2026-03-31',
    })
    const signals = collectTermsPaymentSignals({
      invoices: [holdInv, disputeInv, cleanInv],
      payments: [pay({ id: 'p1', invoice_id: 'c1', received_date: '2026-03-20' })],
      paymentTermsDays: 30,
      asOf: new Date(2026, 3, 21),
    })
    expect(signals.hold_count).toBe(1)
    expect(signals.open_dispute_count).toBe(1)
    expect(signals.paused_open_count).toBe(2)
    expect(signals.open_overdue_past_terms).toBe(0)
    expect(signals.open_urgent_past_terms).toBe(0)
    expect(signals.avg_days_invoice_to_pay).toBe(19)
    expect(
      evaluateRiskFromSignals({ hasWorked: true, signals, noteFlagCount: 0 }).computed_level
    ).toBe('low')
  })

  it('notes alone cannot set high without payment signals', () => {
    const signals = collectTermsPaymentSignals({
      invoices: [inv({ id: 'i1', invoice_date: '2026-01-01', status: 'paid' })],
      payments: [pay({ id: 'p1', invoice_id: 'i1', received_date: '2026-01-25' })],
      paymentTermsDays: 30,
      asOf: new Date('2026-02-01'),
    })
    const evaluation = evaluateRiskFromSignals({
      hasWorked: true,
      signals,
      noteFlagCount: 3,
    })
    expect(evaluation.computed_level).not.toBe('high')
    expect(evaluation.computed_level).toBe('medium')
  })

  it('classifies PPW notes separately from broker slow pay', () => {
    const ppw = classifyDelayCauses(
      [{ text: 'Waiting on missing POD / incomplete PPW packet' }],
      null
    )
    expect(ppw.primary).toBe('ppw_docs')
    expect(ppw.ppw_count).toBeGreaterThan(0)

    const slow = classifyDelayCauses(
      [{ text: 'Broker not paying — remittance late again' }],
      null
    )
    expect(slow.primary).toBe('broker_slow_pay')
  })

  it('ignores routine lifecycle notes so happy-path PPW is not Mixed', () => {
    const invoiceNotes = extractInvoiceNotesForRisk([
      {
        invoice_number: '2406',
        notes_history: [
          { note: 'Submitted packet for load LD-91070. Docs look complete on our end.' },
          { note: 'Paperwork verified. Invoice approved for broker submission.' },
          {
            note: 'PPW sent to AGL GROUP AP (ap@aglgroup.example) — invoice, BOL, POD, rate con.',
          },
          {
            note: 'Action needed: Confirm payment receipt in Payments, or dispute if funds were not received.',
          },
          { note: 'Payment receipt dispute: Funds not received — a. Funds on hold.' },
          { note: 'Hold: Payment receipt dispute — funds on hold until Credyx resolves' },
        ],
      },
      {
        invoice_number: '2410',
        notes_history: [
          { note: 'Submitted packet for load LD-91114. Docs look complete on our end.' },
          { note: 'Paperwork verified. Invoice approved for broker submission.' },
          {
            note: 'PPW sent to AGL GROUP AP (ap@aglgroup.example) — invoice, BOL, POD, rate con.',
          },
          {
            note:
              'Short payment correction posted: chargeback of $350.00 against the original remittance. Net received now $2,850.00 of $3,200.00.',
          },
        ],
      },
    ])

    // Lifecycle / confirm prompts must not appear.
    expect(invoiceNotes.every((n) => !/^Submitted packet/i.test(n.text))).toBe(true)
    expect(invoiceNotes.every((n) => !/^PPW sent to/i.test(n.text))).toBe(true)

    const causes = classifyDelayCauses([], null, invoiceNotes)
    expect(causes.primary).toBe('dispute')
    expect(causes.ppw_count).toBe(0)
    expect(causes.snippets.every((s) => s.cause !== 'ppw_docs')).toBe(true)
  })

  it('reads Will Pay + missing BOL from invoice notes as PPW (not unclear)', () => {
    const invoiceNotes = extractInvoiceNotesForRisk([
      {
        invoice_number: '1042',
        collection_status: 'W/P',
        collection_date: '2026-08-19',
        notes_history: [
          {
            note: 'Status: Will Pay · 08/19/2026 — This will be paid, delay due to missing BOL',
          },
        ],
      },
    ])
    expect(invoiceNotes.length).toBeGreaterThan(0)

    const causes = classifyDelayCauses([], null, invoiceNotes)
    expect(causes.primary).toBe('ppw_docs')
    expect(causes.snippets.some((s) => s.source === 'invoice_note')).toBe(true)
    expect(causes.snippets.some((s) => /BOL/i.test(s.text))).toBe(true)
  })

  it('builds a readable verdict for reviewers', () => {
    const causes = classifyDelayCauses(
      [{ text: 'Broker not paying — remittance late again' }],
      null
    )
    const verdict = buildBrokerIssueVerdict({
      computedLevel: 'medium',
      delayCauses: causes,
      latePaymentCount: 1,
      openPastTerms: 0,
    })
    expect(verdict.code).toBe('broker_issue')
    expect(verdict.title.toLowerCase()).toContain('broker')
  })

  it('does not bump low→medium for PPW-only notes', () => {
    const signals = collectTermsPaymentSignals({
      invoices: [inv({ id: 'i1', invoice_date: '2026-01-01', status: 'paid' })],
      payments: [pay({ id: 'p1', invoice_id: 'i1', received_date: '2026-01-25' })],
      paymentTermsDays: 30,
      asOf: new Date('2026-02-01'),
    })
    const causes = classifyDelayCauses([{ text: 'PPW hold — missing BOL' }], null)
    const evaluation = evaluateRiskFromSignals({
      hasWorked: true,
      signals,
      noteFlagCount: 1,
      delayCauses: causes,
    })
    expect(evaluation.computed_level).toBe('low')
    expect(evaluation.suggest_clear_as_ppw).toBe(true)
  })
  it('flags NEW / thin payment history as elevated risk', () => {
    const signals = collectTermsPaymentSignals({
      invoices: [],
      payments: [],
      paymentTermsDays: 30,
      asOf: new Date('2026-08-01'),
    })
    const markedNew = evaluateRiskFromSignals({
      hasWorked: false,
      signals,
      noteFlagCount: 0,
      isNewBroker: true,
    })
    expect(markedNew.computed_level).toBe('high')
    expect(markedNew.reasons.some((r) => /NEW/i.test(r))).toBe(true)

    const noHistory = evaluateRiskFromSignals({
      hasWorked: false,
      signals,
      noteFlagCount: 0,
    })
    expect(noHistory.computed_level).toBe('medium')
    expect(noHistory.reasons.some((r) => /No confirmed payments/i.test(r))).toBe(true)

    const relaxed = evaluateRiskFromSignals({
      hasWorked: false,
      signals,
      noteFlagCount: 0,
      isNewBroker: true,
      policy: {
        ...BROKER_RISK_POLICY,
        new_broker_no_history_level: 'low',
      },
    })
    expect(relaxed.computed_level).toBe('low')
  })
})

describe('review gate', () => {
  it('maps every computed level to pending_review until Credyx confirms', () => {
    expect(reviewStatusForComputedLevel('low')).toBe('pending_review')
    expect(reviewStatusForComputedLevel('unrated')).toBe('pending_review')
    expect(reviewStatusForComputedLevel('medium')).toBe('pending_review')
    expect(reviewStatusForComputedLevel('high')).toBe('pending_review')
  })

  it('prefers published/cleared over pending when collapsing duplicates', () => {
    const pending = {
      id: 'a',
      broker_id: 'b1',
      review_status: 'pending_review',
      computed_risk_level: 'high',
      mc_number: '481558',
      analyzed_at: '2026-08-10T10:00:00Z',
    } as BrokerRiskProfile
    const published = {
      id: 'b',
      broker_id: 'b2',
      review_status: 'published',
      computed_risk_level: 'medium',
      mc_number: null,
      analyzed_at: '2026-08-09T10:00:00Z',
    } as BrokerRiskProfile
    expect(preferBrokerRiskProfile(pending, published).id).toBe('b')
    expect(preferBrokerRiskProfile(published, pending).id).toBe('b')

    const olderPublished = {
      id: 'pub',
      broker_id: 'b1',
      review_status: 'published',
      risk_level: 'medium',
      computed_risk_level: 'medium',
      reviewed_at: '2026-08-08T10:00:00Z',
      analyzed_at: '2026-08-08T10:00:00Z',
    } as BrokerRiskProfile
    const newerCleared = {
      id: 'clr',
      broker_id: 'b1',
      review_status: 'cleared',
      risk_level: 'low',
      computed_risk_level: 'medium',
      reviewed_at: '2026-08-10T10:00:00Z',
      analyzed_at: '2026-08-09T10:00:00Z',
    } as BrokerRiskProfile
    expect(preferBrokerRiskProfile(olderPublished, newerCleared).id).toBe('clr')
    expect(preferBrokerRiskProfile(newerCleared, olderPublished).id).toBe('clr')
  })

  it('uses local calendar date (not UTC) for as-of', () => {
    const d = new Date(2026, 7, 10, 23, 30, 0) // Aug 10 local evening
    expect(localDateIso(d)).toBe('2026-08-10')
  })

  it('shows flagged Medium/High to carriers while pending review', () => {
    const pending = {
      review_status: 'pending_review',
      risk_level: 'unrated',
      computed_risk_level: 'high',
    } as BrokerRiskProfile
    expect(carrierVisibleRiskLevel(pending)).toBe('high')
    expect(isCarrierVisibleReviewStatus('pending_review')).toBe(false)

    const pendingMed = {
      review_status: 'pending_review',
      risk_level: 'unrated',
      computed_risk_level: 'medium',
    } as BrokerRiskProfile
    expect(carrierVisibleRiskLevel(pendingMed)).toBe('medium')

    const published = {
      ...pending,
      review_status: 'published',
      risk_level: 'high',
    } as BrokerRiskProfile
    expect(carrierVisibleRiskLevel(published)).toBe('high')
    expect(isCarrierVisibleReviewStatus('published')).toBe(true)

    const cleared = {
      ...pending,
      review_status: 'cleared',
      risk_level: 'low',
    } as BrokerRiskProfile
    expect(carrierVisibleRiskLevel(cleared)).toBe('low')
  })

  it('preserves Credyx publish/clear across re-analysis', async () => {
    const { applyPreservedCredyxReview } = await import('../services/brokerRiskService')
    const priorPublished = {
      review_status: 'published',
      risk_level: 'high',
      computed_risk_level: 'high',
      review_note: 'Published after review',
      reviewed_at: '2026-08-09T12:00:00Z',
      reviewed_by: 'Ops',
    } as BrokerRiskProfile
    const recomputed = {
      review_status: 'pending_review',
      risk_level: 'unrated',
      computed_risk_level: 'medium',
      review_note: null,
      reviewed_at: null,
      reviewed_by: null,
    } as BrokerRiskProfile

    const kept = applyPreservedCredyxReview(priorPublished, recomputed)
    expect(kept.review_status).toBe('published')
    expect(kept.risk_level).toBe('high')
    expect(kept.review_note).toBe('Published after review')

    const priorCleared = {
      ...priorPublished,
      review_status: 'cleared',
      risk_level: 'low',
    } as BrokerRiskProfile
    const cleared = applyPreservedCredyxReview(priorCleared, {
      ...recomputed,
      computed_risk_level: 'high',
    })
    expect(cleared.review_status).toBe('cleared')
    expect(cleared.risk_level).toBe('low')
  })
})
