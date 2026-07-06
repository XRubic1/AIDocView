import { useEffect, useState } from 'react'

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

interface UseCountUpOptions {
  /** Animation duration in ms. Default 600. */
  duration?: number
  /** Decimal places for fractional targets (e.g. currency). Default 0. */
  decimals?: number
}

/** Eases a number from 0 to `target` on mount; respects prefers-reduced-motion. */
export function useCountUp(target: number, options?: UseCountUpOptions): number {
  const duration = options?.duration ?? 600
  const decimals = options?.decimals ?? 0
  const [value, setValue] = useState(0)

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) {
      setValue(target)
      return
    }

    let frame = 0
    const start = performance.now()

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = easeOutCubic(progress) * target
      const factor = Math.pow(10, decimals)
      setValue(Math.round(eased * factor) / factor)
      if (progress < 1) {
        frame = requestAnimationFrame(tick)
      } else {
        setValue(target)
      }
    }

    setValue(0)
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, duration, decimals])

  return value
}
