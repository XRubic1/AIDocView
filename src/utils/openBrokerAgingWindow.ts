/** Named popup for one broker's aging invoices. */
export const BROKER_AGING_WINDOW_PREFIX = 'credyx-broker-aging-'
export const CARRIER_AGING_WINDOW_PREFIX = 'credyx-carrier-aging-'

function popupFeatures(): string {
  return [
    'popup=yes',
    'width=1440',
    'height=920',
    'menubar=no',
    'toolbar=no',
    'location=yes',
    'resizable=yes',
    'scrollbars=yes',
  ].join(',')
}

function safeWindowName(prefix: string, id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'id'
  return `${prefix}${safe}`
}

/** Open invoices for a broker, optionally scoped to one carrier. */
export function openBrokerAgingWindow(
  brokerId: string,
  brokerName: string,
  clientId?: string,
  clientName?: string
): Window | null {
  const params = new URLSearchParams()
  params.set('broker', brokerId)
  if (brokerName) params.set('name', brokerName)
  if (clientId) params.set('client', clientId)
  if (clientName) params.set('carrier', clientName)
  const url = `/aging-ar/broker?${params.toString()}`
  const popup = window.open(url, safeWindowName(BROKER_AGING_WINDOW_PREFIX, `${clientId || ''}-${brokerId}`), popupFeatures())
  popup?.focus()
  return popup
}

/** Open broker concentration for one carrier. */
export function openCarrierAgingWindow(clientId: string, clientName: string): Window | null {
  const params = new URLSearchParams()
  params.set('client', clientId)
  if (clientName) params.set('carrier', clientName)
  const url = `/aging-ar/carrier?${params.toString()}`
  const popup = window.open(url, safeWindowName(CARRIER_AGING_WINDOW_PREFIX, clientId), popupFeatures())
  popup?.focus()
  return popup
}
