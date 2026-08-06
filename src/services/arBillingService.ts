import {
  BILL_LOCK_AFTER_DAYS,
  BILL_PAYMENT_TERMS_DAYS,
  BILL_REMINDER_DAYS,
  BILL_WARNING_DAYS,
  PLATFORM_APP_FEE_MONTHLY,
} from '../config/arBillingRates'
import { mockInvoices, getInvoiceById } from '../data/mockInvoices'
import { mockPayments } from '../data/mockPayments'
import { getBatchById } from '../data/mockBatches'
import { getEffectivePaymentAmount } from '../utils/paymentVariance'
import {
  feeAmountForPayment,
  formatFeeTermsLabel,
  resolveInvoiceFeeTerms,
} from '../utils/feeTermsLock'
import {
  getShortPaymentFeeCreditsForPeriod,
  markCreditsAppliedToBill,
} from './reimbursementAccountService'
import { getSupabase, isSupabaseConfigured, requireSupabase } from '../lib/supabase'
import { updateClient, getClientById } from './clientRegistry'
import { persistOrThrow } from './persistHelper'
import { logAuditEvent } from '../utils/auditLogger'
import type {
  BillHistoryEvent,
  BillingFeeTermsSnapshot,
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
  fee_terms_snapshot?: BillingFeeTermsSnapshot | null
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

/** Snapshot current client fee terms for locking onto an issued bill. */
export function snapshotClientFeeTerms(client: Client | undefined): BillingFeeTermsSnapshot | undefined {
  const terms = client?.fee_terms
  if (!terms?.fee_type) return undefined
  return {
    fee_type: terms.fee_type,
    fee_percentage: terms.fee_percentage,
    flat_fee_amount: terms.flat_fee_amount,
  }
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
    fee_terms_snapshot: row.fee_terms_snapshot ?? undefined,
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
    fee_terms_snapshot: bill.fee_terms_snapshot ?? null,
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

/** Count distinct invoices with confirmed payments in the billing period. */
export function countInvoicesCollectedInPeriod(clientId: string, period: BillingPeriod): number {
  const invoiceIds = invoiceIdsForClient(clientId)
  const collected = new Set<string>()
  for (const p of mockPayments) {
    if (!invoiceIds.has(p.invoice_id) || p.status !== 'confirmed') continue
    if (!isDateInPeriod(p.confirmed_at ?? p.received_date, period)) continue
    collected.add(p.invoice_id)
  }
  return collected.size
}

export interface ResolvedClientFee {
  feeType: 'percentage' | 'flat'
  /** Percentage rate when fee_type is percentage; 0 for flat. */
  ratePct: number
  /** Collection fee for the period (before trial waiver / credits). */
  fee: number
  /** Short label for tables (e.g. "2.5%" or "$50 flat"). */
  displayRate: string
  /** Line-item description fragment. */
  feeDescription: string
}

/**
 * Resolve period collection fee from each payment's invoice/batch lock when present
 * (processed batches), otherwise the carrier's live Fee Terms.
 */
export function resolveClientCollectionFee(
  client: Client,
  collectedVolume: number,
  period: BillingPeriod
): ResolvedClientFee {
  const invoiceIds = invoiceIdsForClient(client.id)
  let fee = 0
  let trialVolume = 0
  const rateLabels = new Set<string>()
  const flatChargedInvoiceIds = new Set<string>()
  let sawPayment = false

  for (const p of mockPayments) {
    if (!invoiceIds.has(p.invoice_id) || p.status !== 'confirmed') continue
    if (!isDateInPeriod(p.confirmed_at ?? p.received_date, period)) continue

    const inv = getInvoiceById(p.invoice_id)
    if (!inv) continue
    sawPayment = true
    const batch = inv.batch_id ? getBatchById(inv.batch_id) : undefined
    const terms = resolveInvoiceFeeTerms(inv, batch, client)
    const paymentAmt = getEffectivePaymentAmount(p)

    if (!terms) {
      throw new Error(`Fee terms not found for invoice ${inv.invoice_number} (${client.name})`)
    }

    if (terms.billing_mode === 'trial') {
      trialVolume += paymentAmt
      rateLabels.add('Trial')
      continue
    }

    rateLabels.add(formatFeeTermsLabel(terms))

    if (terms.fee_type === 'flat') {
      if (flatChargedInvoiceIds.has(inv.id)) continue
      flatChargedInvoiceIds.add(inv.id)
      fee += feeAmountForPayment(paymentAmt, terms)
    } else {
      fee += feeAmountForPayment(paymentAmt, terms)
    }
  }

  // No collections in period — still validate live client terms exist for the UI.
  if (!sawPayment) {
    if (!client.fee_terms?.fee_type) {
      throw new Error(`Fee terms not configured for ${client.name}`)
    }
    const terms = client.fee_terms
    if (terms.fee_type === 'flat') {
      return {
        feeType: 'flat',
        ratePct: 0,
        fee: 0,
        displayRate: `$${Number(terms.flat_fee_amount ?? 0).toFixed(2)} flat`,
        feeDescription: `Collection fee — $0 (no invoices collected)`,
      }
    }
    return {
      feeType: 'percentage',
      ratePct: terms.fee_percentage ?? 0,
      fee: 0,
      displayRate: `${terms.fee_percentage ?? 0}%`,
      feeDescription: `Collection fee — ${terms.fee_percentage ?? 0}% of $0 collected`,
    }
  }

  fee = Math.round(fee * 100) / 100
  const displayRate =
    rateLabels.size === 0 ? '—' : rateLabels.size === 1 ? [...rateLabels][0]! : 'Mixed'
  const feeType: 'percentage' | 'flat' =
    [...rateLabels].every((l) => l.includes('flat')) && rateLabels.size > 0
      ? 'flat'
      : 'percentage'

  let ratePct = 0
  if (rateLabels.size === 1) {
    const only = [...rateLabels][0]!
    const m = only.match(/^([\d.]+)%$/)
    if (m) ratePct = Number(m[1])
  }

  const trialNote =
    trialVolume > 0
      ? ` (${formatVolume(trialVolume)} collected under trial — not charged)`
      : ''

  return {
    feeType,
    ratePct,
    fee,
    displayRate,
    feeDescription:
      feeType === 'flat' && rateLabels.size === 1
        ? `Collection fee — ${displayRate} × ${flatChargedInvoiceIds.size} invoice(s) collected${trialNote}`
        : `Collection fee — ${displayRate} of ${formatVolume(collectedVolume)} collected${trialNote}`,
  }
}

/** @deprecated Use resolveClientCollectionFee — kept for call-site migration. */
export function resolveArRate(client: Client, _collectedVolume?: number): number {
  const terms = client.fee_terms
  if (terms?.fee_type === 'percentage' && terms.fee_percentage) return terms.fee_percentage
  if (terms?.fee_type === 'flat') return 0
  throw new Error(`Fee terms not configured for ${client.name}`)
}

function isTrialClient(client: Client): boolean {
  return client.billing?.subscription_status === 'trial'
}

function getForceCloseAdjustments(
  clientId: string,
  period: BillingPeriod,
  client: Client
): BillingLineItem[] {
  const periodLabel = formatBillingPeriod(period)
  return mockInvoices
    .filter((inv) => inv.client_id === clientId && inv.status === 'force_closed')
    .filter((inv) => isDateInPeriod(inv.updated_at, period))
    .map((inv) => {
      const batch = inv.batch_id ? getBatchById(inv.batch_id) : undefined
      const terms = resolveInvoiceFeeTerms(inv, batch, client)
      let amount = 0
      let detail = 'no fee terms'
      if (terms?.billing_mode === 'trial') {
        amount = 0
        detail = 'trial — waived'
      } else if (terms?.fee_type === 'flat' && terms.flat_fee_amount) {
        amount = terms.flat_fee_amount
        detail = `$${terms.flat_fee_amount} flat`
      } else if (terms?.fee_percentage) {
        amount = (terms.fee_percentage / 100) * inv.amount
        detail = `${terms.fee_percentage}% of invoice`
      }
      return {
        id: `fc-${inv.id}`,
        date: inv.updated_at?.split('T')[0] ?? periodLabel,
        description: `Force-close fee — ${inv.invoice_number} (${detail})`,
        amount,
        status: 'pending' as const,
      }
    })
    .filter((li) => li.amount > 0)
}

/** Compute monthly bill breakdown for a client and period. */
export function computeMonthlyBill(clientId: string, period: BillingPeriod): ComputedMonthlyBill {
  const client = getClientById(clientId)
  if (!client) {
    throw new Error(`Client not found: ${clientId}`)
  }

  const collectedVolume = getClientCollectedVolume(clientId, period)
  const resolved = resolveClientCollectionFee(client, collectedVolume, period)
  const trial = isTrialClient(client)

  // Always compute gross fees so the UI can show what would be charged.
  const grossAppFee = PLATFORM_APP_FEE_MONTHLY
  const grossArFee = resolved.fee
  const adjustments = [...getForceCloseAdjustments(clientId, period, client)]
  const adjustmentTotal = adjustments.reduce((sum, a) => sum + a.amount, 0)
  const grossSubtotal = grossAppFee + grossArFee + adjustmentTotal

  // Trial clients are not charged; active clients pay the full gross.
  const appFee = trial ? 0 : grossAppFee
  const arFee = trial ? 0 : grossArFee
  const chargedAdjustments = trial ? [] : adjustments
  const chargedAdjustmentTotal = trial ? 0 : adjustmentTotal

  const reimbursementCredits = getShortPaymentFeeCreditsForPeriod(clientId, period)
  const reimbursementBalance = client.reimbursement_balance ?? 0

  const periodLabel = formatBillingPeriod(period)
  const lineItems: BillingLineItem[] = []

  lineItems.push({
    id: `app-${periodLabel}`,
    date: periodLabel,
    description: 'Platform subscription',
    amount: grossAppFee,
    status: 'pending',
  })

  if (grossArFee > 0 || collectedVolume > 0 || resolved.feeType === 'flat') {
    lineItems.push({
      id: `fee-${periodLabel}`,
      date: periodLabel,
      description: resolved.feeDescription,
      amount: Math.round(grossArFee * 100) / 100,
      status: 'pending',
    })
  }

  for (const adj of chargedAdjustments) {
    lineItems.push(adj)
  }

  if (trial && grossSubtotal > 0) {
    lineItems.push({
      id: `trial-waiver-${periodLabel}`,
      date: periodLabel,
      description: 'Trial — fees waived (not charged while on trial)',
      amount: -Math.round(grossSubtotal * 100) / 100,
      status: 'pending',
    })
  }

  const chargedSubtotal = appFee + arFee + chargedAdjustmentTotal
  const total = Math.max(0, chargedSubtotal - reimbursementBalance)

  if (reimbursementCredits.length > 0) {
    lineItems.push(...reimbursementCredits)
  }
  if (reimbursementBalance > 0 && chargedSubtotal > 0) {
    lineItems.push({
      id: `reimb-acct-${clientId}-${periodLabel}`,
      date: periodLabel,
      description: `Credit on account applied (${formatVolume(reimbursementBalance)} available)`,
      amount: -Math.min(reimbursementBalance, chargedSubtotal),
      status: 'pending',
    })
  }

  return {
    appFee,
    collectedVolume,
    ratePct: resolved.ratePct,
    arFee,
    adjustments: chargedAdjustments,
    total,
    lineItems,
    reimbursementCredits,
    reimbursementBalance,
    isTrial: trial,
    grossSubtotal: Math.round(grossSubtotal * 100) / 100,
    feeDisplay: resolved.displayRate,
    feeType: resolved.feeType,
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
    // Lock rate at issue so later Fee Terms edits do not change clawbacks.
    fee_terms_snapshot: snapshotClientFeeTerms(client),
  }

  await persistOrThrow('Issue client bill', () => persistClientBill(bill))
  upsertBillInCache(bill)

  if (appliedFromAccount > 0) {
    await markCreditsAppliedToBill(clientId, bill.id, appliedFromAccount)
  }

  return bill
}

/** Build a readable payment / lifecycle timeline for a bill. */
export function getBillHistoryEvents(bill: ClientBill): BillHistoryEvent[] {
  const events: BillHistoryEvent[] = [
    {
      id: `${bill.id}-issued`,
      type: 'issued',
      label: 'Invoice issued',
      at: bill.issued_at,
      amount: bill.amount,
      detail: `Period ${bill.period} · due ${bill.due_at.slice(0, 10)}`,
    },
  ]

  if (bill.payoneer_reference) {
    events.push({
      id: `${bill.id}-payoneer`,
      type: 'payoneer_sent',
      label: 'Payoneer payment request',
      at: bill.issued_at,
      detail: bill.payoneer_reference,
    })
  }

  if (bill.status === 'overdue') {
    events.push({
      id: `${bill.id}-overdue`,
      type: 'overdue',
      label: 'Marked overdue',
      at: bill.due_at,
    })
  }

  if (bill.paid_at) {
    events.push({
      id: `${bill.id}-paid`,
      type: 'paid',
      label: 'Payment received',
      at: bill.paid_at,
      amount: bill.amount,
    })
  }

  return events.sort((a, b) => a.at.localeCompare(b.at))
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
      logAuditEvent(
        'account_unlocked',
        'client',
        client.id,
        client.name,
        `Account unlocked after bill ${bill.id} marked paid`,
        'admin',
        'Admin',
        'Admin'
      )
    }
  }

  logAuditEvent(
    'payment_received',
    'client',
    bill.client_id,
    client?.name ?? bill.client_id,
    `Bill ${bill.period} marked paid`,
    'admin',
    'Admin',
    'Admin'
  )

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


