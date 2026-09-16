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
})
