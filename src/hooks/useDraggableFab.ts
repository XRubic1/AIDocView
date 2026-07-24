import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'

export type FabPosition = { left: number; top: number }

interface UseDraggableFabOptions {
  /** sessionStorage key — remembers where the user parked the bubble. */
  storageKey: string
  /** Default distance from the right edge of the viewport. */
  defaultRight?: number
  /** Default distance from the bottom edge (higher = more clearance). */
  defaultBottom?: number
  /** Approximate bubble size for clamp + default placement. */
  size?: number
  /** Gap from viewport edges when clamping. */
  margin?: number
  /** Pixels of movement before a press counts as a drag (not a click). */
  dragThreshold?: number
}

/**
 * Pointer-drag for a fixed floating bubble. Distinguishes click vs drag so
 * opening the chat still works on a tap. Position is restored from sessionStorage.
 */
export function useDraggableFab({
  storageKey,
  defaultRight = 16,
  defaultBottom = 72,
  size = 44,
  margin = 8,
  dragThreshold = 6,
}: UseDraggableFabOptions) {
  const fabRef = useRef<HTMLButtonElement>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originLeft: number
    originTop: number
    moved: boolean
  } | null>(null)
  const positionRef = useRef<FabPosition | null>(null)
  const suppressClickRef = useRef(false)

  const [position, setPosition] = useState<FabPosition | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const clamp = useCallback(
    (left: number, top: number): FabPosition => {
      const maxLeft = Math.max(margin, window.innerWidth - size - margin)
      const maxTop = Math.max(margin, window.innerHeight - size - margin)
      return {
        left: Math.min(Math.max(margin, left), maxLeft),
        top: Math.min(Math.max(margin, top), maxTop),
      }
    },
    [margin, size]
  )

  const defaultPosition = useCallback((): FabPosition => {
    return clamp(
      window.innerWidth - size - defaultRight,
      window.innerHeight - size - defaultBottom
    )
  }, [clamp, defaultBottom, defaultRight, size])

  const updatePosition = useCallback((next: FabPosition) => {
    positionRef.current = next
    setPosition(next)
  }, [])

  // Place once on mount (restore or default).
  useEffect(() => {
    let placed: FabPosition | null = null
    try {
      const raw = sessionStorage.getItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw) as FabPosition
        if (
          typeof parsed?.left === 'number' &&
          typeof parsed?.top === 'number' &&
          Number.isFinite(parsed.left) &&
          Number.isFinite(parsed.top)
        ) {
          placed = clamp(parsed.left, parsed.top)
        }
      }
    } catch {
      // ignore corrupt storage
    }
    updatePosition(placed ?? defaultPosition())
  }, [clamp, defaultPosition, storageKey, updatePosition])

  // Persist + keep in viewport on resize.
  useEffect(() => {
    if (!position) return
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(position))
    } catch {
      // private mode / quota
    }
  }, [position, storageKey])

  useEffect(() => {
    const onResize = () => {
      const cur = positionRef.current
      if (!cur) return
      updatePosition(clamp(cur.left, cur.top))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [clamp, updatePosition])

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      // Only primary button / touch.
      if (e.button !== 0) return
      const cur = positionRef.current ?? defaultPosition()
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originLeft: cur.left,
        originTop: cur.top,
        moved: false,
      }
      suppressClickRef.current = false
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [defaultPosition]
  )

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== e.pointerId) return

      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY
      if (!drag.moved && Math.hypot(dx, dy) < dragThreshold) return

      if (!drag.moved) {
        drag.moved = true
        setIsDragging(true)
      }

      updatePosition(clamp(drag.originLeft + dx, drag.originTop + dy))
      e.preventDefault()
    },
    [clamp, dragThreshold, updatePosition]
  )

  const endDrag = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    if (drag.moved) {
      // Swallow the synthetic click that follows a drag.
      suppressClickRef.current = true
    }
    dragRef.current = null
    setIsDragging(false)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // already released
    }
  }, [])

  /** Call from onClick — returns false when the press was a drag. */
  const shouldOpenOnClick = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return false
    }
    return true
  }, [])

  const style: CSSProperties | undefined = position
    ? {
        left: position.left,
        top: position.top,
        right: 'auto',
        bottom: 'auto',
      }
    : undefined

  return {
    fabRef,
    style,
    position,
    isDragging,
    shouldOpenOnClick,
    dragHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  }
}
