import { brokersFuzzyMatch, normalizeBrokerName } from './brokerFuzzyMatch'
import { CrossValidationFlag } from '../types/documentPipeline'

/** Placeholder / non-facility BOL party text. */
const NON_FACILITY_PATTERNS = [
  /^as\s*directed$/i,
  /^tbd$/i,
  /^n\/?a$/i,
  /^none$/i,
  /^unknown$/i,
  /^same$/i,
  /^see\s+above$/i,
  /^shipper$/i,
  /^consignee$/i,
  /^receiver$/i,
  /^customer$/i,
  /^broker$/i,
]

/**
 * True when a BOL ship-from / ship-to string looks like a real facility
 * (name + address-like detail), not blank or placeholder text.
 */
export function looksLikeFacilityAddress(value?: string | null): boolean {
  const raw = (value ?? '').trim()
  if (raw.length < 6) return false

  const normalized = raw.replace(/\s+/g, ' ')
  if (NON_FACILITY_PATTERNS.some((pattern) => pattern.test(normalized))) return false

  const hasDigit = /\d/.test(normalized)
  const hasStreetWord =
    /\b(st|street|ave|avenue|rd|road|blvd|dr|drive|ln|lane|hwy|highway|way|ct|court|pkwy|parkway|suite|ste|bldg|building|warehouse|whse|dock|dc|depot|terminal|yard|facility|plant|mill)\b/i.test(
      normalized
    )
  const hasCityState =
    /,\s*[A-Za-z]{2}\b/.test(normalized) || /\b[A-Za-z]{2}\s+\d{5}(-\d{4})?\b/.test(normalized)

  // Require address-like signal — company name alone is not a facility.
  if (hasDigit && (hasStreetWord || hasCityState)) return true
  if (hasStreetWord && hasCityState) return true
  if (hasDigit && hasCityState && normalized.length >= 12) return true
  return false
}

/** True when text appears to name the same company as the broker (fuzzy). */
export function partyMatchesBroker(party?: string | null, brokerName?: string | null): boolean {
  const partyText = (party ?? '').trim()
  const broker = (brokerName ?? '').trim()
  if (!partyText || !broker) return false
  if (brokersFuzzyMatch(partyText, broker)) return true

  // Party lines are often "Broker Name – 123 Main St…"; compare leading company tokens.
  const partyHead = partyText.split(/[-–—,|]/)[0]?.trim() ?? partyText
  if (partyHead && brokersFuzzyMatch(partyHead, broker)) return true

  const brokerNorm = normalizeBrokerName(broker)
  const partyNorm = normalizeBrokerName(partyHead)
  if (!brokerNorm || !partyNorm) return false
  return partyNorm.includes(brokerNorm) || brokerNorm.includes(partyNorm)
}

export interface BolIdentityRiskInput {
  brokerName?: string | null
  shipFrom?: string | null
  shipTo?: string | null
  /** When false, skip broker-both-ends check. */
  checkBrokerBothEnds?: boolean
  /** When false, skip missing-facilities check. */
  checkMissingFacilities?: boolean
}

export interface BolIdentityRiskResult {
  brokerAsShipperAndReceiver: boolean
  missingShipperFacility: boolean
  missingReceiverFacility: boolean
  missingBothFacilities: boolean
  flags: CrossValidationFlag[]
}

/**
 * Stolen-ID / fraud paperwork checks for BOL party layout.
 * Critical risks → WARNING flags (forces Needs review; does not hard-reject alone).
 */
export function evaluateBolIdentityRiskFlags(input: BolIdentityRiskInput): BolIdentityRiskResult {
  const checkBrokerBothEnds = input.checkBrokerBothEnds !== false
  const checkMissingFacilities = input.checkMissingFacilities !== false

  const shipFrom = input.shipFrom ?? ''
  const shipTo = input.shipTo ?? ''
  const missingShipperFacility = !looksLikeFacilityAddress(shipFrom)
  const missingReceiverFacility = !looksLikeFacilityAddress(shipTo)
  const missingBothFacilities = missingShipperFacility && missingReceiverFacility

  const brokerAsShipper =
    checkBrokerBothEnds && partyMatchesBroker(shipFrom, input.brokerName)
  const brokerAsReceiver =
    checkBrokerBothEnds && partyMatchesBroker(shipTo, input.brokerName)
  const brokerAsShipperAndReceiver = Boolean(brokerAsShipper && brokerAsReceiver)

  const flags: CrossValidationFlag[] = []

  if (brokerAsShipperAndReceiver) {
    flags.push({
      level: 'WARNING',
      field: 'bol_broker_as_shipper_and_receiver',
      message:
        'High fraud risk: the broker appears as both shipper and receiver on the BOL. Verify real facilities and carrier identity before approving.',
    })
  }

  if (checkMissingFacilities && missingBothFacilities) {
    flags.push({
      level: 'WARNING',
      field: 'bol_missing_shipper_receiver_facilities',
      message:
        'High fraud risk: BOL is missing usable shipper and receiver facility addresses. Request corrected paperwork before approving.',
    })
  }

  return {
    brokerAsShipperAndReceiver,
    missingShipperFacility,
    missingReceiverFacility,
    missingBothFacilities,
    flags,
  }
}
