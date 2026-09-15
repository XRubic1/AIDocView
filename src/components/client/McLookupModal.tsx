import { useEffect, useId, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Search,
  Shield,
  X,
} from 'lucide-react'
import { lookupBrokerSnapshotByMc } from '../../services/brokerSnapshotService'
import type {
  BrokerInsuranceVerdict,
  BrokerSnapshotSummary,
} from '../../types/brokerSnapshot'
import { normalizeMcQuery } from '../../utils/clientBrokers'
import { useClientTheme } from '../../theme/ThemeContext'
import { useClientSession } from '../../hooks/useClientSession'
import McLookupReviewLog from './McLookupReviewLog'
import {
  displaySnapshotRiskFlags,
  hasActiveFreightAuthority,
  isDoNotWorkBroker,
  shouldShowCancellationHistory,
} from '../../utils/brokerSnapshotSafety'

interface McLookupModalProps {
  open: boolean
  /** Prefill MC when opening (e.g. from search bar). */
  initialMc?: string
  /** Run the lookup immediately when the modal opens with initialMc. */
  autoLookup?: boolean
  onClose: () => void
}

function Cell({
  label,
  value,
  span = false,
}: {
  label: string
  value: string | number | null | undefined
  span?: boolean
}) {
  const c = useClientTheme()
  if (value == null || value === '') return null
  return (
    <div className={span ? 'mc-lookup-modal__cell mc-lookup-modal__cell--span' : 'mc-lookup-modal__cell'}>
      <span className="mc-lookup-modal__label" style={{ color: c.secondary }}>
        {label}
      </span>
      <span className="mc-lookup-modal__value tabular-nums" style={{ color: c.primary }}>
        {value}
      </span>
    </div>
  )
}

function formatMoneyLimit(limit: number | null | undefined): string | null {
  if (limit == null || limit <= 0) return null
  return `$${limit.toLocaleString()}`
}

function insuranceBannerStyle(
  verdict: BrokerInsuranceVerdict | undefined,
  c: ReturnType<typeof useClientTheme>
): { bg: string; fg: string } {
  if (verdict === 'ok') return { bg: c.stat.green, fg: c.success }
  if (verdict === 'cancelled' || verdict === 'missing') return { bg: c.stat.red, fg: c.error }
  return { bg: c.stat.amber, fg: c.warning }
}

/**
 * Compact MC Lookup popup — all Snapshot details visible without scrolling.
 */
