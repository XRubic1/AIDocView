import { getClientById, updateClient } from './clientRegistry'
import {
  formatBillingPeriod,
  resolveArRate,
  getClientCollectedVolume,
  parseBillingPeriod,
} from './arBillingService'
import { getInvoiceById } from '../data/mockInvoices'
import { getPaymentById } from '../data/mockPayments'
import { persistOrThrow } from './persistHelper'
import { isSupabaseConfigured, requireSupabase } from '../lib/supabase'
import type { BillingLineItem, BillingPeriod } from '../types/billing'
import type { Payment } from '../types/payment'
import { isShortPayment } from '../types/payment'
import type { ReimbursementAccountSummary, ReimbursementLedgerEntry } from '../types/reimbursement'
import {
  calculateShortPaymentFeeCredit,
  formatShortPaymentFeeCreditDescription,
} from '../utils/shortPaymentFeeCredit'

/** In-memory reimbursement ledger (hydrated from Supabase when configured). */
let ledgerCache: ReimbursementLedgerEntry[] = []

interface ReimbursementRow {
  id: string
  client_id: string
  payment_id: string
  parent_payment_id: string
  invoice_id: string
  invoice_number: string
  short_amount: number
  fee_rate_pct: number
  fee_credit_amount: number
  period: string
  status: 'applied' | 'pending'
  applied_to_bill_id: string | null
  applied_at: string | null
  created_at: string
}

function rowToEntry(row: ReimbursementRow): ReimbursementLedgerEntry {
  return {
    id: row.id,
    client_id: row.client_id,
    payment_id: row.payment_id,
    parent_payment_id: row.parent_payment_id,
    invoice_id: row.invoice_id,
    invoice_number: row.invoice_number,
    short_amount: Number(row.short_amount),
    fee_rate_pct: Number(row.fee_rate_pct),
    fee_credit_amount: Number(row.fee_credit_amount),
    period: row.period,
    status: row.status,
    applied_to_bill_id: row.applied_to_bill_id ?? undefined,
    applied_at: row.applied_at ?? undefined,
    created_at: row.created_at,
  }
}

function entryToRow(entry: ReimbursementLedgerEntry): ReimbursementRow {
  return {
    id: entry.id,
    client_id: entry.client_id,
    payment_id: entry.payment_id,
    parent_payment_id: entry.parent_payment_id,
    invoice_id: entry.invoice_id,
    invoice_number: entry.invoice_number,
    short_amount: entry.short_amount,
    fee_rate_pct: entry.fee_rate_pct,
    fee_credit_amount: entry.fee_credit_amount,
    period: entry.period,
    status: entry.status,
    applied_to_bill_id: entry.applied_to_bill_id ?? null,
    applied_at: entry.applied_at ?? null,
    created_at: entry.created_at,
  }
}

export function hydrateReimbursementLedger(entries: ReimbursementLedgerEntry[]): void {
  ledgerCache = [...entries]
}

export function clearReimbursementLedger(): void {
  ledgerCache = []
}

export function getReimbursementLedger(clientId?: string): ReimbursementLedgerEntry[] {
  const list = clientId ? ledgerCache.filter((e) => e.client_id === clientId) : [...ledgerCache]
  return list.sort((a, b) => b.created_at.localeCompare(a.created_at))
}

async function persistLedgerEntry(entry: ReimbursementLedgerEntry): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = requireSupabase()
  const { error } = await supabase.from('reimbursement_ledger').upsert(entryToRow(entry))
  if (error) throw new Error(error.message)
}

function periodFromIso(isoDate: string): string {
  const d = new Date(isoDate)
  return formatBillingPeriod({ year: d.getFullYear(), month: d.getMonth() + 1 })
}

function rateForPaymentConfirmation(clientId: string, confirmedAt: string): number {
  const client = getClientById(clientId)
  if (!client) return 0
  const period = parseBillingPeriod(periodFromIso(confirmedAt))
  const volume = getClientCollectedVolume(clientId, period)
  try {
    return resolveArRate(client, volume)
  } catch {
    return client.ar_rate_override ?? client.fee_terms?.fee_percentage ?? 0
  }
}

/**
 * Record fee credit when a short payment is confirmed.
 * Credits accrue on the client's reimbursement account until applied to a bill.
 */
