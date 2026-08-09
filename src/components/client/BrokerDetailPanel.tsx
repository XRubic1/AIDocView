import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  X,
  StickyNote,
  Trash2,
  Building2,
  Wallet,
  BarChart3,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react'
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

type RiskTone = 'none' | 'watch' | 'flagged' | 'urgent'

/** One-line carrier risk status — no essays. */
function carrierRiskStatus(broker: ClientBrokerProfile): {
  tone: RiskTone
  title: string
  detail: string | null
} {
  const level = broker.risk?.risk_level
  const pending = Boolean(broker.risk?.pending_review)

  if (!level || level === 'low' || level === 'unrated') {
    return { tone: 'none', title: 'No risk', detail: null }
  }

  if (broker.is_new) {
    return {
      tone: level === 'high' ? 'urgent' : 'flagged',
      title: level === 'high' ? 'High risk · NEW' : 'Elevated · NEW',
      detail: 'Limited payment history.',
    }
  }

  if (pending) {
    return {
      tone: level === 'high' ? 'urgent' : 'flagged',
      title: level === 'high' ? 'High risk · under review' : 'Medium risk · under review',
      detail: 'Credyx is confirming details.',
    }
  }

  if (level === 'high') {
    return {
      tone: 'urgent',
      title: 'High risk',
      detail: broker.risk?.recommendation?.trim() || 'Use caution on new loads.',
    }
  }

  return {
    tone: 'flagged',
    title: 'Medium risk',
    detail: broker.risk?.recommendation?.trim() || 'Watch payment timing.',
  }
}

