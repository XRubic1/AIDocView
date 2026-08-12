import { useClientTheme } from '../../theme/ThemeContext'

interface SectionHeaderProps {
  /** Section label shown in uppercase */
  label: string
  /** Optional count badge next to the label */
  count?: number
}

/**
 * Compact section divider for the urgency-first admin dashboard hierarchy.
 * Inputs: label + optional count. Output: uppercase label with thin divider.
 */
export function SectionHeader({ label, count }: SectionHeaderProps) {
  const c = useClientTheme()

  return (
    <div className="flex items-center gap-3 pt-1">
      <div className="flex items-center gap-2 shrink-0">
        <h2
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: c.secondary }}
        >
          {label}
        </h2>
        {typeof count === 'number' && count > 0 && (
          <span
            className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-[10px] font-bold tabular-nums"
            style={{ backgroundColor: c.stat.amber, color: c.warning }}
          >
            {count}
          </span>
        )}
      </div>
      <div className="flex-1 h-px" style={{ backgroundColor: c.border }} />
    </div>
  )
}
