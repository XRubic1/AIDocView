import { useCountUp } from '../../../hooks/useCountUp'
import { formatCurrency } from '../../../utils/format'

type OpenBalanceCardProps = {
  /** Open A/R amount to display. */
  amount: number
  /** Optional carrier / account label on the card face. */
  accountName?: string
  /** Soft loading placeholder while data resolves. */
  loading?: boolean
}

/**
 * Balance hero in a wide card form (credit-card proportions, not a literal bank card).
 */
export default function OpenBalanceCard({
  amount,
  accountName,
  loading = false,
}: OpenBalanceCardProps) {
  const animated = useCountUp(loading ? 0 : amount, { decimals: 2, duration: 900 })

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

      <footer className="cd-open-balance__foot">
        <span className="cd-open-balance__account">
          {accountName?.trim() || 'Carrier account'}
        </span>
      </footer>
    </article>
  )
}
