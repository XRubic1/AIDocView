import {
  getConfirmedPaymentTotal,
  getPaymentsByInvoiceId,
  getUnconfirmedPaymentTotal,
  getUnconfirmedShortPaymentTotal,
} from '../data/mockPayments'
import { getInvoiceById, mockInvoices, updateInvoiceAsync } from '../data/mockInvoices'
import { clearClientTenantCache } from '../data/clientDemoData'
import type { Invoice, InvoiceNote } from '../types/invoice'
import type { Payment } from '../types/payment'
import { isShortPayment } from '../types/payment'
import { formatCurrency, formatDate } from '../utils/format'
import { logAuditEvent } from '../utils/auditLogger'
import { isOpenArInvoice } from '../utils/invoiceAging'
import {
  AMOUNT_EPSILON,
  getInvoiceBalanceState,
  type InvoiceBalanceState,
} from '../utils/paymentVariance'
import { buildPaymentConfirmationNote } from './clientInvoiceActions'

export type ArRecalcIssueKind =
  /** Confirmed cash covers the invoice but status is still open A/R (aging). */
  | 'fully_paid_still_open'
  /** paid_amount says settled but status is still approved (no/insufficient confirmed rows). */
  | 'paid_amount_still_open'
  /**
   * Gross confirmed (excluding short corrections) covers face, but net after shorts
   * still shows a balance — keeps the invoice in aging incorrectly for close purposes.
   */
  | 'short_blocks_close'

export type ArRecalcIssue = {
  invoice: Invoice
  kind: ArRecalcIssueKind
  confirmedReceived: number
  /** Confirmed normal/over only (shorts excluded). */
  grossConfirmed: number
  paidAmount: number
  /** Amount that will be written as paid_amount after fix. */
  appliedReceived: number
  suggestedStatus: 'paid'
  message: string
}

/** Before/after preview so admins can confirm before applying recalc. */
export type ArRecalcPreview = {
  issue: ArRecalcIssue
  issueTitle: string
  issueDetail: string
  changes: Array<{ label: string; before: string; after: string }>
  effects: string[]
}

export type ArInspectionVerdict =
  | 'healthy'
  | 'needs_recalc'
  | 'short_open'
  | 'awaiting_funds'
  | 'closed_ok'
  | 'other_open'

export type ArPaymentLine = {
  payment: Payment
  effectiveTowardBalance: number
}

/** Full diagnostic for a single invoice (lookup → review → optional fix). */
export type ArInvoiceInspection = {
  invoice: Invoice
  inAgingAr: boolean
  confirmedReceived: number
  grossConfirmed: number
  confirmedShortTotal: number
  unconfirmedReceived: number
  unconfirmedShort: number
  paidAmount: number
  appliedReceived: number
  balance: InvoiceBalanceState
  payments: ArPaymentLine[]
  /** Best-effort date when funds were confirmed / invoice marked paid. */
  paidAtLabel: string | null
  findings: string[]
  verdict: ArInspectionVerdict
  verdictLabel: string
  canRecalc: boolean
  /** Admin may force-close any open A/R invoice after review. */
  canForceClose: boolean
  issue: ArRecalcIssue | null
}

/** True when confirmed (or recorded paid) cash covers the invoice face amount. */
function isFullyCovered(invoiceAmount: number, received: number): boolean {
  return received >= invoiceAmount - AMOUNT_EPSILON
}

/** Confirmed cash excluding short corrections (gross remittances). */
export function getGrossConfirmedPaymentTotal(invoiceId: string): number {
  return getPaymentsByInvoiceId(invoiceId).reduce((sum, p) => {
    if (p.status !== 'confirmed' || isShortPayment(p)) return sum
    return sum + p.amount
  }, 0)
}

/** Confirmed short correction total (positive magnitude). */
export function getConfirmedShortPaymentTotal(invoiceId: string): number {
  return getPaymentsByInvoiceId(invoiceId).reduce((sum, p) => {
    if (p.status !== 'confirmed' || !isShortPayment(p)) return sum
    return sum + p.amount
  }, 0)
}

