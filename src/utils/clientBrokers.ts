import { mockBrokers } from '../data/mockBrokers'
import { getLatestBrokerRiskProfile } from '../data/brokerRiskStore'
import type { BrokerRiskLevel } from '../types/brokerRisk'
import type { Broker } from '../types/broker'
import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import type {
  BrokerPayRating,
  ClientBrokerNote,
  ClientBrokerProfile,
} from '../types/clientBroker'
import { carrierSafeRiskSummary, toClientBrokerRiskView } from '../types/clientBroker'
import { computeBrokerScores, type BrokerScoreRow } from './clientReports'
import { ensureBrokerRiskProfile } from '../services/brokerRiskService'
import { carrierVisibleRiskLevel, formatRiskFreshness } from './computeBrokerRiskProfile'
import {
  collectTermsPaymentSignals,
  countNoteFlags,
  BROKER_RISK_POLICY,
  evaluateRiskFromSignals,
  normalizeBrokerNameKey,
  pickCanonicalBroker,
} from './brokerRiskPolicy'

const NOTES_STORAGE_PREFIX = 'credyx_client_broker_notes_'

const ALL_TIME_RANGE = {
  start_date: '2000-01-01',
  end_date: new Date().toISOString().split('T')[0],
}

/** Normalize MC input for lookup (MC-123456, 123456, mc123456). */
export function normalizeMcQuery(raw: string): string {
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!cleaned) return ''
  const digits = cleaned.replace(/^MC/, '')
  return digits ? `MC-${digits}` : ''
}

export function findBrokerByMc(mcQuery: string): Broker | undefined {
  const normalized = normalizeMcQuery(mcQuery)
  if (!normalized) return undefined
  return mockBrokers.find(
    (b) =>
      b.mc_number?.toUpperCase().replace(/[^A-Z0-9]/g, '') ===
      normalized.replace(/[^A-Z0-9]/g, '')
  )
}

/**
 * Traffic-light pay rating — terms-aware (Net 45 paying ~45d is green).
 * Prefer score.late_payment_count / open_overdue_past_terms when present.
 */
export function getBrokerPayRating(
  score: BrokerScoreRow | null,
  options?: { paymentTermsDays?: number | null; hasWorked?: boolean }
): BrokerPayRating {
  if (!score) return 'yellow'
  const hasWorked =
    options?.hasWorked ??
    (score.open_invoices > 0 ||
      score.invoiced_in_range > 0 ||
      (score.late_payment_count ?? 0) > 0)

  const signals = {
    payment_terms_days:
      options?.paymentTermsDays ??
      score.payment_terms_days ??
      30,
    late_payment_count: score.late_payment_count ?? 0,
    max_days_past_terms: score.max_days_past_terms ?? null,
    avg_days_past_terms: null,
    open_overdue_past_terms: score.open_overdue_past_terms ?? 0,
    open_overdue_amount: score.overdue_amount,
    open_urgent_past_terms:
      (score.max_days_past_terms ?? 0) >= BROKER_RISK_POLICY.high_single_late_days
        ? Math.max(score.open_overdue_past_terms ?? 0, 0)
        : 0,
    paid_sample_size: Math.max(score.invoiced_in_range, 0),
    avg_days_invoice_to_pay: score.avg_days_invoice_to_pay ?? null,
  }

  const evaluation = evaluateRiskFromSignals({
    hasWorked,
    signals,
    noteFlagCount: 0,
  })
  return evaluation.pay_rating
}

export function getBrokerPayRatingLabel(rating: BrokerPayRating): string {
  if (rating === 'green') return 'Reliable payer'
  if (rating === 'yellow') return 'Watch list'
  return 'Slow / risk'
}

