import type { BrokerInsuranceVerdict, BrokerSnapshotSummary } from '../types/brokerSnapshot'
import { hasActiveFreightAuthority, isDoNotWorkBroker } from './brokerSnapshotSafety'

/** Frozen MC Lookup fields used to show status-at-review-time. */
export type BrokerLookupStatusSnapshot = {
  found: boolean | null
  legal_name?: string | null
  operating_status: string | null
  broker_authority: string | null
  insurance_verdict: string | null
  status_label: string | null
}

export type BrokerLookupStatusTone = 'ok' | 'warn' | 'bad' | 'neutral'

function insurancePart(verdict: string | null | undefined): string | null {
  switch ((verdict ?? '').trim().toLowerCase()) {
    case 'ok':
      return 'Insurance OK'
    case 'cancelled':
      return 'Insurance cancelled'
    case 'missing':
      return 'Insurance missing'
    case 'warning':
      return 'Insurance warning'
    default:
      return null
  }
}

/**
 * Compact status line stored on each MC Lookup (status at review time).
 * @param summary BrokerSnapshot payload, or null when no company was found
 * @param found Whether Snapshot returned a company
 */
export function formatMcLookupStatusLabel(
  summary: Pick<
    BrokerSnapshotSummary,
    | 'found'
    | 'operatingStatus'
    | 'brokerAuthority'
    | 'commonAuthority'
    | 'contractAuthority'
    | 'insuranceVerdict'
  > | null,
  found = summary?.found ?? false
): string {
  if (!found || !summary) return 'No company found'

  const insurance = insurancePart(summary.insuranceVerdict ?? null)
  const asSummary: BrokerSnapshotSummary = {
    found: true,
    riskFlags: [],
    operatingStatus: summary.operatingStatus,
    brokerAuthority: summary.brokerAuthority,
    commonAuthority: summary.commonAuthority,
    contractAuthority: summary.contractAuthority,
    insuranceVerdict: summary.insuranceVerdict,
  }

  if (isDoNotWorkBroker(asSummary)) {
    const authBit = summary.operatingStatus?.trim() || 'No active authority'
    const core = `${authBit} — do not use`
    return insurance ? `${core} · ${insurance}` : core
  }

  const authBit = hasActiveFreightAuthority(asSummary)
    ? `Broker ${summary.brokerAuthority?.trim() || 'Active'}`
    : summary.operatingStatus?.trim() || 'Looked up'
  return insurance ? `${authBit} · ${insurance}` : authBit
}

/** Prefer the frozen label; rebuild from stored fields for older rows. */
export function displayBrokerLookupStatus(row: BrokerLookupStatusSnapshot): string {
  if (row.status_label?.trim()) return row.status_label.trim()
  const found = row.found ?? Boolean(row.legal_name)
  return formatMcLookupStatusLabel(
    {
      found,
      operatingStatus: row.operating_status,
      brokerAuthority: row.broker_authority,
      insuranceVerdict: (row.insurance_verdict ?? undefined) as BrokerInsuranceVerdict | undefined,
    },
    found
  )
}

/** Color the review-log chip from frozen fields (not live Snapshot). */
export function brokerLookupStatusTone(row: BrokerLookupStatusSnapshot): BrokerLookupStatusTone {
  const label = displayBrokerLookupStatus(row).toLowerCase()
  if (row.found === false || label.includes('no company found')) return 'warn'
  if (
    label.includes('do not use') ||
    row.insurance_verdict === 'cancelled' ||
    row.insurance_verdict === 'missing'
  ) {
    return 'bad'
  }
  if (row.insurance_verdict === 'ok') return 'ok'
  if (row.insurance_verdict === 'warning') return 'warn'
  return 'neutral'
}
