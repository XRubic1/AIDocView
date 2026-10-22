import { useState } from 'react'
import type { InvoiceBlueprintChaseTrack } from '../../utils/invoiceBlueprintChaseInsight'

interface InvoiceBlueprintChaseTrackProps {
  track: InvoiceBlueprintChaseTrack
  title: string
  subtitle: string
}

function formatDone(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function stateLabelWithRun(
  state: 'done' | 'current' | 'upcoming',
  completedAt?: string,
  runsAt?: string
): string {
  const base = stateLabel(state, completedAt)
  const when = formatDone(runsAt)
  return when && state !== 'done' ? `${base} · Runs ${when}` : base
}

function stateLabel(state: 'done' | 'current' | 'upcoming', completedAt?: string): string {
  if (state === 'current') return 'Current step'
  if (state === 'done') {
    const when = formatDone(completedAt)
    return when ? `Done · ${when}` : 'Done'
  }
  return 'Upcoming'
}

/** Numbered blueprint path. The current step is the green circle. */
export default function InvoiceBlueprintChaseTrackView({
  track,
  title,
  subtitle,
}: InvoiceBlueprintChaseTrackProps) {
  const [openId, setOpenId] = useState<string | null>(null)
  const open = track.steps.find((step) => step.id === openId) ?? null

  return (
    <div
      className="mobile-invoice-overview__insight inv-chase-track"
      onMouseLeave={() => setOpenId(null)}
    >
      <div className="inv-chase-track__copy">
        <span className="mobile-invoice-overview__insight-title">{title}</span>
        {subtitle ? (
          <span className="mobile-invoice-overview__insight-sub">{subtitle}</span>
        ) : null}
      </div>
      <ol className="inv-chase-steps" aria-label={`${track.blueprintName} steps`}>
        {track.steps.map((step) => (
          <li key={step.id} className={`inv-chase-steps__item is-${step.state}`}>
            <button
              type="button"
              className="inv-chase-steps__dot"
              aria-current={step.state === 'current' ? 'step' : undefined}
              aria-label={`${step.number}. ${step.label}. ${step.detail}${
                step.completedAt ? `. Completed ${formatDone(step.completedAt)}` : ''
              }${step.runsAt ? `. Runs ${formatDone(step.runsAt)}` : ''}`}
              onMouseEnter={() => setOpenId(step.id)}
              onFocus={() => setOpenId(step.id)}
              onBlur={() => setOpenId(null)}
            >
              {step.number}
            </button>
            {step.number < track.steps.length ? (
              <span className="inv-chase-steps__line" aria-hidden />
            ) : null}
          </li>
        ))}
      </ol>
      {open ? (
        <div className="inv-chase-steps__detail" role="tooltip">
          <span className="inv-chase-steps__tip-title">{open.label}</span>
          <span className={`inv-chase-steps__tip-state is-${open.state}`}>
            {stateLabelWithRun(open.state, open.completedAt, open.runsAt)}
          </span>
          <span className="inv-chase-steps__tip-detail">{open.detail}</span>
        </div>
      ) : null}
    </div>
  )
}
