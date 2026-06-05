import { type ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { clientTheme as t } from '../../../theme/clientTheme'

interface DashboardPanelProps {
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  children: ReactNode
  className?: string
  compact?: boolean
  interactive?: boolean
}

/** Premium card wrapper for dashboard sections. */
export default function DashboardPanel({
  title,
  description,
  actionLabel,
  onAction,
  children,
  className = '',
  compact = false,
  interactive = true,
}: DashboardPanelProps) {
  return (
    <section
      className={`dashboard-card overflow-hidden ${interactive ? 'dashboard-card-interactive' : ''} ${className}`}
    >
      <div
        className={`flex items-center justify-between gap-3 border-b ${
          compact ? 'px-5 py-3' : 'px-5 py-3.5'
        }`}
        style={{ borderColor: t.border }}
      >
        <div className="min-w-0">
          <h2
            className={`truncate ${compact ? 'text-base font-semibold' : 'text-lg font-semibold'}`}
            style={{ color: t.primary }}
          >
            {title}
          </h2>
          {description && !compact && (
            <p className="text-sm font-medium mt-1" style={{ color: t.secondary }}>
              {description}
            </p>
          )}
        </div>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="inline-flex items-center gap-1 text-sm font-medium shrink-0 transition-opacity hover:opacity-70"
            style={{ color: t.info }}
          >
            {actionLabel}
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
      {children}
    </section>
  )
}
