import { useCountUp } from '../../../hooks/useCountUp'
import { formatCurrency } from '../../../utils/format'
import DonutRing from './DonutRing'
import CompactAgingBar from './CompactAgingBar'
import StatusStatChips from './StatusStatChips'

type StatusStatChip = {
  key: string
  label: string
  value: string
  count: number
  tone: 'neutral' | 'warn' | 'danger' | 'success' | 'info'
  navigateTo: string
}

type OpenBalanceCardProps = {
  /** Open A/R amount to display. */
  amount: number
  /** On-time share of open A/R (sums with overdue to amount). */
  onTimeAmount?: number
  /** Overdue share of open A/R (sums with on-time to amount). */
  overdueAmount?: number
  /** Optional carrier / account label on the card face. */
  accountName?: string
  /** Aging A/R data for compact bar. */
  aging?: {
    '1_15': number
    '16_30': number
    '31_45': number
    '46_60': number
    '61_90': number
    over_91: number
    total: number
  }
  /** Status stat chips (Held, Overdue, Awaiting, Paid 30d). */
  statusChips?: StatusStatChip[]
  /** Recent collections context line (e.g. "$12,345 collected in last 30 days"). */
  recentCollections?: {
    amount: number
    period: string
    trend?: 'up' | 'down' | 'flat'
  }
  /** Soft loading placeholder while data resolves. */
  loading?: boolean
}

/**
 * Expanded Open Balance card — now absorbs the donut ring, aging bar, and status chips.
 * Dense summary card with all key A/R metrics in one place.
 */
export default function OpenBalanceCard({
  amount,
  onTimeAmount,
  overdueAmount,
  accountName,
  aging,
  statusChips = [],
  recentCollections,
  loading = false,
}: OpenBalanceCardProps) {
  const animated = useCountUp(loading ? 0 : amount, { decimals: 2, duration: 900 })
  const showSplit =
    !loading &&
    typeof onTimeAmount === 'number' &&
    typeof overdueAmount === 'number'

  return (
    <article
      className={`cd-open-balance cd-open-balance--expanded${loading ? ' is-loading' : ''}`}
      aria-label="Open Balance"
    >
      <div className="cd-open-balance__wash" aria-hidden />

      <div className="cd-open-balance__main">
        <header className="cd-open-balance__top">
          <div>
            <p className="cd-open-balance__label">Open Balance</p>
            <p className="cd-open-balance__eyebrow">Open A/R</p>
          </div>
          {showSplit && onTimeAmount != null && overdueAmount != null ? (
            <DonutRing
              onTimeAmount={onTimeAmount}
              overdueAmount={overdueAmount}
              totalAmount={amount}
              loading={loading}
            />
          ) : null}
        </header>

        <p className="cd-open-balance__amount tabular-nums">
          {loading ? '—' : formatCurrency(animated)}
        </p>

        {recentCollections && !loading ? (
          <div className="cd-open-balance__context">
            <span className="cd-open-balance__context-text">
              {formatCurrency(recentCollections.amount)} collected in {recentCollections.period}
            </span>
            {recentCollections.trend === 'up' ? (
              <span className="cd-open-balance__context-icon is-up" aria-label="Trending up">
                ↑
              </span>
            ) : recentCollections.trend === 'down' ? (
              <span className="cd-open-balance__context-icon is-down" aria-label="Trending down">
                ↓
              </span>
            ) : null}
          </div>
        ) : null}

        {statusChips.length > 0 ? (
          <StatusStatChips chips={statusChips} loading={loading} />
        ) : null}
      </div>

      {aging ? (
        <div className="cd-open-balance__aging">
          <CompactAgingBar aging={aging} loading={loading} />
        </div>
      ) : null}

      <footer className="cd-open-balance__foot">
        <span className="cd-open-balance__account">
          {accountName?.trim() || 'Carrier account'}
        </span>
      </footer>
    </article>
  )
}
