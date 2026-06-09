import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../theme/ThemeContext'

interface ThemeToggleProps {
  className?: string
  /** Compact icon-only button for headers. */
  compact?: boolean
}

/** Switch between light and dark mode. */
export default function ThemeToggle({ className = '', compact = false }: ThemeToggleProps) {
  const { resolvedTheme, toggleTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode'

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className={`theme-toggle theme-toggle--compact ${className}`.trim()}
        aria-label={label}
        title={label}
      >
        {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>
    )
  }

  return (
    <button type="button" onClick={toggleTheme} className={`theme-toggle ${className}`.trim()} aria-label={label}>
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      <span>{isDark ? 'Light mode' : 'Dark mode'}</span>
    </button>
  )
}
