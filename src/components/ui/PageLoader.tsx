import { useEffect, useState } from 'react'
import Spinner from './Spinner'

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

/** Branded full-area loader for boot, guards, and Suspense fallbacks. */
export default function PageLoader({
  message = 'Loading your workspace…',
  fullScreen = true,
}: PageLoaderProps) {
  const reducedMotion = usePrefersReducedMotion()

  return (
    <div
      className={
        fullScreen
          ? 'min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-zinc-950 px-6'
          : 'flex flex-col items-center justify-center py-16 px-6'
      }
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <p
        className="text-xl font-semibold tracking-tight text-[#113543] dark:text-slate-100 mb-6"
        style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
      >
        Credyx
      </p>
      <Spinner size="lg" className="text-[#113543] dark:text-cyan-400 mb-4" />
      <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-xs">{message}</p>
      {!reducedMotion && (
        <div className="mt-6 h-0.5 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-zinc-800">
          <div className="h-full w-1/2 rounded-full bg-[#0891b2] animate-pulse" />
        </div>
      )}
    </div>
  )
}
