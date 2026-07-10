import { useEffect, useState } from 'react'

/** Phone / small tablet — stacked list UI, hamburger nav helpers. */
const MOBILE_QUERY = '(max-width: 767px)'

/**
 * Below this width, list+detail split panes use full-page detail instead of
 * a side panel (sidebar + 460px panel leaves too little room for the table).
 */
const COMPACT_DETAIL_QUERY = '(max-width: 1279px)'

function useMatchMedia(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  )

  useEffect(() => {
    const media = window.matchMedia(query)
    const onChange = () => setMatches(media.matches)
    onChange()
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [query])

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