function buildIssueForInvoice(invoice: Invoice): ArRecalcIssue | null {
  if (invoice.status !== 'approved') return null

  const confirmedReceived = getConfirmedPaymentTotal(invoice.id)
  const grossConfirmed = getGrossConfirmedPaymentTotal(invoice.id)
  const paidAmount = invoice.paid_amount ?? 0

  if (isFullyCovered(invoice.amount, confirmedReceived)) {
    return {
      invoice,
      kind: 'fully_paid_still_open',
      confirmedReceived,
      grossConfirmed,
      paidAmount,
      appliedReceived: Math.max(confirmedReceived, paidAmount),
      suggestedStatus: 'paid',
      message: `Confirmed ${formatCurrency(confirmedReceived)} covers ${formatCurrency(invoice.amount)} but status is still approved (in aging A/R).`,
    }
  }

  if (isFullyCovered(invoice.amount, paidAmount)) {
    return {
      invoice,
      kind: 'paid_amount_still_open',
      confirmedReceived,
      grossConfirmed,
      paidAmount,
      appliedReceived: paidAmount,
      suggestedStatus: 'paid',
      message: `paid_amount ${formatCurrency(paidAmount)} covers the invoice but status is still approved (in aging A/R).`,
    }
  }

  // Gross remittances cover face, but short corrections keep net below face (Inv 666 case).
  if (
    isFullyCovered(invoice.amount, grossConfirmed) &&
    !isFullyCovered(invoice.amount, confirmedReceived)
  ) {
    const shortTotal = getConfirmedShortPaymentTotal(invoice.id)
    return {
      invoice,
      kind: 'short_blocks_close',
      confirmedReceived,
      grossConfirmed,
      paidAmount,
      appliedReceived: invoice.amount,
      suggestedStatus: 'paid',
      message: `Gross confirmed ${formatCurrency(grossConfirmed)} covers ${formatCurrency(invoice.amount)}, but short correction(s) of ${formatCurrency(shortTotal)} leave net ${formatCurrency(confirmedReceived)} — invoice stays in aging A/R.`,
    }
  }

  return null
}

/** Resolve invoice# (preferred) or face amount to matching invoices. */
export function findInvoicesForArRecalc(query: string): Invoice[] {
  const q = query.trim()
  if (!q) return []

  const lower = q.toLowerCase()
  const byNumber = mockInvoices.filter(
    (inv) =>
      inv.invoice_number.toLowerCase() === lower ||
      inv.invoice_number.toLowerCase().includes(lower) ||
      inv.id.toLowerCase() === lower
  )
  if (byNumber.length > 0) {
    return byNumber.sort((a, b) =>
      a.invoice_number.localeCompare(b.invoice_number, undefined, { numeric: true })
    )
  }

  const asAmount = Number(q.replace(/[$,\s]/g, ''))
  if (!Number.isFinite(asAmount) || asAmount <= 0) return []

  return mockInvoices
    .filter((inv) => Math.abs(inv.amount - asAmount) < AMOUNT_EPSILON)
    .sort((a, b) =>
      a.invoice_number.localeCompare(b.invoice_number, undefined, { numeric: true })
    )
}

function resolvePaidAtLabel(invoice: Invoice, payments: Payment[]): string | null {
  const confirmed = payments
    .filter((p) => p.status === 'confirmed')
    .map((p) => p.client_confirmed_at || p.confirmed_at || p.received_date || p.payment_date)
    .filter(Boolean)
    .sort()

  if (confirmed.length > 0) {
    const first = confirmed[0]
    const last = confirmed[confirmed.length - 1]
    if (first === last) return formatDate(first)
    return `${formatDate(first)} → ${formatDate(last)}`
  }

  if (invoice.status === 'paid' && invoice.updated_at) {
    return formatDate(invoice.updated_at)
  }

  return null
}

