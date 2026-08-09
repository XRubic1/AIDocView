import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { mockBrokers, updateBroker } from '../../data/mockBrokers'
import '../../styles/brokerPicker.css'

interface BrokerInternalNotesBannerProps {
  brokerId?: string | null
  /** When broker id is empty, look up by exact name. */
  brokerName?: string | null
  className?: string
  /** Allow add/edit of admin-only internal notes. */
  editable?: boolean
  /** Bump after save so parent can refresh. */
  onSaved?: () => void
}

/**
 * Admin-only banner for Broker.notes (internal warnings).
 * Never mount this in the carrier portal.
 */
export default function BrokerInternalNotesBanner({
  brokerId,
  brokerName,
  className = '',
  editable = false,
  onSaved,
}: BrokerInternalNotesBannerProps) {
  const broker =
    (brokerId ? mockBrokers.find((b) => b.id === brokerId) : undefined) ??
    (brokerName
      ? mockBrokers.find((b) => b.name.toLowerCase() === brokerName.trim().toLowerCase())
      : undefined)

  const stored = broker?.notes?.trim() ?? ''
  const [draft, setDraft] = useState(stored)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(stored)
  }, [broker?.id, stored])

  if (!broker) return null
  if (!editable && !stored) return null

  const dirty = draft.trim() !== stored
  const canSave = editable && dirty

  const handleSave = () => {
    if (!canSave) return
    setSaving(true)
    try {
      updateBroker(broker.id, { notes: draft.trim() })
      onSaved?.()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className={`broker-internal-notes-banner ${className}`.trim()}
      role="status"
      aria-label="Internal broker warning"
    >
      <AlertTriangle className="broker-internal-notes-banner__icon" aria-hidden />
      <div className="broker-internal-notes-banner__body">
        <p className="broker-internal-notes-banner__label">
          Internal note — not visible to carriers
        </p>
        {editable ? (
          <div className="broker-internal-notes-banner__edit">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              placeholder="Add an internal note (slow pay, docs issues, watch list…)"
              className="broker-internal-notes-banner__input"
            />
            <button
              type="button"
              className="broker-internal-notes-banner__save"
              disabled={!canSave || saving}
              onClick={handleSave}
            >
              {saving ? 'Saving…' : stored ? 'Update note' : 'Add note'}
            </button>
          </div>
        ) : (
          <p className="broker-internal-notes-banner__text">{stored}</p>
        )}
      </div>
    </div>
  )
}
