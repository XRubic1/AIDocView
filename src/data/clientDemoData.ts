import type { ClientDashboardData } from '../types/clientDashboard'
import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import { mockInvoices } from './mockInvoices'
import { mockPayments } from './mockPayments'
import { getAllBatches, type Batch } from './mockBatches'
import { enrichInvoices, isOpenArInvoice } from '../utils/invoiceAging'
import { computeOpenArAging } from '../utils/clientReports'
import { isSupabaseConfigured } from '../lib/supabase'
import { fetchClientTenantData, type ClientTenantData } from '../services/supabase/tenantDataRepository'

const tenantCache = new Map<string, ClientTenantData>()

function mockInvoicesForClient(clientId: string, clientName?: string): Invoice[] {
  return mockInvoices.filter(
    (inv) =>
      inv.client_id === clientId ||
      (clientName != null && inv.client_name === clientName)
  )
}

function mockPaymentsForClient(clientId: string, clientName?: string): Payment[] {
  const ids = new Set(mockInvoicesForClient(clientId, clientName).map((inv) => inv.id))
  return mockPayments
    .filter((p) => ids.has(p.invoice_id))
    .sort((a, b) => b.received_date.localeCompare(a.received_date))
}

function mockBatchesForClient(clientId: string): Batch[] {
  return getAllBatches().filter((b) => b.client_id === clientId)
}

/** Load and cache tenant data for one client from Supabase (or mock fallback). */
export async function loadClientTenantData(
  clientId: string,
  _clientName?: string
): Promise<ClientTenantData> {
  if (!clientId) {
    return { clientId: '', invoices: [], payments: [], batches: [] }
  }

  if (isSupabaseConfigured()) {
    const data = await fetchClientTenantData(clientId)
    tenantCache.set(clientId, data)
    return data
  }

  const data: ClientTenantData = {
    clientId,
    invoices: mockInvoicesForClient(clientId, _clientName),
    payments: mockPaymentsForClient(clientId, _clientName),
    batches: mockBatchesForClient(clientId),
  }
  tenantCache.set(clientId, data)
  return data
}

function getCachedOrMock(clientId: string, clientName?: string): ClientTenantData {
  const cached = tenantCache.get(clientId)
  if (cached) return cached

  return {
    clientId,
    invoices: mockInvoicesForClient(clientId, clientName),
    payments: mockPaymentsForClient(clientId, clientName),
    batches: mockBatchesForClient(clientId),
  }
}

/** Invoices for a client — always scoped by client_id. */
export function getClientInvoices(clientId: string, clientName?: string): Invoice[] {
  if (!clientId) return []
  return getCachedOrMock(clientId, clientName).invoices
}

/** Payments for a client — always scoped by client_id. */
export function getClientPayments(clientId: string, clientName?: string): Payment[] {
  if (!clientId) return []
  return getCachedOrMock(clientId, clientName).payments
}

/** Batches for a client — always scoped by client_id. */
export function getClientBatches(clientId: string): Batch[] {
  if (!clientId) return []
  return getCachedOrMock(clientId).batches
}

/** Clear cached tenant data (e.g. on logout). */
export function clearClientTenantCache(clientId?: string): void {
  if (clientId) tenantCache.delete(clientId)
  else tenantCache.clear()
}

/** Refresh one client's cache from in-memory stores after realtime merge. */
export function refreshClientTenantCacheFromStores(
  clientId: string,
  clientName?: string
): void {
  if (!clientId) return
  tenantCache.set(clientId, {
    clientId,
    invoices: mockInvoicesForClient(clientId, clientName),
    payments: mockPaymentsForClient(clientId, clientName),
    batches: mockBatchesForClient(clientId),
  })
}

/** Confirmed payment total for an invoice within cached tenant data. */
export function getConfirmedPaymentTotalForClient(
  clientId: string,
  invoiceId: string
): number {
  return getClientPayments(clientId)
    .filter((p) => p.invoice_id === invoiceId && p.status === 'confirmed')
    .reduce((sum, p) => sum + p.amount, 0)
}

/** Dashboard snapshot derived from client-scoped invoice/payment data. */
export function buildClientDashboardData(
  clientId: string,
  clientName: string,
  invoices = getClientInvoices(clientId, clientName),
  payments = getClientPayments(clientId, clientName)
): ClientDashboardData {
  const enriched = enrichInvoices(invoices)
  const openAr = enriched.filter(isOpenArInvoice)
  const aging = computeOpenArAging(invoices, new Date(), payments)

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const paidThisMonth = payments
    .filter((p) => p.status === 'confirmed' && new Date(p.received_date) >= monthStart)
    .reduce((s, p) => s + p.amount, 0)

  const recent = [...invoices]
    .sort((a, b) => b.invoice_date.localeCompare(a.invoice_date))
    .slice(0, 5)
    .map((inv) => ({
      id: inv.id,
      invoice_number: inv.invoice_number,
      broker_name: inv.broker_name,
      amount: inv.amount,
      status: inv.status,
      invoice_date: inv.invoice_date,
      due_date: inv.due_date ?? inv.expected_payment_date ?? inv.invoice_date,
    }))

  const recent_activity: ClientDashboardData['recent_activity'] = []

  for (const p of payments.filter((x) => x.status === 'confirmed').slice(0, 3)) {
    recent_activity.push({
      id: `act-pay-${p.id}`,
      type: 'payment_received',
      description: `Payment received for ${p.invoice_number}`,
      timestamp: new Date(p.received_date).toISOString(),
      invoice_id: p.invoice_id,
    })
  }

  for (const inv of invoices.filter((i) => i.approved_at).slice(0, 2)) {
    recent_activity.push({
      id: `act-appr-${inv.id}`,
      type: 'invoice_approved',
      description: `Invoice ${inv.invoice_number} approved`,
      timestamp: inv.approved_at!,
      invoice_id: inv.id,
    })
  }

  return {
    client_id: clientId,
    client_name: clientName,
    summary: {
      total_ar: aging.total_ar,
      pending_invoices: invoices.filter((i) => i.status === 'pending').length,
      approved_invoices: openAr.length,
      on_hold_invoices: invoices.filter((i) => i.status === 'hold').length,
      paid_this_month: paidThisMonth,
      overdue_invoices: enriched.filter((i) => isOpenArInvoice(i) && i.isOverdue).length,
    },
    aging_ar: aging.aging_ar,
    recent_invoices: recent,
    recent_activity: recent_activity.slice(0, 6),
  }
}

/** Open A/R invoices with no confirmed payment yet (for post-payment picker). */
export function getPostableInvoices(clientId: string, clientName?: string): Invoice[] {
  return getClientInvoices(clientId, clientName).filter((inv) => {
    if (!isOpenArInvoice(inv)) return false
    const received = getConfirmedPaymentTotalForClient(clientId, inv.id)
    return received < inv.amount - 0.01
  })
}
