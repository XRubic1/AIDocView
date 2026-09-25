import { getInitials } from '../../config/clientNav'
import { AI_DOC_SPLIT_LOCK } from '../../services/resourceLockService'
import { useClientTheme } from '../../theme/ThemeContext'

type InUseBubbleProps = {
  name?: string | null
  /** Compact: initials only (list cells). */
  compact?: boolean
  className?: string
}

/**
 * Presence chip for workspace locks — initials bubble + name.
 * AI Doc Split shows a distinct label without fake initials.
 */
export default function InUseBubble({ name, compact = false, className = '' }: InUseBubbleProps) {
  const c = useClientTheme()
  const label = (name || '').trim() || 'In use'
  const isAi = label === AI_DOC_SPLIT_LOCK
  const initials = isAi ? 'AI' : getInitials(label)

  return (
    <span
      className={`inline-flex items-center gap-1.5 min-w-0 ${className}`}
      title={label}
    >
      <span
        className="inline-flex items-center justify-center shrink-0 rounded-full text-[10px] font-semibold leading-none"
        style={{
          width: 22,
          height: 22,
          backgroundColor: isAi ? c.secondary : c.accent,
          color: '#fff',
        }}
        aria-hidden
      >
        {initials}
      </span>
      {!compact ? (
        <span className="truncate text-xs" style={{ color: c.primary }}>
          {label}
        </span>
      ) : null}
    </span>
  )
}