export default function McLookupModal({
  open,
  initialMc = '',
  autoLookup = false,
  onClose,
}: McLookupModalProps) {
  const c = useClientTheme()
  const { clientId } = useClientSession()
  const titleId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [mcInput, setMcInput] = useState(initialMc)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<BrokerSnapshotSummary | null>(null)
  const [searchedMc, setSearchedMc] = useState<string | null>(null)
  const [showLog, setShowLog] = useState(false)
  const [logRefresh, setLogRefresh] = useState(0)

  useEffect(() => {
    if (!open) return
    setMcInput(initialMc)
    setError(null)
    setSummary(null)
    setSearchedMc(null)
    setLoading(false)
    setShowLog(false)
    const t = window.setTimeout(() => inputRef.current?.focus(), 50)
    return () => window.clearTimeout(t)
  }, [open, initialMc])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const runLookup = async (raw?: string) => {
    const normalized = normalizeMcQuery(raw ?? mcInput)
    if (!normalized || normalized.replace(/\D/g, '').length < 4) {
      setError('Enter a valid MC number (at least 4 digits).')
      setSummary(null)
      return
    }

    setLoading(true)
    setError(null)
    setSummary(null)
    setSearchedMc(normalized)
    setMcInput(normalized)

    try {
      const data = await lookupBrokerSnapshotByMc(normalized)
      setSummary(data)
      setLogRefresh((n) => n + 1)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lookup failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open || !autoLookup) return
    const normalized = normalizeMcQuery(initialMc)
    if (!normalized || normalized.replace(/\D/g, '').length < 4) return
    void runLookup(normalized)
  }, [open, autoLookup, initialMc])

  if (!open) return null

  const bad = summary?.found ? isDoNotWorkBroker(summary) : false
  const riskFlags = summary?.found ? displaySnapshotRiskFlags(summary) : []
  const showCancelHistory = summary?.found ? shouldShowCancellationHistory(summary) : false
  const activeAuthority = summary?.found ? hasActiveFreightAuthority(summary) : false
  const insuranceLine =
    summary?.found && (summary.insurances?.length ?? 0) > 0
      ? summary.insurances!
          .slice(0, 3)
          .map((ins) =>
            [ins.companyName, formatMoneyLimit(ins.maxLimit)].filter(Boolean).join(' ')
          )
          .join(' · ')
      : summary?.found
        ? 'None on file'
        : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 client-modal-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="mc-lookup-modal client-modal flex flex-col w-full max-w-4xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Compact top bar: title + search + actions */}
        <header
          className="mc-lookup-modal__top shrink-0 px-3 py-2.5 border-b flex flex-wrap items-center gap-2"
          style={{ borderColor: c.border }}
        >
          <div className="flex items-center gap-2 shrink-0 min-w-0">
            <Shield className="w-4 h-4 shrink-0" style={{ color: c.info }} />
            <h2 id={titleId} className="text-sm font-bold whitespace-nowrap" style={{ color: c.primary }}>
              MC Lookup
            </h2>
          </div>

          <div className="relative flex-1 min-w-[180px]">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
              style={{ color: c.secondary }}
            />
            <input
              ref={inputRef}
              type="text"
              value={mcInput}
              onChange={(e) => setMcInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void runLookup()
                }
              }}
              placeholder="MC number…"
              className="client-input w-full pl-8"
              style={{ height: 34, fontSize: 13 }}
              aria-label="MC number"
            />
          </div>

          <button
            type="button"
            onClick={() => void runLookup()}
            disabled={loading}
            className="dashboard-btn-primary text-xs py-1.5 px-3 shrink-0 inline-flex items-center gap-1.5"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {loading ? 'Looking up…' : 'Look up'}
          </button>
          {clientId ? (
            <button
              type="button"
              onClick={() => setShowLog((open) => !open)}
              className="dashboard-btn-secondary text-xs py-1.5 px-3 shrink-0 inline-flex items-center gap-1.5"
              aria-pressed={showLog}
            >
              <Clock className="w-3.5 h-3.5" />
              {showLog ? 'Lookup' : 'Log'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:opacity-80 shrink-0"
            aria-label="Close"
            style={{ color: c.secondary }}
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="mc-lookup-modal__body px-3 py-3 overflow-y-auto">
          {showLog && clientId && (
            <div className="mc-review-log-panel">
              <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: c.secondary }}>
                Review log
              </p>
              <p className="text-[11px] mb-2 leading-relaxed" style={{ color: c.secondary }}>
                Brokers you looked up, when you checked them, and their status at that time.
              </p>
              <McLookupReviewLog
                clientId={clientId}
                refreshKey={logRefresh}
                onSelectMc={(mc) => {
                  setShowLog(false)
                  void runLookup(mc)
                }}
              />
            </div>
          )}

          {!showLog && !loading && !error && !summary && (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 py-4 text-xs" style={{ color: c.secondary }}>
                <Shield className="w-4 h-4 opacity-50" style={{ color: c.info }} />
                Enter an MC to verify authority, insurance, and company details.
              </div>
              {clientId ? (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: c.secondary }}>
                    Recent reviews
                  </p>
                  <McLookupReviewLog
                    clientId={clientId}
                    refreshKey={logRefresh}
                    compact
                    maxItems={8}
                    onSelectMc={(mc) => void runLookup(mc)}
                    emptyHint="Your MC checks will appear here with the broker’s status at the time."
                  />
                </div>
              ) : null}
            </div>
          )}

          {!showLog && loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-xs" style={{ color: c.secondary }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              Fetching BrokerSnapshot…
            </div>
          )}

          {!showLog && error && (
            <div
              className="flex items-center gap-2 rounded-md px-2.5 py-2 text-xs"
              style={{ backgroundColor: c.stat.amber, color: c.primary }}
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: c.warning }} />
              {error}
            </div>
          )}

          {!showLog && !loading && summary && !summary.found && (
            <div
              className="rounded-md px-2.5 py-2 text-xs"
              style={{ backgroundColor: c.stat.amber, color: c.primary }}
            >
              <span className="font-semibold">No company found for {searchedMc ?? 'this MC'}.</span>{' '}
              Verify the number before booking.
            </div>
          )}

          {!showLog && !loading && summary?.found && (
            <div className="mc-lookup-modal__result space-y-2">
              {/* Quick insurance note — first thing the user sees */}
              {(() => {
                const coverageOk =
                  (summary.activeInsuranceCount ?? 0) > 0 ||
                  (summary.insurances?.length ?? 0) > 0
                const verdict: BrokerInsuranceVerdict = coverageOk
                  ? 'ok'
                  : summary.insuranceVerdict ?? 'missing'
                const note = coverageOk
                  ? summary.insuranceVerdict === 'ok' && summary.insuranceNote
                    ? summary.insuranceNote
                    : 'Broker insurance is fine — active coverage on file.'
                  : summary.insuranceNote ?? 'Check insurance before booking.'
                const tone = insuranceBannerStyle(verdict, c)
                return (
                  <div
                    className="flex items-start gap-2 rounded-md px-2.5 py-2 text-xs"
                    style={{ backgroundColor: tone.bg, color: tone.fg }}
                    role="status"
                  >
                    {verdict === 'ok' ? (
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-bold leading-snug">{note}</p>
                      {showCancelHistory && summary.latestCancellationDate && (
                        <p className="mt-0.5 leading-snug" style={{ color: c.primary }}>
                          Cancellation on file
                          {summary.cancellations?.[0]?.companyName
                            ? ` · ${summary.cancellations[0].companyName}`
                            : ''}
                          {summary.cancellations?.[0]?.policyNumber
                            ? ` · Policy ${summary.cancellations[0].policyNumber}`
                            : ''}
                          .
                        </p>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* Identity + status strip */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold truncate leading-tight" style={{ color: c.primary }}>
                    {summary.name ?? 'Unknown company'}
                  </p>
                  <p className="text-xs tabular-nums mt-0.5" style={{ color: c.secondary }}>
                    {[
                      summary.mcNumber,
                      summary.dotNumber != null ? `DOT ${summary.dotNumber}` : null,
                      summary.addDate ? `Since ${summary.addDate}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>

                {summary.operatingStatus && (
                  <span
                    className="inline-flex items-center gap-1 text-xs font-bold rounded px-2 py-1 shrink-0"
                    style={
                      bad
                        ? { backgroundColor: c.stat.red, color: c.error }
                        : { backgroundColor: c.stat.green, color: c.success }
                    }
                  >
                    {bad && <AlertTriangle className="w-3.5 h-3.5" />}
                    {bad
                      ? `${summary.operatingStatus} — do not use`
                      : activeAuthority
                        ? `Broker ${summary.brokerAuthority ?? 'Active'}`
                        : summary.operatingStatus}
                  </span>
                )}

                {summary.dotNumber != null && (
                  <a
                    href={`https://safer.fmcsa.dot.gov/CompanySnapshot.aspx?query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${summary.dotNumber}`}
                    target="_blank"
                    rel="noreferrer"
                    className="dashboard-btn-secondary text-xs py-1 px-2.5 inline-flex items-center gap-1 shrink-0"
                  >
                    SAFER
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              {bad && (
                <div
                  className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs"
                  style={{ backgroundColor: c.stat.red, color: c.error }}
                  role="alert"
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span className="font-bold">Broker is not good to work with.</span>
                  <span style={{ color: c.primary }}>
                    No active broker authority. Do not book until SAFER confirms active status.
                  </span>
                </div>
              )}

              {riskFlags.length > 0 && !bad && (
                <p className="text-[11px] flex flex-wrap gap-x-2 gap-y-0.5" style={{ color: c.warning }}>
                  {riskFlags.map((flag) => (
                    <span key={flag} className="inline-flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {flag}
                    </span>
                  ))}
                </p>
              )}

              {bad && riskFlags.length > 0 && (
                <p className="text-[11px] flex flex-wrap gap-x-2 gap-y-0.5" style={{ color: c.error }}>
                  {riskFlags.map((flag) => (
                    <span key={flag} className="inline-flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {flag}
                    </span>
                  ))}
                </p>
              )}

              {/* Dense fact grid — everything visible at once */}
              <div
                className="mc-lookup-modal__facts rounded-md border"
                style={{ borderColor: c.border, backgroundColor: c.surface }}
              >
                <div className="mc-lookup-modal__facts-col">
                  <p className="mc-lookup-modal__col-title" style={{ color: c.secondary }}>
                    Authority
                  </p>
                  <Cell label="Common" value={summary.commonAuthority} />
                  <Cell label="Contract" value={summary.contractAuthority} />
                  <Cell label="Broker" value={summary.brokerAuthority} />
                  <Cell
                    label="Property"
                    value={
                      summary.propertyAuthorized == null
                        ? null
                        : summary.propertyAuthorized
                          ? 'Yes'
                          : 'No'
                    }
                  />
                  <Cell label="Entity" value={summary.entityType} />
                  <Cell label="Operation" value={summary.carrierOperation} />
                  <Cell label="Status" value={summary.statusCode} />
                </div>

                <div className="mc-lookup-modal__facts-col">
                  <p className="mc-lookup-modal__col-title" style={{ color: c.secondary }}>
                    Contact
                  </p>
                  <Cell label="Phone" value={summary.phone} />
                  <Cell label="Fax" value={summary.fax} />
                  <Cell label="Email" value={summary.email} />
                  <Cell label="Officer" value={summary.officer} />
                  <Cell label="Officer 2" value={summary.officer2} />
                  <Cell label="Physical" value={summary.phyAddress} span />
                  <Cell
                    label="Mailing"
                    value={
                      summary.mailAddress && summary.mailAddress !== summary.phyAddress
                        ? summary.mailAddress
                        : null
                    }
                    span
                  />
                </div>

                <div className="mc-lookup-modal__facts-col">
                  <p className="mc-lookup-modal__col-title" style={{ color: c.secondary }}>
                    Fleet & insurance
                  </p>
                  <Cell label="Trucks" value={summary.totalTrucks} />
                  <Cell label="Power units" value={summary.totalPowerUnits} />
                  <Cell label="Drivers" value={summary.totalDrivers} />
                  <Cell label="Tractors" value={summary.ownTractors} />
                  <Cell label="Trailers" value={summary.ownTrailers} />
                  <Cell
                    label="Mileage"
                    value={
                      summary.mileage != null
                        ? `${summary.mileage.toLocaleString()}${
                            summary.mileageYear ? ` (${summary.mileageYear})` : ''
                          }`
                        : null
                    }
                  />
                  <Cell
                    label="Safety"
                    value={
                      summary.safetyRating
                        ? `${summary.safetyRating}${
                            summary.safetyRatingDate ? ` · ${summary.safetyRatingDate}` : ''
                          }`
                        : null
                    }
                  />
                  <Cell
                    label="Cargo"
                    value={
                      [
                        summary.cargoGeneralFreight ? 'General freight' : null,
                        summary.cargoHazmat ? 'Hazmat' : null,
                      ]
                        .filter(Boolean)
                        .join(', ') || null
                    }
                  />
                  <Cell label="Changed" value={summary.changeDate} />
                  <Cell label="Insurance" value={insuranceLine} span />
                  {showCancelHistory && (
                    <Cell
                      label="Cancelled"
                      value={
                        summary.cancellations?.[0]
                          ? [
                              summary.latestCancellationDate,
                              summary.cancellations[0].companyName,
                              summary.cancellations.length > 1
                                ? `+${summary.cancellations.length - 1} more`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')
                          : summary.latestCancellationDate
                      }
                      span
                    />
                  )}
                  {(summary.insurances?.length ?? 0) > 0 &&
                    summary.insurances!.slice(0, 2).map((ins, idx) => (
                      <Cell
                        key={`${ins.companyName}-${idx}`}
                        label={idx === 0 ? 'Policy' : 'Policy 2'}
                        value={[
                          ins.policyNumber,
                          ins.effectiveDate ? `eff ${ins.effectiveDate}` : null,
                          formatMoneyLimit(ins.maxLimit),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                        span
                      />
                    ))}
                </div>
              </div>

              {summary._meta?.fromCache && summary._meta.nextReviewAt && (
                <p className="text-[10px]" style={{ color: c.secondary }}>
                  Shared Credyx cache · next Snapshot refresh{' '}
                  {new Date(summary._meta.nextReviewAt).toLocaleDateString()}
                  {summary._meta.needsBrokerAdd ? ' · queued for Credyx to add' : ''}
                </p>
              )}
              {!summary._meta?.fromCache && summary._meta?.pendingChanges != null && summary._meta.pendingChanges > 0 && (
                <p className="text-[10px]" style={{ color: c.warning }}>
                  {summary._meta.pendingChanges} change(s) flagged for Credyx review
                </p>
              )}

              <p className="text-[10px]" style={{ color: c.secondary }}>
                BrokerSnapshot authority data — not Credyx pay history.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
