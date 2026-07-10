import {
  AR_RATE_TIERS,
  BILL_LOCK_AFTER_DAYS,
  BILL_PAYMENT_TERMS_DAYS,
  BILL_REMINDER_DAYS,
  BILL_WARNING_DAYS,
  lookupArRatePct,
  PLATFORM_APP_FEE_MONTHLY,
} from '../config/arBillingRates'
import { mockInvoices } from '../data/mockInvoices'
import { mockPayments } from '../data/mockPayments'
import { getEffectivePaymentAmount } from '../utils/paymentVariance'
import { getShortPaymentFeeCreditsForPeriod } from './reimbursementAccountService'
import { getSupabase, isSupabaseConfigured, requireSupabase } from '../lib/supabase'
import { updateClient, getClientById } from './clientRegistry'
import { persistOrThrow } from './persistHelper'
import type {
  BillingLineItem,
  BillingPeriod,
  BillingStanding,
  ClientBill,
  ClientBillStatus,
  ComputedMonthlyBill,
} from '../types/billing'
import type { Client } from '../types/client'

/** In-memory client bill store (hydrated from Supabase when configured). */
let billsCache: ClientBill[] = []

interface ClientBillRow {
  id: string
  client_id: string
  period: string
  issued_at: string
  due_at: string
  amount: number
  status: ClientBillStatus
  paid_at: string | null
  payoneer_reference: string | null
  line_items: BillingLineItem[]
}

export function hydrateClientBills(bills: ClientBill[]): void {
  billsCache = [...bills]
}

export function clearClientBills(): void {
  billsCache = []
}

export function getAllClientBills(): ClientBill[] {
  return [...billsCache]
}

export function getClientBills(clientId: string): ClientBill[] {
  return billsCache
    .filter((b) => b.client_id === clientId)
    .sort((a, b) => b.period.localeCompare(a.period))
}

export function getBillById(billId: string): ClientBill | undefined {
  return billsCache.find((b) => b.id === billId)
}

export function getBillForPeriod(clientId: string, period: BillingPeriod): ClientBill | undefined {
  const key = formatBillingPeriod(period)
  return billsCache.find((b) => b.client_id === clientId && b.period === key)
}

/** Format period as YYYY-MM. */
export function formatBillingPeriod(period: BillingPeriod): string {
  return `${period.year}-${String(period.month).padStart(2, '0')}`
}

/** Parse YYYY-MM into a billing period. */
export function parseBillingPeriod(periodStr: string): BillingPeriod {
  const [year, month] = periodStr.split('-').map(Number)
  return { year, month }
}

export function currentBillingPeriod(): BillingPeriod {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

export function previousBillingPeriod(): BillingPeriod {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

function periodBounds(period: BillingPeriod): { start: Date; end: Date } {
  const start = new Date(period.year, period.month - 1, 1)
  const end = new Date(period.year, period.month, 0, 23, 59, 59, 999)
  return { start, end }
}

function isDateInPeriod(isoDate: string | undefined, period: BillingPeriod): boolean {
  if (!isoDate) return false
  const { start, end } = periodBounds(period)
  const d = new Date(isoDate)
  return d >= start && d <= end
}

function invoiceIdsForClient(clientId: string): Set<string> {
  return new Set(mockInvoices.filter((i) => i.client_id === clientId).map((i) => i.id))
}

function daysSince(isoDate: string): number {
  const then = new Date(isoDate).getTime()
  const now = Date.now()
  return Math.floor((now - then) / (1000 * 60 * 60 * 24))
}

function billRowToClientBill(row: ClientBillRow): ClientBill {
  return {
    id: row.id,
    client_id: row.client_id,
    period: row.period,
    issued_at: row.issued_at,
    due_at: row.due_at,
    amount: Number(row.amount),
    status: row.status,
    paid_at: row.paid_at ?? undefined,
    payoneer_reference: row.payoneer_reference ?? undefined,
    line_items: Array.isArray(row.line_items) ? row.line_items : [],
  }
}

function clientBillToRow(bill: ClientBill): ClientBillRow {
  return {
    id: bill.id,
    client_id: bill.client_id,
    period: bill.period,
    issued_at: bill.issued_at,
    due_at: bill.due_at,
    amount: bill.amount,
    status: bill.status,
    paid_at: bill.paid_at ?? null,
    payoneer_reference: bill.payoneer_reference ?? null,
    line_items: bill.line_items,
  }
}

/** Load client bills from Supabase into the in-memory cache. */
export async function hydrateClientBillsFromSupabase(clientId?: string): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return

  let query = supabase.from('client_bills').select('*').order('period', { ascending: false })
  if (clientId) query = query.eq('client_id', clientId)

  const { data, error } = await query
  if (error) throw new Error(`[arBilling] fetch failed: ${error.message}`)

  const rows = (data ?? []) as ClientBillRow[]
  if (clientId) {
    billsCache = [...billsCache.filter((b) => b.client_id !== clientId), ...rows.map(billRowToClientBill)]
  } else {
    hydrateClientBills(rows.map(billRowToClientBill))
  }
}

async function persistClientBill(bill: ClientBill): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = requireSupabase()
  const { error } = await supabase.from('client_bills').upsert(clientBillToRow(bill))
  if (error) throw new Error(error.message)
}

