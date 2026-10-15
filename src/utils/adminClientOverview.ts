/**
 * Per-client rollup for the admin dashboard.
 * One row per carrier: A/R exposure, collections, open work, and setup gaps.
 */
import type { Client } from '../types/client'
import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import type { ClientWorkSeverity, ClientWorkSummary } from './clientWorkQueue'
import { getInvoiceAgeDays, isOpenArInvoice } from './invoiceAging'
import { getInvoiceOpenArBalance } from './paymentVariance'

export type ClientHealth = 'at_risk' | 'watch' | 'healthy' | 'idle'

export type ClientSetupGap = 'remittance' | 'fee_terms' | 'contact' | 'mc_number'

export type AdminClientRow = {
  clientId: string
  name: string
  tier: Client['service_tier']
  status: NonNullable<Client['status']>
  subscription?: string
  openAr: number
  openInvoices: number
  /** Open balance on invoices aged 31+ days. */
  overdueAr: number
  /** Open balance on invoices aged 61+ days. */
  severeAr: number
  overduePct: number
  collected30d: number
  holds: number
  disputes: number
  workOpen: number
  workSeverity: ClientWorkSeverity | null
  nextWork: string
  lastActivityAt: string
  setupGaps: ClientSetupGap[]
  health: ClientHealth
}

export type AdminClientTotals = {
  clients: number
  activeClients: number
  managed: number
  selfService: number
  openAr: number
  openInvoices: number
  overdueAr: number
  severeAr: number
  collected30d: number
  collectedPrev30d: number
  health: Record<ClientHealth, number>
  setupIncomplete: number
}

export const SETUP_GAP_LABEL: Record<ClientSetupGap, string> = {
  remittance: 'Remittance / bank info',
  fee_terms: 'Fee terms',
  contact: 'Contact email',
  mc_number: 'MC number',
}

const DAY_MS = 24 * 60 * 60 * 1000
const COLLECTED_STATUSES: Payment['status'][] = ['confirmed', 'awaiting_receipt']

function laterIso(a: string, b?: string | null): string {
  if (!b) return a
  if (!a) return b
  return new Date(b).getTime() > new Date(a).getTime() ? b : a
}

function setupGapsFor(client: Client): ClientSetupGap[] {
  const gaps: ClientSetupGap[] = []
  const hasRemit =
    Boolean(client.remittance_info?.trim()) ||
    (Boolean(client.bank_name?.trim()) && Boolean(client.routing_number?.trim()))
  if (!hasRemit) gaps.push('remittance')
  const fee = client.fee_terms
  const hasFee =
    fee?.fee_type === 'flat' ? (fee.flat_fee_amount ?? 0) > 0 : (fee?.fee_percentage ?? 0) > 0
  if (!hasFee) gaps.push('fee_terms')
  if (!client.email?.trim()) gaps.push('contact')
  if (!client.mc_number?.trim()) gaps.push('mc_number')
  return gaps
}

function healthFor(row: Omit<AdminClientRow, 'health'>): ClientHealth {
  if (row.openInvoices === 0 && row.workOpen === 0) return 'idle'
  if (
    row.workSeverity === 'critical' ||
    row.disputes > 0 ||
    row.overduePct >= 40 ||
    row.severeAr > 0
  ) {
    return 'at_risk'
  }
  if (row.workSeverity === 'high' || row.overduePct >= 15 || row.holds > 0) return 'watch'
  return 'healthy'
}

