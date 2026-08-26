import type { BrokerDelayCause, BrokerRiskLevel } from '../types/brokerRisk'
import type { BrokerPayRating } from '../types/clientBroker'
import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import { isOpenArInvoice } from './invoiceAging'

/** Default Credyx broker-risk policy template (rules-v2.5). */
export const DEFAULT_BROKER_RISK_POLICY = {
  /** Lookback window for late paid invoices (days). */
  lookback_days: 365,
  /** Medium: at least this many review-threshold late payments. */
  medium_late_count: 2,
  /**
   * Medium / Needs review: one payment or open invoice this many days past Net terms.
   * Example: Net 30 → review starts at day 45 (15 past due), not on the due date.
   */
  medium_single_late_days: 15,
  /** High / Urgent: at least this many review-threshold late payments. */
  high_late_count: 3,
  /**
   * High / Urgent review: one payment or open invoice this many days past Net terms (3 weeks).
   * Example: Net 30 → urgent at day 51 (21 past due).
   */
  high_single_late_days: 21,
  /**
   * High: this many open invoices already past the urgent (21d) threshold.
   * (15d opens alone stay Medium until day 21.)
   */
  high_open_overdue_count: 1,
  /** Medium: at least this many open invoices past the review (15d) threshold. */
  medium_open_overdue_count: 1,
  /**
   * Paid remittance counts toward late_payment_count only after this many days
   * past Net terms — same gate as Needs review (not day-1 after due).
   */
  late_payment_min_days: 15,
  /**
   * Open invoice enters overdue counts only after this many days past due —
   * Needs review gate (aligned with Credyx collections grace).
   */
  open_overdue_min_days: 15,
  /** Default Net days when broker has no payment_terms_days. */
  fallback_terms_days: 30,
  /**
   * Fewer confirmed payments than this with the carrier → insufficient history risk.
   */
  min_paid_sample_for_confidence: 2,
  /**
   * Need at least this many confirmed pays before Net vs avg payment timing is shown.
   */
  min_paid_sample_for_payment_timing: 10,
  /**
   * Problem-signal keywords only (not bare PPW/BOL/POD — those appear on happy-path notes).
   */
  note_keyword_re:
    /delay|slow.?pay|late|short.?pay|dispute|chargeback|missing|incomplete|won't pay|will not pay|not paying|funds on hold|will\s*pay|\bw\/p\b/i,
}

export type BrokerRiskPolicy = typeof DEFAULT_BROKER_RISK_POLICY

/** Runtime singleton — admin Settings persist into this. */
export const BROKER_RISK_POLICY: BrokerRiskPolicy = {
  ...DEFAULT_BROKER_RISK_POLICY,
  note_keyword_re: DEFAULT_BROKER_RISK_POLICY.note_keyword_re,
}

/** Why payment timing looks late — from notes / internal comments. */
export type { BrokerDelayCause } from '../types/brokerRisk'

export type DelayCauseSnippet = {
  cause: Exclude<BrokerDelayCause, 'mixed' | 'none'>
  text: string
  source: 'carrier_note' | 'admin_note' | 'invoice_note'
  invoice_number?: string
}

export type DelayCauseAnalysis = {
  primary: BrokerDelayCause
  broker_pay_count: number
  ppw_count: number
  dispute_count: number
  snippets: DelayCauseSnippet[]
  /** One-line hint for Credyx reviewers. */
  summary: string
}

/** Plain-language verdict for the Broker Risk review panel. */
export type BrokerIssueVerdict = {
  code: 'broker_issue' | 'docs_issue' | 'dispute' | 'timing_only' | 'mixed' | 'no_issue'
  /** Short headline: is this a broker problem? */
  title: string
  /** One sentence of guidance. */
  detail: string
  /** Suggested Credyx action. */
  action: string
}

/** Broker not paying / slow remittance language. */
const BROKER_PAY_RE =
  /slow.?pay|not paying|won't pay|will not pay|non.?payment|past due|overdue|waiting on (?:broker|payment|check|ach|wire)|no remittance|remit(?:tance)? (?:late|missing)|short.?pay|cut (?:the )?rate|broker delay|funds (?:not|never) received/i

