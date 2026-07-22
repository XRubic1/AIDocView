import { getClientById, updateClient } from './clientRegistry'
import { formatBillingPeriod, resolveArRate } from './arBillingService'
import { getInvoiceById, mockInvoices } from '../data/mockInvoices'
import { getPaymentById } from '../data/mockPayments'
import { persistOrThrow } from './persistHelper'
import { isSupabaseConfigured, requireSupabase } from '../lib/supabase'
import type { BillingLineItem, BillingPeriod } from '../types/billing'
import type { Payment } from '../types/payment'
import { isShortPayment } from '../types/payment'
import type {
  ManualBillingCreditInput,
  ReimbursementAccountSummary,
  ReimbursementCreditType,
  ReimbursementLedgerEntry,
} from '../types/reimbursement'
import {
  calculateShortPaymentFeeCredit,
  formatShortPaymentFeeCreditDescription,
  getPaymentAttributedFee,
} from '../utils/shortPaymentFeeCredit'

/** In-memory reimbursement ledger (hydrated from Supabase when configured). */
let ledgerCache: ReimbursementLedgerEntry[] = []

interface ReimbursementRow {
  id: string
  client_id: string
  payment_id: string | null
  parent_payment_id: string | null
  invoice_id: string | null
  invoice_number: string | null
  short_amount: number | null
  fee_rate_pct: number | null
  fee_credit_amount: number
  period: string
  credit_type: ReimbursementCreditType | null
  reason: string | null
  note: string | null
  created_by: string | null
  status: 'applied' | 'pending' | 'voided'
  applied_to_bill_id: string | null
  applied_at: string | null
  voided_at: string | null
  voided_by: string | null
  void_reason: string | null
  created_at: string
}

function rowToEntry(row: ReimbursementRow): ReimbursementLedgerEntry {
  return {
    id: row.id,
    client_id: row.client_id,
    payment_id: row.payment_id ?? undefined,
    parent_payment_id: row.parent_payment_id ?? undefined,
    invoice_id: row.invoice_id ?? undefined,
    invoice_number: row.invoice_number ?? undefined,
    short_amount: row.short_amount != null ? Number(row.short_amount) : undefined,
    fee_rate_pct: row.fee_rate_pct != null ? Number(row.fee_rate_pct) : undefined,
    fee_credit_amount: Number(row.fee_credit_amount),
    period: row.period,
    credit_type: row.credit_type ?? 'short_payment',
    reason: row.reason ?? undefined,
    note: row.note ?? undefined,
    created_by: row.created_by ?? undefined,
    status: row.status,
    applied_to_bill_id: row.applied_to_bill_id ?? undefined,
    applied_at: row.applied_at ?? undefined,
    voided_at: row.voided_at ?? undefined,
    voided_by: row.voided_by ?? undefined,
    void_reason: row.void_reason ?? undefined,
    created_at: row.created_at,
  }
}

