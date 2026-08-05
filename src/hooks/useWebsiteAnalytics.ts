import { useEffect } from 'react'
import {
  startTimeOnPageTracking,
  trackPageViewOnce,
  trackWebsiteEvent,
} from '../services/websiteAnalytics'

const SECTION_IDS = ['buddy', 'features', 'pricing', 'vs-factoring', 'waitlist-form'] as const

/**
 * Waitlist/marketing analytics: page_view on mount, time_on_page while open,
 * and one-shot section_view when key sections enter the viewport.
 */
export function useWebsiteAnalytics() {
  useEffect(() => {
    trackPageViewOnce()
    const stopTimeOnPage = startTimeOnPageTracking()

    const seen = new Set<string>()
    const elements = SECTION_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => Boolean(el)
    )

    if (!elements.length || typeof IntersectionObserver === 'undefined') {
      return () => stopTimeOnPage()
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.35) continue
          const id = entry.target.id
          if (!id || seen.has(id)) continue
          seen.add(id)
          trackWebsiteEvent('section_view', `section:${id}`)
          observer.unobserve(entry.target)
        }
      },
      { threshold: [0.35] }
    )

    elements.forEach((el) => observer.observe(el))

    return () => {
      observer.disconnect()
      stopTimeOnPage()
    }
  }, [])
}