/** Rules narrative from broker metrics and notes (legacy helper). */
export function generateBrokerAiSummary(
  brokerName: string,
  score: BrokerScoreRow | null,
  rating: BrokerPayRating,
  notes: ClientBrokerNote[],
  hasWorked: boolean,
  paymentTermsDays?: number | null
): string {
  const net = paymentTermsDays ?? score?.payment_terms_days ?? 30
  const noteHints = notes
    .slice(0, 2)
    .map((n) => n.text)
    .join(' ')
  const noteLower = noteHints.toLowerCase()

  if (noteLower.includes('delay') || noteLower.includes('slow') || noteLower.includes('late')) {
    return `${brokerName} has been flagged in your notes for payment delays. Review recent terms before booking new freight.`
  }

  if (!hasWorked || !score) {
    return `${brokerName} is in the Credyx broker network but you have no payment history yet. Check MC details and start with smaller exposure until you build a track record.`
  }

  if (rating === 'green') {
    const avg =
      score.avg_days_invoice_to_pay != null
        ? ` averaging ${score.avg_days_invoice_to_pay} days from invoice`
        : ''
    return `${brokerName} pays within Net ${net}${avg} with ${score.collection_rate.toFixed(0)}% collection rate on your loads. Low overdue exposure past terms.`
  }

  if (rating === 'yellow') {
    const parts = [
      `${brokerName} shows mixed payment behavior vs Net ${net}.`,
      (score.late_payment_count ?? 0) > 0
        ? `${score.late_payment_count} payment(s) arrived after terms.`
        : '',
      (score.open_overdue_past_terms ?? score.overdue_count) > 0
        ? `${score.open_overdue_past_terms ?? score.overdue_count} open invoice(s) currently past terms.`
        : 'Monitor new loads until recent invoices clear.',
    ]
    return parts.filter(Boolean).join(' ')
  }

  return `${brokerName} is a higher-risk payer vs Net ${net} — ${formatCurrencyShort(score.overdue_amount)} past terms. Consider tighter terms or reduced volume.`
}

function formatCurrencyShort(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}

function loadNotes(clientId: string): Record<string, ClientBrokerNote[]> {
  try {
    const raw = localStorage.getItem(`${NOTES_STORAGE_PREFIX}${clientId}`)
    return raw ? (JSON.parse(raw) as Record<string, ClientBrokerNote[]>) : {}
  } catch {
    return {}
  }
}

function persistNotes(clientId: string, data: Record<string, ClientBrokerNote[]>): void {
  try {
    localStorage.setItem(`${NOTES_STORAGE_PREFIX}${clientId}`, JSON.stringify(data))
  } catch {
    /* ignore */
  }
}

export function getBrokerNotes(clientId: string, brokerId: string): ClientBrokerNote[] {
  return loadNotes(clientId)[brokerId] ?? []
}

export function saveBrokerNote(
  clientId: string,
  brokerId: string,
  text: string,
  noteId?: string
): ClientBrokerNote[] {
  const trimmed = text.trim()
  if (!trimmed) return getBrokerNotes(clientId, brokerId)

  const all = loadNotes(clientId)
  const existing = all[brokerId] ?? []
  const now = new Date().toISOString()

  if (noteId) {
    all[brokerId] = existing.map((n) =>
      n.id === noteId ? { ...n, text: trimmed, updated_at: now } : n
    )
  } else {
    all[brokerId] = [
      {
        id: `note-${Date.now()}`,
        broker_id: brokerId,
        text: trimmed,
        created_at: now,
        updated_at: now,
      },
      ...existing,
    ]
  }

  persistNotes(clientId, all)
  return all[brokerId]
}

export function deleteBrokerNote(
  clientId: string,
  brokerId: string,
  noteId: string
): ClientBrokerNote[] {
  const all = loadNotes(clientId)
  all[brokerId] = (all[brokerId] ?? []).filter((n) => n.id !== noteId)
  persistNotes(clientId, all)
  return all[brokerId]
}

function brokerIdFromName(name: string): string {
  const match = mockBrokers.find((b) => b.name === name)
  return match?.id ?? `broker-name-${name.toLowerCase().replace(/\s+/g, '-')}`
}

