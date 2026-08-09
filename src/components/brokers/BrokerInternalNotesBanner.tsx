import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, Eye, Plus, X } from 'lucide-react'
import { mockBrokers, updateBrokerAsync } from '../../data/mockBrokers'
import { findBrokerByName } from '../../utils/brokerResolve'
import { useToast } from '../ui/ToastProvider'
import '../../styles/brokerPicker.css'

type NoteVisibility = 'internal' | 'carrier'

interface BrokerInternalNotesBannerProps {
  brokerId?: string | null
  /** When broker id is empty, look up by exact name. */
  brokerName?: string | null
  className?: string
  /** Allow posting internal or carrier-visible notes. */
  editable?: boolean
  /** Bump after save so parent can refresh. */
  onSaved?: () => void
  /** Extra controls next to Add note (e.g. Risk audit button). */
  topActions?: ReactNode
}

/** Append a new note line onto an existing broker note field. */
function appendNote(existing: string | undefined, next: string): string {
  const prior = existing?.trim() ?? ''
  return prior ? `${prior}\n${next}` : next
}

/** Resolve catalog broker from risk profile id / name / slug. */
function resolveBroker(brokerId?: string | null, brokerName?: string | null) {
  if (brokerId) {
    const byId = mockBrokers.find((b) => b.id === brokerId)
    if (byId) return byId
    if (brokerId.startsWith('broker-name-')) {
      const fromSlug = brokerId.replace(/^broker-name-/, '').replace(/-/g, ' ')
      const bySlug = findBrokerByName(fromSlug)
      if (bySlug) return bySlug
    }
  }
  if (brokerName?.trim()) return findBrokerByName(brokerName)
  return undefined
}

/**
 * Compact admin broker notes.
 * Internal: Add note → composer. Carrier: Post to carrier from the same sheet.
 * Never mount this in the carrier portal.
 */
export default function BrokerInternalNotesBanner({
  brokerId,
  brokerName,
  className = '',
  editable = false,
  onSaved,
  topActions,
}: BrokerInternalNotesBannerProps) {
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState<NoteVisibility | null>(null)
  const [revision, setRevision] = useState(0)

  const broker = useMemo(
    () => resolveBroker(brokerId, brokerName),
    [brokerId, brokerName, revision]
  )

  const internal = broker?.notes?.trim() ?? ''
  const carrier = broker?.carrier_notes?.trim() ?? ''

  useEffect(() => {
    setDraft('')
    setOpen(false)
  }, [broker?.id])

  if (!broker) {
    if (!topActions && !editable) return null
    return (
      <div className={`broker-note-bar ${className}`.trim()} role="region" aria-label="Broker notes">
        <div className="broker-note-bar__top">
          <p className="broker-note-bar__empty">
            {editable ? 'Broker not in directory — notes unavailable' : 'No internal note'}
          </p>
          <div className="broker-note-bar__actions-top">{topActions}</div>
        </div>
      </div>
    )
  }
  if (!editable && !internal && !topActions) return null

  const canPost = editable && open && draft.trim().length > 0 && !saving

  const handlePost = async (visibility: NoteVisibility) => {
    if (!canPost) return
    const text = draft.trim()
    setSaving(visibility)
    try {
      const patch =
        visibility === 'internal'
          ? { notes: appendNote(broker.notes, text) }
          : { carrier_notes: appendNote(broker.carrier_notes, text) }
      const updated = await updateBrokerAsync(broker.id, patch)
      if (!updated) {
        showToast('Could not save note — broker not found', 'error')
        return
      }
      setDraft('')
      setOpen(false)
      setRevision((n) => n + 1)
      onSaved?.()
      showToast(
        visibility === 'carrier' ? 'Note posted for carriers' : 'Internal note saved',
        'success'
      )
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save note', 'error')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div
      className={`broker-note-bar ${className}`.trim()}
      role="region"
      aria-label="Broker notes"
    >
      <div className="broker-note-bar__top">
        {internal ? (
          <p className="broker-note-bar__line broker-note-bar__line--internal">
            <AlertTriangle className="broker-note-bar__icon" aria-hidden />
            <span>
              <strong>Internal</strong> {internal}
            </span>
          </p>
        ) : (
          <p className="broker-note-bar__empty">No internal note</p>
        )}

        <div className="broker-note-bar__actions-top">
          {editable && !open ? (
            <button
              type="button"
              className="broker-note-bar__add"
              onClick={() => setOpen(true)}
            >
              <Plus className="w-3 h-3" aria-hidden />
              Add note
            </button>
          ) : null}
          {topActions}
        </div>
      </div>

      {editable && carrier ? (
        <p className="broker-note-bar__line broker-note-bar__line--carrier">
          <Eye className="broker-note-bar__icon" aria-hidden />
          <span>
            <strong>Carrier</strong> {carrier}
          </span>
        </p>
      ) : null}

      {editable && open ? (
        <div className="broker-note-bar__composer">
          <div className="broker-note-bar__composer-head">
            <span>Add note</span>
            <button
              type="button"
              className="broker-note-bar__close"
              onClick={() => {
                setOpen(false)
                setDraft('')
              }}
              aria-label="Cancel note"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canPost) {
                e.preventDefault()
                void handlePost('internal')
              }
              if (e.key === 'Escape') {
                setOpen(false)
                setDraft('')
              }
            }}
            placeholder="Type note…"
            className="broker-note-bar__input"
            autoFocus
          />
          <div className="broker-note-bar__actions">
            <button
              type="button"
              className="broker-note-bar__btn broker-note-bar__btn--internal"
              disabled={!canPost}
              onClick={() => void handlePost('internal')}
            >
              {saving === 'internal' ? '…' : 'Post internal'}
            </button>
            <button
              type="button"
              className="broker-note-bar__btn broker-note-bar__btn--carrier"
              disabled={!canPost}
              onClick={() => void handlePost('carrier')}
            >
              {saving === 'carrier' ? '…' : 'Post to carrier'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
