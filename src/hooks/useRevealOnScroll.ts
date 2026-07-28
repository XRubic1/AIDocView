import { useEffect, type RefObject } from 'react'

/**
 * Adds `.visible` to `.reveal` elements when they enter the viewport.
 * Supports staggered children via `.reveal-stagger.visible > *`.
 * @param rootRef - Container element to scope queries (defaults to document)
 */
export function useRevealOnScroll(rootRef?: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef?.current ?? document
    const elements = root.querySelectorAll('.reveal')
    if (!elements.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible')
            // One-shot reveal — stop observing after growth animation starts.
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
    )

    elements.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [rootRef])
}
