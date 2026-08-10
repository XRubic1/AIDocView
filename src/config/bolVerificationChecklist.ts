/** Describes one step in the BOL review pipeline (Settings UI). */

export type BolCheckOutcome = 'reject' | 'review' | 'info'

export interface BolVerificationStep {
  id: string
  name: string
  description: string
  /** What usually happens when this check fails. */
  outcome: BolCheckOutcome
}

/** Vision model audit — runs on every delivery-proof page (BOL, POD, delivery confirmation). */
export const BOL_AI_VISION_CHECKS: BolVerificationStep[] = [
  {
    id: 'ai_receiver_signature',
    name: 'Receiver / consignee signature',
    description:
      'Ink, stamp, or initials in the consignee signature box. Printed text does not count. PRESENT requires a tight bounding box.',
    outcome: 'reject',
  },
  {
    id: 'ai_receiver_date',
    name: 'Receiver delivery date',
    description: 'Date next to the consignee signature when the form shows a date field.',
    outcome: 'review',
  },
  {
    id: 'ai_destination',
    name: 'Delivery address vs rate con',
    description: 'Ship-to street, city, and state compared to the rate confirmation destination.',
    outcome: 'reject',
  },
  {
    id: 'ai_page_count',
    name: 'BOL printed pagination',
    description:
      'Uses the BOL footer only (e.g. “Page 1 of 1”) — not the PDF packet index. INCOMPLETE when BOL pages are missing.',
    outcome: 'reject',
  },
  {
    id: 'ai_legibility',
    name: 'Legibility',
    description: 'Whether the BOL scan is readable enough to verify signatures and addresses.',
    outcome: 'review',
  },
  {
    id: 'ai_delivery_exceptions',
    name: 'Delivery exceptions',
    description: 'Damage, shortage, or protest notes on the BOL.',
    outcome: 'review',
  },
  {
    id: 'ai_signature_authenticity',
    name: 'Signature authenticity',
    description: 'Flags traced, stamped-over, or digitally overlaid signatures for human review.',
    outcome: 'review',
  },
  {
    id: 'ai_broker_both_ends',
    name: 'Broker as shipper and receiver',
    description:
      'Flags when the rate-con broker appears as both ship-from and ship-to on the BOL (stolen-ID / fraud risk).',
    outcome: 'review',
  },
  {
    id: 'ai_missing_facilities',
    name: 'Shipper & receiver facilities present',
    description:
      'Flags when the BOL lacks usable shipper and receiver facility addresses (blank, “as directed”, or name-only).',
    outcome: 'review',
  },
  {
    id: 'ai_shipper_carrier_sig',
    name: 'Shipper & carrier signatures',
    description: 'Informational only by default — missing pickup/driver signatures do not fail the load.',
    outcome: 'info',
  },
]

/** Programmatic gates after the AI audit (not toggleable here). */
export const BOL_VERDICT_GATES: BolVerificationStep[] = [
  {
    id: 'gate_identity_risk',
    name: 'Stolen-ID / risky party layout',
    description:
      'Programmatic checks: broker as both shipper and receiver, or missing shipper+receiver facilities → WARNING → Needs review (not auto-approved).',
    outcome: 'review',
  },
  {
    id: 'gate_cross_error',
    name: 'Cross-validation ERROR flags',
    description:
      'Missing receiver signature, destination FAIL, incomplete BOL pages, or other blocking BOL flags become ERROR flags → verdict REJECTED.',
    outcome: 'reject',
  },
  {
    id: 'gate_delivery_ok',
    name: 'Delivery requirements not met',
    description:
      'When BOL delivery proof fails checks but no ERROR flag was raised, verdict is NEEDS_REVIEW (not auto-approved).',
    outcome: 'review',
  },
  {
    id: 'gate_fail_closed',
    name: 'Fail-closed approval gate',
    description:
      'Blocks APPROVED when receiver is UNCLEAR/MISSING without evidence, delivery page was not audited, or classification confidence is too low. Downgrades to NEEDS_REVIEW only.',
    outcome: 'review',
  },
  {
    id: 'gate_unclear_receiver',
    name: 'Receiver UNCLEAR (not missing)',
    description:
      'AI could not confirm signature status. Fail-closed routes to NEEDS_REVIEW; cross-check may also flag for review depending on other rules.',
    outcome: 'review',
  },
]

export function bolCheckOutcomeLabel(outcome: BolCheckOutcome): string {
  if (outcome === 'reject') return 'Often → Rejected'
  if (outcome === 'review') return 'Often → Needs review'
  return 'Informational'
}
