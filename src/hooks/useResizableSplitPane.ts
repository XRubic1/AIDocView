import { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'client-payments-detail-width'
const MIN_WIDTH = 280
const MAX_WIDTH = 480

/** Default detail width scales down on mid-size screens. */
function getDefaultWidth(): number {
  if (typeof window === 'undefined') return 360
  const vw = window.innerWidth
  if (vw < 1400) return Math.min(320, Math.floor(vw * 0.28))
  if (vw < 1600) return 360
  return 400
}

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

function getViewportMaxWidth(): number {
  if (typeof window === 'undefined') return MAX_WIDTH
  // Keep most of the viewport for the list until the workspace ref measures.
  return Math.min(MAX_WIDTH, Math.floor(window.innerWidth * 0.34))
}

/** Horizontal split-pane resize — drag handle adjusts trailing panel width. */
export function useResizableSplitPane() {
  const workspaceRef = useRef<HTMLDivElement>(null)
  const detailWidthRef = useRef(getDefaultWidth())
  const [detailWidth, setDetailWidth] = useState(() => {
    const stored = readStoredWidth()
    return clampWidth(stored ?? getDefaultWidth(), getViewportMaxWidth())
  })
  const [isResizing, setIsResizing] = useState(false)
  const resizeState = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null)

  detailWidthRef.current = detailWidth

  const getMaxWidth = useCallback(() => {
    const workspace = workspaceRef.current
    if (!workspace) return getViewportMaxWidth()
    // Keep at least ~62% of the workspace for the list/table.
    return Math.min(MAX_WIDTH, Math.floor(workspace.clientWidth * 0.38))
  }, [])

  const clampDetailWidth = useCallback(
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
        startWidth: detailWidthRef.current,
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
      const delta = drag.startX - event.clientX
      setDetailWidth(clampDetailWidth(drag.startWidth + delta))
    },
    [clampDetailWidth]
  )

  const endResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = resizeState.current
    if (!drag || drag.pointerId !== event.pointerId) return
    resizeState.current = null
    setIsResizing(false)
    persistWidth(detailWidthRef.current)
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* already released */
    }
  }, [persistWidth])

  useEffect(() => {
    const handleWindowResize = () => {
      setDetailWidth((current) => clampDetailWidth(current))
    }
    window.addEventListener('resize', handleWindowResize)
    return () => window.removeEventListener('resize', handleWindowResize)
  }, [clampDetailWidth])

  return {
    workspaceRef,
    detailWidth,
    isResizing,
    resizeHandleProps: {
      onPointerDown: onResizePointerDown,
      onPointerMove: onResizePointerMove,
      onPointerUp: endResize,
      onPointerCancel: endResize,
    },
  }
}
