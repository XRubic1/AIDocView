import { useEffect, useRef, useState } from 'react'
import { MessageSquarePlus, ChevronDown, ChevronRight, Lock } from 'lucide-react'

export type NoteComposeVisibility = 'client' | 'internal'

interface InvoiceNoteComposeProps {
  newNote: string
  isAddingNote: boolean
  onChange: (value: string) => void
  onSubmit: () => void
  compact?: boolean
  /** Start collapsed; expands when the user opens it or types a note. */
  collapsible?: boolean
  /** When true, show Credyx-only vs carrier-visible toggle. */
  allowInternal?: boolean
  visibility?: NoteComposeVisibility
  onVisibilityChange?: (visibility: NoteComposeVisibility) => void
  /** Override placeholder (defaults based on visibility). */
  placeholder?: string
}

/** Compact note composer for detail panels and modals. */
export function InvoiceNoteCompose({
  newNote,
  isAddingNote,
  onChange,
  onSubmit,
  compact = false,
  collapsible = false,
  allowInternal = false,
  visibility = 'client',
  onVisibilityChange,
  placeholder,
}: InvoiceNoteComposeProps) {
  const [expanded, setExpanded] = useState(() => Boolean(newNote.trim()) || !collapsible)
  const hadContentRef = useRef(Boolean(newNote.trim()))

  useEffect(() => {
    if (newNote.trim()) {
      hadContentRef.current = true
      setExpanded(true)
      return
    }
    // Collapse again after a successful add clears the field.
    if (collapsible && hadContentRef.current && !isAddingNote) {
      hadContentRef.current = false
      setExpanded(false)
    }
  }, [newNote, collapsible, isAddingNote])

  const resolvedPlaceholder =
    placeholder ||
    (allowInternal && visibility === 'internal'
      ? 'Internal note (Credyx only)…'
      : allowInternal
        ? 'Note visible to carrier…'
        : 'Add a note for Credyx...')

  if (collapsible && !expanded) {
    return (
      <div
        className={`invoice-detail-note-compose invoice-detail-note-compose--collapsed ${
          compact ? 'invoice-detail-note-compose--compact' : ''
        }`}
      >
        <button
          type="button"
          className="invoice-detail-note-compose__toggle"
          onClick={() => setExpanded(true)}
        >
          <ChevronRight className="w-3.5 h-3.5 shrink-0" aria-hidden />
          <MessageSquarePlus className="w-3.5 h-3.5 shrink-0" aria-hidden />
          <span>Add note</span>
        </button>
      </div>
    )
  }

  return (
    <div className={`invoice-detail-note-compose ${compact ? 'invoice-detail-note-compose--compact' : ''}`}>
      {collapsible ? (
        <button
          type="button"
          className="invoice-detail-note-compose__toggle invoice-detail-note-compose__toggle--open"
          onClick={() => {
            if (!newNote.trim() && !isAddingNote) setExpanded(false)
          }}
          aria-expanded="true"
        >
          <ChevronDown className="w-3.5 h-3.5 shrink-0" aria-hidden />
          <span>Add note</span>
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

      <div className="invoice-detail-note-compose-row">
        <textarea
          value={newNote}
          onChange={(e) => onChange(e.target.value)}
          placeholder={resolvedPlaceholder}
          rows={compact ? 1 : 2}
          className="client-input invoice-detail-note-input"
          autoFocus={collapsible}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              onSubmit()
            }
            if (e.key === 'Escape' && collapsible && !newNote.trim()) {
              setExpanded(false)
            }
          }}
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={!newNote.trim() || isAddingNote}
          className="dashboard-btn-primary dashboard-btn-compact invoice-detail-add-note-btn"
          title="Add note"
        >
          <MessageSquarePlus className="w-3 h-3" />
          <span className="hidden sm:inline">{isAddingNote ? 'Adding...' : 'Add'}</span>
        </button>
      </div>
    </div>
  )
}
