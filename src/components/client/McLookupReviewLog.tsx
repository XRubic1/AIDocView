import { useEffect, useState } from 'react'
import { Clock, Loader2, Shield } from 'lucide-react'
import { listMyBrokerSnapshotLookups } from '../../services/brokerSnapshotService'
import type { BrokerSnapshotLookupLogRow } from '../../types/brokerSnapshot'
import { formatDateTime } from '../../utils/format'
import {
  brokerLookupStatusTone,
  displayBrokerLookupStatus,
  type BrokerLookupStatusTone,
} from '../../utils/brokerLookupStatus'
import { useClientTheme } from '../../theme/ThemeContext'

function formatMc(row: BrokerSnapshotLookupLogRow): string {
  if (row.mc_number?.trim()) return row.mc_number.trim()
  return row.mc_digits ? `MC-${row.mc_digits}` : 'MC'
}

function toneColors(
  tone: BrokerLookupStatusTone,
  c: ReturnType<typeof useClientTheme>
): { bg: string; fg: string } {
  if (tone === 'ok') return { bg: c.stat.green, fg: c.success }
  if (tone === 'bad') return { bg: c.stat.red, fg: c.error }
  if (tone === 'warn') return { bg: c.stat.amber, fg: c.warning }
  return { bg: c.stat.slate, fg: c.secondary }
}

interface McLookupReviewLogProps {
  clientId: string
  /** Bump after a new lookup so the list refreshes. */
  refreshKey?: number | string
  /** When set, clicking a row re-opens that MC. */
  onSelectMc?: (mc: string) => void
  /** Empty-state copy. */
  emptyHint?: string
  compact?: boolean
  maxItems?: number
}

/**
 * Carrier log of MC Lookups: which broker, when, and status at that time.
 */
export default function McLookupReviewLog({
  clientId,
  refreshKey,
  onSelectMc,
  emptyHint = 'Lookups you run are saved here with the broker’s status at that time.',
  compact = false,
  maxItems = 40,
}: McLookupReviewLogProps) {
  const c = useClientTheme()
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<BrokerSnapshotLookupLogRow[]>([])

  useEffect(() => {
    if (!clientId) {
      setRows([])
      return
    }
    let cancelled = false
    setLoading(true)
    listMyBrokerSnapshotLookups(clientId, maxItems)
      .then((list) => {
        if (!cancelled) setRows(list)
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [clientId, refreshKey, maxItems])

  if (!clientId) return null

  if (loading && rows.length === 0) {
    return (
      <p
        className="inline-flex items-center gap-2 text-xs py-3"
        style={{ color: c.secondary }}
      >
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Loading review log…
      </p>
    )
  }

  if (rows.length === 0) {
    return (
      <div
        className={`flex items-start gap-2 ${compact ? 'py-2' : 'py-4'}`}
        style={{ color: c.secondary }}
      >
        <Clock className="w-4 h-4 mt-0.5 shrink-0 opacity-70" />
        <p className="text-xs leading-relaxed">{emptyHint}</p>
      </div>
    )
  }

  return (
    <ul className="mc-lookup-review-log m-0 p-0 list-none divide-y" style={{ borderColor: c.border }}>
      {rows.map((row) => {
        const tone = brokerLookupStatusTone(row)
        const colors = toneColors(tone, c)
        const status = displayBrokerLookupStatus(row)
        const name = row.legal_name?.trim() || (row.found === false ? 'No company found' : 'Unknown broker')
        const rowClass =
          'mc-lookup-review-log__row w-full text-left flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 px-1 py-2.5 transition-colors duration-150'
        const body = (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate leading-tight" style={{ color: c.primary }}>
                {name}
              </p>
              <p className="text-[11px] tabular-nums mt-0.5" style={{ color: c.secondary }}>
                {formatMc(row)}
                {' · '}
                {formatDateTime(row.created_at)}
              </p>
            </div>
            <span
              className="inline-flex items-center gap-1 self-start sm:self-center shrink-0 text-[11px] font-semibold rounded px-2 py-1 max-w-full"
              style={{ backgroundColor: colors.bg, color: colors.fg }}
            >
              <Shield className="w-3 h-3 shrink-0" />
              <span className="truncate">{status}</span>
            </span>
          </>
        )

        return (
          <li key={row.id}>
            {onSelectMc ? (
              <button
                type="button"
                onClick={() => onSelectMc(formatMc(row))}
                className={`${rowClass} rounded-md`}
              >
                {body}
              </button>
            ) : (
              <div className={rowClass}>{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
