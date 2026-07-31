import { AlertCircle, Bot, CheckCircle2, FileText, TrendingUp } from 'lucide-react'

type ActivityItem = {
  type: 'payment' | 'batch' | 'status_change' | 'hold'
  label: string
  detail: string
  icon?: 'payment' | 'batch' | 'change' | 'alert'
  tone?: 'success' | 'info' | 'warn' | 'neutral'
}

type AIActivitySummaryProps = {
  activities: ActivityItem[]
  daysSinceLastLogin: number
  loading?: boolean
}

const ACTIVITY_ICONS = {
  payment: CheckCircle2,
  batch: FileText,
  change: TrendingUp,
  alert: AlertCircle,
}

/** Compact away-period label for the strip. */
function awayLabel(daysSinceLastLogin: number): string {
  if (daysSinceLastLogin === 0) return 'today'
  if (daysSinceLastLogin === 1) return 'yesterday'
  return `${daysSinceLastLogin}d`
}

/**
 * Compact activity strip for the dashboard top — quick scan of what changed while away.
 */
export default function AIActivitySummary({
  activities,
  daysSinceLastLogin,
  loading = false,
}: AIActivitySummaryProps) {
  if (loading) {
    return (
      <div className="cd-ai-summary is-loading" aria-label="Loading activity summary">
        <span className="cd-ai-summary__label">
          <Bot size={14} strokeWidth={2} aria-hidden />
          <span>Loading activity…</span>
        </span>
      </div>
    )
  }

  if (activities.length === 0) {
    return (
      <div className="cd-ai-summary cd-ai-summary--empty">
        <span className="cd-ai-summary__label">
          <Bot size={14} strokeWidth={2} aria-hidden />
          <span>No new activity since your last visit</span>
        </span>
      </div>
    )
  }

  return (
    <div className="cd-ai-summary" role="status" aria-live="polite">
      <span className="cd-ai-summary__label">
        <Bot size={14} strokeWidth={2} aria-hidden />
        <span>
          Away · {awayLabel(daysSinceLastLogin)}
        </span>
      </span>

      <ul className="cd-ai-summary__list">
        {activities.map((activity, idx) => {
          const Icon = ACTIVITY_ICONS[activity.icon || 'change']
          const text = [activity.label, activity.detail].filter(Boolean).join(' ').trim()
          return (
            <li
              key={`${activity.type}-${idx}`}
              className={`cd-ai-summary__item${activity.tone ? ` tone-${activity.tone}` : ''}`}
              title={text}
            >
              <span className="cd-ai-summary__item-icon" aria-hidden>
                <Icon size={12} strokeWidth={2.25} />
              </span>
              <span className="cd-ai-summary__item-text">{text}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
