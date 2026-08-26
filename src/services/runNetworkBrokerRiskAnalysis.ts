import { mockBrokers } from '../data/mockBrokers'
import { mockInvoices } from '../data/mockInvoices'
import { mockPayments } from '../data/mockPayments'
import {
  countPendingBrokerRiskReviews,
  pruneDuplicateBrokerRiskProfiles,
} from '../data/brokerRiskStore'
import { runBrokerRiskWeekly } from '../jobs/runBrokerRiskWeekly'
import { getAllClients } from './clientRegistry'
import { deleteBrokerRiskProfiles } from './supabase/brokerRiskPersist'
import { getBrokerNotes, getBrokerPayRating } from '../utils/clientBrokers'
import { computeBrokerScores } from '../utils/clientReports'
import {
  collectTermsPaymentSignals,
  normalizeBrokerNameKey,
  pickCanonicalBroker,
} from '../utils/brokerRiskPolicy'
import type { Broker } from '../types/broker'

const ALL_TIME = {
  start_date: '2000-01-01',
  end_date: new Date().toISOString().slice(0, 10),
}

/** One catalog row per broker name (duplicate directory IDs collapse). */
function uniqueBrokersByName(invoiceBrokerIds: string[]): Broker[] {
  const groups = new Map<string, Broker[]>()
  for (const broker of mockBrokers) {
    const key = normalizeBrokerNameKey(broker.name)
    const list = groups.get(key) ?? []
    list.push(broker)
    groups.set(key, list)
  }
  const out: Broker[] = []
  for (const group of groups.values()) {
    const picked = pickCanonicalBroker(group, invoiceBrokerIds)
    if (picked) out.push(picked)
  }
  return out
}

/**
 * Re-run rules-v2 broker risk for every carrier (admin "Run analysis").
 * Returns total profiles written.
 */
export function runNetworkBrokerRiskAnalysis(force = true): {
  clients: number
  profiles: number
  pendingReview: number
} {
  const clients = getAllClients()
  let profiles = 0

  const termsByName: Record<string, number | null | undefined> = {}
  for (const b of mockBrokers) termsByName[b.name] = b.payment_terms_days

  for (const client of clients) {
    const invoices = mockInvoices.filter((i) => i.client_id === client.id)
    const invoiceIds = new Set(invoices.map((i) => i.id))
    const payments = mockPayments.filter((p) => invoiceIds.has(p.invoice_id))
    const scores = computeBrokerScores(invoices, payments, ALL_TIME, new Date(), termsByName)
    const scoreByName = new Map(scores.map((s) => [s.broker_name, s]))
    const invoiceBrokerIds = invoices.map((i) => i.broker_id).filter(Boolean)

    const brokerIds = new Set<string>()
    const seenNames = new Set<string>()
    const targets = []

    for (const broker of uniqueBrokersByName(invoiceBrokerIds)) {
      const nameKey = normalizeBrokerNameKey(broker.name)
      if (seenNames.has(nameKey)) continue
      seenNames.add(nameKey)
      brokerIds.add(broker.id)

      const score = scoreByName.get(broker.name) ?? null
      const hasWorked =
        score !== null && (score.open_invoices > 0 || score.invoiced_in_range > 0)
      const notes = getBrokerNotes(client.id, broker.id)
      // Include NEW / thin-history brokers even with no loads yet.
      if (!hasWorked && notes.length === 0 && !broker.is_new) continue

      const brokerInvoices = invoices.filter((i) => i.broker_name === broker.name)
      const brokerPayments = payments.filter((p) => p.broker_name === broker.name)
      const termsSignals = collectTermsPaymentSignals({
        invoices: brokerInvoices,
        payments: brokerPayments,
        paymentTermsDays: broker.payment_terms_days,
      })

      targets.push({
        brokerId: broker.id,
        brokerName: broker.name,
        mcNumber: broker.mc_number ?? null,
        score,
        rating: getBrokerPayRating(score, {
          paymentTermsDays: broker.payment_terms_days,
          hasWorked,
        }),
        notes,
        adminNotes: broker.notes,
        invoices: brokerInvoices,
        payments: brokerPayments,
        hasWorked,
        paymentTermsDays: broker.payment_terms_days,
        termsSignals,
        isNewBroker: Boolean(broker.is_new),
      })
    }

    for (const score of scores) {
      const nameKey = normalizeBrokerNameKey(score.broker_name)
      if (seenNames.has(nameKey)) continue
      const existing = mockBrokers.find(
        (b) => normalizeBrokerNameKey(b.name) === nameKey
      )
      if (existing) continue
      const id = `broker-name-${score.broker_name.toLowerCase().replace(/\s+/g, '-')}`
      if (brokerIds.has(id)) continue
      brokerIds.add(id)
      seenNames.add(nameKey)
      const hasWorked = score.open_invoices > 0 || score.invoiced_in_range > 0
      const notes = getBrokerNotes(client.id, id)
      const brokerInvoices = invoices.filter((i) => i.broker_name === score.broker_name)
      const brokerPayments = payments.filter((p) => p.broker_name === score.broker_name)
      const termsSignals = collectTermsPaymentSignals({
        invoices: brokerInvoices,
        payments: brokerPayments,
        paymentTermsDays: score.payment_terms_days,
      })
      targets.push({
        brokerId: id,
        brokerName: score.broker_name,
        mcNumber: null,
        score,
        rating: getBrokerPayRating(score, { hasWorked }),
        notes,
        invoices: brokerInvoices,
        payments: brokerPayments,
        hasWorked,
        paymentTermsDays: score.payment_terms_days,
        termsSignals,
      })
    }

    const result = runBrokerRiskWeekly({
      clientId: client.id,
      brokers: targets,
      force,
      trigger: 'manual',
    })
    profiles += result.profileIds.length
  }

  // Drop stale same-name duplicates so the queue can't flip back to pending.
  const removed = pruneDuplicateBrokerRiskProfiles()
  if (removed.length > 0) {
    void deleteBrokerRiskProfiles(removed).catch(console.error)
  }

  return {
    clients: clients.length,
    profiles,
    pendingReview: countPendingBrokerRiskReviews(),
  }
}
