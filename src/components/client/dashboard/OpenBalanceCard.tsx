import { useCountUp } from '../../../hooks/useCountUp'
import { formatCurrency } from '../../../utils/format'

type OpenBalanceCardProps = {
  /** Open A/R amount to display. */
  amount: number
  /** On-time share of open A/R (sums with overdue to amount). */
  onTimeAmount?: number
  /** Overdue share of open A/R (sums with on-time to amount). */
  overdueAmount?: number
  /** Optional carrier / account label on the card face. */
  accountName?: string
  /** Soft loading placeholder while data resolves. */
  loading?: boolean
}

/**
 * Balance hero — Open Balance with an on-time / overdue split that reconciles.
 */
export default function OpenBalanceCard({
  amount,
  onTimeAmount,
  overdueAmount,
  accountName,
  loading = false,
}: OpenBalanceCardProps) {
  const animated = useCountUp(loading ? 0 : amount, { decimals: 2, duration: 900 })
  const showSplit =
    !loading &&
    typeof onTimeAmount === 'number' &&
    typeof overdueAmount === 'number'

  return (
    <article
      className={`cd-open-balance${loading ? ' is-loading' : ''}`}
      aria-label="Open Balance"
    >
      <div className="cd-open-balance__wash" aria-hidden />

      <header className="cd-open-balance__top">
        <p className="cd-open-balance__label">Open Balance</p>
        <p className="cd-open-balance__eyebrow">Open A/R</p>
      </header>

      <p className="cd-open-balance__amount tabular-nums">
        {loading ? '—' : formatCurrency(animated)}
      </p>

      {showSplit ? (
        <div className="cd-open-balance__split" aria-label="Open balance breakdown">
          <div className="cd-open-balance__split-item">
            <span className="cd-open-balance__split-label">On-time</span>
            <span className="cd-open-balance__split-value tabular-nums is-blue">
              {formatCurrency(onTimeAmount)}
            </span>
          </div>
          <div className="cd-open-balance__split-item">
            <span className="cd-open-balance__split-label">Overdue</span>
            <span className="cd-open-balance__split-value tabular-nums is-danger">
              {formatCurrency(overdueAmount)}
            </span>
          </div>
        </div>
      ) : null}

      <footer className="cd-open-balance__foot">
        <span className="cd-open-balance__account">
          {accountName?.trim() || 'Carrier account'}
        </span>
        {showSplit ? (
          <span className="cd-open-balance__reconcile">
            On-time + Overdue = Open Balance
          </span>
        ) : null}
      </footer>
    </article>
  )
}