/** Side panel — clear status first, short facts, notes. */
export default function BrokerDetailPanel({
  broker,
  clientId,
  onClose,
  onNotesChange,
}: BrokerDetailPanelProps) {
  const c = useClientTheme()
  const navigate = useNavigate()
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

  const location = [broker.city, broker.state].filter(Boolean).join(', ')
  const risk = carrierRiskStatus(broker)
  const openInvoices = broker.score?.open_invoices ?? 0
  const openAr = broker.score?.open_ar ?? 0
  const showBullets =
    risk.tone !== 'none' &&
    !broker.risk?.pending_review &&
    (broker.risk?.bullets?.length ?? 0) > 0

  const statusBg =
    risk.tone === 'none'
      ? c.stat.green
      : risk.tone === 'urgent'
        ? c.stat.red
        : risk.tone === 'flagged'
          ? c.stat.amber
          : c.stat.slate

  const statusColor =
    risk.tone === 'none'
      ? c.success
      : risk.tone === 'urgent'
        ? c.error
        : risk.tone === 'flagged'
          ? c.warning
          : c.secondary

  return (
    <div className="broker-detail-panel" role="dialog" aria-label={`${broker.broker_name} details`}>
      <div className="broker-detail-panel__header">
        <div className="min-w-0">
          <h2 className="text-base font-bold truncate" style={{ color: c.primary }}>
            {broker.broker_name}
          </h2>
          <p className="text-xs mt-0.5 truncate" style={{ color: c.secondary }}>
            {[
              broker.mc_number ? `MC ${broker.mc_number}` : null,
              broker.payment_terms_days != null && broker.payment_terms_days > 0
                ? `Net ${broker.payment_terms_days}`
                : null,
              location || null,
            ]
              .filter(Boolean)
              .join(' · ') || 'Broker profile'}
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
        {/* Status — read in 2 seconds */}
        <div
          className="broker-detail-status"
          style={{ backgroundColor: statusBg, borderColor: c.border }}
        >
          <div className="broker-detail-status__row">
            {risk.tone === 'none' ? (
              <ShieldCheck className="w-5 h-5 shrink-0" style={{ color: statusColor }} />
            ) : (
              <ShieldAlert className="w-5 h-5 shrink-0" style={{ color: statusColor }} />
            )}
            <div className="min-w-0">
              <p className="broker-detail-status__title" style={{ color: statusColor }}>
                {risk.title}
              </p>
              {risk.detail ? (
                <p className="broker-detail-status__detail" style={{ color: c.primary }}>
                  {risk.detail}
                </p>
              ) : null}
            </div>
            <BrokerPayRatingBadge rating={broker.rating} size="sm" />
          </div>
          {showBullets ? (
            <ul className="broker-detail-status__bullets" style={{ color: c.primary }}>
              {broker.risk!.bullets.slice(0, 3).map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="broker-detail-actions">
          <button
            type="button"
            className="dashboard-btn-primary text-xs py-2 px-3 inline-flex items-center justify-center gap-1.5 flex-1"
            onClick={() =>
              navigate(
                `/client/collections?broker=${encodeURIComponent(broker.broker_name)}`
              )
            }
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Aging A/R
            {openInvoices > 0 ? ` (${openInvoices})` : ''}
          </button>
        </div>

        {broker.carrier_notes ? (
          <section className="broker-detail-panel__section">
            <div className="flex items-center gap-1.5 mb-2">
              <Building2 className="w-3.5 h-3.5" style={{ color: c.info }} />
              <h3
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: c.secondary }}
              >
                Credyx note
              </h3>
            </div>
            <p
              className="text-sm leading-snug p-2.5 rounded-lg border"
              style={{ borderColor: c.border, backgroundColor: c.stat.blue, color: c.primary }}
            >
              {broker.carrier_notes}
            </p>
          </section>
        ) : null}

        {/* Notes first — works the same for No risk / Medium / High */}
        <section className="broker-detail-panel__section">
          <div className="flex items-center gap-1.5 mb-2">
            <StickyNote className="w-3.5 h-3.5" style={{ color: c.warning }} />
            <h3
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: c.secondary }}
            >
              Your notes
            </h3>
          </div>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={2}
            placeholder="Quick note — works for any broker…"
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

        <section className="broker-detail-panel__section">
          <div className="flex items-center gap-1.5 mb-2">
            <Wallet className="w-3.5 h-3.5" style={{ color: c.info }} />
            <h3
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: c.secondary }}
            >
              With your company
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="broker-detail-stat" style={{ backgroundColor: c.stat.blue }}>
              <p className="broker-detail-stat__label" style={{ color: c.secondary }}>
                Open invoices
              </p>
              <p className="broker-detail-stat__value tabular-nums" style={{ color: c.primary }}>
                {openInvoices}
              </p>
            </div>
            <div className="broker-detail-stat" style={{ backgroundColor: c.stat.amber }}>
              <p className="broker-detail-stat__label" style={{ color: c.secondary }}>
                Open A/R
              </p>
              <p className="broker-detail-stat__value tabular-nums" style={{ color: c.primary }}>
                {formatCurrency(openAr)}
              </p>
            </div>
            <div className="broker-detail-stat" style={{ backgroundColor: c.stat.green }}>
              <p className="broker-detail-stat__label" style={{ color: c.secondary }}>
                Avg days to pay
              </p>
              <p className="broker-detail-stat__value tabular-nums" style={{ color: c.primary }}>
                {broker.score?.avg_days_invoice_to_pay != null
                  ? `${broker.score.avg_days_invoice_to_pay}d`
                  : broker.score?.avg_days_to_pay != null
                    ? `${broker.score.avg_days_to_pay}d`
                    : '—'}
              </p>
            </div>
            <div className="broker-detail-stat" style={{ backgroundColor: c.stat.slate }}>
              <p className="broker-detail-stat__label" style={{ color: c.secondary }}>
                Paid rate
              </p>
              <p className="broker-detail-stat__value tabular-nums" style={{ color: c.primary }}>
                {broker.score && broker.score.invoiced_in_range > 0
                  ? `${broker.score.collection_rate.toFixed(0)}%`
                  : '—'}
              </p>
            </div>
          </div>
        </section>

        {(location || broker.dot_number) && (
          <section className="broker-detail-panel__section">
            <div className="flex items-center gap-1.5 mb-2">
              <Building2 className="w-3.5 h-3.5" style={{ color: c.info }} />
              <h3
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: c.secondary }}
              >
                Details
              </h3>
            </div>
            <dl className="broker-detail-info-grid">
              {broker.dot_number ? (
                <div>
                  <dt style={{ color: c.secondary }}>DOT</dt>
                  <dd style={{ color: c.primary }}>{broker.dot_number}</dd>
                </div>
              ) : null}
              {location ? (
                <div>
                  <dt style={{ color: c.secondary }}>Location</dt>
                  <dd style={{ color: c.primary }}>{location}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        )}
      </div>
    </div>
  )
}