/**
 * Real PPW / paperwork *problems* — not normal "PPW sent" lifecycle notes.
 */
const PPW_DOCS_RE =
  /missing\s+(?:(?:the|a|an)\s+)?(?:pod|bol|rate.?con|invoice|doc|ppw|paperwork|packet)|incomplete\s+(?:ppw|packet|paperwork|docs?)|(?:ppw|packet|paperwork|docs?)\s+(?:missing|rejected|hold|incomplete|issue|problem)|doc(?:ument)?s?\s+(?:missing|rejected|hold)|need(?:s|ed)?\s+(?:revised|corrected|new|missing)\s+(?:invoice|pod|bol|docs?)|wrong\s+(?:invoice|amount|load|pod|bol)|docs?\s+hold|verification\s+hold|delay due to missing|awaiting\s+(?:pod|bol|ppw|paperwork|docs)|waiting on\s+(?:pod|bol|ppw|docs|paperwork)|upload the missing|lumpers?/i

/** Dispute / claim language (skip generic "or dispute if…" prompts via routine filter). */
const DISPUTE_RE =
  /(?:payment receipt )?dispute|funds on hold|claim|chargeback|deduct(?:ion)?|offset|contention|short payment correction/i

/** Credyx Will Pay / promised remittance — usually not pure broker risk. */
const WILL_PAY_RE = /will\s*pay|w\/p|this will be paid|promised\s+pay/i

/**
 * Happy-path Credyx lifecycle notes — ignore for delay-cause / risk keywords.
 * These mention PPW/BOL/POD but do not explain a late payment.
 */
export function isRoutineLifecycleNote(text: string): boolean {
  const t = text.trim()
  if (!t) return true
  return (
    /^submitted packet\b/i.test(t) ||
    /^paperwork verified\b/i.test(t) ||
    /^ppw sent to\b/i.test(t) ||
    /^ppw resent to\b/i.test(t) ||
    /^ppw send to .+ failed/i.test(t) ||
    /^document sent\b/i.test(t) ||
    /^sent to broker\b/i.test(t) ||
    /docs look complete on our end/i.test(t) ||
    /^invoice approved for broker submission/i.test(t) ||
    /^action needed:\s*confirm (?:payment|the payment)/i.test(t) ||
    /^action needed:\s*confirm payment receipt/i.test(t)
  )
}

/** Normalize broker display names for dedupe (AGL GROUP == agl group). */
export function normalizeBrokerNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Pick one catalog broker when duplicates share a name.
 * Prefers invoice.broker_id frequency, then MC number, then stable id.
 */
export function pickCanonicalBroker<
  T extends { id: string; name: string; mc_number?: string | null },
