import { describe, expect, it } from 'vitest'
import {
  handoffLinkWouldCycle,
  nextBlueprintAfter,
  type BlueprintHandoffMap,
} from './blueprintHandoffMap'

const map: BlueprintHandoffMap = {
  links: [
    { fromId: 'docs', toId: 'payment' },
    { fromId: 'payment', toId: 'close' },
  ],
  positions: {},
}

describe('blueprint handoff map', () => {
  it('starts the blueprint the finished one points to', () => {
    expect(nextBlueprintAfter('docs', map)).toBe('payment')
    expect(nextBlueprintAfter('close', map)).toBeNull()
  })

  it('rejects a line that loops back', () => {
    expect(handoffLinkWouldCycle(map.links, 'close', 'docs')).toBe(true)
    expect(handoffLinkWouldCycle(map.links, 'docs', 'close')).toBe(false)
    expect(handoffLinkWouldCycle(map.links, 'docs', 'docs')).toBe(true)
  })
})
