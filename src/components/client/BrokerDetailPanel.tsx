import { useState } from 'react'
import { X, Sparkles, StickyNote, Trash2 } from 'lucide-react'
import type { ClientBrokerProfile } from '../../types/clientBroker'
import { deleteBrokerNote, saveBrokerNote } from '../../utils/clientBrokers'
import { formatCurrency } from '../../utils/format'
import BrokerPayRatingBadge from './BrokerPayRatingBadge'
import { useClientTheme } from '../../theme/ThemeContext'

interface BrokerDetailPanelProps {
  broker: ClientBrokerProfile
  clientId: string
  onClose: () => void
  onNotesChange: () => void
}

/** Side panel — AI summary, pay stats, and client notes. */
export default function BrokerDetailPanel({
  broker,
  clientId,
  onClose,
  onNotesChange,
}: BrokerDetailPanelProps) {
  const c = useClientTheme()
  const [noteText, setNoteText] = useState('')
  const [saving, setSaving] = useState(false)

  const handleAddNote = async () => {
    if (!noteText.trim()) return
    setSaving(true)
    try {
      saveBrokerNote(clientId, broker.broker_id, noteText)
      setNoteText('')
      onNotesChange()
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteNote = (noteId: string) => {
    deleteBrokerNote(clientId, broker.broker_id, noteId)
    onNotesChange()
  }

  return (
    <div className="broker-detail-panel" role="dialog" aria-label={`${broker.broker_name} details`}>
      <div className="broker-detail-panel__header">
        <div className="min-w-0">
          <h2 className="text-base font-bold truncate" style={{ color: c.primary }}>
            {broker.broker_name}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: c.secondary }}>
            {broker.mc_number ?? 'MC not on file'}
            {broker.payment_terms_days != null && ` · Net ${broker.payment_terms_days}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg hover:opacity-70"
          aria-label="Close"
        >
          <X className="w-5 h-5" style={{ color: c.secondary }} />
        </button>
      </div>

      <div className="broker-detail-panel__body">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <BrokerPayRatingBadge rating={broker.rating} />
          {!broker.has_worked_with_client && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: c.stat.slate, color: c.secondary }}>
              No loads with you yet
            </span>
          )}
        </div>

        <section className="broker-detail-panel__section">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles className="w-3.5 h-3.5" style={{ color: c.info }} />
            <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: c.secondary }}>
              AI summary
            </h3>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: c.primary }}>
            {broker.ai_summary}
          </p>
        </section>

        {broker.score && (
          <section className="broker-detail-panel__section grid grid-cols-2 gap-2">
            <div className="broker-detail-stat" style={{ backgroundColor: c.stat.blue }}>
              <p className="broker-detail-stat__label" style={{ color: c.secondary }}>
                Avg pay lag
              </p>
              <p className="broker-detail-stat__value tabular-nums" style={{ color: c.primary }}>
                {broker.score.avg_days_to_pay !== null ? `${broker.score.avg_days_to_pay}d` : '—'}
              </p>
            </div>
            <div className="broker-detail-stat" style={{ backgroundColor: c.stat.green }}>
              <p className="broker-detail-stat__label" style={{ color: c.secondary }}>
                Collection rate
              </p>
              <p className="broker-detail-stat__value tabular-nums" style={{ color: c.primary }}>
                {broker.score.invoiced_in_range > 0
                  ? `${broker.score.collection_rate.toFixed(0)}%`
                  : '—'}
              </p>
            </div>
            <div className="broker-detail-stat" style={{ backgroundColor: c.stat.amber }}>
              <p className="broker-detail-stat__label" style={{ color: c.secondary }}>
                Open A/R
              </p>
              <p className="broker-detail-stat__value tabular-nums" style={{ color: c.primary }}>
                {formatCurrency(broker.score.open_ar)}
              </p>
            </div>
            <div className="broker-detail-stat" style={{ backgroundColor: c.stat.red }}>
              <p className="broker-detail-stat__label" style={{ color: c.secondary }}>
                Overdue
              </p>
              <p className="broker-detail-stat__value tabular-nums" style={{ color: c.primary }}>
                {formatCurrency(broker.score.overdue_amount)}
              </p>
            </div>
          </section>
        )}

        <section className="broker-detail-panel__section">
          <div className="flex items-center gap-1.5 mb-2">
            <StickyNote className="w-3.5 h-3.5" style={{ color: c.warning }} />
            <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: c.secondary }}>
              Your notes
            </h3>
          </div>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={3}
            placeholder="e.g. Delayed payment on last 3 loads, requires follow-up…"
            className="client-input w-full text-sm resize-none mb-2"
            style={{ borderColor: c.border, color: c.primary }}
          />
          <button
            type="button"
            disabled={!noteText.trim() || saving}
            onClick={handleAddNote}
            className="dashboard-btn-primary text-xs py-1.5 px-3 disabled:opacity-50"
          >
            Save note
          </button>
          {broker.notes.length > 0 && (
            <ul className="mt-3 space-y-2">
              {broker.notes.map((note) => (
                <li
                  key={note.id}
                  className="text-sm p-2.5 rounded-lg border flex gap-2"
                  style={{ borderColor: c.border, color: c.primary }}
                >
                  <p className="flex-1 min-w-0">{note.text}</p>
                  <button
                    type="button"
                    onClick={() => handleDeleteNote(note.id)}
                    className="shrink-0 p-1 rounded hover:opacity-70"
                    aria-label="Delete note"
                  >
                    <Trash2 className="w-3.5 h-3.5" style={{ color: c.mutedLight }} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
