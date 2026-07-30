import {
  useCallback,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react'

export type HorizontalSwipeDirection = 'left' | 'right'

export interface HorizontalSwipeCommit {
  direction: HorizontalSwipeDirection
  /** Current drag offset in px at commit time (negative = left). */
  offsetX: number
  /** Approximate horizontal velocity in px/ms (signed). */
  velocityX: number
}

interface UseHorizontalSwipeOptions {
  /** When false, pointer handlers are no-ops. */
  enabled?: boolean
  /** Min horizontal distance (px) to count as a swipe. */
  thresholdPx?: number
  /** Commit even below distance if |velocity| exceeds this (px/ms). */
  velocityThreshold?: number
  /** Horizontal must exceed vertical by this ratio to lock as a swipe. */
  dominanceRatio?: number
  /** Called when a completed horizontal swipe is detected. */
  onSwipe?: (commit: HorizontalSwipeCommit) => void
  /**
   * Live drag offset while tracking. Pass null when the gesture ends without
   * a commit, or when cancelled (parent should spring back).
   */
  onDragOffsetChange?: (offsetX: number | null) => void
  /**
   * When true, a successful swipe does NOT clear the drag offset — the parent
   * continues from the current offset into an exit animation.
   */
  keepOffsetOnCommit?: boolean
}

interface SwipeState {
  pointerId: number
  startX: number
  startY: number
  lastX: number
  lastT: number
  velocityX: number
  /** null until axis is decided; false = vertical scroll, true = horizontal swipe. */
  lockedHorizontal: boolean | null
  /** Ignore when gesture started on form controls / buttons. */
  ignore: boolean
}

const INTERACTIVE_SELECTOR =
  'button, a, input, textarea, select, label, [role="button"], [role="tab"], [contenteditable="true"]'

/**
 * Detects horizontal swipe gestures on a container without blocking vertical scroll.
 * Follows the finger 1:1 once locked horizontal; supports distance + velocity commit.
 */
export function useHorizontalSwipe({
  enabled = true,
  thresholdPx = 56,
  velocityThreshold = 0.45,
  dominanceRatio = 1.25,
  onSwipe,
  onDragOffsetChange,
  keepOffsetOnCommit = false,
}: UseHorizontalSwipeOptions = {}) {
  const stateRef = useRef<SwipeState | null>(null)
  const optionsRef = useRef({
    enabled,
    thresholdPx,
    velocityThreshold,
    dominanceRatio,
    onSwipe,
    onDragOffsetChange,
    keepOffsetOnCommit,
  })
  optionsRef.current = {
    enabled,
    thresholdPx,
    velocityThreshold,
    dominanceRatio,
    onSwipe,
    onDragOffsetChange,
    keepOffsetOnCommit,
  }

  const clearDrag = useCallback(() => {
    optionsRef.current.onDragOffsetChange?.(null)
  }, [])

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const opts = optionsRef.current
    if (!opts.enabled || event.button !== 0) return

    const target = event.target as HTMLElement | null
    const ignore = Boolean(target?.closest(INTERACTIVE_SELECTOR))
    const now = performance.now()

    stateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastT: now,
      velocityX: 0,
      lockedHorizontal: null,
      ignore,
    }
  }, [])

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const state = stateRef.current
      const opts = optionsRef.current
      if (!state || state.pointerId !== event.pointerId || state.ignore || !opts.enabled) return

      const dx = event.clientX - state.startX
      const dy = event.clientY - state.startY
      const absDx = Math.abs(dx)
      const absDy = Math.abs(dy)
      const now = performance.now()
      const dt = Math.max(1, now - state.lastT)
      // Smoothed velocity for flick commits.
      const instantV = (event.clientX - state.lastX) / dt
      state.velocityX = state.velocityX * 0.7 + instantV * 0.3
      state.lastX = event.clientX
      state.lastT = now

      // Decide axis once movement is meaningful.
      if (state.lockedHorizontal === null) {
        if (absDx < 8 && absDy < 8) return
        state.lockedHorizontal = absDx > absDy * opts.dominanceRatio
        if (!state.lockedHorizontal) {
          clearDrag()
          return
        }
      }

      if (!state.lockedHorizontal) return

      // Claim the gesture so the page doesn't rubber-band horizontally.
      event.preventDefault()
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // setPointerCapture can throw if the pointer is already released.
      }

      // Follow the finger closely for a polished drag feel.
      opts.onDragOffsetChange?.(dx)
    },
    [clearDrag]
  )

  const finishGesture = useCallback(
    (event: ReactPointerEvent<HTMLElement>, cancelled: boolean) => {
      const state = stateRef.current
      if (!state || state.pointerId !== event.pointerId) return
      stateRef.current = null

      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
      } catch {
        // ignore release errors
      }

      const opts = optionsRef.current

      if (cancelled || state.ignore || !opts.enabled || state.lockedHorizontal !== true) {
        clearDrag()
        return
      }

      const dx = event.clientX - state.startX
      const absDx = Math.abs(dx)
      const flick =
        Math.abs(state.velocityX) >= opts.velocityThreshold &&
        Math.sign(state.velocityX) === Math.sign(dx || state.velocityX)
      const distanceOk = absDx >= opts.thresholdPx

      if (!distanceOk && !flick) {
        clearDrag()
        return
      }

      const direction: HorizontalSwipeDirection = dx < 0 || (dx === 0 && state.velocityX < 0) ? 'left' : 'right'

      if (!opts.keepOffsetOnCommit) {
        clearDrag()
      }

      opts.onSwipe?.({
        direction,
        offsetX: dx,
        velocityX: state.velocityX,
      })
    },
    [clearDrag]
  )

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => finishGesture(event, false),
    [finishGesture]
  )

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => finishGesture(event, true),
    [finishGesture]
  )

  return {
    swipeHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
  }
}
