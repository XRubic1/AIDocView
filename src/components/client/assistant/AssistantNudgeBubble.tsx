import { useLayoutEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { AssistantPageHelp } from '../../../utils/assistantPageContext'
import type { FabPosition } from '../../../hooks/useDraggableFab'

interface AssistantNudgeBubbleProps {
  help: AssistantPageHelp
  /** Current FAB coords so the tip stays next to the bubble. */
  fabPosition: FabPosition
  fabSize?: number
  /** Open the chat, optionally pre-filled with a starter prompt. */
  onOpen: (starterPrompt?: string) => void
  onDismiss: () => void
}

const NUDGE_WIDTH = 260
const GAP = 10
const EDGE = 8

/**
 * Speech bubble beside the floating buddy. Anchored to the FAB and clamped
 * inside the viewport so it never clips through the bottom of the screen.
 */
export default function AssistantNudgeBubble({
  help,
  fabPosition,
  fabSize = 44,
  onOpen,
  onDismiss,
}: AssistantNudgeBubbleProps) {
  const starters = help.chips.slice(0, 2)
  const rootRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(140)

  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    setHeight(el.getBoundingClientRect().height)
  }, [help.nudge, starters.length])

  const preferLeft = fabPosition.left + fabSize / 2 > window.innerWidth / 2
  let left = preferLeft
    ? fabPosition.left - NUDGE_WIDTH - GAP
    : fabPosition.left + fabSize + GAP
  left = Math.min(
    Math.max(EDGE, left),
    Math.max(EDGE, window.innerWidth - NUDGE_WIDTH - EDGE)
  )

  // Prefer above the FAB when near the bottom so chips stay on-screen.
  const spaceBelow = window.innerHeight - (fabPosition.top + fabSize) - EDGE
  const placeAbove = spaceBelow < height + GAP
  let top = placeAbove
    ? fabPosition.top - height - GAP
    : fabPosition.top - 8
  top = Math.min(
    Math.max(EDGE, top),
    Math.max(EDGE, window.innerHeight - height - EDGE)
  )

  const style: CSSProperties = {
    left,
    top,
    right: 'auto',
    bottom: 'auto',
    width: NUDGE_WIDTH,
  }

  const arrowClass = [
    preferLeft ? '' : 'assistant-nudge--right',
    placeAbove ? 'assistant-nudge--above' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      ref={rootRef}
      className={`assistant-nudge ${arrowClass}`.trim()}
      role="status"
      style={style}
    >
      <button
        type="button"
        className="assistant-nudge__close"
        onClick={onDismiss}
        aria-label="Dismiss assistant tip"
      >
        <X className="w-3 h-3" aria-hidden />
      </button>

      <button
        type="button"
        className="assistant-nudge__body"
        onClick={() => onOpen()}
        aria-label={`Open assistant — ${help.nudge}`}
      >
        <span className="assistant-nudge__title">Hey 👋</span>
        <span className="assistant-nudge__text">{help.nudge}</span>
      </button>

      {starters.length > 0 && (
        <div className="assistant-nudge__chips">
          {starters.map((chip) => (
            <button
              key={chip}
              type="button"
              className="assistant-nudge__chip"
              onClick={() => onOpen(chip)}
            >
              {chip}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
