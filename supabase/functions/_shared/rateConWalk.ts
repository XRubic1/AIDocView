/**
 * Rate-confirmation field walk.
 * Read binder page 1, then 2, then 3, and stop once the packet fields are filled.
 * Shared by the browser review path and the server doc-split pipeline.
 */

export interface WalkableStop {
  name?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  pickup_date?: string | null
  delivery_date?: string | null
}

export interface WalkableRateCon {
  load_number?: string | null
  broker_name?: string | null
  carrier_name?: string | null
  rate_total?: number | null
  rate_currency?: string | null
  origin?: WalkableStop | null
  destinations?: WalkableStop[] | null
  bol_reference_numbers?: string[] | null
  confidence?: number | null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function stopHasPlace(stop: WalkableStop | null | undefined): boolean {
  if (!stop) return false
  return Boolean(text(stop.city) || text(stop.address) || text(stop.name))
}

function asStop(value: unknown): WalkableStop | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  return {
    name: text(row.name) || null,
    address: text(row.address) || null,
    city: text(row.city) || null,
    state: text(row.state) || null,
    zip: text(row.zip) || null,
    pickup_date: text(row.pickup_date) || null,
    delivery_date: text(row.delivery_date) || null,
  }
}

/** Packet fields: load, broker, rate, pickup, and at least one delivery. */
export function rateConWalkComplete(rc: WalkableRateCon | null | undefined): boolean {
  if (!rc) return false
  const hasLoad = Boolean(text(rc.load_number))
  const hasBroker = Boolean(text(rc.broker_name))
  const hasRate = typeof rc.rate_total === 'number' && rc.rate_total > 0
  const hasPickup = stopHasPlace(rc.origin)
  const hasDrop = (rc.destinations ?? []).some((stop) => stopHasPlace(stop))
  return hasLoad && hasBroker && hasRate && hasPickup && hasDrop
}

function preferText(current: unknown, next: unknown): string | null {
  return text(current) || text(next) || null
}

/** Keep the first filled value. Later pages only fill blanks. */
export function mergeRateConWalk(
  base: WalkableRateCon | null | undefined,
  next: WalkableRateCon | null | undefined
): WalkableRateCon {
  const left = base ?? {}
  const right = next ?? {}
  const dests = (left.destinations ?? []).some((stop) => stopHasPlace(stop))
    ? left.destinations
    : right.destinations
  const refs = [
    ...new Set(
      [...(left.bol_reference_numbers ?? []), ...(right.bol_reference_numbers ?? [])]
        .map((value) => text(value))
        .filter(Boolean)
    ),
  ]
  return {
    load_number: preferText(left.load_number, right.load_number),
    broker_name: preferText(left.broker_name, right.broker_name),
    carrier_name: preferText(left.carrier_name, right.carrier_name),
    rate_total:
      typeof left.rate_total === 'number' && left.rate_total > 0
        ? left.rate_total
        : typeof right.rate_total === 'number'
          ? right.rate_total
          : null,
    rate_currency: text(left.rate_currency) || text(right.rate_currency) || null,
    origin: stopHasPlace(left.origin) ? left.origin : right.origin ?? left.origin ?? null,
    destinations: dests ?? [],
    bol_reference_numbers: refs,
    confidence:
      typeof right.confidence === 'number'
        ? right.confidence
        : typeof left.confidence === 'number'
          ? left.confidence
          : null,
  }
}

export function rateConFromUnknown(raw: Record<string, unknown> | null | undefined): WalkableRateCon {
  const source = raw ?? {}
  const rate =
    typeof source.rate_total === 'number'
      ? source.rate_total
      : typeof source.rate === 'number'
        ? source.rate
        : null
  const refs = Array.isArray(source.bol_reference_numbers)
    ? source.bol_reference_numbers.map((value) => text(value)).filter(Boolean)
    : []
  const destinations = Array.isArray(source.destinations)
    ? source.destinations.map((row) => asStop(row)).filter((row): row is WalkableStop => row != null)
    : []
  return {
    load_number: text(source.load_number) || text(source.loadNumber) || null,
    broker_name: text(source.broker_name) || text(source.broker) || null,
    carrier_name: text(source.carrier_name) || text(source.carrier) || null,
    rate_total: rate,
    rate_currency: text(source.rate_currency) || null,
    origin: asStop(source.origin),
    destinations,
    bol_reference_numbers: refs,
    confidence: typeof source.confidence === 'number' ? source.confidence : null,
  }
}

/** Overlay walked fields onto the model JSON so downstream parsers see one result. */
export function rateConWalkToRaw(
  walked: WalkableRateCon,
  raw: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...raw,
    load_number: walked.load_number ?? raw.load_number ?? '',
    broker_name: walked.broker_name ?? raw.broker_name ?? '',
    carrier_name: walked.carrier_name ?? raw.carrier_name ?? '',
    rate_total: walked.rate_total ?? raw.rate_total ?? null,
    rate_currency: walked.rate_currency ?? raw.rate_currency ?? 'USD',
    origin: walked.origin ?? raw.origin,
    destinations: walked.destinations ?? raw.destinations ?? [],
    bol_reference_numbers: walked.bol_reference_numbers ?? raw.bol_reference_numbers ?? [],
    confidence: walked.confidence ?? raw.confidence,
  }
}