function upsertBillInCache(bill: ClientBill): void {
  const index = billsCache.findIndex((b) => b.id === bill.id)
  if (index >= 0) {
    const next = [...billsCache]
    next[index] = bill
    billsCache = next
  } else {
    billsCache = [bill, ...billsCache]
  }
}

/** Sum confirmed payment amounts for the client in the billing period (net of short corrections). */
export function getClientCollectedVolume(clientId: string, period: BillingPeriod): number {
  const invoiceIds = invoiceIdsForClient(clientId)
  return mockPayments
    .filter((p) => invoiceIds.has(p.invoice_id) && p.status === 'confirmed')
    .filter((p) => isDateInPeriod(p.confirmed_at ?? p.received_date, period))
    .reduce((sum, p) => sum + getEffectivePaymentAmount(p), 0)
}

/** Resolve A/R rate % from client flags and collected volume. */
export function resolveArRate(client: Client, collectedVolume: number): number {
  return lookupArRatePct(collectedVolume, client.factoring ?? false, client.ar_rate_override)
}

function isTrialClient(client: Client): boolean {
  return client.billing?.subscription_status === 'trial'
}

function getForceCloseAdjustments(
  clientId: string,
  period: BillingPeriod,
  ratePct: number
): BillingLineItem[] {
  const periodLabel = formatBillingPeriod(period)
  return mockInvoices
    .filter((inv) => inv.client_id === clientId && inv.status === 'force_closed')
    .filter((inv) => isDateInPeriod(inv.updated_at, period))
    .map((inv) => ({
      id: `fc-${inv.id}`,
      date: inv.updated_at?.split('T')[0] ?? periodLabel,
      description: `Force-close fee — ${inv.invoice_number} (${ratePct}% of invoice)`,
      amount: (ratePct / 100) * inv.amount,
      status: 'pending' as const,
    }))
}

function getReversalCredits(clientId: string, period: BillingPeriod): BillingLineItem[] {
  const invoiceIds = invoiceIdsForClient(clientId)
  return mockPayments
    .filter((p) => invoiceIds.has(p.invoice_id) && p.status === 'reversed')
    .filter((p) => isDateInPeriod(p.reversed_at, period))
    .filter((p) => p.confirmed_at && !isDateInPeriod(p.confirmed_at, period))
    .map((p) => ({
      id: `rev-${p.id}`,
      date: p.reversed_at?.split('T')[0] ?? formatBillingPeriod(period),
      description: `Reversal credit — ${p.invoice_number}`,
      amount: -p.amount,
      status: 'pending' as const,
    }))
}

/** Compute monthly bill breakdown for a client and period. */
export function computeMonthlyBill(clientId: string, period: BillingPeriod): ComputedMonthlyBill {
  const client = getClientById(clientId)
  if (!client) {
    throw new Error(`Client not found: ${clientId}`)
  }

  const collectedVolume = getClientCollectedVolume(clientId, period)
  const ratePct = resolveArRate(client, collectedVolume)
  const trial = isTrialClient(client)

  const appFee = trial ? 0 : PLATFORM_APP_FEE_MONTHLY
  const arFee = trial ? 0 : (ratePct / 100) * collectedVolume
  const adjustments = trial
    ? []
    : [...getForceCloseAdjustments(clientId, period, ratePct), ...getReversalCredits(clientId, period)]

  const reimbursementCredits = trial
    ? []
    : getShortPaymentFeeCreditsForPeriod(clientId, period)
  const reimbursementBalance = client.reimbursement_balance ?? 0

  const adjustmentTotal = adjustments.reduce((sum, a) => sum + a.amount, 0)
  const periodLabel = formatBillingPeriod(period)

  const lineItems: BillingLineItem[] = []

  if (appFee > 0) {
    lineItems.push({
      id: `app-${periodLabel}`,
      date: periodLabel,
      description: 'Platform subscription',
      amount: appFee,
      status: 'pending',
    })
  }

  if (arFee > 0 || collectedVolume > 0) {
    lineItems.push({
      id: `ar-${periodLabel}`,
      date: periodLabel,
      description: `A/R service fee — ${ratePct}% of ${formatVolume(collectedVolume)} collected`,
      amount: arFee,
      status: 'pending',
    })
  }

  for (const adj of adjustments) {
    lineItems.push(adj)
  }

  const subtotal = appFee + arFee + adjustmentTotal
  const total = Math.max(0, subtotal - reimbursementBalance)
  if (reimbursementCredits.length > 0) {
    lineItems.push(...reimbursementCredits)
  }
  if (reimbursementBalance > 0 && subtotal > 0) {
    lineItems.push({
      id: `reimb-acct-${clientId}-${periodLabel}`,
      date: periodLabel,
      description: `Reimbursement account credit applied (${formatVolume(reimbursementBalance)} available)`,
      amount: -Math.min(reimbursementBalance, subtotal),
      status: 'pending',
    })
  }

  return {
    appFee,
    collectedVolume,
    ratePct,
    arFee,
    adjustments,
    total,
    lineItems,
    reimbursementCredits,
    reimbursementBalance,
  }
}

