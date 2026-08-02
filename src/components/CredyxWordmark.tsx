import type { CSSProperties, KeyboardEvent } from 'react'
import { useTheme } from '../theme/ThemeContext'

export type CredyxWordmarkVariant = 'full' | 'compact' | 'mark'
export type CredyxWordmarkTheme = 'client' | 'admin'

interface CredyxWordmarkProps {
  variant?: CredyxWordmarkVariant
  theme?: CredyxWordmarkTheme
  className?: string
  onClick?: () => void
  /**
   * Force logo contrast. Default follows the active color theme
   * (`on-dark` = white wordmark, `on-light` = navy wordmark).
   */
  surface?: 'on-light' | 'on-dark' | 'auto'
}

const themeTokens: Record<
  CredyxWordmarkTheme,
  { primary: string; accent: string; muted: string; markBg: string; markText: string }
> = {
  client: {
    primary: '#0F172A',
    accent: '#3B82F6',
    muted: '#64748B',
    markBg: '#0F172A',
    markText: '#FFFFFF',
  },
  admin: {
    primary: '#113543',
    accent: '#C2A558',
    muted: '#819291',
    markBg: '#113543',
    markText: '#C2A558',
  },
}

/** Tight-cropped transparent wordmarks for nav chrome. */
const CLIENT_LOGO_ON_LIGHT = '/credyx-nav-wordmark-light.png'
const CLIENT_LOGO_ON_DARK = '/credyx-nav-wordmark-dark.png'

/** Typographic Credyx brand mark for navbars and sidebars. */
export default function CredyxWordmark({
  variant = 'full',
  theme = 'client',
  className = '',
  onClick,
  surface = 'auto',
}: CredyxWordmarkProps) {
  const colors = themeTokens[theme]
  const { resolvedTheme } = useTheme()
  const isInteractive = !!onClick
  const onDark =
    surface === 'on-dark' || (surface === 'auto' && resolvedTheme === 'dark')

  const rootStyle: CSSProperties = {
    cursor: isInteractive ? 'pointer' : undefined,
  }

  const interactiveProps = {
    onClick,
    onKeyDown: isInteractive
      ? (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onClick?.()
          }
        }
      : undefined,
    role: isInteractive ? ('button' as const) : undefined,
    tabIndex: isInteractive ? 0 : undefined,
    'aria-label': 'Credyx A/R Solutions',
  }

  // Client portal — real logo image (cropped, transparent).
  if (theme === 'client' && variant !== 'mark') {
    return (
      <div
        className={`credyx-wordmark credyx-wordmark--logo credyx-wordmark--${variant} credyx-wordmark--${theme}${
          onDark ? ' credyx-wordmark--on-dark' : ' credyx-wordmark--on-light'
        } ${className}`.trim()}
        style={rootStyle}
        {...interactiveProps}
      >
        <img
          src={onDark ? CLIENT_LOGO_ON_DARK : CLIENT_LOGO_ON_LIGHT}
          alt="Credyx"
          className="credyx-wordmark__logo-img"
          width={360}
          height={110}
          decoding="async"
          draggable={false}
        />
      </div>
    )
  }

  if (variant === 'mark') {
    return (
      <div
        className={`credyx-wordmark credyx-wordmark--mark credyx-wordmark--${theme} ${className}`.trim()}
        style={rootStyle}
        {...interactiveProps}
      >
        <span
          className="credyx-wordmark__mark-letter"
          style={{ backgroundColor: colors.markBg, color: colors.markText }}
        >
          C
        </span>
      </div>
    )
  }

  return (
    <div
      className={`credyx-wordmark credyx-wordmark--${variant} credyx-wordmark--${theme} ${className}`.trim()}
      style={rootStyle}
      {...interactiveProps}
    >
      <span className="credyx-wordmark__name" style={{ color: colors.primary }}>
        Cred
        <span style={{ color: colors.accent }}>yx</span>
      </span>
      {variant === 'full' && (
        <span className="credyx-wordmark__tagline" style={{ color: colors.muted }}>
          A/R Solutions
        </span>
      )}
    </div>
  )
}
