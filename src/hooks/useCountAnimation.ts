import { useEffect, type RefObject } from 'react'

/** Animates `.count-num` elements from 0 to data-target when visible */
export function useCountAnimation(rootRef?: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef?.current ?? document
    const elements = root.querySelectorAll<HTMLElement>('.count-num')
    if (!elements.length) return

    function animateCount(el: HTMLElement) {
      const target = parseInt(el.dataset.target ?? '0', 10)
      const duration = 1200
      const start = performance.now()

      function step(now: number) {
        const p = Math.min((now - start) / duration, 1)
        const ease = 1 - Math.pow(1 - p, 3)
        el.textContent = String(Math.round(ease * target))
        if (p < 1) requestAnimationFrame(step)
      }

      requestAnimationFrame(step)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateCount(entry.target as HTMLElement)
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.5 }
    )

    elements.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [rootRef])
}