function formatVolume(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}

/** Derive escalation standing from unpaid bill ages. */
export function getBillingStanding(client: Client, bills?: ClientBill[]): BillingStanding {
  const clientBills = bills ?? getClientBills(client.id)
  const unpaid = clientBills.filter((b) => b.status === 'open' || b.status === 'overdue')

  if (unpaid.length === 0) return 'ok'

  let worst: BillingStanding = 'ok'
  for (const bill of unpaid) {
    const age = daysSince(bill.issued_at)
    if (age >= BILL_LOCK_AFTER_DAYS) return 'locked'
    if (age >= BILL_WARNING_DAYS) worst = 'warning'
    else if (age >= BILL_REMINDER_DAYS && worst === 'ok') worst = 'overdue'
  }

  if (client.status === 'suspended') return 'locked'
  return worst
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate)
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

/** Issue a persisted bill for the period (idempotent per client+period). */
export async function issueClientBill(clientId: string, period: BillingPeriod): Promise<ClientBill> {
  const existing = getBillForPeriod(clientId, period)
  if (existing) return existing

  const client = getClientById(clientId)
  const computed = computeMonthlyBill(clientId, period)
  const subtotal = computed.appFee + computed.arFee + computed.adjustments.reduce((s, a) => s + a.amount, 0)
  const appliedFromAccount = Math.min(client?.reimbursement_balance ?? 0, Math.max(0, subtotal))
  const now = new Date().toISOString()

  if (appliedFromAccount > 0 && client) {
    const newBalance = Math.round(((client.reimbursement_balance ?? 0) - appliedFromAccount) * 100) / 100
    await updateClient(client.id, { reimbursement_balance: newBalance })
  }

  const bill: ClientBill = {
    id: `bill-${clientId}-${formatBillingPeriod(period)}`,
    client_id: clientId,
    period: formatBillingPeriod(period),
    issued_at: now,
    due_at: addDays(now, BILL_PAYMENT_TERMS_DAYS),
    amount: computed.total,
    status: 'open',
    line_items: computed.lineItems,
  }

  await persistOrThrow('Issue client bill', () => persistClientBill(bill))
  upsertBillInCache(bill)
  return bill
}

/** Send Payoneer payment request via Edge Function; stores reference on the bill. */
export async function sendPayoneerRequest(
  billId: string
): Promise<{ ok: boolean; reference?: string; error?: string }> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.functions.invoke('payoneer-request', {
    body: { billId },
  })

  if (error) return { ok: false, error: error.message }

  const result = data as { ok?: boolean; reference?: string; error?: string }
  if (!result?.ok || !result.reference) {
    return { ok: false, error: result?.error ?? 'Payoneer request failed' }
  }

  const bill = getBillById(billId)
  if (bill) {
    const updated = { ...bill, payoneer_reference: result.reference }
    upsertBillInCache(updated)
  }

  return { ok: true, reference: result.reference }
}

/** Mark a bill paid and unlock the client when appropriate. */
export async function markBillPaid(billId: string): Promise<ClientBill | undefined> {
  const bill = getBillById(billId)
  if (!bill) return undefined

  const now = new Date().toISOString()
  const updated: ClientBill = {
    ...bill,
    status: 'paid',
    paid_at: now,
    line_items: bill.line_items.map((li) => ({ ...li, status: 'paid' as const })),
  }

  await persistOrThrow('Mark bill paid', () => persistClientBill(updated))
  upsertBillInCache(updated)

  const client = getClientById(bill.client_id)
  if (client?.status === 'suspended') {
    const standing = getBillingStanding(client)
    if (standing !== 'locked') {
      await updateClient(client.id, { status: 'active' })
    }
  }

  return updated
}

/** Sync overdue status on open bills past due date. */
export function refreshOverdueBillStatuses(): void {
  const now = Date.now()
  billsCache = billsCache.map((bill) => {
    if (bill.status !== 'open') return bill
    if (new Date(bill.due_at).getTime() < now) {
      return { ...bill, status: 'overdue' }
    }
    return bill
  })
}

/** Return the A/R tier label for display. */
export function getArTierLabel(collectedVolume: number, factoring: boolean): string {
  const tier =
    AR_RATE_TIERS.find((t) => t.maxVolume == null || collectedVolume <= t.maxVolume) ??
    AR_RATE_TIERS[AR_RATE_TIERS.length - 1]
  const rate = factoring ? tier.factoringPct : tier.standardPct
  if (!Number.isFinite(rate)) return 'Custom (negotiated)'
  const maxLabel = tier.maxVolume == null ? '+' : `≤ $${(tier.maxVolume / 1000).toFixed(0)}k`
  return `${maxLabel} — ${rate}%`
}
