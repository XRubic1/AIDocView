import type { LucideIcon } from 'lucide-react'
import { Inbox } from 'lucide-react'
import { useClientTheme } from '../../theme/ThemeContext'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  hint?: string
  className?: string
  children?: React.ReactNode
}

/** Shared empty list/table state — icon + title + optional help line. */
export default function EmptyState({
  icon: Icon = Inbox,
  title,
  hint,
  className = '',
  children,
}: EmptyStateProps) {
  const c = useClientTheme()
  return (
    <div
      className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`.trim()}
    >
      <Icon className="w-10 h-10 mb-3" style={{ color: c.mutedLight }} aria-hidden />
      <p className="text-sm font-medium" style={{ color: c.primary }}>
        {title}
      </p>
      {hint && (
        <p className="text-xs mt-1 max-w-sm" style={{ color: c.secondary }}>
          {hint}
        </p>
      )}
      {children}
    </div>
  )
}
