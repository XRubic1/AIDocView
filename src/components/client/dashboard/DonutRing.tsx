type DonutRingProps = {
  onTimeAmount: number
  overdueAmount: number
  totalAmount: number
  loading?: boolean
}

/**
 * Single combined donut ring showing on-time (blue) vs overdue (red) open A/R.
 * Compact, fits inside the Open Balance card.
 */
export default function DonutRing({
  onTimeAmount,
  overdueAmount,
  totalAmount,
  loading = false,
}: DonutRingProps) {
  const size = 120
  const strokeWidth = 10
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  const onTimePct = totalAmount > 0 ? (onTimeAmount / totalAmount) * 100 : 0
  const overduePct = totalAmount > 0 ? (overdueAmount / totalAmount) * 100 : 0

  const onTimeOffset = circumference - (onTimePct / 100) * circumference
  const overdueOffset = circumference - (overduePct / 100) * circumference

  const onTimeCount = Math.round((onTimePct / 100) * totalAmount / 1000) // rough invoice count estimate
  const overdueCount = Math.round((overduePct / 100) * totalAmount / 1000)

  if (loading) {
    return (
      <div className="cd-donut-ring is-loading" aria-label="Loading ring chart">
        <div className="cd-donut-ring__chart">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="rgba(255, 255, 255, 0.1)"
              strokeWidth={strokeWidth}
            />
          </svg>
          <div className="cd-donut-ring__center">
            <span className="cd-donut-ring__total">—</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="cd-donut-ring" aria-label="Open A/R breakdown">
      <div className="cd-donut-ring__chart">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255, 255, 255, 0.1)"
            strokeWidth={strokeWidth}
          />
          {/* Overdue segment (red) */}
          {overduePct > 0 ? (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#f87171"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={overdueOffset}
              strokeLinecap="round"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              style={{
                transition: 'stroke-dashoffset 0.7s cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            />
          ) : null}
          {/* On-time segment (blue) */}
          {onTimePct > 0 ? (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#1684fe"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={onTimeOffset}
              strokeLinecap="round"
              transform={`rotate(${(overduePct / 100) * 360 - 90} ${size / 2} ${size / 2})`}
              style={{
                transition: 'stroke-dashoffset 0.7s cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            />
          ) : null}
        </svg>
        <div className="cd-donut-ring__center">
          <span className="cd-donut-ring__total tabular-nums">{Math.round(onTimeCount + overdueCount)}</span>
          <span className="cd-donut-ring__label">Total</span>
        </div>
      </div>
      <div className="cd-donut-ring__legend">
        <div className="cd-donut-ring__legend-item">
          <i className="cd-donut-ring__dot cd-donut-ring__dot--ontime" aria-hidden />
          <span className="cd-donut-ring__legend-label">On-time</span>
          <span className="cd-donut-ring__legend-count tabular-nums">{onTimeCount}</span>
        </div>
        <div className="cd-donut-ring__legend-item">
          <i className="cd-donut-ring__dot cd-donut-ring__dot--overdue" aria-hidden />
          <span className="cd-donut-ring__legend-label">Overdue</span>
          <span className="cd-donut-ring__legend-count tabular-nums">{overdueCount}</span>
        </div>
      </div>
    </div>
  )
}
