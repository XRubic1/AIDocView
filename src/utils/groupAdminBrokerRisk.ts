/**
 * Collapse per-carrier broker risk profiles into one admin queue row per broker.
 */
import type { BrokerRiskLevel, BrokerRiskProfile, BrokerRiskReviewStatus } from '../types/brokerRisk'

function statusRank(status: BrokerRiskReviewStatus): number {
  if (status === 'pending_review') return 0
  if (status === 'published') return 1
  if (status === 'auto_published') return 2
  return 3
}

function levelRank(level: BrokerRiskLevel): number {
  if (level === 'high') return 0
  if (level === 'medium') return 1
  if (level === 'low') return 2
  return 3
}

export type AdminBrokerRiskGroup = {
  brokerId: string
  profiles: BrokerRiskProfile[]
  representative: BrokerRiskProfile
  carrierCount: number
  needsReviewCount: number
}

/** One group per broker_id — worst review status / computed level first. */
export function groupAdminBrokerRiskProfiles(
  profiles: BrokerRiskProfile[]
): AdminBrokerRiskGroup[] {
  const byBroker = new Map<string, BrokerRiskProfile[]>()
  for (const row of profiles) {
    const list = byBroker.get(row.broker_id) ?? []
    list.push(row)
    byBroker.set(row.broker_id, list)
  }

  const groups: AdminBrokerRiskGroup[] = []
  for (const [brokerId, list] of byBroker) {
    const sorted = [...list].sort((a, b) => {
      const sa = statusRank(a.review_status)
      const sb = statusRank(b.review_status)
      if (sa !== sb) return sa - sb
      const la = levelRank(a.computed_risk_level)
      const lb = levelRank(b.computed_risk_level)
      if (la !== lb) return la - lb
      return Date.parse(b.analyzed_at) - Date.parse(a.analyzed_at)
    })
    const representative = sorted[0]
    groups.push({
      brokerId,
      profiles: sorted,
      representative,
      carrierCount: new Set(list.map((p) => p.client_id)).size,
      needsReviewCount: list.filter((p) => p.review_status === 'pending_review').length,
    })
  }

  return groups.sort((a, b) => {
    const sa = statusRank(a.representative.review_status)
    const sb = statusRank(b.representative.review_status)
    if (sa !== sb) return sa - sb
    const la = levelRank(a.representative.computed_risk_level)
    const lb = levelRank(b.representative.computed_risk_level)
    if (la !== lb) return la - lb
    return Date.parse(b.representative.analyzed_at) - Date.parse(a.representative.analyzed_at)
  })
}

/** Roll up per-carrier metrics so the admin panel is broker-level, not one client. */
export function mergeAdminBrokerRiskMetrics(profiles: BrokerRiskProfile[]) {
  const maxDays = profiles
    .map((p) => p.metrics.max_days_past_terms)
    .filter((n): n is number => n != null)
  return {
    late_payment_count: profiles.reduce((n, p) => n + (p.metrics.late_payment_count ?? 0), 0),
    max_days_past_terms: maxDays.length > 0 ? Math.max(...maxDays) : null,
    open_overdue_past_terms: profiles.reduce(
      (n, p) => n + (p.metrics.open_overdue_past_terms ?? 0),
      0
    ),
    overdue_amount: profiles.reduce((n, p) => n + (p.metrics.overdue_amount ?? 0), 0),
    hold_count: profiles.reduce((n, p) => n + (p.metrics.hold_count ?? 0), 0),
    open_dispute_count: profiles.reduce((n, p) => n + (p.metrics.open_dispute_count ?? 0), 0),
    paid_sample_size: profiles.reduce((n, p) => n + (p.metrics.paid_sample_size ?? 0), 0),
    suggest_clear_as_ppw: profiles.some((p) => p.metrics.suggest_clear_as_ppw),
  }
}