function entryToRow(entry: ReimbursementLedgerEntry): ReimbursementRow {
  return {
    id: entry.id,
    client_id: entry.client_id,
    payment_id: entry.payment_id ?? null,
    parent_payment_id: entry.parent_payment_id ?? null,
    invoice_id: entry.invoice_id ?? null,
    invoice_number: entry.invoice_number ?? null,
    short_amount: entry.short_amount ?? null,
    fee_rate_pct: entry.fee_rate_pct ?? null,
    fee_credit_amount: entry.fee_credit_amount,
    period: entry.period,
    credit_type: entry.credit_type,
    reason: entry.reason ?? null,
    note: entry.note ?? null,
    created_by: entry.created_by ?? null,
    status: entry.status,
    applied_to_bill_id: entry.applied_to_bill_id ?? null,
    applied_at: entry.applied_at ?? null,
    voided_at: entry.voided_at ?? null,
    voided_by: entry.voided_by ?? null,
    void_reason: entry.void_reason ?? null,
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

async function persistLedgerEntries(entries: ReimbursementLedgerEntry[]): Promise<void> {
  if (!isSupabaseConfigured() || entries.length === 0) return
  const supabase = requireSupabase()
  const { error } = await supabase.from('reimbursement_ledger').upsert(entries.map(entryToRow))
  if (error) throw new Error(error.message)
}

function periodFromIso(isoDate: string): string {
  const d = new Date(isoDate)
  return formatBillingPeriod({ year: d.getFullYear(), month: d.getMonth() + 1 })
}

function rateForPaymentConfirmation(clientId: string, _confirmedAt: string): number {
  const client = getClientById(clientId)
  if (!client) return 0
  try {
    return resolveArRate(client)
  } catch {
    return client.fee_terms?.fee_percentage ?? 0
  }
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
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
    credit_type: 'short_payment',
    status: 'pending',
    created_at: now,
  }

  const pendingBalance = roundMoney((client.reimbursement_balance ?? 0) + feeCredit)

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
  await updateClient(client.id, { reimbursement_balance: pendingBalance })
  return entry
}

/**
 * Admin discount / invoice-fee reimbursement.
 * Amount is held on the reimbursement account and deducted from the next issued bill
 * (bill total floors at $0 — unused credit carries forward).
 */
export async function recordManualBillingCredit(
  input: ManualBillingCreditInput
): Promise<ReimbursementLedgerEntry> {
  const amount = roundMoney(input.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Credit amount must be greater than zero')
  }
  const reason = input.reason.trim()
  if (!reason) {
    throw new Error('A reason is required for billing credits')
  }

  const client = getClientById(input.clientId)
  if (!client) throw new Error(`Client not found: ${input.clientId}`)

  let invoiceId = input.invoiceId
  let invoiceNumber = input.invoiceNumber
  if (invoiceId && !invoiceNumber) {
    const inv = getInvoiceById(invoiceId)
    invoiceNumber = inv?.invoice_number
  }

  const now = new Date().toISOString()
  const period = periodFromIso(now)
  const entry: ReimbursementLedgerEntry = {
    id: `credit-${input.clientId}-${Date.now().toString(36)}`,
    client_id: input.clientId,
    payment_id: input.paymentId,
    invoice_id: invoiceId,
    invoice_number: invoiceNumber,
    fee_credit_amount: amount,
    period,
    credit_type: input.creditType,
    reason,
    note: input.note?.trim() || undefined,
    created_by: input.createdBy,
    status: 'pending',
    created_at: now,
  }

  const pendingBalance = roundMoney((client.reimbursement_balance ?? 0) + amount)

  await persistOrThrow('manual billing credit', async () => {
    await persistLedgerEntry(entry)
    if (isSupabaseConfigured()) {
      const supabase = requireSupabase()
      const { error } = await supabase
        .from('clients')
        .update({ reimbursement_balance: pendingBalance })
        .eq('id', client.id)
      if (error) throw new Error(error.message)
    }
  })

  ledgerCache = [entry, ...ledgerCache]
  await updateClient(client.id, { reimbursement_balance: pendingBalance })
  return entry
}

/**
 * Void a pending credit/discount on the client's reimbursement account.
 * Applied credits cannot be voided (they already reduced an issued invoice).
 */
export async function voidBillingCredit(
  entryId: string,
  options?: { voidedBy?: string; reason?: string }
): Promise<ReimbursementLedgerEntry> {
  const entry = ledgerCache.find((e) => e.id === entryId)
  if (!entry) throw new Error('Credit not found')
  if (entry.status === 'voided') return entry
  if (entry.status === 'applied') {
    throw new Error('This credit was already applied to an invoice and cannot be voided')
  }

  const client = getClientById(entry.client_id)
  if (!client) throw new Error(`Client not found: ${entry.client_id}`)

  const now = new Date().toISOString()
  const voided: ReimbursementLedgerEntry = {
    ...entry,
    status: 'voided',
    voided_at: now,
    voided_by: options?.voidedBy,
    void_reason: options?.reason?.trim() || undefined,
  }

  const newBalance = Math.max(
    0,
    roundMoney((client.reimbursement_balance ?? 0) - entry.fee_credit_amount)
  )

  await persistOrThrow('void billing credit', async () => {
    await persistLedgerEntry(voided)
    if (isSupabaseConfigured()) {
      const supabase = requireSupabase()
      const { error } = await supabase
        .from('clients')
        .update({ reimbursement_balance: newBalance })
        .eq('id', client.id)
      if (error) throw new Error(error.message)
    }
  })

  ledgerCache = ledgerCache.map((e) => (e.id === entryId ? voided : e))
  await updateClient(client.id, { reimbursement_balance: newBalance })
  return voided
}

/**
 * Mark pending ledger credits as applied when a bill consumes reimbursement balance.
 * Consumes oldest pending credits first up to `appliedAmount`.
 * Partially consumed credits are split so leftover stays pending for a later bill.
 */
export async function markCreditsAppliedToBill(
  clientId: string,
  billId: string,
  appliedAmount: number
): Promise<void> {
  const amount = roundMoney(appliedAmount)
  if (amount <= 0) return

  const pending = ledgerCache
    .filter((e) => e.client_id === clientId && e.status === 'pending')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))

  let remaining = amount
  const now = new Date().toISOString()
  const upserts: ReimbursementLedgerEntry[] = []
  const removeIds = new Set<string>()

  for (const entry of pending) {
    if (remaining <= 0) break

    if (entry.fee_credit_amount <= remaining + 0.001) {
      upserts.push({
        ...entry,
        status: 'applied',
        applied_to_bill_id: billId,
        applied_at: now,
      })
      remaining = roundMoney(remaining - entry.fee_credit_amount)
      continue
    }

    // Split: apply what the bill can use; leave remainder pending.
    const appliedSlice = remaining
    const leftover = roundMoney(entry.fee_credit_amount - appliedSlice)
    upserts.push({
      ...entry,
      fee_credit_amount: appliedSlice,
      status: 'applied',
      applied_to_bill_id: billId,
      applied_at: now,
    })
    upserts.push({
      ...entry,
      id: `${entry.id}-carry`,
      fee_credit_amount: leftover,
      status: 'pending',
      applied_to_bill_id: undefined,
      applied_at: undefined,
      created_at: entry.created_at,
    })
    removeIds.add(entry.id)
    remaining = 0
  }

  if (upserts.length === 0) return

  await persistOrThrow('mark credits applied', () => persistLedgerEntries(upserts))

  const byId = new Map(upserts.map((e) => [e.id, e]))
  ledgerCache = [
    ...ledgerCache.filter((e) => !removeIds.has(e.id) && !byId.has(e.id)),
    ...upserts,
  ]
}

