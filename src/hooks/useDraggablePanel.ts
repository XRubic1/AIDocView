import { useCallback, useEffect, useRef, useState } from 'react'

interface Position {
  x: number
  y: number
}

/**
 * Pointer-drag positioning for floating panels. Clamps within the viewport.
 */
export function useDraggablePanel(enabled: boolean) {
  const panelRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null)
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)

  const clampPosition = useCallback((x: number, y: number) => {
    const el = panelRef.current
    if (!el) return { x, y }
    const rect = el.getBoundingClientRect()
    const margin = 12
    const maxX = Math.max(margin, (window.innerWidth - rect.width) / 2)
    const maxY = Math.max(margin, (window.innerHeight - rect.height) / 2)
    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    }
  }, [])

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (!enabled) return
      event.preventDefault()
      dragState.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: position.x,
        originY: position.y,
      }
      setIsDragging(true)
      ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    },
    [enabled, position.x, position.y]
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const drag = dragState.current
      if (!drag || drag.pointerId !== event.pointerId) return
      const dx = event.clientX - drag.startX
      const dy = event.clientY - drag.startY
      setPosition(clampPosition(drag.originX + dx, drag.originY + dy))
    },
    [clampPosition]
  )

  const onPointerUp = useCallback((event: React.PointerEvent) => {
    const drag = dragState.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragState.current = null
    setIsDragging(false)
    try {
      ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
    } catch {
      /* already released */
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      setPosition({ x: 0, y: 0 })
    }
  }, [enabled])

  const dragHandleProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    style: { cursor: enabled ? (isDragging ? 'grabbing' : 'grab') : undefined } as const,
  }

  return { panelRef, position, dragHandleProps, isDragging }
}
