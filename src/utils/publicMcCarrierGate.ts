import type { BrokerSnapshotSummary } from '../types/brokerSnapshot'
import { parseSnapshotEntityRoles } from './salesLeadRating'
import {
  displayAuthorities,
  isUnauthorizedOperatingStatus,
} from './brokerSnapshotSafety'

function isActiveAuthority(value: string | null | undefined): boolean {
  const text = (value ?? '').trim().toLowerCase()
  return text === 'active' || text === 'authorized' || text === 'a'
}

export type CarrierMcGateResult =
  | { ok: true }
  | {
      ok: false
      reason: 'not_found' | 'broker_only' | 'not_carrier' | 'inactive'
      message: string
    }

/**
 * Public /MC unlock gate: MC must resolve to a motor carrier, not a broker-only docket.
 */
export function assessCarrierMcGate(summary: BrokerSnapshotSummary | null | undefined): CarrierMcGateResult {
  if (!summary?.found) {
    return {
      ok: false,
      reason: 'not_found',
      message: 'We could not find that MC. Check the number and try again.',
    }
  }

  const { isCarrier, isBroker } = parseSnapshotEntityRoles(summary)
  const authorities = displayAuthorities(summary)
  const hasCarrierAuth =
    isActiveAuthority(authorities.common) || isActiveAuthority(authorities.contract)
  const hasFleet =
    (summary.totalPowerUnits ?? 0) > 0 ||
    (summary.totalTrucks ?? 0) > 0 ||
    (summary.totalDrivers ?? 0) > 0 ||
    (summary.ownTractors ?? 0) > 0
  const carrierOperation = Boolean((summary.carrierOperation ?? '').trim())
  const unauthorized = isUnauthorizedOperatingStatus(summary.operatingStatus)

  // Pure broker docket — never unlock.
  if (isBroker && !isCarrier && !hasCarrierAuth && !hasFleet) {
    return {
      ok: false,
      reason: 'broker_only',
      message: 'That looks like a broker MC. Enter your carrier MC to continue.',
    }
  }

  const carrierEvidence =
    isCarrier || hasCarrierAuth || carrierOperation || (hasFleet && !isBroker)

  if (!carrierEvidence) {
    return {
      ok: false,
      reason: 'not_carrier',
      message: 'That MC does not look like a valid carrier. Enter your carrier MC to continue.',
    }
  }

  // Inactive / out of service with no usable carrier authority or fleet.
  if (unauthorized && !hasCarrierAuth && !hasFleet) {
    return {
      ok: false,
      reason: 'inactive',
      message: 'That carrier MC is not active. Enter a valid active carrier MC to continue.',
    }
  }

  return { ok: true }
}
