import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldAlert, ShieldCheck, Shield } from 'lucide-react'
import type { Invoice } from '../../../types/invoice'
import type { Payment } from '../../../types/payment'
import type { BrokerPayRating } from '../../../types/clientBroker'
import type { BrokerRiskLevel } from '../../../types/brokerRisk'
import { useClientSession } from '../../../hooks/useClientSession'
import { useTenantDataRevision } from '../../../hooks/useTenantDataRevision'
import {
  buildClientBrokerDirectory,
  getBrokerPayRatingLabel,
} from '../../../utils/clientBrokers'
import { formatCurrency } from '../../../utils/format'

type BrokerRiskOverviewProps = {
  invoices: Invoice[]
  payments: Payment[]
  loading?: boolean
  /** Optional entrance class (onboarding unlock). */
  className?: string
}

type RatedBroker = {
  name: string
  rating: BrokerPayRating
  /** Carrier-visible Credyx risk (only after publish / auto-low). */
  riskLevel: BrokerRiskLevel | null
  /** True when Credyx published Medium or High. */
  flagged: boolean
  openAr: number
  overdueAmount: number
  overdueCount: number
  avgDays: number | null
  collectionRate: number
}

/**
 * Compact broker risk overview under Actions —
 * Credyx-flagged Medium/High first, then pay-rating buckets.
 */
export default function BrokerRiskOverview({
  invoices,
  payments,
  loading = false,
  className,
}: BrokerRiskOverviewProps) {
  const navigate = useNavigate()
  const { clientId } = useClientSession()
  const tenantRevision = useTenantDataRevision()

  const { counts, good, risky, watch } = useMemo(() => {
    void tenantRevision
    if (!clientId) {
      return {
        counts: { good: 0, watch: 0, risky: 0, total: 0 },
        good: [] as RatedBroker[],
        watch: [] as RatedBroker[],
        risky: [] as RatedBroker[],
      }
    }

    const directory = buildClientBrokerDirectory(clientId, invoices, payments)
    const rated: RatedBroker[] = directory
      .filter((b) => b.has_worked_with_client)
      .map((b) => {
        const riskLevel = b.risk?.risk_level ?? null
        const flagged = riskLevel === 'medium' || riskLevel === 'high'
        return {
          name: b.broker_name,
          rating: b.rating,
          riskLevel,
          flagged,
          openAr: b.score?.open_ar ?? 0,
          overdueAmount: b.score?.overdue_amount ?? 0,
          overdueCount:
            b.score?.open_overdue_past_terms ?? b.score?.overdue_count ?? 0,
          avgDays: b.score?.avg_days_invoice_to_pay ?? b.score?.avg_days_to_pay ?? null,
          collectionRate: b.score?.collection_rate ?? 0,
        }
      })

    // Flagged Medium/High always land in Needs attention; red pay rating too.
    const riskyList = rated
      .filter((b) => b.flagged || b.rating === 'red')
      .sort((a, b) => {
        const rank = (x: RatedBroker) =>
          x.riskLevel === 'high' ? 0 : x.flagged ? 1 : 2
        if (rank(a) !== rank(b)) return rank(a) - rank(b)
        return b.overdueAmount - a.overdueAmount || b.openAr - a.openAr
      })

    const riskyNames = new Set(riskyList.map((b) => b.name))
    const watchList = rated
      .filter((b) => !riskyNames.has(b.name) && b.rating === 'yellow')
      .sort((a, b) => b.overdueAmount - a.overdueAmount || b.openAr - a.openAr)
    const goodList = rated
      .filter((b) => !riskyNames.has(b.name) && b.rating === 'green')
      .sort((a, b) => b.openAr - a.openAr || (a.avgDays ?? 99) - (b.avgDays ?? 99))

    return {
      counts: {
        good: goodList.length,
        watch: watchList.length,
        risky: riskyList.length,
        total: rated.length,
      },
      good: goodList.slice(0, 2),
      watch: watchList.slice(0, 2),
      risky: riskyList.slice(0, 3),
    }
  }, [clientId, invoices, payments, tenantRevision])

  if (loading) {
    return (
      <section
        className={`cd-broker-risk is-loading${className ? ` ${className}` : ''}`}
        data-onboard-target="brokerRisk"
        aria-label="Loading broker risk"
      >
        <header className="cd-broker-risk__head">
          <h2 className="cd-broker-risk__title">Broker risk</h2>
        </header>
        <p className="cd-broker-risk__empty">Analyzing…</p>
      </section>
    )
  }

  if (counts.total === 0) {
    return (
      <section
        className={`cd-broker-risk cd-broker-risk--empty${className ? ` ${className}` : ''}`}
        data-onboard-target="brokerRisk"
        aria-label="Broker risk"
      >
        <header className="cd-broker-risk__head">
          <h2 className="cd-broker-risk__title">Broker risk</h2>
        </header>
        <p className="cd-broker-risk__empty">No broker history yet.</p>
      </section>
    )
  }

  const totalRated = Math.max(1, counts.good + counts.watch + counts.risky)

  return (
    <section
      className={`cd-broker-risk${className ? ` ${className}` : ''}`}
      data-onboard-target="brokerRisk"
      aria-label="Broker payment risk overview"
    >
      <header className="cd-broker-risk__head">
        <h2 className="cd-broker-risk__title">Broker risk</h2>
        <button
          type="button"
          className="cd-broker-risk__link"
          onClick={() => navigate('/client/brokers')}
        >
          View all
        </button>
      </header>

      <div className="cd-broker-risk__summary">
        <div
          className="cd-broker-risk__bar"
          role="img"
          aria-label={`${counts.good} reliable, ${counts.watch} watch list, ${counts.risky} flagged or risky`}
        >
          {counts.good > 0 ? (
            <span
              className="cd-broker-risk__bar-seg is-good"
              style={{ width: `${(counts.good / totalRated) * 100}%` }}
            />
          ) : null}
          {counts.watch > 0 ? (
            <span
              className="cd-broker-risk__bar-seg is-watch"
              style={{ width: `${(counts.watch / totalRated) * 100}%` }}
            />
          ) : null}
          {counts.risky > 0 ? (
            <span
              className="cd-broker-risk__bar-seg is-risky"
              style={{ width: `${(counts.risky / totalRated) * 100}%` }}
            />
          ) : null}
        </div>

        <div className="cd-broker-risk__stats">
          <div className="cd-broker-risk__stat is-good">
            <ShieldCheck size={11} strokeWidth={2.25} aria-hidden />
            <span className="cd-broker-risk__stat-label">Good</span>
            <span className="cd-broker-risk__stat-n tabular-nums">{counts.good}</span>
          </div>
          <div className="cd-broker-risk__stat is-watch">
            <Shield size={11} strokeWidth={2.25} aria-hidden />
            <span className="cd-broker-risk__stat-label">Watch</span>
            <span className="cd-broker-risk__stat-n tabular-nums">{counts.watch}</span>
          </div>
          <div className="cd-broker-risk__stat is-risky">
            <ShieldAlert size={11} strokeWidth={2.25} aria-hidden />
            <span className="cd-broker-risk__stat-label">Flagged</span>
            <span className="cd-broker-risk__stat-n tabular-nums">{counts.risky}</span>
          </div>
        </div>
      </div>

      <div className="cd-broker-risk__lists">
        {risky.length > 0 ? (
          <BrokerGroup
            title="Flagged risk"
            tone="risky"
            brokers={risky}
            onOpen={() => navigate('/client/brokers')}
          />
        ) : null}
        {good.length > 0 ? (
          <BrokerGroup
            title="Reliable"
            tone="good"
            brokers={good}
            onOpen={() => navigate('/client/brokers')}
          />
        ) : null}
        {risky.length === 0 && watch.length > 0 ? (
          <BrokerGroup
            title="Watch"
            tone="watch"
            brokers={watch}
            onOpen={() => navigate('/client/brokers')}
          />
        ) : null}
      </div>
    </section>
  )
}

