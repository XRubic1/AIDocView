import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'

/** Phone / small tablet — stacked list UI, hamburger nav helpers. */
const MOBILE_QUERY = '(max-width: 767px)'

/**
 * Below this width, list+detail split panes use full-page detail instead of
 * a side panel (sidebar + 460px panel leaves too little room for the table).
 */
const COMPACT_DETAIL_QUERY = '(max-width: 1279px)'

/**
 * Dashboard body stacks at 860px (see clientDashboardV2.css).
 * Use the same cutoff so shrinking the window/pane switches to the phone UI.
 */
export const DASHBOARD_PHONE_MAX_WIDTH = 860

function subscribeMedia(query: string, onChange: (matches: boolean) => void): () => void {
  const media = window.matchMedia(query)
  const handle = () => onChange(media.matches)
  handle()
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', handle)
  } else {
    media.addListener(handle)
  }
  // Resize is a fallback when MediaQueryList `change` does not fire (some embeds).
  window.addEventListener('resize', handle)
  window.visualViewport?.addEventListener('resize', handle)
  return () => {
    if (typeof media.removeEventListener === 'function') {
      media.removeEventListener('change', handle)
    } else {
      media.removeListener(handle)
    }
    window.removeEventListener('resize', handle)
    window.visualViewport?.removeEventListener('resize', handle)
  }
}

function useMatchMedia(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  )

  useEffect(() => subscribeMedia(query, setMatches), [query])

  return matches
}

/** True when viewport is below the client portal mobile breakpoint. */
export function useIsMobileViewport(): boolean {
  return useMatchMedia(MOBILE_QUERY)
}

/**
 * True when invoice/payment/aging detail should take the full main area
 * instead of a resizable side panel.
 */
export function useCompactDetailViewport(): boolean {
  return useMatchMedia(COMPACT_DETAIL_QUERY)
}

/**
 * True when `elementRef` is at most `maxWidth` px wide.
 * Follows the element (main pane), not the browser window — so shrinking
 * the app chrome still switches phone layouts.
 */
export function useIsBelowWidth(
  elementRef: RefObject<HTMLElement | null>,
  maxWidth: number
): boolean {
  const [below, setBelow] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= maxWidth : false
  )

  useLayoutEffect(() => {
    const el = elementRef.current
    if (!el) return

    const update = () => setBelow(el.clientWidth <= maxWidth)
    update()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }

    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [elementRef, maxWidth])

  return below
}