>(brokers: T[], invoiceBrokerIds: string[]): T | null {
  if (brokers.length === 0) return null
  if (brokers.length === 1) return brokers[0]
  const counts = new Map<string, number>()
  for (const id of invoiceBrokerIds) {
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return [...brokers].sort((a, b) => {
    const ca = counts.get(a.id) ?? 0
    const cb = counts.get(b.id) ?? 0
    if (cb !== ca) return cb - ca
    const ma = a.mc_number ? 1 : 0
    const mb = b.mc_number ? 1 : 0
    if (mb !== ma) return mb - ma
    return a.id.localeCompare(b.id)
  })[0]
}

/**
 * Pull note text from invoices (status notes, history, hold reasons)
 * for delay-cause analysis — skips routine lifecycle notes.
 */
export function extractInvoiceNotesForRisk(
  invoices: Array<{
    invoice_number?: string
    notes?: string
    hold_reason?: string
    collection_status?: string
    collection_date?: string
    notes_history?: Array<{ note?: string }>
  }>
): Array<{ text: string; invoice_number?: string }> {
  const out: Array<{ text: string; invoice_number?: string }> = []
  const push = (text: string, invoice_number?: string) => {
    const t = text.trim()
    if (!t || isRoutineLifecycleNote(t)) return
    out.push({ text: t, invoice_number })
  }
  for (const inv of invoices) {
    const num = inv.invoice_number
    for (const n of inv.notes_history ?? []) {
      if (n.note) push(n.note, num)
    }
    if (inv.notes) push(inv.notes, num)
    if (inv.hold_reason?.trim()) {
      push(`Hold: ${inv.hold_reason.trim()}`, num)
    }
    if (inv.collection_status === 'W/P') {
      const when = inv.collection_date ? ` · ${inv.collection_date.slice(0, 10)}` : ''
      push(`Status: Will Pay${when}`, num)
    }
  }
  return out
}

/**
 * Read notes to explain *why* timing looks late —
 * broker slow pay vs PPW/docs vs dispute (includes invoice status notes).
 */
export function classifyDelayCauses(
  notes: Array<{ text: string }>,
  adminNotes?: string | null,
  invoiceNotes?: Array<{ text: string; invoice_number?: string }>
): DelayCauseAnalysis {
  const snippets: DelayCauseSnippet[] = []
  let broker_pay_count = 0
  let ppw_count = 0
  let dispute_count = 0

  const push = (
    text: string,
    source: DelayCauseSnippet['source'],
    invoice_number?: string
  ) => {
    const t = text.trim()
    if (!t || isRoutineLifecycleNote(t)) return
    const isPpw = PPW_DOCS_RE.test(t)
    const isWillPay = WILL_PAY_RE.test(t)
    // "delay due to missing BOL" → PPW, not broker slow pay
    const isPay =
      !isPpw &&
      !isWillPay &&
      (BROKER_PAY_RE.test(t) ||
        (/(?:\blate\b|\bdelay\b|\bslow\b)/i.test(t) &&
          !/delay due to missing/i.test(t)))
    const isDispute = DISPUTE_RE.test(t)
    if (isPpw) {
      ppw_count += 1
      snippets.push({ cause: 'ppw_docs', text: t.slice(0, 180), source, invoice_number })
    }
    if (isPay) {
      broker_pay_count += 1
      snippets.push({ cause: 'broker_slow_pay', text: t.slice(0, 180), source, invoice_number })
    }
    if (isDispute) {
      dispute_count += 1
      snippets.push({ cause: 'dispute', text: t.slice(0, 180), source, invoice_number })
    }
    // Bare Will Pay (no docs problem language) → soft PPW/docs-adjacent, not broker risk.
    if (isWillPay && !isPpw && !isPay && !isDispute) {
      ppw_count += 1
      snippets.push({
        cause: 'ppw_docs',
        text: t.slice(0, 180),
        source,
        invoice_number,
      })
    }
  }

  for (const n of notes) push(n.text, 'carrier_note')
  if (adminNotes?.trim()) push(adminNotes, 'admin_note')
  for (const n of invoiceNotes ?? []) push(n.text, 'invoice_note', n.invoice_number)

  let primary: BrokerDelayCause = 'none'
  if (broker_pay_count === 0 && ppw_count === 0 && dispute_count === 0) {
    primary = 'none'
  } else if (ppw_count > 0 && broker_pay_count === 0 && dispute_count === 0) {
    primary = 'ppw_docs'
  } else if (broker_pay_count > 0 && ppw_count === 0 && dispute_count === 0) {
    primary = 'broker_slow_pay'
  } else if (dispute_count > 0 && broker_pay_count === 0 && ppw_count === 0) {
    primary = 'dispute'
  } else if (ppw_count > 0 && (broker_pay_count > 0 || dispute_count > 0)) {
    primary = 'mixed'
  } else if (broker_pay_count > 0 && dispute_count > 0) {
    // Short-pay / chargeback + dispute language → treat as dispute (reviewer-facing).
    primary = dispute_count >= broker_pay_count ? 'dispute' : 'broker_slow_pay'
  } else {
    primary =
      dispute_count > 0 ? 'dispute' : broker_pay_count > 0 ? 'broker_slow_pay' : 'ppw_docs'
  }

  const summary =
    primary === 'none'
      ? 'No problem notes explaining the delay yet'
      : primary === 'ppw_docs'
        ? 'Notes point to PPW / paperwork issues — usually not broker slow pay'
        : primary === 'broker_slow_pay'
          ? 'Notes point to broker payment delays'
          : primary === 'dispute'
            ? 'Notes mention disputes, short-pays, or funds on hold'
            : 'Notes mix docs issues with payment/dispute signals — review carefully'

  // Prefer distinct problem lines (drop near-duplicates).
  const unique: DelayCauseSnippet[] = []
  const seen = new Set<string>()
  for (const s of snippets) {
    const key = `${s.cause}|${s.invoice_number ?? ''}|${s.text.slice(0, 80).toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(s)
    if (unique.length >= 6) break
  }

  return {
    primary,
    broker_pay_count,
    ppw_count,
    dispute_count,
    snippets: unique,
    summary,
  }
}

export function delayCauseLabel(cause: BrokerDelayCause): string {
  if (cause === 'ppw_docs') return 'PPW / docs'
  if (cause === 'broker_slow_pay') return 'Broker slow pay'
  if (cause === 'dispute') return 'Dispute / short pay'
  if (cause === 'mixed') return 'Mixed causes'
  return 'Unclear'
}

/**
 * Plain-language answer: is this actually a broker problem?
 */
export function buildBrokerIssueVerdict(args: {
  computedLevel: BrokerRiskLevel
  delayCauses: DelayCauseAnalysis
  latePaymentCount: number
  openPastTerms: number
  suggestClearAsPpw?: boolean
}): BrokerIssueVerdict {
  const { computedLevel, delayCauses, latePaymentCount, openPastTerms } = args
  const paymentElevated =
    computedLevel === 'medium' ||
    computedLevel === 'high' ||
    latePaymentCount > 0 ||
    openPastTerms > 0

  if (args.suggestClearAsPpw || delayCauses.primary === 'ppw_docs') {
    return {
      code: 'docs_issue',
      title: 'Likely a docs / PPW issue — not broker risk',
      detail: delayCauses.summary,
      action: 'Suggested: Clear — PPW / docs issue',
    }
  }

  if (delayCauses.primary === 'dispute') {
    return {
      code: 'dispute',
      title: 'Dispute or short-pay — review before rating',
      detail: delayCauses.summary,
      action: paymentElevated
        ? 'Confirm whether the broker caused it, then Rate or Clear'
        : 'Resolve the dispute; publish only if the broker is the problem',
    }
  }

  if (delayCauses.primary === 'broker_slow_pay') {
    return {
      code: 'broker_issue',
      title: 'Likely a broker payment issue',
      detail: delayCauses.summary,
      action:
        computedLevel === 'high'
          ? 'Suggested: Rate High — broker slow'
          : 'Suggested: Rate Medium — broker slow',
    }
  }

  if (delayCauses.primary === 'mixed') {
    return {
      code: 'mixed',
      title: 'Mixed signals — check problem notes',
      detail: delayCauses.summary,
      action: 'Read the problem notes below, then Rate or Clear',
    }
  }

  if (paymentElevated) {
    return {
      code: 'timing_only',
      title: 'Past Net terms — no clear note why',
      detail:
        'Payment timing is elevated vs this broker’s Net terms, but notes do not clearly blame the broker or docs.',
      action: 'Check invoices / collections, then Rate if broker-caused or Clear if not',
    }
  }

  return {
    code: 'no_issue',
    title: 'No elevated broker risk signal',
    detail: 'Timing looks within terms and notes do not show a broker payment problem.',
    action: 'No publish needed',
  }
}

export type BrokerTermsPaymentSignals = {
  payment_terms_days: number
  late_payment_count: number
  max_days_past_terms: number | null
  avg_days_past_terms: number | null
  /** Open invoices currently past the Needs-review gate (15d+). */
  open_overdue_past_terms: number
  open_overdue_amount: number
  /** Open invoices past the Urgent gate (21d+). */
  open_urgent_past_terms: number
  paid_sample_size: number
  /** Average calendar days from invoice date to payment (informational). */
  avg_days_invoice_to_pay: number | null
}

export type BrokerRiskEvaluation = {
  computed_level: BrokerRiskLevel
  pay_rating: BrokerPayRating
  note_flag_count: number
  signals: BrokerTermsPaymentSignals
  reasons: string[]
  delay_causes?: DelayCauseAnalysis
  /** Notes say PPW/docs — Credyx may clear instead of publishing broker risk. */
  suggest_clear_as_ppw?: boolean
}

/** YYYY-MM-DD in the user's local timezone (avoids UTC day-shift near midnight). */
export function localDateIso(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** YYYY-MM-DD day difference (end - start). */
export function daysBetweenDates(start: string, end: string): number {
  const a = new Date(`${start.slice(0, 10)}T12:00:00`)
  const b = new Date(`${end.slice(0, 10)}T12:00:00`)
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

/** Add N days to a YYYY-MM-DD date. */
export function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso.slice(0, 10)}T12:00:00`)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Due / terms date for an invoice: prefer due_date / expected_payment_date,
 * else invoice_date + broker Net terms.
 */
export function resolveInvoiceTermsDueDate(
  invoice: Pick<Invoice, 'invoice_date' | 'due_date' | 'expected_payment_date'>,
  paymentTermsDays: number
): string {
  const due = invoice.due_date?.trim() || invoice.expected_payment_date?.trim()
  if (due) return due.slice(0, 10)
  const terms = Math.max(0, Math.floor(paymentTermsDays))
  return addDaysIso(invoice.invoice_date.slice(0, 10), terms || BROKER_RISK_POLICY.fallback_terms_days)
}

/** Days past terms for a payment (0 if on time / early). */
export function daysPastTerms(
  invoice: Pick<Invoice, 'invoice_date' | 'due_date' | 'expected_payment_date'>,
  receivedDate: string,
  paymentTermsDays: number
): number {
  const due = resolveInvoiceTermsDueDate(invoice, paymentTermsDays)
  return Math.max(0, daysBetweenDates(due, receivedDate.slice(0, 10)))
}

export function isPaymentLate(
  invoice: Pick<Invoice, 'invoice_date' | 'due_date' | 'expected_payment_date'>,
  receivedDate: string,
  paymentTermsDays: number
): boolean {
  return daysPastTerms(invoice, receivedDate, paymentTermsDays) > 0
}

function isOpenInvoice(invoice: Invoice): boolean {
  // Only approved open A/R — pending/hold packets are not "broker overdue".
  return isOpenArInvoice(invoice)
}

/**
 * Collect terms-aware payment signals for one broker relationship.
 * Late = paid/open after that broker's Net terms (not a flat day count).
 * Review gate: 15+ days past due → Needs review. Urgent: 21+ days past due.
 */
export function collectTermsPaymentSignals(args: {
  invoices: Invoice[]
  payments: Payment[]
  paymentTermsDays?: number | null
  asOf?: Date
  policy?: BrokerRiskPolicy
}): BrokerTermsPaymentSignals {
  const policy = args.policy ?? BROKER_RISK_POLICY
  const terms =
    args.paymentTermsDays != null && args.paymentTermsDays > 0
      ? Math.floor(args.paymentTermsDays)
      : policy.fallback_terms_days
  const asOfDate = args.asOf ?? new Date()
  const asOf = localDateIso(asOfDate)
  const lookbackStart = addDaysIso(asOf, -policy.lookback_days)

  const invoiceById = new Map(args.invoices.map((i) => [i.id, i]))
  const pastTermsPaid: number[] = []
  const invoiceToPay: number[] = []

  for (const p of args.payments) {
    if (p.status !== 'confirmed') continue
    const received = p.received_date.slice(0, 10)
    if (received < lookbackStart) continue
    const inv = invoiceById.get(p.invoice_id)
    if (!inv) continue
    const past = daysPastTerms(inv, received, terms)
    // Only count remittances past the Needs-review gate (15d), not day-1 after due.
    if (past >= policy.late_payment_min_days) pastTermsPaid.push(past)
    invoiceToPay.push(daysBetweenDates(inv.invoice_date.slice(0, 10), received))
  }

  let open_overdue_past_terms = 0
  let open_overdue_amount = 0
  let open_urgent_past_terms = 0
  const openPastDays: number[] = []
  for (const inv of args.invoices) {
    if (!isOpenInvoice(inv)) continue
    const due = resolveInvoiceTermsDueDate(inv, terms)
    const past = Math.max(0, daysBetweenDates(due, asOf))
    // Not "for review" until N days past due (default 15).
    if (past >= policy.open_overdue_min_days) {
      open_overdue_past_terms += 1
      open_overdue_amount += inv.amount
      openPastDays.push(past)
      if (past >= policy.high_single_late_days) open_urgent_past_terms += 1
    }
  }

  const allPastDays = [...pastTermsPaid, ...openPastDays]

  return {
    payment_terms_days: terms,
    late_payment_count: pastTermsPaid.length,
    max_days_past_terms: allPastDays.length > 0 ? Math.max(...allPastDays) : null,
    avg_days_past_terms:
      pastTermsPaid.length > 0
        ? Math.round(pastTermsPaid.reduce((a, b) => a + b, 0) / pastTermsPaid.length)
        : null,
    open_overdue_past_terms,
    open_overdue_amount,
    open_urgent_past_terms,
    paid_sample_size: invoiceToPay.length,
    avg_days_invoice_to_pay:
      invoiceToPay.length > 0
        ? Math.round(invoiceToPay.reduce((a, b) => a + b, 0) / invoiceToPay.length)
        : null,
  }
}

/** Count note texts matching policy delay keywords. */
export function countNoteFlags(
  notes: Array<{ text: string }>,
  adminNotes?: string | null,
  policy: BrokerRiskPolicy = BROKER_RISK_POLICY
): number {
  let count = notes.filter(
    (n) => !isRoutineLifecycleNote(n.text) && policy.note_keyword_re.test(n.text)
  ).length
  if (
    adminNotes &&
    !isRoutineLifecycleNote(adminNotes) &&
    policy.note_keyword_re.test(adminNotes)
  ) {
    count += 1
  }
  return count
}

/**
 * Evaluate computed risk level from terms signals + notes.
 * Notes alone cannot set High without a payment signal.
 * PPW-only notes do not bump low → medium (Credyx should clear as docs issue).
 * NEW / insufficient payment history with this carrier → Medium (or High if marked NEW).
 */
export function evaluateRiskFromSignals(args: {
  hasWorked: boolean
  signals: BrokerTermsPaymentSignals
  noteFlagCount: number
  delayCauses?: DelayCauseAnalysis
  /** Credyx marked this broker NEW for carriers. */
  isNewBroker?: boolean
  policy?: BrokerRiskPolicy
}): BrokerRiskEvaluation {
  const policy = args.policy ?? BROKER_RISK_POLICY
  const { signals, noteFlagCount, hasWorked } = args
  const delay_causes =
    args.delayCauses ??
    ({
      primary: 'none' as const,
      broker_pay_count: 0,
      ppw_count: 0,
      dispute_count: 0,
      snippets: [],
      summary: 'No note language explaining the delay yet',
    } satisfies DelayCauseAnalysis)
  const reasons: string[] = []
  const isNew = Boolean(args.isNewBroker)
  // No payments with this carrier, or Credyx-marked NEW with thin sample.
  const insufficientHistory =
    !hasWorked ||
    (isNew && signals.paid_sample_size < policy.min_paid_sample_for_confidence)

  // Thin / NEW brokers: elevated risk for this carrier (not "unrated silence").
  if (insufficientHistory) {
    const computed: BrokerRiskLevel = isNew && !hasWorked ? 'high' : 'medium'
    if (isNew) {
      reasons.push('Credyx marked this broker NEW — limited verified payment history')
    }
    if (!hasWorked) {
      reasons.push('No confirmed payments with this carrier yet')
    } else if (signals.paid_sample_size < policy.min_paid_sample_for_confidence) {
      reasons.push(
        `Only ${signals.paid_sample_size} confirmed payment(s) with this carrier — not enough history`
      )
    }
    if (delay_causes.primary !== 'none') reasons.push(delay_causes.summary)
    return {
      computed_level: computed,
      pay_rating: riskLevelToPayRating(computed),
      note_flag_count: noteFlagCount,
      signals,
      reasons,
      delay_causes,
      suggest_clear_as_ppw: false,
    }
  }

  const late = signals.late_payment_count
  const maxPast = signals.max_days_past_terms ?? 0
  const openPast = signals.open_overdue_past_terms
  const openUrgent = signals.open_urgent_past_terms ?? 0
  const net = signals.payment_terms_days
  const reviewDays = policy.medium_single_late_days
  const urgentDays = policy.high_single_late_days

  let computed: BrokerRiskLevel = 'low'
  let paymentDriven = false

  const highByLate = late >= policy.high_late_count
  const highBySeverity = maxPast >= urgentDays
  const highByOpen = openUrgent >= policy.high_open_overdue_count
  if (highByLate || highBySeverity || highByOpen) {
    computed = 'high'
    paymentDriven = true
    if (highByLate) reasons.push(`${late} payments ${reviewDays}+ days past Net ${net}`)
    if (highBySeverity)
      reasons.push(`Urgent: ${maxPast}d past Net ${net} (${urgentDays}+ day threshold)`)
    if (highByOpen)
      reasons.push(
        `${openUrgent} open invoice(s) ${urgentDays}+ days past due — urgent review required`
      )
  } else {
    const medByLate = late >= policy.medium_late_count
    const medBySeverity = maxPast >= reviewDays
    const medByOpen = openPast >= policy.medium_open_overdue_count
    if (medByLate || medBySeverity || medByOpen) {
      computed = 'medium'
      paymentDriven = true
      if (medByLate) reasons.push(`${late} payments ${reviewDays}+ days past Net ${net}`)
      if (medBySeverity) reasons.push(`Late by ${maxPast}d past Net ${net} — Needs review`)
      if (medByOpen)
        reasons.push(
          `${openPast} open invoice(s) overdue (${reviewDays}+ days past due) — Needs review`
        )
    } else {
      reasons.push(`Pays within Net ${net} — on time (review starts at ${reviewDays}d past due)`)
      if (signals.avg_days_invoice_to_pay != null) {
        reasons.push(`Avg ${signals.avg_days_invoice_to_pay}d from invoice date`)
      }
    }
  }

  const ppwOnly =
    delay_causes.primary === 'ppw_docs' ||
    (delay_causes.ppw_count > 0 && delay_causes.broker_pay_count === 0)

  if (noteFlagCount > 0 || delay_causes.primary !== 'none') {
    reasons.push(delay_causes.summary)
    if (
      computed === 'low' &&
      !ppwOnly &&
      (delay_causes.broker_pay_count + delay_causes.dispute_count > 0 ||
        (noteFlagCount > 0 && delay_causes.primary === 'none'))
    ) {
      computed = 'medium'
    }
  }

  const suggest_clear_as_ppw = Boolean(
    ppwOnly && (computed === 'medium' || !paymentDriven || delay_causes.ppw_count > 0)
  )

  return {
    computed_level: computed,
    pay_rating: riskLevelToPayRating(computed),
    note_flag_count: noteFlagCount,
    signals,
    reasons,
    delay_causes,
    suggest_clear_as_ppw,
  }
}

export function riskLevelToPayRating(level: BrokerRiskLevel): BrokerPayRating {
  if (level === 'high') return 'red'
  if (level === 'medium') return 'yellow'
  if (level === 'unrated') return 'yellow'
  return 'green'
}

/** Whether a review status is visible to carriers as elevated/confirmed risk. */
export function isCarrierVisibleReviewStatus(
  status: string | null | undefined
): boolean {
  return (
    status === 'published' ||
    status === 'auto_published' ||
    status === 'cleared'
  )
}