type BrokerGroupProps = {
  title: string
  tone: 'good' | 'watch' | 'risky'
  brokers: RatedBroker[]
  onOpen: () => void
}

function riskBadgeLabel(b: RatedBroker): string | null {
  if (b.flagged && b.riskLevel === 'high') return 'High'
  if (b.flagged && b.riskLevel === 'medium') return 'Medium'
  return null
}

function BrokerGroup({ title, tone, brokers, onOpen }: BrokerGroupProps) {
  return (
    <div className={`cd-broker-risk__group tone-${tone}`}>
      <h3 className="cd-broker-risk__group-title">{title}</h3>
      <ul className="cd-broker-risk__rows">
        {brokers.map((b) => {
          const badge = riskBadgeLabel(b)
          return (
            <li key={b.name}>
              <button
                type="button"
                className="cd-broker-risk__row"
                title={
                  badge
                    ? `Credyx risk: ${badge}`
                    : getBrokerPayRatingLabel(b.rating)
                }
                onClick={onOpen}
              >
                <span className="cd-broker-risk__name">
                  {b.name}
                  {badge ? (
                    <span
                      className={`cd-broker-risk__flag cd-broker-risk__flag--${b.riskLevel}`}
                    >
                      {badge}
                    </span>
                  ) : null}
                </span>
                <span className="cd-broker-risk__meta">
                  {b.avgDays != null ? (
                    <span className="tabular-nums">{b.avgDays}d</span>
                  ) : null}
                  {b.overdueAmount > 0 ? (
                    <span className="cd-broker-risk__overdue tabular-nums">
                      {formatCurrency(b.overdueAmount)}
                    </span>
                  ) : (
                    <span className="cd-broker-risk__ar tabular-nums">
                      {formatCurrency(b.openAr)}
                    </span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
