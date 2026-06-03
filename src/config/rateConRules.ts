/**
 * Landstar / agency note: broker is Landstar — not "Agency Name" (e.g. Transsouth Logistics / TSX).
 * See brokerExtractionRules.ts and documentAiPrompts.ts.
 */

/** Field keys extracted from a rate confirmation. */
export type RateConFieldKey =
  | 'carrier'
  | 'broker'
  | 'rate'
  | 'emailDomain'
  | 'loadNumber'
  | 'pickup'
  | 'drop'

export const RATE_CON_FIELD_LABELS: Record<RateConFieldKey, string> = {
  carrier: 'Carrier',
  broker: 'Broker',
  rate: 'Rate',
  emailDomain: 'Email domain',
  loadNumber: 'Load number',
  pickup: 'Pickup (full address)',
  drop: 'Delivery (full address)',
}

/** Confidence below this triggers a user prompt for that field. */
export const FIELD_UNCERTAINTY_THRESHOLD = 0.7

/** Default user prompt when load number is uncertain on a rate con. */
export function getDefaultLoadNumberPrompt(): string {
  return 'Can you point me to the load number on this rate con? It may be labeled Load #, Order #, or Reference #.'
}

/** Default user prompt when pickup/delivery address is uncertain. */
export function getDefaultAddressPrompt(kind: 'pickup' | 'drop'): string {
  return kind === 'pickup'
    ? 'Can you point me to the pickup location? I need the full address including street, city, and state.'
    : 'Can you point me to the delivery location? I need the full address including street, city, and state.'
}
