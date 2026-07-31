import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldAlert, ShieldCheck, Shield } from 'lucide-react'
import type { Invoice } from '../../../types/invoice'
import type { Payment } from '../../../types/payment'
import type { BrokerPayRating } from '../../../types/clientBroker'
import { computeBrokerScores } from '../../../utils/clientReports'
import {
  getBrokerPayRating,
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
  openAr: number
  overdueAmount: number
  overdueCount: number
  avgDays: number | null
  collectionRate: number
}

const ALL_TIME = {
  start_date: '2000-01-01',
  end_date: new Date().toISOString().slice(0, 10),
}

/**
 * Compact broker pay-risk overview under Actions —
 * good payers vs watch list vs slow/risky brokers.
 */
export default function BrokerRiskOverview({
  invoices,
  payments,
  loading = false,
  className,
}: BrokerRiskOverviewProps) {
  const navigate = useNavigate()

  const { counts, good, risky, watch } = useMemo(() => {
    const scores = computeBrokerScores(invoices, payments, ALL_TIME)
    const rated: RatedBroker[] = scores
      .filter((s) => s.open_ar > 0 || s.invoiced_in_range > 0 || s.collected_in_range > 0)
      .map((s) => ({
        name: s.broker_name,
        rating: getBrokerPayRating(s),
        openAr: s.open_ar,
        overdueAmount: s.overdue_amount,
        overdueCount: s.overdue_count,
        avgDays: s.avg_days_to_pay,
        collectionRate: s.collection_rate,
      }))

    const goodList = rated
      .filter((b) => b.rating === 'green')
      .sort((a, b) => b.openAr - a.openAr || (a.avgDays ?? 99) - (b.avgDays ?? 99))
    const watchList = rated
      .filter((b) => b.rating === 'yellow')
      .sort((a, b) => b.overdueAmount - a.overdueAmount || b.openAr - a.openAr)
    const riskyList = rated
      .filter((b) => b.rating === 'red')
      .sort((a, b) => b.overdueAmount - a.overdueAmount || b.openAr - a.openAr)

    return {
      counts: {
        good: goodList.length,
        watch: watchList.length,
        risky: riskyList.length,
        total: rated.length,
      },
      good: goodList.slice(0, 2),
      watch: watchList.slice(0, 2),
      risky: riskyList.slice(0, 2),
    }
  }, [invoices, payments])

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
          aria-label={`${counts.good} reliable, ${counts.watch} watch list, ${counts.risky} risky`}
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
            <span className="cd-broker-risk__stat-label">Risky</span>
            <span className="cd-broker-risk__stat-n tabular-nums">{counts.risky}</span>
          </div>
        </div>
      </div>

      <div className="cd-broker-risk__lists">
        {risky.length > 0 ? (
          <BrokerGroup
            title="Needs attention"
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

function BrokerGroup({ title, tone, brokers, onOpen }: BrokerGroupProps) {
  return (
    <div className={`cd-broker-risk__group tone-${tone}`}>
      <h3 className="cd-broker-risk__group-title">{title}</h3>
      <ul className="cd-broker-risk__rows">
        {brokers.map((b) => (
          <li key={b.name}>
            <button
              type="button"
              className="cd-broker-risk__row"
              title={getBrokerPayRatingLabel(b.rating)}
              onClick={onOpen}
            >
              <span className="cd-broker-risk__name">{b.name}</span>
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
        ))}
      </ul>
    </div>
  )
}
