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

/**
 * Speech bubble beside the floating buddy offering help for the current page.
 * Anchored to the FAB so it moves with a dragged bubble.
 */
export default function AssistantNudgeBubble({
  help,
  fabPosition,
  fabSize = 44,
  onOpen,
  onDismiss,
}: AssistantNudgeBubbleProps) {
  const starters = help.chips.slice(0, 2)

  // Prefer opening to the left of the FAB; flip right if near the left edge.
  const nudgeWidth = 260
  const gap = 10
  const preferLeft = fabPosition.left + fabSize / 2 > window.innerWidth / 2
  const left = preferLeft
    ? Math.max(8, fabPosition.left - nudgeWidth - gap)
    : fabPosition.left + fabSize + gap
  const top = Math.max(8, fabPosition.top - 8)

  const style: CSSProperties = {
    left,
    top,
    right: 'auto',
    bottom: 'auto',
  }

  return (
    <div
      className={`assistant-nudge${preferLeft ? '' : ' assistant-nudge--right'}`}
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
