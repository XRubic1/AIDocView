import type { CSSProperties, KeyboardEvent } from 'react'

export type CredyxWordmarkVariant = 'full' | 'compact' | 'mark'
export type CredyxWordmarkTheme = 'client' | 'admin'

interface CredyxWordmarkProps {
  variant?: CredyxWordmarkVariant
  theme?: CredyxWordmarkTheme
  className?: string
  onClick?: () => void
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

/** Light-mode client logo (navy Cred + blue yx arrow). */
const CLIENT_LOGO_SRC = '/credyx-nav-logo.png'

/** Typographic Credyx brand mark for navbars and sidebars. */
export default function CredyxWordmark({
  variant = 'full',
  theme = 'client',
  className = '',
  onClick,
}: CredyxWordmarkProps) {
  const colors = themeTokens[theme]
  const isInteractive = !!onClick

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

  // Client portal uses the real logo asset (text wordmark for admin stays).
  if (theme === 'client' && variant !== 'mark') {
    return (
      <div
        className={`credyx-wordmark credyx-wordmark--logo credyx-wordmark--${variant} credyx-wordmark--${theme} ${className}`.trim()}
        style={rootStyle}
        {...interactiveProps}
      >
        <img
          src={CLIENT_LOGO_SRC}
          alt="Credyx"
          className="credyx-wordmark__logo-img"
          width={360}
          height={96}
          decoding="async"
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
