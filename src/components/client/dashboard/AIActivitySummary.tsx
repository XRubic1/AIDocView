import { formatCurrency, formatDate } from '../../../utils/format'
import { CheckCircle2, FileText, TrendingUp, AlertCircle } from 'lucide-react'

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

/**
 * AI-powered activity summary showing what happened since the carrier's last login.
 * Gives context and orientation immediately upon landing on the dashboard.
 */
export default function AIActivitySummary({
  activities,
  daysSinceLastLogin,
  loading = false,
}: AIActivitySummaryProps) {
  if (loading) {
    return (
      <div className="cd-ai-summary is-loading" aria-label="Loading activity summary">
        <div className="cd-ai-summary__head">
          <span className="cd-ai-summary__icon" aria-hidden>
            🤖
          </span>
          <span className="cd-ai-summary__greeting">Loading...</span>
        </div>
      </div>
    )
  }

  if (activities.length === 0) {
    return (
      <div className="cd-ai-summary cd-ai-summary--empty">
        <div className="cd-ai-summary__head">
          <span className="cd-ai-summary__icon" aria-hidden>
            🤖
          </span>
          <span className="cd-ai-summary__greeting">
            Welcome back! No new activity since your last visit.
          </span>
        </div>
      </div>
    )
  }

  const timeLabel =
    daysSinceLastLogin === 0
      ? 'today'
      : daysSinceLastLogin === 1
        ? 'yesterday'
        : `last ${daysSinceLastLogin} days`

  return (
    <div className="cd-ai-summary">
      <div className="cd-ai-summary__head">
        <span className="cd-ai-summary__icon" aria-hidden>
          🤖
        </span>
        <span className="cd-ai-summary__greeting">
          Since you were away ({timeLabel}):
        </span>
      </div>

      <ul className="cd-ai-summary__list">
        {activities.map((activity, idx) => {
          const Icon = ACTIVITY_ICONS[activity.icon || 'change']
          return (
            <li
              key={idx}
              className={`cd-ai-summary__item${activity.tone ? ` tone-${activity.tone}` : ''}`}
            >
              <span className="cd-ai-summary__item-icon" aria-hidden>
                <Icon size={14} strokeWidth={2} />
              </span>
              <span className="cd-ai-summary__item-text">
                <strong>{activity.label}</strong>
                {activity.detail ? ` ${activity.detail}` : ''}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
