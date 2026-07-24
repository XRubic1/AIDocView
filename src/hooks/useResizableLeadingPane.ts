import { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'credyx-assistant-chat-width'
const MIN_WIDTH = 280
const MAX_WIDTH = 640
const DEFAULT_WIDTH = 420

function readStoredWidth(): number | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    const parsed = Number(stored)
    return Number.isFinite(parsed) ? parsed : null
  } catch {
    return null
  }
}

function clampWidth(width: number, max: number) {
  return Math.min(max, Math.max(MIN_WIDTH, width))
}

/**
 * Resize the leading (left) pane of a horizontal split.
 * Dragging the handle right grows the left pane; left shrinks it.
 */
export function useResizableLeadingPane() {
  const workspaceRef = useRef<HTMLDivElement>(null)
  const paneWidthRef = useRef(DEFAULT_WIDTH)
  const [paneWidth, setPaneWidth] = useState(() => readStoredWidth() ?? DEFAULT_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  const resizeState = useRef<{
    pointerId: number
    startX: number
    startWidth: number
  } | null>(null)

  paneWidthRef.current = paneWidth

  const getMaxWidth = useCallback(() => {
    const workspace = workspaceRef.current
    if (!workspace) return MAX_WIDTH
    // Keep at least ~40% for the calendar.
    return Math.min(MAX_WIDTH, Math.floor(workspace.clientWidth * 0.58))
  }, [])

  const clampPaneWidth = useCallback(
    (width: number) => clampWidth(width, getMaxWidth()),
    [getMaxWidth]
  )

  const persistWidth = useCallback((width: number) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(width))
    } catch {
      /* storage unavailable */
    }
  }, [])

  const onResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      resizeState.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: paneWidthRef.current,
      }
      setIsResizing(true)
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    []
  )

  const onResizePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = resizeState.current
      if (!drag || drag.pointerId !== event.pointerId) return
      const delta = event.clientX - drag.startX
      setPaneWidth(clampPaneWidth(drag.startWidth + delta))
    },
    [clampPaneWidth]
  )

  const endResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = resizeState.current
      if (!drag || drag.pointerId !== event.pointerId) return
      resizeState.current = null
      setIsResizing(false)
      persistWidth(paneWidthRef.current)
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        /* already released */
      }
    },
    [persistWidth]
  )

  useEffect(() => {
    const handleWindowResize = () => {
      setPaneWidth((current) => clampPaneWidth(current))
    }
    window.addEventListener('resize', handleWindowResize)
    return () => window.removeEventListener('resize', handleWindowResize)
  }, [clampPaneWidth])

  return {
    workspaceRef,
    paneWidth,
    isResizing,
    resizeHandleProps: {
      onPointerDown: onResizePointerDown,
      onPointerMove: onResizePointerMove,
      onPointerUp: endResize,
      onPointerCancel: endResize,
    },
  }
}