/** Inspect one invoice: payments, paid timing, aging A/R membership, fixability. */
export function inspectInvoiceAr(invoiceId: string): ArInvoiceInspection | null {
  const invoice = getInvoiceById(invoiceId)
  if (!invoice) return null

  const payments = getPaymentsByInvoiceId(invoice.id).sort((a, b) =>
    (b.received_date || b.payment_date).localeCompare(a.received_date || a.payment_date)
  )
  const confirmedReceived = getConfirmedPaymentTotal(invoice.id)
  const grossConfirmed = getGrossConfirmedPaymentTotal(invoice.id)
  const confirmedShortTotal = getConfirmedShortPaymentTotal(invoice.id)
  const unconfirmedReceived = getUnconfirmedPaymentTotal(invoice.id)
  const unconfirmedShort = getUnconfirmedShortPaymentTotal(invoice.id)
  const paidAmount = invoice.paid_amount ?? 0
  const issue = buildIssueForInvoice(invoice)
  const appliedReceived = issue?.appliedReceived ?? Math.max(confirmedReceived, paidAmount)
  const balance = getInvoiceBalanceState(invoice.amount, confirmedReceived)
  const inAgingAr = isOpenArInvoice(invoice)
  const paidAtLabel = resolvePaidAtLabel(invoice, payments)

  const paymentLines: ArPaymentLine[] = payments.map((payment) => ({
    payment,
    effectiveTowardBalance:
      payment.status === 'confirmed'
        ? isShortPayment(payment)
          ? -payment.amount
          : payment.amount
        : 0,
  }))

  const findings: string[] = []
  findings.push(
    inAgingAr
      ? `In client aging A/R (status approved) at face ${formatCurrency(invoice.amount)}.`
      : `Not in client aging A/R (status: ${invoice.status}).`
  )
  findings.push(
    `Net confirmed (after shorts): ${formatCurrency(confirmedReceived)} of ${formatCurrency(invoice.amount)}.`
  )
  findings.push(`Gross confirmed (excluding shorts): ${formatCurrency(grossConfirmed)}.`)
  if (confirmedShortTotal > 0) {
    findings.push(`Confirmed short corrections: −${formatCurrency(confirmedShortTotal)}.`)
  }
  if (paidAmount > 0) {
    findings.push(`Invoice paid_amount field: ${formatCurrency(paidAmount)}.`)
  }
  if (unconfirmedReceived > 0 || unconfirmedShort > 0) {
    findings.push(
      `Unconfirmed posted funds: ${formatCurrency(unconfirmedReceived)}` +
        (unconfirmedShort > 0 ? ` (+ short ${formatCurrency(unconfirmedShort)} awaiting confirm)` : '') +
        '.'
    )
  }
  if (paidAtLabel) {
    findings.push(`Payment confirmation timing: ${paidAtLabel}.`)
  } else if (payments.length === 0) {
    findings.push('No payment rows on this invoice.')
  } else {
    findings.push('No confirmed payment dates yet.')
  }
  findings.push(
    `Open balance vs net confirmed: ${balance.label} (${formatCurrency(Math.abs(balance.signedBalance))}).`
  )

  let verdict: ArInspectionVerdict
  let verdictLabel: string

  if (issue) {
    verdict = 'needs_recalc'
    verdictLabel =
      issue.kind === 'short_blocks_close'
        ? 'Needs recalc — short correction keeps A/R open'
        : 'Needs recalc — settled funds but still in aging A/R'
    findings.push(issue.message)
  } else if (
    invoice.status === 'paid' ||
    invoice.status === 'written_off' ||
    invoice.status === 'force_closed'
  ) {
    verdict = 'closed_ok'
    verdictLabel = 'Closed — not in aging A/R'
  } else if (inAgingAr && confirmedReceived > 0 && confirmedReceived < invoice.amount - AMOUNT_EPSILON) {
    verdict = 'short_open'
    verdictLabel = 'Open A/R — short / partial (expected in aging)'
  } else if (inAgingAr && (unconfirmedReceived > 0 || unconfirmedShort > 0)) {
    verdict = 'awaiting_funds'
    verdictLabel = 'Open A/R — funds posted but not confirmed yet'
  } else if (inAgingAr && confirmedReceived <= 0) {
    verdict = 'other_open'
    verdictLabel = 'Open A/R — no confirmed payments'
  } else if (!inAgingAr) {
    verdict = 'healthy'
    verdictLabel = 'OK — not in aging A/R'
  } else {
    verdict = 'healthy'
    verdictLabel = 'OK — no mismatch detected'
  }

  return {
    invoice,
    inAgingAr,
    confirmedReceived,
    grossConfirmed,
    confirmedShortTotal,
    unconfirmedReceived,
    unconfirmedShort,
    paidAmount,
    appliedReceived,
    balance,
    payments: paymentLines,
    paidAtLabel,
    findings,
    verdict,
    verdictLabel,
    canRecalc: issue != null,
    canForceClose: inAgingAr,
    issue,
  }
}

