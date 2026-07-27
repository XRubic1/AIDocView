import { mockBrokers } from '../data/mockBrokers'
import type { Broker } from '../types/broker'
import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import type {
  BrokerPayRating,
  ClientBrokerNote,
  ClientBrokerProfile,
} from '../types/clientBroker'
import { toClientBrokerRiskView } from '../types/clientBroker'
import { computeBrokerScores, type BrokerScoreRow } from './clientReports'
import { ensureBrokerRiskProfile } from '../services/brokerRiskService'
import { formatRiskFreshness } from './computeBrokerRiskProfile'

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

/** Traffic-light pay rating from scorecard metrics. */
export function getBrokerPayRating(score: BrokerScoreRow | null): BrokerPayRating {
  if (!score) return 'yellow'

  const avg = score.avg_days_to_pay
  const hasOverdue = score.overdue_count > 0
  const highOverdue = score.overdue_amount >= 5_000 || score.overdue_count >= 2

  if (highOverdue || (avg !== null && avg > 12)) return 'red'
  if (hasOverdue || (avg !== null && avg > 5) || score.collection_rate < 75) return 'yellow'
  if (avg !== null && avg <= 3 && !hasOverdue && score.collection_rate >= 90) return 'green'
  if (!hasOverdue && (avg === null || avg <= 7)) return 'green'
  return 'yellow'
}

export function getBrokerPayRatingLabel(rating: BrokerPayRating): string {
  if (rating === 'green') return 'Reliable payer'
  if (rating === 'yellow') return 'Watch list'
  return 'Slow / risk'
}

/** Mock AI-style summary from broker metrics and notes. */
export function generateBrokerAiSummary(
  brokerName: string,
  score: BrokerScoreRow | null,
  rating: BrokerPayRating,
  notes: ClientBrokerNote[],
  hasWorked: boolean
): string {
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
    return `${brokerName} pays consistently — average ${score.avg_days_to_pay ?? 0} days from expected date with ${score.collection_rate.toFixed(0)}% collection rate on your loads. Low overdue exposure.`
  }

  if (rating === 'yellow') {
    const parts = [
      `${brokerName} shows mixed payment behavior on your account.`,
      score.avg_days_to_pay !== null ? `Average pay lag is ${score.avg_days_to_pay} days.` : '',
      score.overdue_count > 0
        ? `${score.overdue_count} open invoice${score.overdue_count > 1 ? 's' : ''} currently overdue.`
        : 'Monitor new loads until recent invoices clear.',
    ]
    return parts.filter(Boolean).join(' ')
  }

  return `${brokerName} is a higher-risk payer for your fleet — ${formatCurrencyShort(score.overdue_amount)} overdue across ${score.overdue_count} invoice${score.overdue_count !== 1 ? 's' : ''}${score.avg_days_to_pay !== null ? ` with ${score.avg_days_to_pay}d average lag` : ''}. Consider tighter terms or reduced volume.`
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

/** Build full broker directory for a client. */
export function buildClientBrokerDirectory(
  clientId: string,
  invoices: Invoice[],
  payments: Payment[]
): ClientBrokerProfile[] {
  const scores = computeBrokerScores(invoices, payments, ALL_TIME_RANGE)
  const scoreByName = new Map(scores.map((s) => [s.broker_name, s]))

  const brokerNamesFromData = new Set(invoices.map((i) => i.broker_name))
  const directoryBrokers: Array<Broker | { id: string; name: string }> = [
    ...mockBrokers,
    ...[...brokerNamesFromData]
      .filter((name) => !mockBrokers.some((b) => b.name === name))
      .map((name) => ({ id: brokerIdFromName(name), name })),
  ]

  const seen = new Set<string>()

  return directoryBrokers
    .filter((b) => {
      if (seen.has(b.id)) return false
      seen.add(b.id)
      return true
    })
    .map((broker) => {
      const fullBroker = 'mc_number' in broker ? (broker as Broker) : undefined
      const score = scoreByName.get(broker.name) ?? null
      const hasWorked = score !== null && (score.open_invoices > 0 || score.invoiced_in_range > 0)
      const notes = getBrokerNotes(clientId, broker.id)
      const rating = getBrokerPayRating(score)
      const riskProfile = ensureBrokerRiskProfile({
        clientId,
        brokerId: broker.id,
        brokerName: broker.name,
        mcNumber: fullBroker?.mc_number ?? null,
        score,
        rating,
        notes,
        hasWorked,
        trigger: 'backfill',
      })
      const freshness = formatRiskFreshness(riskProfile, notes)

      return {
        broker_id: broker.id,
        broker_name: broker.name,
        mc_number: fullBroker?.mc_number ?? null,
        dot_number: fullBroker?.dot_number ?? null,
        payment_terms_days: fullBroker?.payment_terms_days ?? null,
        city: fullBroker?.city ?? null,
        state: fullBroker?.state ?? null,
        has_worked_with_client: hasWorked,
        in_credyx_network: Boolean(fullBroker),
        score,
        rating,
        ai_summary: riskProfile.summary_text,
        risk: toClientBrokerRiskView(
          riskProfile,
          freshness.analyzedAtLabel,
          freshness.notesRecencyLabel
        ),
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
