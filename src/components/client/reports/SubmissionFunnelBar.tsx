import { useClientTheme } from '../../../theme/ThemeContext'
import type { PipelineMetrics } from '../../../utils/clientReports'

type FunnelSegment = {
  id: string
  label: string
  count: number
  color: string
}

type SubmissionFunnelBarProps = {
  pipeline: PipelineMetrics
}

/** Horizontal stacked bar — submission funnel by status with legend. */
export default function SubmissionFunnelBar({ pipeline }: SubmissionFunnelBarProps) {
  const c = useClientTheme()

  const segments: FunnelSegment[] = [
    { id: 'approved', label: 'Approved / Paid', count: pipeline.approved + pipeline.paid, color: c.success },
    { id: 'pending', label: 'Pending review', count: pipeline.pending, color: c.chart.cyan },
    { id: 'hold', label: 'On hold', count: pipeline.on_hold, color: c.warning },
    { id: 'rejected', label: 'Rejected', count: pipeline.rejected, color: c.error },
  ].filter((s) => s.count > 0)

  const total = segments.reduce((s, seg) => s + seg.count, 0) || pipeline.submitted

  if (total === 0) {
    return (
      <p className="text-xs text-center py-3" style={{ color: c.secondary }}>
        No submissions in this period
      </p>
    )
  }

  return (
    <div className="submission-funnel-bar">
      <div className="submission-funnel-bar__track" role="img" aria-label="Submission funnel by status">
        {segments.map((seg) => {
          const pct = (seg.count / total) * 100
          if (pct <= 0) return null
          return (
            <div
              key={seg.id}
              className="submission-funnel-bar__segment"
              style={{ width: `${pct}%`, backgroundColor: seg.color }}
              title={`${seg.label}: ${seg.count} (${pct.toFixed(0)}%)`}
            />
          )
        })}
      </div>
      <ul className="submission-funnel-bar__legend">
        {segments.map((seg) => (
          <li key={seg.id} className="submission-funnel-bar__legend-item">
            <span className="submission-funnel-bar__dot" style={{ backgroundColor: seg.color }} />
            <span className="submission-funnel-bar__legend-label" style={{ color: c.secondary }}>
              {seg.label}
            </span>
            <span className="submission-funnel-bar__legend-value tabular-nums" style={{ color: c.primary }}>
              {seg.count}
            </span>
            <span className="submission-funnel-bar__legend-pct tabular-nums" style={{ color: c.mutedLight }}>
              {((seg.count / total) * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
