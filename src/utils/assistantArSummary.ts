/**
 * A/R overview snapshot for the Assistant — growth, projection, aging.
 * Intentionally NOT an invoice list (that’s a separate follow-up question).
 */

import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import { formatCurrency } from './format'
import { isOpenArInvoice, enrichInvoices } from './invoiceAging'
import { AMOUNT_EPSILON, getInvoiceOpenArBalance } from './paymentVariance'
import { isClientVisibleHold } from './clientInvoiceView'
import {
  computeCashFlowTrend,
  computeDso,
  computeOpenArAging,
  type CashFlowMonth,
} from './clientReports'
import { computeCashCollectionForecast } from './cashCollectionForecast'

export type AssistantArSummary = {
  openAr: number
  openArLabel: string
  openInvoiceCount: number
  onHold: number
  onHoldLabel: string
  onHoldCount: number
  overdue: number
  overdueLabel: string
  overdueCount: number
  dsoDays: number | null
  /** MoM invoiced change (this month vs prior). */
  invoicedGrowthPct: number | null
  invoicedThisMonthLabel: string
  invoicedPriorMonthLabel: string
  /** MoM collected change. */
  collectedGrowthPct: number | null
  collectedThisMonthLabel: string
  collectedPriorMonthLabel: string
  /** Forecast cash in. */
  project7Label: string
  project30Label: string
  project7: number
  project30: number
  /** Chart series. */
  cashFlow: CashFlowMonth[]
  aging: ReturnType<typeof computeOpenArAging>['aging_ar']
  headline: string
  summary: string
}

function pctChange(current: number, prior: number): number | null {
  if (prior <= AMOUNT_EPSILON && current <= AMOUNT_EPSILON) return null
  if (prior <= AMOUNT_EPSILON) return 100
  return Math.round(((current - prior) / prior) * 100)
}

function growthWord(pct: number | null): string {
  if (pct == null) return 'flat'
  if (pct > 3) return `up ${pct}%`
  if (pct < -3) return `down ${Math.abs(pct)}%`
  return 'about flat'
}

/** Detect A/R overview asks (summary / growth / projection — not “list my invoices”). */
export function isArSummaryQuery(prompt: string): boolean {
  const q = prompt.trim()
  if (/\b(list|show|which)\b.*\b(open|invoice)/i.test(q) && !/\b(summar|growth|project|forecast|trend|chart|overview)\b/i.test(q)) {
    return false
  }
  return (
    (/\b(summariz\w*|summary|overview|growth|project(?:ion|ed)?|forecast|trend|chart|how\s+(?:am\s+i|we)\s+doing)\b/i.test(
      q
    ) &&
      /\b(a\/?r|receivable|collections?|cash\s*flow|aging)\b/i.test(q)) ||
    /\bsummariz\w*\s+(my\s+)?(a\/?r|receivables?)\b/i.test(q) ||
    /\b(a\/?r|receivable)\s+(summary|overview|report)\b/i.test(q)
  )
}

/** True when the user wants the open-invoice list specifically. */
export function isOpenInvoiceListQuery(prompt: string): boolean {
  return (
    /\b(list|show|which|what('s| is))\b.*\b(still\s+)?open\b/i.test(prompt) ||
    /\bopen\s+invoices?\b/i.test(prompt)
  ) && !isArSummaryQuery(prompt)
}

/** Build the portfolio-level A/R snapshot (no per-invoice rows). */
export function buildArSummarySnapshot(
  invoices: Invoice[],
  payments: Payment[],
  asOf = new Date()
): AssistantArSummary {
  const aging = computeOpenArAging(invoices, asOf, payments)
  const enriched = enrichInvoices(invoices, asOf)
  const open = enriched.filter(isOpenArInvoice)
  const openWithBal = open.filter((inv) => getInvoiceOpenArBalance(inv, payments) > AMOUNT_EPSILON)

  let onHold = 0
  let onHoldCount = 0
  for (const inv of openWithBal) {
    if (isClientVisibleHold(inv) || inv.status === 'hold') {
      onHold += getInvoiceOpenArBalance(inv, payments)
      onHoldCount += 1
    }
  }

  const dsoDays = computeDso(open, payments)
  const cashFlow = computeCashFlowTrend(invoices, payments, 6)
  const thisMonth = cashFlow[cashFlow.length - 1]
  const priorMonth = cashFlow[cashFlow.length - 2]
  const invoicedGrowthPct = pctChange(
    thisMonth?.invoiced ?? 0,
    priorMonth?.invoiced ?? 0
  )
  const collectedGrowthPct = pctChange(
    thisMonth?.collected ?? 0,
    priorMonth?.collected ?? 0
  )

  const forecast = computeCashCollectionForecast(invoices, payments, 30, asOf)

  const headline =
    aging.total_ar <= AMOUNT_EPSILON
      ? 'A/R is clear'
      : `Open A/R ${formatCurrency(aging.total_ar)}`

  const parts: string[] = []
  if (aging.total_ar > AMOUNT_EPSILON) {
    parts.push(
      `${aging.total_invoices} open invoice${aging.total_invoices === 1 ? '' : 's'}`
    )
  }
  if (onHoldCount > 0) {
    parts.push(`${formatCurrency(onHold)} on hold (${onHoldCount})`)
  }
  if (aging.overdue_count > 0) {
    parts.push(`${formatCurrency(aging.overdue_amount)} past due`)
  }
  parts.push(
    `Invoiced ${growthWord(invoicedGrowthPct)} MoM · collected ${growthWord(collectedGrowthPct)} MoM`
  )
  if (forecast.next_30_days > AMOUNT_EPSILON) {
    parts.push(
      `~${formatCurrency(forecast.next_30_days)} projected in the next 30 days`
    )
  }
  if (dsoDays != null) {
    parts.push(`DSO ~${dsoDays}d`)
  }

  return {
    openAr: aging.total_ar,
    openArLabel: formatCurrency(aging.total_ar),
    openInvoiceCount: aging.total_invoices,
    onHold,
    onHoldLabel: formatCurrency(onHold),
    onHoldCount,
    overdue: aging.overdue_amount,
    overdueLabel: formatCurrency(aging.overdue_amount),
    overdueCount: aging.overdue_count,
    dsoDays,
    invoicedGrowthPct,
    invoicedThisMonthLabel: formatCurrency(thisMonth?.invoiced ?? 0),
    invoicedPriorMonthLabel: formatCurrency(priorMonth?.invoiced ?? 0),
    collectedGrowthPct,
    collectedThisMonthLabel: formatCurrency(thisMonth?.collected ?? 0),
    collectedPriorMonthLabel: formatCurrency(priorMonth?.collected ?? 0),
    project7Label: formatCurrency(forecast.next_7_days),
    project30Label: formatCurrency(forecast.next_30_days),
    project7: forecast.next_7_days,
    project30: forecast.next_30_days,
    cashFlow,
    aging: aging.aging_ar,
    headline,
    summary: parts.join(' · '),
  }
}