export function buildAdminClientOverview(input: {
  clients: Client[]
  invoices: Invoice[]
  payments: Payment[]
  workSummaries: ClientWorkSummary[]
  asOf?: Date
}): { rows: AdminClientRow[]; totals: AdminClientTotals } {
  const asOf = input.asOf ?? new Date()
  const now = asOf.getTime()
  const workByClient = new Map(input.workSummaries.map((w) => [w.clientId, w]))
  const invoiceById = new Map(input.invoices.map((inv) => [inv.id, inv]))

  const paymentsByInvoice = new Map<string, Payment[]>()
  for (const payment of input.payments) {
    const list = paymentsByInvoice.get(payment.invoice_id)
    if (list) list.push(payment)
    else paymentsByInvoice.set(payment.invoice_id, [payment])
  }

  type Acc = {
    openAr: number
    openInvoices: number
    overdueAr: number
    severeAr: number
    collected30d: number
    holds: number
    lastActivityAt: string
  }
  const acc = new Map<string, Acc>()
  const bucket = (clientId: string): Acc => {
    let row = acc.get(clientId)
    if (!row) {
      row = {
        openAr: 0,
        openInvoices: 0,
        overdueAr: 0,
        severeAr: 0,
        collected30d: 0,
        holds: 0,
        lastActivityAt: '',
      }
      acc.set(clientId, row)
    }
    return row
  }

  for (const inv of input.invoices) {
    const row = bucket(inv.client_id)
    row.lastActivityAt = laterIso(row.lastActivityAt, inv.updated_at || inv.created_at)
    if (inv.status === 'hold') row.holds += 1
    if (!isOpenArInvoice(inv)) continue
    const balance = getInvoiceOpenArBalance(inv, paymentsByInvoice.get(inv.id) ?? [])
    if (balance <= 0) continue
    const age = getInvoiceAgeDays(inv, asOf)
    row.openAr += balance
    row.openInvoices += 1
    if (age > 30) row.overdueAr += balance
    if (age > 60) row.severeAr += balance
  }

  let collected30d = 0
  let collectedPrev30d = 0
  for (const payment of input.payments) {
    if (!COLLECTED_STATUSES.includes(payment.status)) continue
    const dateStr = payment.received_date || payment.payment_date
    if (!dateStr) continue
    const ageMs = now - new Date(dateStr).getTime()
    if (ageMs < 0 || ageMs > 60 * DAY_MS) continue
    const inv = invoiceById.get(payment.invoice_id)
    if (ageMs <= 30 * DAY_MS) {
      collected30d += payment.amount
      if (inv) bucket(inv.client_id).collected30d += payment.amount
    } else {
      collectedPrev30d += payment.amount
    }
    if (inv) {
      const row = bucket(inv.client_id)
      row.lastActivityAt = laterIso(row.lastActivityAt, dateStr)
    }
  }

  const rows: AdminClientRow[] = input.clients.map((client) => {
    const a = acc.get(client.id)
    const work = workByClient.get(client.id)
    const openAr = a?.openAr ?? 0
    const overdueAr = a?.overdueAr ?? 0
    const base: Omit<AdminClientRow, 'health'> = {
      clientId: client.id,
      name: client.name,
      tier: client.service_tier,
      status: client.status ?? 'active',
      subscription: client.billing?.subscription_status,
      openAr,
      openInvoices: a?.openInvoices ?? 0,
      overdueAr,
      severeAr: a?.severeAr ?? 0,
      overduePct: openAr > 0 ? Math.round((overdueAr / openAr) * 100) : 0,
      collected30d: a?.collected30d ?? 0,
      holds: a?.holds ?? 0,
      disputes: work?.disputes ?? 0,
      workOpen: work?.totalOpen ?? 0,
      workSeverity: work && work.totalOpen > 0 ? work.severity : null,
      nextWork: work?.nextDueLabel ?? '—',
      lastActivityAt: laterIso(a?.lastActivityAt ?? '', work?.newestActivityAt),
      setupGaps: setupGapsFor(client),
    }
    return { ...base, health: healthFor(base) }
  })

  const health: Record<ClientHealth, number> = { at_risk: 0, watch: 0, healthy: 0, idle: 0 }
  for (const row of rows) health[row.health] += 1

  const totals: AdminClientTotals = {
    clients: rows.length,
    activeClients: rows.filter((r) => r.status === 'active').length,
    managed: rows.filter((r) => r.tier === 'managed').length,
    selfService: rows.filter((r) => r.tier !== 'managed').length,
    openAr: rows.reduce((s, r) => s + r.openAr, 0),
    openInvoices: rows.reduce((s, r) => s + r.openInvoices, 0),
    overdueAr: rows.reduce((s, r) => s + r.overdueAr, 0),
    severeAr: rows.reduce((s, r) => s + r.severeAr, 0),
    collected30d,
    collectedPrev30d,
    health,
    setupIncomplete: rows.filter((r) => r.setupGaps.length > 0).length,
  }

  return { rows, totals }
}

const HEALTH_RANK: Record<ClientHealth, number> = { at_risk: 0, watch: 1, healthy: 2, idle: 3 }

export type AdminClientSort = 'attention' | 'open_ar' | 'overdue' | 'name'

export function sortAdminClientRows(rows: AdminClientRow[], sort: AdminClientSort): AdminClientRow[] {
  const copy = [...rows]
  switch (sort) {
    case 'open_ar':
      return copy.sort((a, b) => b.openAr - a.openAr)
    case 'overdue':
      return copy.sort((a, b) => b.overdueAr - a.overdueAr || b.overduePct - a.overduePct)
    case 'name':
      return copy.sort((a, b) => a.name.localeCompare(b.name))
    case 'attention':
    default:
      return copy.sort(
        (a, b) =>
          HEALTH_RANK[a.health] - HEALTH_RANK[b.health] ||
          b.workOpen - a.workOpen ||
          b.overdueAr - a.overdueAr ||
          b.openAr - a.openAr
      )
  }
}