/** Suggested fee credit for an invoice from client fee_terms. */
export function suggestInvoiceFeeCredit(clientId: string, invoiceId: string): number {
  const invoice = getInvoiceById(invoiceId)
  if (!invoice || invoice.client_id !== clientId) return 0

  const client = getClientById(clientId)
  if (!client?.fee_terms) return 0

  if (client.fee_terms.fee_type === 'flat' && client.fee_terms.flat_fee_amount) {
    return Math.round(client.fee_terms.flat_fee_amount * 100) / 100
  }

  const ratePct = client.fee_terms.fee_percentage ?? 0
  return getPaymentAttributedFee(invoice.amount, ratePct)
}

/** Client invoices available for linking a reimbursement credit. */
export function getClientInvoicesForCredit(clientId: string) {
  return mockInvoices
    .filter((inv) => inv.client_id === clientId)
    .slice()
    .sort((a, b) => (b.invoice_date ?? '').localeCompare(a.invoice_date ?? ''))
}

/** Fee credit line items for a billing period (from confirmed short payments + manual credits). */
export function getShortPaymentFeeCreditsForPeriod(
  clientId: string,
  period: BillingPeriod
): BillingLineItem[] {
  const periodKey = formatBillingPeriod(period)
  return ledgerCache
    .filter((e) => e.client_id === clientId && e.period === periodKey && e.status !== 'voided')
    .map((e) => {
      if (e.credit_type === 'short_payment' && e.invoice_number && e.short_amount != null) {
        return {
          id: `spfc-${e.id}`,
          date: e.created_at.split('T')[0],
          description: formatShortPaymentFeeCreditDescription(
            e.invoice_number,
            e.short_amount,
            e.fee_credit_amount
          ),
          amount: -e.fee_credit_amount,
          status: 'pending' as const,
        }
      }

      const label =
        e.credit_type === 'invoice_fee_reimbursement'
          ? `Invoice fee reimbursement${e.invoice_number ? ` — ${e.invoice_number}` : ''}`
          : e.credit_type === 'reversal_fee_reimbursement'
            ? `Reversal fee reimbursement${e.invoice_number ? ` — ${e.invoice_number}` : ''}`
            : `Billing discount${e.reason ? ` — ${e.reason}` : ''}`

      return {
        id: `credit-${e.id}`,
        date: e.created_at.split('T')[0],
        description: e.reason ? `${label}: ${e.reason}` : label,
        amount: -e.fee_credit_amount,
        status: 'pending' as const,
      }
    })
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
  if (!isSupabaseConfigured()) return
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
