import { useEffect, useId } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExternalLink, GripHorizontal, X } from 'lucide-react'
import AssistantChatThread from './AssistantChatThread'
import AssistantBuddyFace from './AssistantBuddyFace'
import { useDraggablePanel } from '../../../hooks/useDraggablePanel'

interface AssistantChatDrawerProps {
  open: boolean
  onClose: () => void
  mode?: 'client' | 'admin'
  /** Question asked automatically on open (from a page nudge chip). */
  initialPrompt?: string
}

/**
 * Floating, draggable + resizable chat window. No overlay — page stays interactive.
 */
export default function AssistantChatDrawer({
  open,
  onClose,
  mode = 'client',
  initialPrompt,
}: AssistantChatDrawerProps) {
  const navigate = useNavigate()
  const titleId = useId()
  const fullPath = mode === 'admin' ? '/admin/assistant' : '/client/assistant'
  const isClient = mode === 'client'

  const {
    panelRef,
    panelStyle,
    dragHandleProps,
    resizeHandleProps,
    isDragging,
    isResizing,
  } = useDraggablePanel({
    enabled: open,
    storageKey: `credyx-assistant-panel-${mode}`,
    defaultBottomOffset: 88,
    defaultWidth: 380,
    defaultHeight: 520,
  })

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={panelRef}
      className={`assistant-drawer assistant-drawer--float${
        isDragging || isResizing ? ' assistant-drawer--dragging' : ''
      } assistant-drawer--enter`}
      style={panelStyle}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
    >
      <header
        className="assistant-drawer__header assistant-drawer__header--drag"
        {...dragHandleProps}
      >
        <span className="assistant-drawer__grip" aria-hidden>
          <GripHorizontal className="w-3.5 h-3.5" />
        </span>
        <div className="assistant-drawer__brand">
          <AssistantBuddyFace
            size={32}
            className="assistant-drawer__face"
            mood="happy"
            animated
          />
          <div>
            <h2 id={titleId} className="assistant-drawer__title">
              {isClient ? 'Hey — I’m your trucking buddy' : 'Credyx Assistant'}
            </h2>
            <p className="assistant-drawer__subtitle">
              {isClient
                ? 'Ask me anything about your company'
                : 'Chase, aging, drafts — grounded in live A/R'}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="assistant-drawer__icon-btn"
          onClick={onClose}
          aria-label="Close"
          data-no-drag
        >
          <X className="w-4 h-4" />
        </button>
      </header>

      <div className="assistant-drawer__body">
        <AssistantChatThread
          mode={mode}
          autoFocus
          initialPrompt={initialPrompt}
          footerExtra={
            <button
              type="button"
              className="assistant-drawer__full-link"
              onClick={() => {
                onClose()
                navigate(fullPath)
              }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open full Assistant
            </button>
          }
        />
      </div>

      <div
        className="assistant-drawer__resize"
        aria-label="Resize chat window"
        role="separator"
        aria-orientation="horizontal"
        data-no-drag
        {...resizeHandleProps}
      />
    </div>
  )
}
