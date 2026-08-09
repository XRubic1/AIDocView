import { useMemo, useState } from 'react'
import { History, X } from 'lucide-react'
import type { BrokerRiskProfile } from '../../types/brokerRisk'
import {
  brokerRiskAuditActionLabel,
  listBrokerRiskAuditLogs,
  synthesizeBrokerRiskAuditFromProfile,
} from '../../utils/brokerRiskAudit'
import { getClientById } from '../../services/clientRegistry'

interface BrokerRiskAuditTimelineProps {
  brokerId: string
  brokerName: string
  /** When set, only show events for this carrier. */
  clientId?: string | null
  /** Used to seed timeline before audit rows exist. */
  profile?: BrokerRiskProfile | null
  /** Remount / refresh key. */
  refreshKey?: number | string
  className?: string
  compact?: boolean
  /**
   * Render as a button (next to Add note). Click opens the timeline.
   * Default: always-visible section.
   */
  asButton?: boolean
}

/** Admin timeline: marked risky, risk removed, notes, flagged for review. */
export default function BrokerRiskAuditTimeline({
  brokerId,
  brokerName,
  clientId,
  profile,
  refreshKey = 0,
  className = '',
  compact = false,
  asButton = false,
}: BrokerRiskAuditTimelineProps) {
  const [open, setOpen] = useState(false)

  const events = useMemo(() => {
    void refreshKey
    const logs = listBrokerRiskAuditLogs({ brokerId, clientId, limit: 40 })
    if (logs.length > 0) return logs
    const clientName = profile ? getClientById(profile.client_id)?.name : null
    return synthesizeBrokerRiskAuditFromProfile(profile, brokerName, clientName)
  }, [brokerId, brokerName, clientId, profile, refreshKey])

  const list = (
    <>
      {events.length === 0 ? (
        <p className="broker-risk-audit__empty">No risk decisions logged yet.</p>
      ) : (
        <ul className={`broker-risk-audit__list${compact || asButton ? ' is-compact' : ''}`}>
          {events.map((ev) => {
            const note =
              (typeof ev.metadata?.review_note === 'string' && ev.metadata.review_note) ||
              ev.changes?.find((c) => c.field === 'review_note')?.new_value
            const clientLabel =
              typeof ev.metadata?.client_name === 'string' && ev.metadata.client_name
                ? ev.metadata.client_name
                : null
            const toLevel =
              typeof ev.metadata?.to_level === 'string' ? ev.metadata.to_level : null

            return (
              <li
                key={ev.id}
                className={`broker-risk-audit__item broker-risk-audit__item--${ev.action}`}
              >
                <div className="broker-risk-audit__row">
                  <span className="broker-risk-audit__badge">
                    {brokerRiskAuditActionLabel(ev.action)}
                    {toLevel && ev.action !== 'broker_risk_cleared'
                      ? ` · ${String(toLevel)}`
                      : ''}
                  </span>
                  <time className="broker-risk-audit__time" dateTime={ev.timestamp}>
                    {new Date(ev.timestamp).toLocaleString()}
                  </time>
                </div>
                <p className="broker-risk-audit__desc">{ev.description}</p>
                <p className="broker-risk-audit__meta">
                  {ev.user_name}
                  {clientLabel && !clientId ? ` · ${clientLabel}` : ''}
                </p>
                {note ? <p className="broker-risk-audit__note">“{String(note)}”</p> : null}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )

  if (asButton) {
    return (
      <div className={`broker-risk-audit broker-risk-audit--button ${className}`.trim()}>
        <button
          type="button"
          className={`broker-risk-audit__toggle${open ? ' is-open' : ''}`}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <History className="w-3 h-3" aria-hidden />
          Risk audit
          {events.length > 0 ? (
            <span className="broker-risk-audit__count">{events.length}</span>
          ) : null}
        </button>
        {open ? (
          <div className="broker-risk-audit__panel">
            <div className="broker-risk-audit__panel-head">
              <span>Risk audit</span>
              <button
                type="button"
                className="broker-risk-audit__close"
                onClick={() => setOpen(false)}
                aria-label="Close risk audit"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {list}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <section className={`broker-risk-audit ${className}`.trim()}>
      <div className="broker-risk-audit__head">
        <History className="broker-risk-audit__icon" aria-hidden />
        <h3 className="broker-risk-audit__title">Risk audit</h3>
      </div>
      {list}
    </section>
  )
}
