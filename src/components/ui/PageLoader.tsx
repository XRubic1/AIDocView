import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import CredyxWordmark from '../CredyxWordmark'
import './pageLoader.css'

interface PageLoaderProps {
  message?: string
  /** When true, fills the viewport (boot / route guards). */
  fullScreen?: boolean
  /**
   * Replaces the Credyx logo (e.g. "Uploading").
   * When set, the branded logo/wordmark is hidden.
   */
  title?: string
  /**
   * 0–100 determinate progress. When set, the bar fills to this width
   * and a percent label is shown instead of the indeterminate sweep.
   */
  progress?: number
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return reduced
}

/**
 * Ease displayed progress toward the target so the bar fills slowly.
 * Never jumps backward (upload feel).
 */
function useEasedProgress(
  target: number | null,
  reducedMotion: boolean
): number | null {
  const [display, setDisplay] = useState(0)
  const displayRef = useRef(0)

  useEffect(() => {
    if (target == null) {
      displayRef.current = 0
      setDisplay(0)
      return
    }

    const goal = Math.max(0, Math.min(100, target))

    if (reducedMotion) {
      displayRef.current = goal
      setDisplay(goal)
      return
    }

    let raf = 0
    const tick = () => {
      const current = displayRef.current
      const delta = goal - current

      if (Math.abs(delta) < 0.12) {
        displayRef.current = goal
        setDisplay(goal)
        return
      }

      // Slow crawl forward; snap gently if target drops.
      const eased =
        delta > 0
          ? current + Math.max(0.08, delta * 0.04)
          : current + delta * 0.12
      const next = delta > 0 ? Math.min(goal, eased) : Math.max(goal, eased)
      displayRef.current = next
      setDisplay(next)
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, reducedMotion])

  return target == null ? null : display
}

/** Credyx-style dual tone: body white, last two letters accent blue (like "yx"). */
function DualToneTitle({ text }: { text: string }): ReactNode {
  if (text.length <= 2) {
    return <p className="page-loader__title">{text}</p>
  }
  const head = text.slice(0, -2)
  const tail = text.slice(-2)
  return (
    <p className="page-loader__title">
      {head}
      <span className="page-loader__title-accent">{tail}</span>
    </p>
  )
}

/** Calm branded loader for boot, guards, and Suspense fallbacks. */
export default function PageLoader({
  message = 'Loading your workspace…',
  fullScreen = true,
  title,
  progress,
}: PageLoaderProps) {
  const reducedMotion = usePrefersReducedMotion()
  const [logoFailed, setLogoFailed] = useState(false)
  const logoSrc = fullScreen
    ? '/credyx-logo-white-cred-no-bg.png'
    : '/credyx-logo-black-cred-no-bg.png'

  const determinate =
    typeof progress === 'number' && Number.isFinite(progress)
  const targetPercent = determinate
    ? Math.max(0, Math.min(100, progress as number))
    : null
  const easedPercent = useEasedProgress(targetPercent, reducedMotion)
  const percent =
    easedPercent == null ? null : Math.round(Math.max(0, Math.min(100, easedPercent)))

  // Title mode (e.g. Uploading) uses the same dark wave stage as boot.
  const immersive = fullScreen || Boolean(title)

  return (
    <div
      className={[
        'page-loader',
        fullScreen ? 'page-loader--fullscreen' : 'page-loader--inline',
        immersive && !fullScreen ? 'page-loader--immersive' : '',
        reducedMotion ? 'page-loader--reduced' : '',
        determinate ? 'page-loader--determinate' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={
        easedPercent != null
          ? ({ '--pl-progress': `${easedPercent}%` } as CSSProperties)
          : undefined
      }
    >
      {immersive ? (
        <div className="page-loader__stage" aria-hidden>
          <div className="page-loader__waves" />
          <div className="page-loader__waves page-loader__waves--slow" />
          <div className="page-loader__glow" />
        </div>
      ) : (
        <div className="page-loader__stage" aria-hidden>
          <div className="page-loader__glow" />
        </div>
      )}

      <div className="page-loader__content">
        {title ? (
          <DualToneTitle text={title} />
        ) : !logoFailed ? (
          <img
            src={logoSrc}
            alt="Credyx"
            className="page-loader__logo"
            width={180}
            height={48}
            onError={() => setLogoFailed(true)}
          />
        ) : (
          <div className="page-loader__wordmark">
            <CredyxWordmark variant="full" theme="admin" />
          </div>
        )}

        <div
          className={[
            'page-loader__track',
            determinate ? 'page-loader__track--determinate' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          role={determinate ? 'progressbar' : undefined}
          aria-valuemin={determinate ? 0 : undefined}
          aria-valuemax={determinate ? 100 : undefined}
          aria-valuenow={percent ?? undefined}
          aria-label={determinate ? `Upload progress ${percent}%` : undefined}
          aria-hidden={determinate ? undefined : true}
        >
          <span className="page-loader__bar" />
        </div>

        {percent != null ? (
          <p className="page-loader__percent tabular-nums">{percent}%</p>
        ) : null}

        <p className="page-loader__message">{message}</p>
      </div>
    </div>
  )
}
