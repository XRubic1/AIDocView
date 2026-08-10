import { useEffect, useState } from 'react'
import { AlertTriangle, Building2, ExternalLink, Loader2, Shield } from 'lucide-react'
import { lookupBrokerSnapshotByMc } from '../../services/brokerSnapshotService'
import type { BrokerSnapshotSummary } from '../../types/brokerSnapshot'
import { useClientTheme } from '../../theme/ThemeContext'

interface BrokerSnapshotLookupCardProps {
  /** Normalized MC like MC-123456 */
  mcQuery: string
  /** When true, auto-fetch Snapshot for this MC. */
  enabled: boolean
  /**
   * `unknown` — MC not in Credyx catalog (default).
   * `enrich` — MC is in Credyx but less known (new / no pay history).
   */
  variant?: 'unknown' | 'enrich'
}

/**
 * Authority / identity card from BrokerSnapshot when MC is outside Credyx catalog.
 */
export default function BrokerSnapshotLookupCard({
  mcQuery,
  enabled,
  variant = 'unknown',
}: BrokerSnapshotLookupCardProps) {
  const c = useClientTheme()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<BrokerSnapshotSummary | null>(null)
  const isEnrich = variant === 'enrich'
  const bannerBg = isEnrich ? c.stat.blue : c.stat.amber
  const bannerIconColor = isEnrich ? c.info : c.warning

  useEffect(() => {
    if (!enabled || !mcQuery) {
      setSummary(null)
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setSummary(null)

    lookupBrokerSnapshotByMc(mcQuery)
      .then((data) => {
        if (cancelled) return
        setSummary(data)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const message =
          err instanceof Error ? err.message : 'Could not reach authority lookup'
        setError(message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [enabled, mcQuery])

  if (!enabled) return null

  return (
    <div
      className="broker-mc-lookup mt-2 p-3 rounded-lg border"
      style={{ borderColor: c.border, backgroundColor: bannerBg }}
    >
      <div className="flex items-start gap-2">
        <Shield className="w-4 h-4 mt-0.5 shrink-0" style={{ color: bannerIconColor }} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium" style={{ color: c.primary }}>
            {isEnrich
              ? `Verifying MC ${mcQuery} (limited Credyx history)`
              : `MC ${mcQuery} not found in Credyx network`}
          </p>
          <p className="text-xs mt-1" style={{ color: c.secondary }}>
            {isEnrich
              ? 'Pulling BrokerSnapshot authority and insurance details for this less-known broker…'
              : 'Checking BrokerSnapshot for authority, insurance, and company details…'}
          </p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 mt-3 text-xs" style={{ color: c.secondary }}>
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Looking up MC authority…
        </div>
      )}

      {error && (
        <div
          className="mt-3 flex items-start gap-2 text-xs rounded-md border p-2"
          style={{ borderColor: c.border, backgroundColor: c.surface, color: c.secondary }}
        >
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: c.warning }} />
          <span>
            Authority lookup unavailable ({error}). Verify the MC on FMCSA/SAFER before booking.
          </span>
        </div>
      )}

      {!loading && !error && summary && !summary.found && (
        <p className="text-xs mt-3" style={{ color: c.secondary }}>
          No company found in BrokerSnapshot for this MC. Double-check the number before booking —
          brokers outside Credyx won&apos;t show pay history here.
        </p>
      )}

      {!loading && !error && summary?.found && (
        <div
          className="mt-3 rounded-md border p-3 space-y-2"
          style={{ borderColor: c.border, backgroundColor: c.surface }}
        >
          <div className="flex items-start gap-2">
            <Building2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: c.info }} />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: c.info }}>
                Authority lookup (BrokerSnapshot)
              </p>
              <p className="text-sm font-bold mt-0.5" style={{ color: c.primary }}>
                {summary.name ?? 'Unknown company'}
              </p>
              <p className="text-xs mt-0.5 tabular-nums" style={{ color: c.secondary }}>
                {[summary.mcNumber, summary.dotNumber != null ? `DOT ${summary.dotNumber}` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            {summary.operatingStatus && (
              <>
                <dt style={{ color: c.secondary }}>Operating status</dt>
                <dd style={{ color: c.primary }}>{summary.operatingStatus}</dd>
              </>
            )}
            {(summary.commonAuthority ||
              summary.contractAuthority ||
              summary.brokerAuthority) && (
              <>
                <dt style={{ color: c.secondary }}>Authority</dt>
                <dd style={{ color: c.primary }}>
                  {[
                    summary.commonAuthority ? `Common: ${summary.commonAuthority}` : null,
                    summary.contractAuthority ? `Contract: ${summary.contractAuthority}` : null,
                    summary.brokerAuthority ? `Broker: ${summary.brokerAuthority}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </dd>
              </>
            )}
            {summary.phyAddress && (
              <>
                <dt style={{ color: c.secondary }}>Address</dt>
                <dd style={{ color: c.primary }}>{summary.phyAddress}</dd>
              </>
            )}
            {summary.phone && (
              <>
                <dt style={{ color: c.secondary }}>Phone</dt>
                <dd className="tabular-nums" style={{ color: c.primary }}>
                  {summary.phone}
                </dd>
              </>
            )}
            {summary.officer && (
              <>
                <dt style={{ color: c.secondary }}>Officer</dt>
                <dd style={{ color: c.primary }}>{summary.officer}</dd>
              </>
            )}
            {summary.totalTrucks != null && (
              <>
                <dt style={{ color: c.secondary }}>Trucks</dt>
                <dd className="tabular-nums" style={{ color: c.primary }}>
                  {summary.totalTrucks}
                </dd>
              </>
            )}
            {summary.primaryInsurer && (
              <>
                <dt style={{ color: c.secondary }}>Insurance</dt>
                <dd style={{ color: c.primary }}>
                  {summary.primaryInsurer}
                  {summary.activeInsuranceCount
                    ? ` (${summary.activeInsuranceCount} active)`
                    : ''}
                </dd>
              </>
            )}
            {summary.addDate && (
              <>
                <dt style={{ color: c.secondary }}>On file since</dt>
                <dd className="tabular-nums" style={{ color: c.primary }}>
                  {summary.addDate}
                </dd>
              </>
            )}
          </dl>

          {summary.riskFlags.length > 0 && (
            <ul className="mt-1 space-y-1">
              {summary.riskFlags.map((flag) => (
                <li
                  key={flag}
                  className="flex items-start gap-1.5 text-xs"
                  style={{ color: c.warning }}
                >
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  {flag}
                </li>
              ))}
            </ul>
          )}

          <p className="text-[11px] pt-1" style={{ color: c.secondary }}>
            This is external authority data — not Credyx pay history. Treat unknown brokers carefully
            until you have payment experience with them.
            {summary.dotNumber != null && (
              <>
                {' '}
                <a
                  href={`https://safer.fmcsa.dot.gov/CompanySnapshot.aspx?query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${summary.dotNumber}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 underline"
                  style={{ color: c.info }}
                >
                  Open SAFER
                  <ExternalLink className="w-3 h-3" />
                </a>
              </>
            )}
          </p>
        </div>
      )}
    </div>
  )
}
