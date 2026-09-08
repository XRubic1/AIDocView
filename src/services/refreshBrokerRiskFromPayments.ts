/**
 * Recompute broker risk for the carrier+broker on an invoice after cash movement.
 */
import { mockBrokers } from '../data/mockBrokers'
import { getInvoiceById, mockInvoices } from '../data/mockInvoices'
import { mockPayments } from '../data/mockPayments'
import { ensureBrokerRiskProfile } from './brokerRiskService'
import { notifyTenantDataUpdated } from './supabase/tenantDataLiveSync'
import { getBrokerNotes, getBrokerPayRating } from '../utils/clientBrokers'
import { computeBrokerScores } from '../utils/clientReports'
import {
  collectTermsPaymentSignals,
  normalizeBrokerNameKey,
} from '../utils/brokerRiskPolicy'
import type { Invoice } from '../types/invoice'
import type { BrokerRiskTrigger } from '../types/brokerRisk'

function allTimeRange() {
  return {
    start_date: '2000-01-01',
    end_date: new Date().toISOString().slice(0, 10),
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null
const queuedInvoiceIds = new Set<string>()

function brokerIdFromName(name: string): string {
  const match = mockBrokers.find(
    (b) => normalizeBrokerNameKey(b.name) === normalizeBrokerNameKey(name)
  )
  return match?.id ?? `broker-name-${name.toLowerCase().replace(/\s+/g, '-')}`
}

/**
 * Queue a risk refresh so bursts of posts (one remittance, many invoices) collapse.
 */
export function scheduleBrokerRiskRefresh(invoiceId: string): void {
  if (!invoiceId) return
  queuedInvoiceIds.add(invoiceId)
  if (debounceTimer) return
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    const ids = [...queuedInvoiceIds]
    queuedInvoiceIds.clear()
    const touchedClients = new Set<string>()
    for (const id of ids) {
      try {
        const clientId = refreshBrokerRiskForInvoice(id)
        if (clientId) touchedClients.add(clientId)
      } catch (err) {
        console.error('[brokerRisk] payment refresh failed', err)
      }
    }
    for (const clientId of touchedClients) {
      notifyTenantDataUpdated(['broker_risk_profiles', 'payments'], clientId)
    }
  }, 400)
}

/**
 * Force rules-v2.5 for the invoice's carrier + broker using live store data.
 * Returns clientId when a profile was written.
 */
export function refreshBrokerRiskForInvoice(
  invoiceId: string,
  trigger: BrokerRiskTrigger = 'payment'
): string | null {
  const invoice = getInvoiceById(invoiceId)
  if (!invoice) return null
  return refreshBrokerRiskForClientBroker(invoice, trigger)
}

/** Recompute one (client, broker) pair from current invoices/payments. */
export function refreshBrokerRiskForClientBroker(
  invoice: Invoice,
  trigger: BrokerRiskTrigger = 'payment'
): string | null {
  const nameKey = normalizeBrokerNameKey(invoice.broker_name || invoice.broker_id)
  if (!nameKey) return null

  const catalog =
    mockBrokers.find((b) => b.id === invoice.broker_id) ??
    mockBrokers.find((b) => normalizeBrokerNameKey(b.name) === nameKey)

  const brokerName = catalog?.name ?? invoice.broker_name
  const brokerId = catalog?.id ?? (invoice.broker_id || brokerIdFromName(brokerName))
  const clientId = invoice.client_id

  const invoices = mockInvoices.filter(
    (inv) =>
      inv.client_id === clientId &&
      (inv.broker_id === brokerId ||
        normalizeBrokerNameKey(inv.broker_name) === nameKey)
  )
  const invoiceIds = new Set(invoices.map((i) => i.id))
  const payments = mockPayments.filter((p) => invoiceIds.has(p.invoice_id))

  const termsByName: Record<string, number | null | undefined> = {}
  for (const b of mockBrokers) termsByName[b.name] = b.payment_terms_days

  const scores = computeBrokerScores(invoices, payments, allTimeRange(), new Date(), termsByName)
  const score =
    scores.find((s) => normalizeBrokerNameKey(s.broker_name) === nameKey) ?? null
  const hasWorked =
    score !== null && (score.open_invoices > 0 || score.invoiced_in_range > 0)
  const termsDays = catalog?.payment_terms_days ?? score?.payment_terms_days ?? null
  const termsSignals = collectTermsPaymentSignals({
    invoices,
    payments,
    paymentTermsDays: termsDays,
  })

  ensureBrokerRiskProfile({
    clientId,
    brokerId,
    brokerName,
    mcNumber: catalog?.mc_number ?? null,
    score,
    rating: getBrokerPayRating(score, {
      paymentTermsDays: termsDays,
      hasWorked,
    }),
    notes: getBrokerNotes(clientId, brokerId),
    adminNotes: catalog?.notes,
    invoices,
    payments,
    hasWorked: true,
    paymentTermsDays: termsDays,
    termsSignals,
    isNewBroker: Boolean(catalog?.is_new),
    force: true,
    trigger,
  })

  return clientId
}
