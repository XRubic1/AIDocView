import { RateConParse } from '../types/documentPipeline'

/** Minimal rate-con context for invoice / lumper / BOL prompts (fewer tokens than full JSON). */
export function buildCompactRateConContext(parse?: RateConParse): string {
  if (!parse) return ''
  const dest = parse.destinations?.[0]
  const delivery = dest
    ? [dest.name, dest.address, dest.city, dest.state, dest.zip].filter(Boolean).join(', ')
    : ''
  const parts = [
    parse.load_number ? `load ${parse.load_number}` : '',
    parse.broker_name ? `broker ${parse.broker_name}` : '',
    parse.carrier_name ? `carrier ${parse.carrier_name}` : '',
    parse.rate_total != null ? `rate $${parse.rate_total}` : '',
    delivery ? `deliver ${delivery}` : '',
    parse.bol_reference_numbers?.length
      ? `refs ${parse.bol_reference_numbers.slice(0, 8).join(', ')}`
      : '',
  ].filter(Boolean)
  return parts.join(' · ')
}

/** Slim JSON for BOL validator — drops empty nested fields. */
export function buildBolRateConJson(parse?: RateConParse): string {
  if (!parse) return '{}'
  const payload = {
    load_number: parse.load_number,
    broker_name: parse.broker_name,
    carrier_name: parse.carrier_name,
    rate_total: parse.rate_total,
    destinations: parse.destinations?.map((stop) => ({
      stop_number: stop.stop_number,
      name: stop.name,
      address: stop.address,
      city: stop.city,
      state: stop.state,
      zip: stop.zip,
    })),
    bol_reference_numbers: parse.bol_reference_numbers,
  }
  return JSON.stringify(payload)
}
