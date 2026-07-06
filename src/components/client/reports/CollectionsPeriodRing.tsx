import { useClientTheme } from '../../../theme/ThemeContext'
import { formatCurrency } from '../../../utils/format'

type CollectionsPeriodRingProps = {
  collected: number
  outstanding: number
  compact?: boolean
}

/** Donut ring — collected vs outstanding for the selected period. */
export default function CollectionsPeriodRing({
  collected,
  outstanding,
  compact = false,
}: CollectionsPeriodRingProps) {
  const c = useClientTheme()
  const total = collected + outstanding
  const rate = total > 0 ? (collected / total) * 100 : 0

  const size = compact ? 96 : 120
  const stroke = compact ? 10 : 12
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const collectedLen = total > 0 ? (collected / total) * circumference : 0
  const outstandingLen = circumference - collectedLen

  return (
    <div className={`collections-period-ring ${compact ? 'collections-period-ring--compact' : ''}`}>
      <div className="collections-period-ring__wrap">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="collections-period-ring__svg"
          role="img"
          aria-label={`${rate.toFixed(0)} percent collected`}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={c.chartGrid}
            strokeWidth={stroke}
          />
          {total > 0 && (
            <>
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={c.success}
                strokeWidth={stroke}
                strokeDasharray={`${collectedLen} ${circumference}`}
                strokeDashoffset={circumference * 0.25}
                strokeLinecap="round"
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
              {outstanding > 0 && (
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={c.warning}
                  strokeWidth={stroke}
                  strokeDasharray={`${outstandingLen} ${circumference}`}
                  strokeDashoffset={circumference * 0.25 - collectedLen}
                  strokeLinecap="round"
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
              )}
            </>
          )}
        </svg>
        <div className="collections-period-ring__center">
          <span className="collections-period-ring__pct tabular-nums" style={{ color: c.primary }}>
            {rate.toFixed(0)}%
          </span>
          <span className="collections-period-ring__label" style={{ color: c.secondary }}>
            collected
          </span>
        </div>
      </div>
      <div className="collections-period-ring__stats">
        <div className="collections-period-ring__stat">
          <span className="collections-period-ring__stat-label" style={{ color: c.secondary }}>
            Collected
          </span>
          <span className="collections-period-ring__stat-value tabular-nums" style={{ color: c.success }}>
            {formatCurrency(collected)}
          </span>
        </div>
        <div className="collections-period-ring__stat">
          <span className="collections-period-ring__stat-label" style={{ color: c.secondary }}>
            Outstanding
          </span>
          <span className="collections-period-ring__stat-value tabular-nums" style={{ color: c.warning }}>
            {formatCurrency(outstanding)}
          </span>
        </div>
      </div>
    </div>
  )
}
