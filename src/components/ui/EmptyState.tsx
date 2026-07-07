import type { LucideIcon } from 'lucide-react'
import { Inbox } from 'lucide-react'

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
  return (
    <div
      className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`.trim()}
    >
      <Icon className="w-10 h-10 text-slate-300 dark:text-zinc-600 mb-3" aria-hidden />
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{title}</p>
      {hint && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">{hint}</p>}
      {children}
    </div>
  )
}
