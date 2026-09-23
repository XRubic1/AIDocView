import { afterEach, describe, expect, it } from 'vitest'
import { addBroker, formatNewBrokerName, hydrateBrokers } from './mockBrokers'

describe('formatNewBrokerName', () => {
  it('uppercases and trims', () => {
    expect(formatNewBrokerName('  Total Quality Logistics  ')).toBe('TOTAL QUALITY LOGISTICS')
  })
})

describe('addBroker', () => {
  afterEach(() => {
    hydrateBrokers([])
  })

  it('stores a new broker name in all caps', () => {
    const created = addBroker({
      id: 'broker-test-caps',
      name: 'Landstar Ranger',
    })
    expect(created.name).toBe('LANDSTAR RANGER')
  })

  it('defaults missing Net days to 30 and marks the broker as new', () => {
    const created = addBroker({
      id: 'broker-test-net30',
      name: 'New Broker LLC',
    })
    expect(created.payment_terms_days).toBe(30)
    expect(created.is_new).toBe(true)
  })

  it('keeps explicit Net days and is_new=false', () => {
    const created = addBroker({
      id: 'broker-test-explicit',
      name: 'Known Broker',
      payment_terms_days: 45,
      is_new: false,
    })
    expect(created.payment_terms_days).toBe(45)
    expect(created.is_new).toBe(false)
  })
})