/** Build broker directory for a client — only brokers with invoices for this carrier. */
export function buildClientBrokerDirectory(
  clientId: string,
  invoices: Invoice[],
  payments: Payment[]
): ClientBrokerProfile[] {
  const termsByName: Record<string, number | null | undefined> = {}
  for (const b of mockBrokers) {
    termsByName[b.name] = b.payment_terms_days
  }

  const scores = computeBrokerScores(invoices, payments, ALL_TIME_RANGE, new Date(), termsByName)
  const scoreByName = new Map(scores.map((s) => [s.broker_name, s]))

  const invoiceBrokerIds = invoices.map((i) => i.broker_id).filter(Boolean)

  // Collapse duplicate catalog rows that share a display name.
  const byName = new Map<string, Broker>()
  for (const b of mockBrokers) {
    const key = normalizeBrokerNameKey(b.name)
    const prev = byName.get(key)
    if (!prev) {
      byName.set(key, b)
      continue
    }
    const picked = pickCanonicalBroker([prev, b], invoiceBrokerIds)
    if (picked) byName.set(key, picked)
  }

  // Only brokers this carrier has invoiced — never the full Credyx catalog.
  const namesFromInvoices = new Map<string, string>()
  for (const inv of invoices) {
    const key = normalizeBrokerNameKey(inv.broker_name)
    if (!namesFromInvoices.has(key)) namesFromInvoices.set(key, inv.broker_name)
  }

  return [...namesFromInvoices.entries()]
    .map(([nameKey, brokerName]) => {
      const catalog = byName.get(nameKey)
      const brokerId = catalog?.id ?? brokerIdFromName(brokerName)
      const score = scoreByName.get(brokerName) ?? scoreByName.get(catalog?.name ?? '') ?? null
      const hasWorked =
        score !== null && (score.open_invoices > 0 || score.invoiced_in_range > 0)
      const notes = getBrokerNotes(clientId, brokerId)
      const termsDays = catalog?.payment_terms_days ?? score?.payment_terms_days ?? null
      const brokerInvoices = invoices.filter(
        (i) => normalizeBrokerNameKey(i.broker_name) === nameKey
      )
      const brokerPayments = payments.filter(
        (p) => normalizeBrokerNameKey(p.broker_name) === nameKey
      )
      const termsSignals = collectTermsPaymentSignals({
        invoices: brokerInvoices,
        payments: brokerPayments,
        paymentTermsDays: termsDays,
      })
      const rating = getBrokerPayRating(score, {
        paymentTermsDays: termsDays,
        hasWorked: true,
      })
      const riskProfile = ensureBrokerRiskProfile({
        clientId,
        brokerId,
        brokerName,
        mcNumber: catalog?.mc_number ?? null,
        score,
        rating,
        notes,
        adminNotes: catalog?.notes,
        invoices: brokerInvoices,
        hasWorked: true,
        paymentTermsDays: termsDays,
        termsSignals,
        isNewBroker: Boolean(catalog?.is_new),
        trigger: 'backfill',
      })
      const freshness = formatRiskFreshness(riskProfile, notes)
      const riskView = toClientBrokerRiskView(
        riskProfile,
        freshness.analyzedAtLabel,
        freshness.notesRecencyLabel
      )

      return {
        broker_id: brokerId,
        broker_name: brokerName,
        mc_number: catalog?.mc_number ?? null,
        dot_number: catalog?.dot_number ?? null,
        payment_terms_days: termsDays,
        city: catalog?.city ?? null,
        state: catalog?.state ?? null,
        address: catalog?.address ?? null,
        is_new: Boolean(catalog?.is_new),
        carrier_notes: catalog?.carrier_notes?.trim() || null,
        has_worked_with_client: true,
        in_credyx_network: Boolean(catalog),
        paid_sample_size: termsSignals.paid_sample_size,
        score,
        rating,
        ai_summary: carrierSafeRiskSummary(riskProfile, brokerName),
        risk: riskView,
        notes,
      }
    })
    .sort((a, b) => {
      const ratingOrder = { red: 0, yellow: 1, green: 2 }
      const ra = ratingOrder[a.rating]
      const rb = ratingOrder[b.rating]
      if (ra !== rb) return ra - rb
      return (b.score?.open_ar ?? 0) - (a.score?.open_ar ?? 0)
    })
}

/** MC lookup result for pre-booking check. */
export function lookupBrokerByMc(
  clientId: string,
  mcQuery: string,
  invoices: Invoice[],
  payments: Payment[]
): ClientBrokerProfile | null {
  const broker = findBrokerByMc(mcQuery)
  if (!broker) return null

  const directory = buildClientBrokerDirectory(clientId, invoices, payments)
  return directory.find((b) => b.broker_id === broker.id) ?? null
}

/**
 * Carrier-visible Credyx Broker Risk for an invoice row.
 * Unrated when no profile exists yet (same gate as the Brokers tab).
 */
export function getCarrierVisibleBrokerRiskLevel(
  clientId: string,
  invoice: Pick<Invoice, 'broker_id' | 'broker_name'>
): BrokerRiskLevel {
  if (!clientId) return 'unrated'

  const ids = new Set<string>()
  if (invoice.broker_id) ids.add(invoice.broker_id)
  const nameKey = normalizeBrokerNameKey(invoice.broker_name || '')
  if (nameKey) {
    for (const broker of mockBrokers) {
      if (normalizeBrokerNameKey(broker.name) === nameKey) ids.add(broker.id)
    }
  }

  for (const id of ids) {
    const profile = getLatestBrokerRiskProfile(clientId, id)
    if (profile) return carrierVisibleRiskLevel(profile)
  }
  return 'unrated'
}

/** Re-export for callers that flag notes. */
export { countNoteFlags }
