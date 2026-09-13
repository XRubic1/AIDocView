import { Bug } from 'lucide-react'
import type { BatchIntakeDraft } from '../../types/credyxBatch'
import { buildAssignmentDebug } from '../../products/docSort/utils/assignmentDebug'
import { useEffect, useMemo, useState } from 'react'

interface BatchAiAssignmentDebugProps {
  draft: BatchIntakeDraft
}

/** Shows why each file landed in a packet (load #, broker, dates). */
export default function BatchAiAssignmentDebug({ draft }: BatchAiAssignmentDebugProps) {
  const rows = useMemo(() => buildAssignmentDebug(draft), [draft])
  const [activeId, setActiveId] = useState(rows[0]?.docId ?? '')

  // Keep selection valid when packets are reassigned / draft reloads.
  useEffect(() => {
    if (rows.length === 0) {
      setActiveId('')
      return
    }
    if (!rows.some((row) => row.docId === activeId)) {
      setActiveId(rows[0].docId)
    }
  }, [rows, activeId])

  const active = rows.find((row) => row.docId === activeId) ?? rows[0]

  if (rows.length === 0) {
    return <p className="client-ai-debug__empty">No documents to explain yet.</p>
  }

  return (
    <div className="client-ai-debug">
      <div className="client-ai-debug__intro">
        <Bug className="w-4 h-4" aria-hidden />
        <p>
          Assignment uses broker load numbers (not truck/unit codes like 0040), and will not merge
          docs with different brokers or different pickup/delivery dates.
        </p>
      </div>
      <div className="client-ai-debug__layout">
        <ul className="client-ai-debug__list">
          {rows.map((row) => (
            <li key={row.docId}>
              <button
                type="button"
                className={`client-ai-debug__item${row.docId === active?.docId ? ' is-active' : ''}`}
                onClick={() => setActiveId(row.docId)}
              >
                <span className="client-ai-debug__item-name">{row.fileName}</span>
                <span className="client-ai-debug__item-meta">{row.packetLabel}</span>
              </button>
            </li>
          ))}
        </ul>
        {active && (
          <article className="client-ai-debug__detail">
            <h3>{active.fileName}</h3>
            <dl className="client-ai-debug__fields">
              <div>
                <dt>Type</dt>
                <dd>{active.kind.replace(/_/g, ' ')}</dd>
              </div>
              <div>
                <dt>Load keys</dt>
                <dd>{active.loadKeys.length ? active.loadKeys.join(', ') : '—'}</dd>
              </div>
              <div>
                <dt>Broker</dt>
                <dd>{active.broker || '—'}</dd>
              </div>
              <div>
                <dt>Pickup</dt>
                <dd>
                  {active.pickup || '—'}
                  {active.pickupDate ? ` · ${active.pickupDate}` : ''}
                </dd>
              </div>
              <div>
                <dt>Delivery</dt>
                <dd>
                  {active.delivery || '—'}
                  {active.deliveryDate ? ` · ${active.deliveryDate}` : ''}
                </dd>
              </div>
              <div>
                <dt>Rate</dt>
                <dd>{active.rateAmount != null ? `$${active.rateAmount}` : '—'}</dd>
              </div>
              <div>
                <dt>Packet</dt>
                <dd>{active.packetLabel}</dd>
              </div>
            </dl>
            <h4>Why it’s in this packet</h4>
            {active.joinReasons.length === 0 ? (
              <p className="client-ai-debug__note">No link reasons recorded.</p>
            ) : (
              <ul className="client-ai-debug__reasons">
                {active.joinReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
            <h4>Why it did not join other packets</h4>
            {active.rejected.length === 0 ? (
              <p className="client-ai-debug__note">No other packets to compare.</p>
            ) : (
              <ul className="client-ai-debug__rejected">
                {active.rejected.map((row) => (
                  <li key={row.packetLabel}>
                    <strong>{row.packetLabel}</strong>
                    <span>{row.blockers.join(' · ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        )}
      </div>
    </div>
  )
}
