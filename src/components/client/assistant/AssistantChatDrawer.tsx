import { useEffect, useId } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ExternalLink, GripHorizontal, X } from 'lucide-react'
import AssistantChatThread from './AssistantChatThread'
import AssistantBuddyFace from './AssistantBuddyFace'
import { useDraggablePanel } from '../../../hooks/useDraggablePanel'
import { useIsMobileViewport } from '../../../hooks/useIsMobileViewport'

interface AssistantChatDrawerProps {
  open: boolean
  onClose: () => void
  mode?: 'client' | 'admin'
  /** Question asked automatically on open (from a page nudge chip). */
  initialPrompt?: string
}

/**
 * Desktop: floating draggable chat window.
 * Phone: full-screen Messenger-style chat (sticky header + composer).
 */
export default function AssistantChatDrawer({
  open,
  onClose,
  mode = 'client',
  initialPrompt,
}: AssistantChatDrawerProps) {
  const navigate = useNavigate()
  const titleId = useId()
  const isPhone = useIsMobileViewport()
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
    enabled: open && !isPhone,
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

  /** Lock page scroll while the phone messenger covers the viewport. */
  useEffect(() => {
    if (!open || !isPhone) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open, isPhone])

  if (!open) return null

  const title = isClient ? 'Credyx Buddy' : 'Credyx Assistant'
  const subtitle = isPhone
    ? 'Active now'
    : isClient
      ? 'Ask me anything about your company'
      : 'Chase, aging, drafts — grounded in live A/R'

  const panel = (
    <div
      ref={isPhone ? undefined : panelRef}
      className={`assistant-drawer assistant-drawer--float${
        isPhone ? ' assistant-drawer--messenger' : ''
      }${isDragging || isResizing ? ' assistant-drawer--dragging' : ''} assistant-drawer--enter`}
      style={isPhone ? undefined : panelStyle}
      role="dialog"
      aria-modal={isPhone}
      aria-labelledby={titleId}
    >
      {isPhone ? (
        <header className="assistant-drawer__header assistant-drawer__header--messenger">
          <button
            type="button"
            className="assistant-drawer__back"
            onClick={onClose}
            aria-label="Close chat"
          >
            <ChevronLeft className="w-6 h-6" strokeWidth={2} aria-hidden />
          </button>
          <div className="assistant-drawer__brand assistant-drawer__brand--messenger">
            <AssistantBuddyFace
              size={40}
              className="assistant-drawer__face"
              mood="happy"
              animated
            />
            <div className="assistant-drawer__brand-copy">
              <h2 id={titleId} className="assistant-drawer__title">
                {title}
              </h2>
              <p className="assistant-drawer__subtitle assistant-drawer__subtitle--online">
                <span className="assistant-drawer__online-dot" aria-hidden />
                {subtitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="assistant-drawer__icon-btn assistant-drawer__icon-btn--messenger"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="w-5 h-5" strokeWidth={2} aria-hidden />
          </button>
        </header>
      ) : (
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
              <p className="assistant-drawer__subtitle">{subtitle}</p>
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
      )}

      <div className="assistant-drawer__body">
        <AssistantChatThread
          mode={mode}
          autoFocus
          initialPrompt={initialPrompt}
          footerExtra={
            isPhone ? null : (
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
            )
          }
        />
      </div>

      {!isPhone ? (
        <div
          className="assistant-drawer__resize"
          aria-label="Resize chat window"
          role="separator"
          aria-orientation="horizontal"
          data-no-drag
          {...resizeHandleProps}
        />
      ) : null}
    </div>
  )

  if (isPhone) {
    return (
      <div className="assistant-messenger-root is-visible" role="presentation">
        {panel}
      </div>
    )
  }

  return panel
}