export function getArRecalcIssueTitle(kind: ArRecalcIssueKind): string {
  if (kind === 'fully_paid_still_open') return 'Paid but still open in aging A/R'
  if (kind === 'short_blocks_close') return 'Short correction keeps invoice in aging A/R'
  return 'paid_amount settled but status still open'
}

/**
 * Scan for invoices still in open A/R (approved) that should be closed to paid
 * based on confirmed payments or recorded paid_amount.
 */
export function listArRecalcIssues(): ArRecalcIssue[] {
  const issues: ArRecalcIssue[] = []

  for (const invoice of mockInvoices) {
    const issue = buildIssueForInvoice(invoice)
    if (issue) issues.push(issue)
  }

  return issues.sort((a, b) =>
    a.invoice.invoice_number.localeCompare(b.invoice.invoice_number, undefined, { numeric: true })
  )
}

/** Build a human-readable preview of what recalc will change. */
export function getArRecalcPreview(issue: ArRecalcIssue): ArRecalcPreview {
  const inv = issue.invoice
  const daysBefore =
    inv.days_since_expected != null ? `${inv.days_since_expected}d` : '—'

  const effects = [
    `Remove ${inv.invoice_number} from ${inv.client_name}'s aging A/R / collections`,
    'Add an internal invoice note documenting this recalc',
    'Write an admin audit log entry',
    `Refresh the client portal cache for ${inv.client_name}`,
  ]

  if (issue.kind === 'short_blocks_close') {
    effects.unshift(
      'Close to paid using face amount — short correction rows stay on payment history but no longer keep this invoice in aging A/R'
    )
  }

  return {
    issue,
    issueTitle: getArRecalcIssueTitle(issue.kind),
    issueDetail: issue.message,
    changes: [
      { label: 'Status', before: inv.status, after: 'paid' },
      {
        label: 'paid_amount',
        before: formatCurrency(issue.paidAmount),
        after: formatCurrency(issue.appliedReceived),
      },
      {
        label: 'Net confirmed (display)',
        before: formatCurrency(issue.confirmedReceived),
        after:
          issue.kind === 'short_blocks_close'
            ? `${formatCurrency(issue.confirmedReceived)} (unchanged on payments)`
            : formatCurrency(issue.appliedReceived),
      },
      {
        label: 'Days past expected',
        before: daysBefore,
        after: '0d',
      },
      {
        label: 'Open A/R (aging)',
        before: formatCurrency(inv.amount),
        after: formatCurrency(0),
      },
    ],
    effects,
  }
}

/** Build a force-close preview for any open A/R invoice. */
export function getForceCloseArPreview(invoiceId: string): ArRecalcPreview | null {
  const invoice = getInvoiceById(invoiceId)
  if (!invoice || !isOpenArInvoice(invoice)) return null

  const confirmedReceived = getConfirmedPaymentTotal(invoice.id)
  const grossConfirmed = getGrossConfirmedPaymentTotal(invoice.id)
  const paidAmount = invoice.paid_amount ?? 0
  const appliedReceived = Math.max(invoice.amount, confirmedReceived, paidAmount, grossConfirmed)

  const issue: ArRecalcIssue = {
    invoice,
    kind:
      isFullyCovered(invoice.amount, grossConfirmed) &&
      !isFullyCovered(invoice.amount, confirmedReceived)
        ? 'short_blocks_close'
        : 'fully_paid_still_open',
    confirmedReceived,
    grossConfirmed,
    paidAmount,
    appliedReceived,
    suggestedStatus: 'paid',
    message: `Admin force-close: remove ${invoice.invoice_number} from aging A/R and set status to paid (applied ${formatCurrency(appliedReceived)}).`,
  }

  return getArRecalcPreview(issue)
}

