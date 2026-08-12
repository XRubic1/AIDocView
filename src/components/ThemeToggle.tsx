import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../theme/ThemeContext'

interface ThemeToggleProps {
  className?: string
  /** Compact icon-only button for headers. */
  compact?: boolean
  /**
   * Sidebar row matching nav items (icon column + label).
   * When set, `compact` is ignored.
   */
  sidebar?: {
    iconColWidth: number
    mutedColor: string
    hoverColor: string
    /** Tooltip when the rail is collapsed. */
    title?: string
  }
}

/** Switch between light and dark mode. */
export default function ThemeToggle({ className = '', compact = false, sidebar }: ThemeToggleProps) {
  const { resolvedTheme, toggleTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode'
  const modeLabel = isDark ? 'Light mode' : 'Dark mode'
  const Icon = isDark ? Sun : Moon

  if (sidebar) {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className={`w-full flex items-center text-[13px] transition-colors ${className}`.trim()}
        style={{ color: sidebar.mutedColor }}
        title={sidebar.title ?? label}
        aria-label={label}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = sidebar.hoverColor
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent'
        }}
      >
        <span
          className="shrink-0 flex items-center justify-center self-stretch py-1.5"
          style={{ width: sidebar.iconColWidth }}
        >
          <Icon className="w-4 h-4" strokeWidth={1.75} />
        </span>
        <span className="whitespace-nowrap truncate py-1.5 pr-2">{modeLabel}</span>
      </button>
    )
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className={`theme-toggle theme-toggle--compact ${className}`.trim()}
        aria-label={label}
        title={label}
      >
        <Icon className="w-4 h-4" />
      </button>
    )
  }

  return (
    <button type="button" onClick={toggleTheme} className={`theme-toggle ${className}`.trim()} aria-label={label}>
      <Icon className="w-4 h-4" />
      <span>{modeLabel}</span>
    </button>
  )
}
