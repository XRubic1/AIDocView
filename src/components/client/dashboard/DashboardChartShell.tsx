import { type ReactNode } from 'react'
import { type LucideIcon } from 'lucide-react'
import { useClientTheme } from '../../../theme/ThemeContext'

interface DashboardChartShellProps {
  icon: LucideIcon
  title: string
  subtitle?: string
  statLabel?: string
  statValue?: string
  statHint?: ReactNode
  children: ReactNode
  footer?: ReactNode
}

/** Modern chart card wrapper for the client dashboard. */
export default function DashboardChartShell({
  icon: Icon,
  title,
  subtitle,
  statLabel,
  statValue,
  statHint,
  children,
  footer,
}: DashboardChartShellProps) {
  const t = useClientTheme()
  return (
    <div
      className="dashboard-card overflow-hidden transition-shadow hover:shadow-md"
    >
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3 border-b" style={{ borderColor: t.border }}>
        <div className="flex items-start gap-3 min-w-0">
          <div
            className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: t.accentLight, color: t.accent }}
          >
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold" style={{ color: t.primary }}>
              {title}
            </h3>
            {subtitle && (
              <p className="text-xs mt-0.5 truncate" style={{ color: t.muted }}>
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {statValue && (
          <div className="text-right shrink-0">
            {statLabel && (
              <p className="text-[10px] uppercase tracking-wide font-medium" style={{ color: t.muted }}>
                {statLabel}
              </p>
            )}
            <p className="text-lg font-bold leading-tight" style={{ color: t.primary }}>
              {statValue}
            </p>
            {statHint}
          </div>
        )}
      </div>

      <div className="px-2 pb-2 pt-1">{children}</div>

      {footer && (
        <div className="px-4 py-2.5 border-t text-xs" style={{ borderColor: t.border, backgroundColor: t.card }}>
          {footer}
        </div>
      )}
    </div>
  )
}