async function closeInvoiceToPaid(
  invoice: Invoice,
  adminName: string,
  totalReceived: number,
  noteSuffix: string,
  meta: Record<string, unknown>
): Promise<Invoice | undefined> {
  const isOver = totalReceived > invoice.amount + AMOUNT_EPSILON
  const now = new Date().toISOString()
  const paidNote: InvoiceNote = {
    id: `note-ar-recalc-${Date.now()}`,
    note: buildPaymentConfirmationNote(invoice.amount, totalReceived, noteSuffix),
    created_by: adminName,
    created_at: now,
    type: 'note',
    visibility: 'internal',
  }

  const updated = await updateInvoiceAsync(invoice.id, {
    status: 'paid',
    paid_amount: totalReceived,
    days_since_expected: 0,
    overpayment_accepted_at: isOver ? invoice.overpayment_accepted_at ?? now : undefined,
    notes_history: [...(invoice.notes_history || []), paidNote],
    updated_at: now,
  })

  if (!updated) return undefined

  clearClientTenantCache(invoice.client_id)

  logAuditEvent(
    'invoice_closed',
    'invoice',
    updated.id,
    updated.invoice_number,
    `${adminName} A/R recalc closed ${updated.invoice_number} to paid (${formatCurrency(totalReceived)} received)`,
    'admin-portal',
    adminName,
    'Admin',
    undefined,
    {
      close_type: 'paid',
      action: 'ar_recalc',
      ...meta,
    }
  )

  return updated
}

/**
 * Recompute one invoice from confirmed cash (or paid_amount / gross fallback) and close to paid.
 * Clears client tenant cache so aging A/R refreshes.
 */
export async function fixArRecalcIssue(
  invoiceId: string,
  adminName: string
): Promise<Invoice | undefined> {
  const invoice = getInvoiceById(invoiceId)
  if (!invoice || invoice.status !== 'approved') return undefined

  const issue = buildIssueForInvoice(invoice)
  if (!issue) return undefined

  const noteSuffix =
    issue.kind === 'short_blocks_close'
      ? `A/R recalc by ${adminName}: closed to paid — gross ${formatCurrency(issue.grossConfirmed)} covered face; short corrections were keeping net at ${formatCurrency(issue.confirmedReceived)}`
      : `A/R recalc by ${adminName}: closed to paid (received ${formatCurrency(issue.appliedReceived)})`

  return closeInvoiceToPaid(invoice, adminName, issue.appliedReceived, noteSuffix, {
    confirmed_received: issue.confirmedReceived,
    gross_confirmed: issue.grossConfirmed,
    paid_amount: issue.appliedReceived,
    issue_kind: issue.kind,
  })
}

/** Force-close any open A/R invoice to paid after admin review. */
export async function forceCloseInvoiceAr(
  invoiceId: string,
  adminName: string
): Promise<Invoice | undefined> {
  const invoice = getInvoiceById(invoiceId)
  if (!invoice || !isOpenArInvoice(invoice)) return undefined

  const confirmedReceived = getConfirmedPaymentTotal(invoice.id)
  const grossConfirmed = getGrossConfirmedPaymentTotal(invoice.id)
  const paidAmount = invoice.paid_amount ?? 0
  const totalReceived = Math.max(invoice.amount, confirmedReceived, paidAmount, grossConfirmed)

  return closeInvoiceToPaid(
    invoice,
    adminName,
    totalReceived,
    `A/R force-close by ${adminName}: removed from aging (applied ${formatCurrency(totalReceived)})`,
    {
      confirmed_received: confirmedReceived,
      gross_confirmed: grossConfirmed,
      paid_amount: totalReceived,
      issue_kind: 'force_close',
    }
  )
}

/** Fix all detected A/R mismatches. Returns counts. */
export async function fixAllArRecalcIssues(
  adminName: string
): Promise<{ fixed: number; failed: number }> {
  const issues = listArRecalcIssues()
  let fixed = 0
  let failed = 0

  for (const issue of issues) {
    try {
      const result = await fixArRecalcIssue(issue.invoice.id, adminName)
      if (result) fixed += 1
      else failed += 1
    } catch {
      failed += 1
    }
  }

  return { fixed, failed }
}
