type DonutRingProps = {
  onTimeAmount: number
  overdueAmount: number
  totalAmount: number
  /** Real on-time open invoice count (preferred over amount estimate). */
  onTimeCount?: number
  /** Real overdue open invoice count. */
  overdueCount?: number
  loading?: boolean
}

const VIEW = 100

/**
 * Combined donut: on-time (blue) vs overdue (red). Scales via CSS for narrow rails.
 */
export default function DonutRing({
  onTimeAmount,
  overdueAmount,
  totalAmount,
  onTimeCount: onTimeCountProp,
  overdueCount: overdueCountProp,
  loading = false,
}: DonutRingProps) {
  const strokeWidth = 10
  const radius = (VIEW - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  const onTimePct = totalAmount > 0 ? (onTimeAmount / totalAmount) * 100 : 0
  const overduePct = totalAmount > 0 ? (overdueAmount / totalAmount) * 100 : 0

  const onTimeOffset = circumference - (onTimePct / 100) * circumference
  const overdueOffset = circumference - (overduePct / 100) * circumference

  const onTimeCount = typeof onTimeCountProp === 'number' ? onTimeCountProp : 0
  const overdueCount = typeof overdueCountProp === 'number' ? overdueCountProp : 0
  const totalCount = onTimeCount + overdueCount

  if (loading) {
    return (
      <div className="cd-donut-ring is-loading" aria-label="Loading ring chart">
        <div className="cd-donut-ring__chart">
          <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="cd-donut-ring__svg" aria-hidden>
            <circle
              cx={VIEW / 2}
              cy={VIEW / 2}
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
        <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="cd-donut-ring__svg" aria-hidden>
          <circle
            cx={VIEW / 2}
            cy={VIEW / 2}
            r={radius}
            fill="none"
            stroke="rgba(255, 255, 255, 0.1)"
            strokeWidth={strokeWidth}
          />
          {overduePct > 0 ? (
            <circle
              cx={VIEW / 2}
              cy={VIEW / 2}
              r={radius}
              fill="none"
              stroke="#f87171"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={overdueOffset}
              strokeLinecap="round"
              transform={`rotate(-90 ${VIEW / 2} ${VIEW / 2})`}
            />
          ) : null}
          {onTimePct > 0 ? (
            <circle
              cx={VIEW / 2}
              cy={VIEW / 2}
              r={radius}
              fill="none"
              stroke="#1684fe"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={onTimeOffset}
              strokeLinecap="round"
              transform={`rotate(${(overduePct / 100) * 360 - 90} ${VIEW / 2} ${VIEW / 2})`}
            />
          ) : null}
        </svg>
        <div className="cd-donut-ring__center">
          <span className="cd-donut-ring__total tabular-nums">{totalCount || '—'}</span>
          <span className="cd-donut-ring__label">Total</span>
        </div>
      </div>
      <div className="cd-donut-ring__legend">
        <div className="cd-donut-ring__legend-item">
          <i className="cd-donut-ring__dot cd-donut-ring__dot--ontime" aria-hidden />
          <span className="cd-donut-ring__legend-text">
            <span className="cd-donut-ring__legend-count tabular-nums">{onTimeCount}</span>
            <span className="cd-donut-ring__legend-label">On-time</span>
          </span>
        </div>
        <div className="cd-donut-ring__legend-item">
          <i className="cd-donut-ring__dot cd-donut-ring__dot--overdue" aria-hidden />
          <span className="cd-donut-ring__legend-text">
            <span className="cd-donut-ring__legend-count tabular-nums">{overdueCount}</span>
            <span className="cd-donut-ring__legend-label">Overdue</span>
          </span>
        </div>
      </div>
    </div>
  )
}
