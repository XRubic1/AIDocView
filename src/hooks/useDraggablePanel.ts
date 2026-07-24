import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'

export type PanelPosition = { left: number; top: number }
export type PanelSize = { width: number; height: number }

type StoredPanel = PanelPosition & PanelSize

interface UseDraggablePanelOptions {
  enabled: boolean
  /** sessionStorage key to remember position + size across opens. */
  storageKey?: string
  /** Gap from viewport edges when placing / clamping. */
  margin?: number
  /** Extra bottom offset for default placement (e.g. above a FAB). */
  defaultBottomOffset?: number
  defaultWidth?: number
  defaultHeight?: number
  minWidth?: number
  minHeight?: number
}

const DEFAULT_WIDTH = 380
const DEFAULT_HEIGHT = 520
const MIN_WIDTH = 300
const MIN_HEIGHT = 360

/**
 * Pointer-drag + corner-resize for floating panels (viewport-clamped).
 * Geometry is restored once when the panel opens — not on every re-render.
 */
export function useDraggablePanel({
  enabled,
  storageKey,
  margin = 12,
  defaultBottomOffset = 88,
  defaultWidth = DEFAULT_WIDTH,
  defaultHeight = DEFAULT_HEIGHT,
  minWidth = MIN_WIDTH,
  minHeight = MIN_HEIGHT,
}: UseDraggablePanelOptions) {
  const panelRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{
    pointerId: number
    startX: number
    startY: number
    originLeft: number
    originTop: number
  } | null>(null)
  const resizeState = useRef<{
    pointerId: number
    startX: number
    startY: number
    originW: number
    originH: number
    originLeft: number
    originTop: number
  } | null>(null)
  const sizeRef = useRef<PanelSize>({ width: defaultWidth, height: defaultHeight })
  const positionRef = useRef<PanelPosition | null>(null)
  const wasEnabledRef = useRef(false)

  const [position, setPosition] = useState<PanelPosition | null>(null)
  const [size, setSize] = useState<PanelSize>({
    width: defaultWidth,
    height: defaultHeight,
  })
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)

  const updatePosition = useCallback((next: PanelPosition) => {
    positionRef.current = next
    setPosition(next)
  }, [])

  const updateSize = useCallback((next: PanelSize) => {
    sizeRef.current = next
    setSize(next)
  }, [])

  const clampSize = useCallback(
    (width: number, height: number): PanelSize => {
      const maxW = Math.max(minWidth, window.innerWidth - margin * 2)
      const maxH = Math.max(minHeight, window.innerHeight - margin * 2)
      return {
        width: Math.min(maxW, Math.max(minWidth, Math.round(width))),
        height: Math.min(maxH, Math.max(minHeight, Math.round(height))),
      }
    },
    [margin, minHeight, minWidth]
  )

  const clampPosition = useCallback(
    (left: number, top: number, width: number, height: number) => {
      const maxLeft = Math.max(margin, window.innerWidth - width - margin)
      const maxTop = Math.max(margin, window.innerHeight - height - margin)
      return {
        left: Math.min(maxLeft, Math.max(margin, left)),
        top: Math.min(maxTop, Math.max(margin, top)),
      }
    },
    [margin]
  )

  const readStored = useCallback((): StoredPanel | null => {
    if (!storageKey) return null
    try {
      const raw = sessionStorage.getItem(storageKey)
      if (!raw) return null
      const parsed = JSON.parse(raw) as Partial<StoredPanel>
      if (typeof parsed.left !== 'number' || typeof parsed.top !== 'number') return null
      return {
        left: parsed.left,
        top: parsed.top,
        width: typeof parsed.width === 'number' ? parsed.width : defaultWidth,
        height: typeof parsed.height === 'number' ? parsed.height : defaultHeight,
      }
    } catch {
      return null
    }
  }, [storageKey, defaultWidth, defaultHeight])

  const persist = useCallback(() => {
    if (!storageKey || !positionRef.current) return
    try {
      const payload: StoredPanel = {
        ...positionRef.current,
        ...sizeRef.current,
      }
      sessionStorage.setItem(storageKey, JSON.stringify(payload))
    } catch {
      /* private mode / quota */
    }
  }, [storageKey])

  // Restore or place once when the panel opens (enabled false → true).
  useEffect(() => {
    const justOpened = enabled && !wasEnabledRef.current
    wasEnabledRef.current = enabled
    if (!justOpened) return

    const id = window.requestAnimationFrame(() => {
      const stored = readStored()
      if (stored) {
        const nextSize = clampSize(stored.width, stored.height)
        updateSize(nextSize)
        updatePosition(
          clampPosition(stored.left, stored.top, nextSize.width, nextSize.height)
        )
        return
      }

      const el = panelRef.current
      const w = el?.offsetWidth || defaultWidth
      const h = el?.offsetHeight || defaultHeight
      const nextSize = clampSize(w, h)
      updateSize(nextSize)
      updatePosition(
        clampPosition(
          window.innerWidth - nextSize.width - margin,
          window.innerHeight - nextSize.height - defaultBottomOffset,
          nextSize.width,
          nextSize.height
        )
      )
    })

    return () => window.cancelAnimationFrame(id)
  }, [
    enabled,
    readStored,
    clampSize,
    clampPosition,
    updateSize,
    updatePosition,
    defaultWidth,
    defaultHeight,
    defaultBottomOffset,
    margin,
  ])

  // Keep on-screen when the viewport resizes (not while actively dragging).
  useEffect(() => {
    if (!enabled) return
    const onResize = () => {
      if (dragState.current || resizeState.current) return
      const prevSize = sizeRef.current
      const prevPos = positionRef.current
      const nextSize = clampSize(prevSize.width, prevSize.height)
      updateSize(nextSize)
      if (prevPos) {
        updatePosition(
          clampPosition(prevPos.left, prevPos.top, nextSize.width, nextSize.height)
        )
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [enabled, clampSize, clampPosition, updateSize, updatePosition])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      if (!enabled) return
      const target = event.target as HTMLElement
      if (target.closest('button, a, input, textarea, select, [data-no-drag]')) return

      // Ensure we have a concrete position before dragging (CSS right/bottom → left/top).
      let pos = positionRef.current
      if (!pos && panelRef.current) {
        const rect = panelRef.current.getBoundingClientRect()
        pos = clampPosition(rect.left, rect.top, sizeRef.current.width, sizeRef.current.height)
        updatePosition(pos)
      }
      if (!pos) return

      event.preventDefault()
      dragState.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originLeft: pos.left,
        originTop: pos.top,
      }
      setIsDragging(true)
      ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    },
    [enabled, clampPosition, updatePosition]
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent) => {
      const drag = dragState.current
      if (!drag || drag.pointerId !== event.pointerId) return
      const next = clampPosition(
        drag.originLeft + (event.clientX - drag.startX),
        drag.originTop + (event.clientY - drag.startY),
        sizeRef.current.width,
        sizeRef.current.height
      )
      updatePosition(next)
    },
    [clampPosition, updatePosition]
  )

  const onPointerUp = useCallback(
    (event: ReactPointerEvent) => {
      const drag = dragState.current
      if (!drag || drag.pointerId !== event.pointerId) return
      dragState.current = null
      setIsDragging(false)
      persist()
      try {
        ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
      } catch {
        /* already released */
      }
    },
    [persist]
  )

  const onResizePointerDown = useCallback(
    (event: ReactPointerEvent) => {
      if (!enabled) return
      event.preventDefault()
      event.stopPropagation()

      let pos = positionRef.current
      if (!pos && panelRef.current) {
        const rect = panelRef.current.getBoundingClientRect()
        pos = clampPosition(rect.left, rect.top, sizeRef.current.width, sizeRef.current.height)
        updatePosition(pos)
      }
      if (!pos) return

      resizeState.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originW: sizeRef.current.width,
        originH: sizeRef.current.height,
        originLeft: pos.left,
        originTop: pos.top,
      }
      setIsResizing(true)
      ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    },
    [enabled, clampPosition, updatePosition]
  )

  const onResizePointerMove = useCallback(
    (event: ReactPointerEvent) => {
      const resize = resizeState.current
      if (!resize || resize.pointerId !== event.pointerId) return
      const nextSize = clampSize(
        resize.originW + (event.clientX - resize.startX),
        resize.originH + (event.clientY - resize.startY)
      )
      updateSize(nextSize)
      updatePosition(
        clampPosition(resize.originLeft, resize.originTop, nextSize.width, nextSize.height)
      )
    },
    [clampPosition, clampSize, updatePosition, updateSize]
  )

  const onResizePointerUp = useCallback(
    (event: ReactPointerEvent) => {
      const resize = resizeState.current
      if (!resize || resize.pointerId !== event.pointerId) return
      resizeState.current = null
      setIsResizing(false)
      persist()
      try {
        ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
      } catch {
        /* already released */
      }
    },
    [persist]
  )

  const dragHandleProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
  }

  const resizeHandleProps = {
    onPointerDown: onResizePointerDown,
    onPointerMove: onResizePointerMove,
    onPointerUp: onResizePointerUp,
    onPointerCancel: onResizePointerUp,
  }

  const panelStyle: CSSProperties = position
    ? {
        left: position.left,
        top: position.top,
        width: size.width,
        height: size.height,
        right: 'auto',
        bottom: 'auto',
      }
    : {
        width: size.width,
        height: size.height,
      }

  return {
    panelRef,
    position,
    size,
    panelStyle,
    dragHandleProps,
    resizeHandleProps,
    isDragging,
    isResizing,
  }
}
