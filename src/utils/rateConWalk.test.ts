import { describe, expect, it } from 'vitest'
import {
  mergeRateConWalk,
  rateConWalkComplete,
} from '../../supabase/functions/_shared/rateConWalk'

describe('rate con binder walk', () => {
  it('stops once load, broker, rate, pickup, and delivery are filled', () => {
    const page1 = mergeRateConWalk(null, {
      load_number: '12477660EVL',
      broker_name: 'Evans Transportation',
      rate_total: null,
      origin: { city: 'Dallas', state: 'TX' },
    })
    expect(rateConWalkComplete(page1)).toBe(false)

    const page2 = mergeRateConWalk(page1, {
      load_number: '',
      broker_name: 'Evans',
      rate_total: 3000,
      destinations: [{ city: 'Chicago', state: 'IL' }],
    })
    expect(rateConWalkComplete(page2)).toBe(true)
    expect(page2.load_number).toBe('12477660EVL')
    expect(page2.broker_name).toBe('Evans Transportation')
    expect(page2.rate_total).toBe(3000)
  })
})
