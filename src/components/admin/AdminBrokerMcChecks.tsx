/**
 * Carrier MC Lookup history + latest cached BrokerSnapshot for this broker.
 */
import { useEffect, useState } from 'react'
import { Loader2, Shield } from 'lucide-react'
import { useClientTheme } from '../../theme/ThemeContext'
import {
  fetchCachedBrokerSnapshot,
  listBrokerSnapshotLookups,
  type BrokerSnapshotCacheRow,
  type BrokerSnapshotLookupEvent,
} from '../../services/brokerSnapshotAdminService'
import { displaySnapshotRiskFlags } from '../../utils/brokerSnapshotSafety'
import { formatDate } from '../../utils/format'

export default function AdminBrokerMcChecks({
  mcNumber,
  refreshKey,
}: {
  mcNumber: string | null
  refreshKey?: number | string
}) {
  const c = useClientTheme()
  const [loading, setLoading] = useState(false)
  const [snapshot, setSnapshot] = useState<BrokerSnapshotCacheRow | null>(null)
  const [events, setEvents] = useState<BrokerSnapshotLookupEvent[]>([])

  useEffect(() => {
    if (!mcNumber) {
      setSnapshot(null)
      setEvents([])
      return
    }
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetchCachedBrokerSnapshot(mcNumber),
      listBrokerSnapshotLookups(mcNumber),
    ])
      .then(([snap, lookups]) => {
        if (cancelled) return
        setSnapshot(snap)
        setEvents(lookups)
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [mcNumber, refreshKey])

  if (!mcNumber) {
    return (
      <p className="admin-broker-risk__muted" style={{ color: c.mutedLight }}>
        No MC on file — carriers cannot look this broker up until Credyx adds an MC.
      </p>
    )
  }

  if (loading) {
    return (
      <p className="admin-broker-risk__muted inline-flex items-center gap-2" style={{ color: c.secondary }}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Loading MC checks…
      </p>
    )
  }

  const summary = snapshot?.payload
  const flags = summary ? displaySnapshotRiskFlags(summary) : []

  return (
    <div className="admin-broker-risk__tab-pane">
      <div className="admin-broker-risk__timing">
        <p className="admin-broker-risk__timing-title">
          <Shield className="w-3.5 h-3.5 inline-block mr-1 align-text-bottom" />
          Latest Snapshot on file
        </p>
        {snapshot && summary?.found ? (
          <>
            <p className="admin-broker-risk__timing-summary">
              {snapshot.legal_name ?? summary.name ?? 'Unknown'}
              {summary.brokerAuthority ? ` · Broker ${summary.brokerAuthority}` : ''}
              {summary.insuranceNote ? ` · ${summary.insuranceNote}` : ''}
            </p>
            <p className="admin-broker-risk__timing-hint">
              Fetched {formatDate(snapshot.fetched_at)} · {snapshot.lookup_count} lookup
              {snapshot.lookup_count === 1 ? '' : 's'} · last{' '}
              {formatDate(snapshot.last_lookup_at)}
            </p>
            {flags.length > 0 ? (
              <ul className="admin-broker-risk__mc-flags">
                {flags.map((flag) => (
                  <li key={flag}>{flag}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <p className="admin-broker-risk__timing-summary">
            No cached Snapshot yet. A carrier MC Lookup (or Snapshot on Review) will store it.
          </p>
        )}
      </div>

      <div className="admin-broker-risk__timing">
        <p className="admin-broker-risk__timing-title">Carrier MC checks</p>
        {events.length === 0 ? (
          <p className="admin-broker-risk__timing-summary">
            No carrier has looked up {mcNumber} yet. New checks appear after the lookup
            function is redeployed.
          </p>
        ) : (
          <ul className="admin-broker-risk__mc-events">
            {events.map((ev) => (
              <li key={ev.id}>
                <strong>{ev.clientName}</strong>
                <span>
                  {formatDate(ev.created_at)}
                  {ev.from_cache ? ' · cache' : ' · live Snapshot'}
                  {ev.status_label
                    ? ` · ${ev.status_label}`
                    : ev.insurance_verdict
                      ? ` · insurance ${ev.insurance_verdict}`
                      : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
