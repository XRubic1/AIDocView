import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
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
  /** Trash drop target — releasing over it docks the bubble into the top nav. */
  trashRef?: RefObject<HTMLElement | null>
  /** Called when the user drops the bubble on the trash zone. */
  onDock?: () => void
  /** When false, skip restoring/persisting (e.g. while docked). */
  enabled?: boolean
}

function pointInRect(x: number, y: number, el: HTMLElement | null): boolean {
  if (!el) return false
  const r = el.getBoundingClientRect()
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
}

/**
 * Pointer-drag for a fixed floating bubble. Distinguishes click vs drag so
 * opening the chat still works on a tap. Position is restored from sessionStorage.
 * Dropping on a trash target docks the bubble into the top nav.
 */
export function useDraggableFab({
  storageKey,
  defaultRight = 16,
  defaultBottom = 96,
  size = 44,
  margin = 8,
  dragThreshold = 6,
  trashRef,
  onDock,
  enabled = true,
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
  const onDockRef = useRef(onDock)
  onDockRef.current = onDock

  const [position, setPosition] = useState<FabPosition | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [overTrash, setOverTrash] = useState(false)

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

  /** Place at an explicit point (e.g. undock from header). */
  const placeAt = useCallback(
    (left: number, top: number) => {
      updatePosition(clamp(left, top))
    },
    [clamp, updatePosition]
  )

  // Place once when enabled (restore or default).
  useEffect(() => {
    if (!enabled) return
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
  }, [clamp, defaultPosition, enabled, storageKey, updatePosition])

  // Persist + keep in viewport on resize.
  useEffect(() => {
    if (!enabled || !position) return
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(position))
    } catch {
      // private mode / quota
    }
  }, [enabled, position, storageKey])

  useEffect(() => {
    if (!enabled) return
    const onResize = () => {
      const cur = positionRef.current
      if (!cur) return
      updatePosition(clamp(cur.left, cur.top))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [clamp, enabled, updatePosition])

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
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

      // Follow the pointer freely while dragging (still softly clamped).
      updatePosition(clamp(drag.originLeft + dx, drag.originTop + dy))
      setOverTrash(pointInRect(e.clientX, e.clientY, trashRef?.current ?? null))
      e.preventDefault()
    },
    [clamp, dragThreshold, trashRef, updatePosition]
  )

  const endDrag = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== e.pointerId) return

      const droppedOnTrash =
        drag.moved && pointInRect(e.clientX, e.clientY, trashRef?.current ?? null)

      if (drag.moved) {
        suppressClickRef.current = true
      }
      dragRef.current = null
      setIsDragging(false)
      setOverTrash(false)
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // already released
      }

      if (droppedOnTrash) {
        onDockRef.current?.()
      }
    },
    [trashRef]
  )

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
    overTrash,
    shouldOpenOnClick,
    placeAt,
    dragHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  }
}
