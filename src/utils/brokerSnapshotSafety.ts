/**
 * BrokerSnapshot safety: active broker authority + current insurance
 * beat historical cancellations and FMCSA carrier "Not Authorized".
 */
import type { BrokerSnapshotSummary } from '../types/brokerSnapshot'

function isActiveAuthority(value?: string | null): boolean {
  const text = (value ?? '').trim().toLowerCase()
  return text === 'active' || text === 'authorized' || text === 'a'
}

/** Active broker/common/contract wording inside an operating-status sentence. */
export function authorityFromOperatingStatus(status?: string | null): {
  broker?: string
  common?: string
  contract?: string
} {
  if (!status) return {}
  const text = status.toLowerCase()
  if (
    text.includes('not authorized') ||
    text.includes('unauthorized') ||
    text.includes('out of service') ||
    text.includes('revoked') ||
    text.includes('inactive')
  ) {
    return {}
  }
  if (!text.includes('authorized') && !/\bactive\b/.test(text)) return {}
  const found: { broker?: string; common?: string; contract?: string } = {}
  if (text.includes('broker')) found.broker = 'Active'
  if (text.includes('common')) found.common = 'Active'
  if (text.includes('contract')) found.contract = 'Active'
  if (text.includes('property') && !found.broker && !found.common && !found.contract) {
    found.common = 'Active'
  }
  return found
}

function usableAuthority(value?: string | null): string | null {
  const text = (value ?? '').trim()
  if (!text || text === '—' || text === '-') return null
  if (['none', 'n', 'null'].includes(text.toLowerCase())) return null
  return text
}

/** Prefer explicit stats, then authority named in the operating status. */
export function displayAuthorities(
  summary: Pick<
    BrokerSnapshotSummary,
    'brokerAuthority' | 'commonAuthority' | 'contractAuthority' | 'operatingStatus'
  >
): { broker: string; common: string; contract: string } {
  const inferred = authorityFromOperatingStatus(summary.operatingStatus)
  return {
    broker: usableAuthority(summary.brokerAuthority) ?? inferred.broker ?? (summary.brokerAuthority?.trim() || '—'),
    common: usableAuthority(summary.commonAuthority) ?? inferred.common ?? (summary.commonAuthority?.trim() || '—'),
    contract:
      usableAuthority(summary.contractAuthority) ?? inferred.contract ?? (summary.contractAuthority?.trim() || '—'),
  }
}

/** True when common, contract, or broker authority is Active. */
export function hasActiveFreightAuthority(summary: Pick<
  BrokerSnapshotSummary,
  'commonAuthority' | 'contractAuthority' | 'brokerAuthority' | 'operatingStatus'
>): boolean {
  const shown = displayAuthorities(summary)
  return (
    isActiveAuthority(shown.broker) ||
    isActiveAuthority(shown.common) ||
    isActiveAuthority(shown.contract)
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
