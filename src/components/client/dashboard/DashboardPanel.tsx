import { type ReactNode } from 'react'
import { ArrowRight, type LucideIcon } from 'lucide-react'
import { useClientTheme } from '../../../theme/ThemeContext'

export type DashboardPanelIconTone =
  | 'blue'
  | 'green'
  | 'amber'
  | 'red'
  | 'purple'
  | 'slate'
  | 'cyan'

interface DashboardPanelProps {
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  children: ReactNode
  className?: string
  compact?: boolean
  interactive?: boolean
  icon?: LucideIcon
  iconTone?: DashboardPanelIconTone
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
  icon: Icon,
  iconTone = 'blue',
}: DashboardPanelProps) {
  const t = useClientTheme()
  return (
    <section
      className={`dashboard-card overflow-hidden ${interactive ? 'dashboard-card-interactive' : ''} ${className}`}
    >
      <div
        className={`flex items-center justify-between gap-3 border-b ${
          compact ? 'px-3 py-2' : 'px-5 py-3.5'
        }`}
        style={{ borderColor: t.border }}
      >
        <div className="min-w-0 flex items-center gap-2">
          {Icon && (
            <span
              className={`dashboard-panel-icon dashboard-panel-icon--${iconTone} shrink-0`}
              aria-hidden
            >
              <Icon className="w-3.5 h-3.5" />
            </span>
          )}
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