export async function recordShortPaymentFeeReimbursement(
  shortPayment: Payment
): Promise<ReimbursementLedgerEntry | undefined> {
  if (!isShortPayment(shortPayment) || shortPayment.status !== 'confirmed') return undefined
  if (!shortPayment.parent_payment_id) return undefined

  const invoice = getInvoiceById(shortPayment.invoice_id)
  const parent = getPaymentById(shortPayment.parent_payment_id)
  if (!invoice || !parent) return undefined

  const client = getClientById(invoice.client_id)
  if (!client) return undefined

  const confirmedAt = shortPayment.confirmed_at ?? shortPayment.received_date
  const period = periodFromIso(confirmedAt)
  const ratePct = rateForPaymentConfirmation(client.id, confirmedAt)
  const feeCredit = calculateShortPaymentFeeCredit(shortPayment, parent, invoice, ratePct)
  if (feeCredit <= 0) return undefined

  const existing = ledgerCache.find((e) => e.payment_id === shortPayment.id)
  if (existing) return existing

  const now = new Date().toISOString()
  const entry: ReimbursementLedgerEntry = {
    id: `reimb-${shortPayment.id}`,
    client_id: client.id,
    payment_id: shortPayment.id,
    parent_payment_id: parent.id,
    invoice_id: invoice.id,
    invoice_number: invoice.invoice_number,
    short_amount: shortPayment.amount,
    fee_rate_pct: ratePct,
    fee_credit_amount: feeCredit,
    period,
    status: 'pending',
    created_at: now,
  }

  const pendingBalance = Math.round(((client.reimbursement_balance ?? 0) + feeCredit) * 100) / 100

  await persistOrThrow('reimbursement ledger', async () => {
    await persistLedgerEntry(entry)
    if (isSupabaseConfigured()) {
      const supabase = requireSupabase()
      await supabase
        .from('clients')
        .update({ reimbursement_balance: pendingBalance })
        .eq('id', client.id)
    }
  })

  ledgerCache = [entry, ...ledgerCache]
  updateClient(client.id, { reimbursement_balance: pendingBalance })
  return entry
}

/** Fee credit line items for a billing period (from confirmed short payments). */
export function getShortPaymentFeeCreditsForPeriod(
  clientId: string,
  period: BillingPeriod
): BillingLineItem[] {
  const periodKey = formatBillingPeriod(period)
  return ledgerCache
    .filter((e) => e.client_id === clientId && e.period === periodKey)
    .map((e) => ({
      id: `spfc-${e.id}`,
      date: e.created_at.split('T')[0],
      description: formatShortPaymentFeeCreditDescription(
        e.invoice_number,
        e.short_amount,
        e.fee_credit_amount
      ),
      amount: -e.fee_credit_amount,
      status: 'pending' as const,
    }))
}

export function getReimbursementAccountSummary(clientId: string): ReimbursementAccountSummary {
  const entries = getReimbursementLedger(clientId)
  const client = getClientById(clientId)
  const pending_balance = client?.reimbursement_balance ?? 0
  const applied_total = entries
    .filter((e) => e.status === 'applied')
    .reduce((sum, e) => sum + e.fee_credit_amount, 0)

  return { pending_balance, applied_total, entries }
}

/** Invoice-level fee credits for a billing period report. */
export function getReimbursementReportForPeriod(
  clientId: string,
  period: BillingPeriod
): {
  feeCredits: ReimbursementLedgerEntry[]
  pendingOnAccount: number
} {
  const periodKey = formatBillingPeriod(period)
  const feeCredits = ledgerCache.filter(
    (e) => e.client_id === clientId && e.period === periodKey
  )
  const client = getClientById(clientId)
  return {
    feeCredits,
    pendingOnAccount: client?.reimbursement_balance ?? 0,
  }
}

export async function hydrateReimbursementLedgerFromSupabase(clientId?: string): Promise<void> {
  const supabase = requireSupabase()
  let query = supabase.from('reimbursement_ledger').select('*').order('created_at', { ascending: false })
  if (clientId) query = query.eq('client_id', clientId)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as ReimbursementRow[]
  if (clientId) {
    ledgerCache = [
      ...ledgerCache.filter((e) => e.client_id !== clientId),
      ...rows.map(rowToEntry),
    ]
  } else {
    hydrateReimbursementLedger(rows.map(rowToEntry))
  }
}
