import { useMemo } from 'react'
import { DollarSign, Layers, PauseCircle, AlertTriangle, Clock } from 'lucide-react'
import { useClientCapabilities } from '../../../hooks/useClientCapabilities'
import type { LucideIcon } from 'lucide-react'
import { useCountUp } from '../../../hooks/useCountUp'
import { useSeenInvoiceAlert } from '../../../hooks/useSeenInvoiceAlert'
import {
  computeActivityMetrics,
  type ActivityMetric,
  type ActivityMetricsInput,
  type ActivityTone,
} from '../../../utils/clientActivityMetrics'

/** Maps a metric key to its Lucide icon. */
const METRIC_ICONS: Record<string, LucideIcon> = {
  payments: DollarSign,
  payment_confirmation: Clock,
  batches: Layers,
  held: PauseCircle,
  overdue: AlertTriangle,
}

/**
 * Maps a metric tone onto the existing `dashboard-status-card` colour variants
 * so the activity cards visually match the status metric row they replace.
 */
const TONE_VARIANT: Record<ActivityTone, string> = {
  green: 'approved',
  blue: 'pending',
  amber: 'hold',
  red: 'overdue',
  slate: 'pending',
}

interface ActivityMetricCardProps {
  metric: ActivityMetric
  /** Per-client storage prefix used to remember which items were seen. */
  storageKeyPrefix: string | null
  onNavigate: (path: string) => void
}

/** Single activity card, styled like the dashboard status metric cards. */
function ActivityMetricCard({ metric, storageKeyPrefix, onNavigate }: ActivityMetricCardProps) {
  const animatedCount = useCountUp(metric.count)
  const variant = TONE_VARIANT[metric.tone]
  const Icon = METRIC_ICONS[metric.key] ?? DollarSign
  const clickable = Boolean(metric.navigateTo)

  // Only standing metrics (those exposing ids) support the "new item" alert.
  const trackIds = metric.ids ?? []
  const storageKey =
    metric.ids && storageKeyPrefix ? `${storageKeyPrefix}:${metric.key}` : null
  const { hasNew, acknowledge } = useSeenInvoiceAlert(storageKey, trackIds)

  const handleClick = () => {
    // Interacting with the card clears the flashing "new" indicator.
    if (hasNew) acknowledge()
    if (metric.navigateTo) onNavigate(metric.navigateTo)
  }

  const ariaLabel = `${metric.label}: ${metric.count}. ${metric.detail}${
    hasNew ? '. New items since your last visit' : ''
  }`

  const needsAttention =
    metric.key === 'payment_confirmation' && metric.count > 0

  return (
    <button
      type="button"
      className={[
        'dashboard-status-card',
        'dashboard-card-lift',
        `dashboard-status-card--${variant}`,
        needsAttention ? 'dashboard-status-card--confirm-attention' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={handleClick}
      disabled={!clickable}
      aria-label={ariaLabel}
    >
      {(hasNew || needsAttention) && (
        <span
          className="dashboard-status-card__alert"
          aria-hidden
          title={needsAttention ? 'Payments awaiting confirmation' : 'New activity'}
        />
      )}
      <div className="dashboard-status-card__head">
        <span className={`dashboard-status-card__icon dashboard-status-card__icon--${variant}`}>
          <Icon className="w-3 h-3" />
        </span>
        <span className="dashboard-status-card__label">{metric.label}</span>
      </div>
      <span className="dashboard-status-card__count tabular-nums">{animatedCount}</span>
      <span className="dashboard-status-card__context">{metric.detail}</span>
    </button>
  )
}

interface ActivityMetricsRowProps extends ActivityMetricsInput {
  /** Rolling window in days for the windowed metrics (defaults to 7). */
  windowDays?: number
  /** Active client id — scopes the per-client "seen" tracking. */
  clientId?: string | null
  onNavigate: (path: string) => void
}

/**
 * "Today's Activity" metric cards that replace the static status row: payments
 * received and batches processed over the last {windowDays} days, plus the
 * all-time held and overdue invoice counts. Held/overdue cards flash a faint
 * indicator when new invoices appear, clearing once the user interacts.
 */
export default function ActivityMetricsRow({
  invoices,
  payments,
  batches,
  windowDays = 7,
  clientId,
  onNavigate,
}: ActivityMetricsRowProps) {
  const { capabilities } = useClientCapabilities()

  const metrics = useMemo(() => {
    const all = computeActivityMetrics({ invoices, payments, batches }, windowDays).metrics
    if (!capabilities.canConfirmPaymentReceipt) {
      return all.filter((metric) => metric.key !== 'payment_confirmation')
    }
    return all
  }, [invoices, payments, batches, windowDays, capabilities.canConfirmPaymentReceipt])

  const storageKeyPrefix = clientId ? `credyx:seen-activity:${clientId}` : null

  return (
    <>
      {metrics.map((metric) => (
        <ActivityMetricCard
          key={metric.key}
          metric={metric}
          storageKeyPrefix={storageKeyPrefix}
          onNavigate={onNavigate}
        />
      ))}
    </>
  )
}
