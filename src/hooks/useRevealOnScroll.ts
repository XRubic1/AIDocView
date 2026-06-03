import { useEffect, type RefObject } from 'react'

/**
 * Adds `.visible` to `.reveal` elements when they enter the viewport.
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
          }
        })
      },
      { threshold: 0.1 }
    )

    elements.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [rootRef])
}
