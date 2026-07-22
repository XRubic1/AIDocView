import { useEffect, useState } from 'react'
import CredyxWordmark from '../CredyxWordmark'
import './pageLoader.css'

interface PageLoaderProps {
  message?: string
  /** When true, fills the viewport (boot / route guards). */
  fullScreen?: boolean
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

/** Calm branded loader for boot, guards, and Suspense fallbacks. */
export default function PageLoader({
  message = 'Loading your workspace…',
  fullScreen = true,
}: PageLoaderProps) {
  const reducedMotion = usePrefersReducedMotion()
  const [logoFailed, setLogoFailed] = useState(false)

  return (
    <div
      className={[
        'page-loader',
        fullScreen ? 'page-loader--fullscreen' : 'page-loader--inline',
        reducedMotion ? 'page-loader--reduced' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="page-loader__stage" aria-hidden>
        <div className="page-loader__glow" />
      </div>

      <div className="page-loader__content">
        {!logoFailed ? (
          <img
            src="/Logo.png"
            alt="Credyx"
            className="page-loader__logo"
            width={168}
            height={48}
            onError={() => setLogoFailed(true)}
          />
        ) : (
          <div className="page-loader__wordmark">
            <CredyxWordmark variant="full" theme="admin" />
          </div>
        )}

        <div className="page-loader__track" aria-hidden>
          <span className="page-loader__bar" />
        </div>

        <p className="page-loader__message">{message}</p>
      </div>
    </div>
  )
}
