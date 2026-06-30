import type { ClientDashboardData } from '../types/clientDashboard'
import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import { mockInvoices } from './mockInvoices'
import { mockPayments } from './mockPayments'
import { getAllBatches, type Batch } from './mockBatches'
import { enrichInvoices, isOpenArInvoice } from '../utils/invoiceAging'
import { computeOpenArAging } from '../utils/clientReports'
import { getConfirmedPaymentTotal } from './mockPayments'

/** Invoices for a client — single source, no supplemental merge. */
export function getClientInvoices(clientId: string, clientName?: string): Invoice[] {
  return mockInvoices.filter(
    (inv) =>
      inv.client_id === clientId ||
      (clientName != null && inv.client_name === clientName)
  )
}

/** Payments linked to a client's invoices. */
export function getClientPayments(clientId: string, clientName?: string): Payment[] {
  const ids = new Set(getClientInvoices(clientId, clientName).map((inv) => inv.id))
  return mockPayments
    .filter((p) => ids.has(p.invoice_id))
    .sort((a, b) => b.received_date.localeCompare(a.received_date))
}

/** Batches for a client. */
export function getClientBatches(clientId: string): Batch[] {
  return getAllBatches().filter((b) => b.client_id === clientId)
}

/** Dashboard snapshot derived from live invoice/payment data. */
export function buildClientDashboardData(
  clientId: string,
  clientName: string
): ClientDashboardData {
  const invoices = getClientInvoices(clientId, clientName)
  const payments = getClientPayments(clientId, clientName)
  const enriched = enrichInvoices(invoices)
  const openAr = enriched.filter(isOpenArInvoice)
  const aging = computeOpenArAging(invoices)

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
      due_date: inv.due_date,
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
    const received = getConfirmedPaymentTotal(inv.id)
    return received < inv.amount - 0.01
  })
}
