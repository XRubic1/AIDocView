import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  MessageSquarePlus,
  ChevronDown,
  ChevronUp,
  Lock,
  Send,
} from 'lucide-react'
import '../../styles/invoiceNotesClean.css'

export type NoteComposeVisibility = 'client' | 'internal'

interface InvoiceNoteComposeProps {
  newNote: string
  isAddingNote: boolean
  onChange: (value: string) => void
  onSubmit: () => void
  compact?: boolean
  /** Start collapsed; expands when the user opens it or types a note. */
  collapsible?: boolean
  /**
   * Mobile dock: collapsed “Add note ↑” button; expands into a large compose sheet.
   */
  mobileEasy?: boolean
  /** When true, show Credyx-only vs carrier-visible toggle. */
  allowInternal?: boolean
  visibility?: NoteComposeVisibility
  onVisibilityChange?: (visibility: NoteComposeVisibility) => void
  /** Override placeholder (defaults based on visibility). */
  placeholder?: string
  /** Extra actions under the note field (e.g. Will Pay / Call Back). */
  footer?: ReactNode
  /** Enable Add when a status is selected even if the note field is empty. */
  submitEnabled?: boolean
}

/** Compact note composer for detail panels and modals. */
export function InvoiceNoteCompose({
  newNote,
  isAddingNote,
  onChange,
  onSubmit,
  compact = false,
  collapsible = false,
  mobileEasy = false,
  allowInternal = false,
  visibility = 'client',
  onVisibilityChange,
  placeholder,
  footer,
  submitEnabled,
}: InvoiceNoteComposeProps) {
  const canCollapse = collapsible || mobileEasy
  const [expanded, setExpanded] = useState(() => Boolean(newNote.trim()) || !canCollapse)
  const hadContentRef = useRef(Boolean(newNote.trim()))

  useEffect(() => {
    if (newNote.trim()) {
      // Expand only when content first appears (not while user is collapsing a draft).
      if (!hadContentRef.current) {
        hadContentRef.current = true
        setExpanded(true)
      }
      return
    }
    // Collapse again after a successful add clears the field.
    if (canCollapse && hadContentRef.current && !isAddingNote) {
      hadContentRef.current = false
      setExpanded(false)
    }
  }, [newNote, canCollapse, isAddingNote])

  const resolvedPlaceholder =
    placeholder ||
    (allowInternal && visibility === 'internal'
      ? 'Internal note (Credyx only)…'
      : allowInternal
        ? 'Note visible to carrier…'
        : mobileEasy
          ? 'Write a note for Credyx…'
          : 'Add a note for Credyx...')

  /** Collapse the composer (draft is kept if they typed). */
  const collapseComposer = () => {
    if (!isAddingNote) setExpanded(false)
  }

  if (canCollapse && !expanded) {
    if (mobileEasy) {
      return (
        <div className="invoice-detail-note-compose invoice-detail-note-compose--mobile-easy invoice-detail-note-compose--mobile-collapsed">
          <button
            type="button"
            className="invoice-detail-note-compose__mobile-open"
            onClick={() => setExpanded(true)}
            aria-expanded="false"
          >
            <MessageSquarePlus className="w-4 h-4 shrink-0" aria-hidden />
            <span>Add note</span>
            <ChevronUp className="w-4 h-4 shrink-0 invoice-detail-note-compose__mobile-open-arrow" aria-hidden />
          </button>
        </div>
      )
    }

    return (
      <div
        className={`invoice-detail-note-compose invoice-detail-note-compose--collapsed note-compose${
          compact ? ' invoice-detail-note-compose--compact' : ''
        }`}
      >
        <button
          type="button"
          className="note-compose__open"
          onClick={() => setExpanded(true)}
          aria-expanded="false"
        >
          <MessageSquarePlus className="w-4 h-4 shrink-0" aria-hidden />
          <span>{resolvedPlaceholder}</span>
        </button>
      </div>
    )
  }

  const composeClass = [
    'invoice-detail-note-compose',
    compact && !mobileEasy ? 'invoice-detail-note-compose--compact' : '',
    mobileEasy ? 'invoice-detail-note-compose--mobile-easy' : 'note-compose note-compose--open',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={composeClass}>
      {mobileEasy ? (
        <button
          type="button"
          className="invoice-detail-note-compose__mobile-close"
          onClick={collapseComposer}
          aria-expanded="true"
        >
          <span>Add a note</span>
          <ChevronDown className="w-4 h-4 shrink-0" aria-hidden />
        </button>
      ) : null}

      {allowInternal && onVisibilityChange ? (
        <div className="invoice-detail-note-compose__visibility" role="group" aria-label="Note visibility">
          <button
            type="button"
            className={`invoice-detail-note-compose__vis-btn ${
              visibility === 'client' ? 'invoice-detail-note-compose__vis-btn--active' : ''
            }`}
            onClick={() => onVisibilityChange('client')}
            aria-pressed={visibility === 'client'}
          >
            Visible to carrier
          </button>
          <button
            type="button"
            className={`invoice-detail-note-compose__vis-btn ${
              visibility === 'internal' ? 'invoice-detail-note-compose__vis-btn--active' : ''
            }`}
            onClick={() => onVisibilityChange('internal')}
            aria-pressed={visibility === 'internal'}
          >
            <Lock className="w-3 h-3" aria-hidden />
            Internal only
          </button>
        </div>
      ) : null}

      {mobileEasy ? (
        <div
          className="invoice-detail-note-compose-row invoice-detail-note-compose-row--stacked"
        >
          <textarea
            value={newNote}
            onChange={(e) => onChange(e.target.value)}
            placeholder={resolvedPlaceholder}
            rows={3}
            className="client-input invoice-detail-note-input"
            autoFocus={canCollapse}
            enterKeyHint="send"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                onSubmit()
              }
              if (e.key === 'Escape' && canCollapse && !newNote.trim()) {
                setExpanded(false)
              }
            }}
          />
          <button
            type="button"
            onClick={onSubmit}
            disabled={!(submitEnabled ?? Boolean(newNote.trim())) || isAddingNote}
            className="dashboard-btn-primary dashboard-btn-compact invoice-detail-add-note-btn invoice-detail-add-note-btn--mobile"
            title="Add note"
          >
            <Send className="w-4 h-4 shrink-0" aria-hidden />
            <span>{isAddingNote ? 'Sending…' : 'Send note'}</span>
          </button>
        </div>
      ) : (
        <>
          <textarea
            value={newNote}
            onChange={(e) => onChange(e.target.value)}
            placeholder={resolvedPlaceholder}
            rows={3}
            className="client-input invoice-detail-note-input note-compose__input"
            autoFocus={canCollapse}
            aria-label="Note"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                onSubmit()
              }
              if (e.key === 'Escape' && canCollapse && !newNote.trim()) {
                setExpanded(false)
              }
            }}
          />
          <div className="note-compose__actions">
            <span className="note-compose__hint">Ctrl + Enter to add</span>
            {canCollapse ? (
              <button
                type="button"
                className="note-compose__cancel"
                onClick={collapseComposer}
                disabled={isAddingNote}
              >
                Cancel
              </button>
            ) : null}
            <button
              type="button"
              onClick={onSubmit}
              disabled={!(submitEnabled ?? Boolean(newNote.trim())) || isAddingNote}
              className="dashboard-btn-primary note-compose__submit"
            >
              {isAddingNote ? 'Adding…' : 'Add note'}
            </button>
          </div>
        </>
      )}
      {footer ? <div className="invoice-detail-note-compose__footer">{footer}</div> : null}
    </div>
  )
}
