/**
 * BrokerSnapshot safety: active broker authority + current insurance
 * beat historical cancellations and FMCSA carrier "Not Authorized".
 */
import type { BrokerSnapshotSummary } from '../types/brokerSnapshot'

function isActiveAuthority(value?: string | null): boolean {
  return (value ?? '').trim().toLowerCase() === 'active'
}

/** True when common, contract, or broker authority is Active. */
export function hasActiveFreightAuthority(summary: Pick<
  BrokerSnapshotSummary,
  'commonAuthority' | 'contractAuthority' | 'brokerAuthority'
>): boolean {
  return (
    isActiveAuthority(summary.commonAuthority) ||
    isActiveAuthority(summary.contractAuthority) ||
    isActiveAuthority(summary.brokerAuthority)
  )
}

export function isUnauthorizedOperatingStatus(status?: string | null): boolean {
  if (!status) return false
  const s = status.toLowerCase()
  return (
    s.includes('not authorized') ||
    s.includes('unauthorized') ||
    s.includes('out of service') ||
    s.includes('inactive') ||
    s.includes('revoked') ||
    s.includes('suspended')
  )
}

/**
 * Do-not-book only when there is no usable active authority.
 * FMCSA operating status "Not Authorized" is common for brokers who
 * still have Active broker authority — that is not a booking block.
 */
export function isDoNotWorkBroker(summary: BrokerSnapshotSummary): boolean {
  if (hasActiveFreightAuthority(summary)) return false
  return (
    isUnauthorizedOperatingStatus(summary.operatingStatus) ||
    (!isActiveAuthority(summary.commonAuthority) &&
      !isActiveAuthority(summary.contractAuthority) &&
      !isActiveAuthority(summary.brokerAuthority))
  )
}

function hasCurrentInsurance(summary: BrokerSnapshotSummary): boolean {
  if ((summary.activeInsuranceCount ?? 0) > 0) return true
  if ((summary.insurances?.length ?? 0) > 0) return true
  return summary.insuranceVerdict === 'ok'
}

/**
 * Drop scare flags that contradict active authority / current coverage.
 * Cached Snapshot payloads may still include the old flags until the proxy is redeployed.
 */
export function displaySnapshotRiskFlags(summary: BrokerSnapshotSummary): string[] {
  const flags = summary.riskFlags ?? []
  const activeAuth = hasActiveFreightAuthority(summary)
  const insured = hasCurrentInsurance(summary)

  return flags.filter((flag) => {
    const t = flag.toLowerCase()
    if (activeAuth && (t.includes('not authorized') || t.includes('do not work'))) {
      return false
    }
    if (insured && t.includes('cancellation')) {
      return false
    }
    return true
  })
}

/** Show historical cancellation rows only when there is no current coverage. */
export function shouldShowCancellationHistory(summary: BrokerSnapshotSummary): boolean {
  if (!summary.hasInsuranceCancellation) return false
  return !hasCurrentInsurance(summary)
}
