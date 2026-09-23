import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react'
import type {
  BrokerInsuranceVerdict,
  BrokerSnapshotSummary,
} from '../../types/brokerSnapshot'
import { useClientTheme } from '../../theme/ThemeContext'
import {
  displaySnapshotRiskFlags,
  hasActiveFreightAuthority,
  isDoNotWorkBroker,
  shouldShowCancellationHistory,
} from '../../utils/brokerSnapshotSafety'

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
 * Full BrokerSnapshot company export — same layout as MC Check results.
 * Pass a stored or freshly looked-up summary.
 */
export default function BrokerSnapshotSummaryView({
  summary,
}: {
  summary: BrokerSnapshotSummary
}) {
  const c = useClientTheme()

  if (!summary.found) {
    return (
      <div
        className="rounded-md px-2.5 py-2 text-xs"
        style={{ backgroundColor: c.stat.amber, color: c.primary }}
      >
        <span className="font-semibold">No company found in BrokerSnapshot.</span> Verify the MC
        or DOT before outreach.
      </div>
    )
  }

  const bad = isDoNotWorkBroker(summary)
  const riskFlags = displaySnapshotRiskFlags(summary)
  const showCancelHistory = shouldShowCancellationHistory(summary)
  const activeAuthority = hasActiveFreightAuthority(summary)
  const insuranceLine =
    (summary.insurances?.length ?? 0) > 0
      ? summary.insurances!
          .slice(0, 3)
          .map((ins) =>
            [ins.companyName, formatMoneyLimit(ins.maxLimit)].filter(Boolean).join(' ')
          )
          .join(' · ')
      : 'None on file'

  const coverageOk =
    (summary.activeInsuranceCount ?? 0) > 0 || (summary.insurances?.length ?? 0) > 0
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
    <div className="mc-lookup-modal__result space-y-2">
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

      {riskFlags.length > 0 && (
        <p
          className="text-[11px] flex flex-wrap gap-x-2 gap-y-0.5"
          style={{ color: bad ? c.error : c.warning }}
        >
          {riskFlags.map((flag) => (
            <span key={flag} className="inline-flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {flag}
            </span>
          ))}
        </p>
      )}

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
      {!summary._meta?.fromCache &&
        summary._meta?.pendingChanges != null &&
        summary._meta.pendingChanges > 0 && (
          <p className="text-[10px]" style={{ color: c.warning }}>
            {summary._meta.pendingChanges} change(s) flagged for Credyx review
          </p>
        )}

      <p className="text-[10px]" style={{ color: c.secondary }}>
        BrokerSnapshot authority data — not Credyx pay history.
      </p>
    </div>
  )
}
