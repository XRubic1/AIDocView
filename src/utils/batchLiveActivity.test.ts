import { describe, expect, it, beforeEach } from 'vitest'
import {
  clearBatchLiveActivity,
  finishBatchLiveActivity,
  getBatchLiveActivity,
  isBatchLiveActivityRunning,
  startBatchLiveActivity,
  updateBatchLiveActivity,
} from './batchLiveActivity'

describe('batchLiveActivity', () => {
  beforeEach(() => {
    clearBatchLiveActivity('b1')
  })

  it('tracks thinking / doing while running in the background', () => {
    startBatchLiveActivity('b1', {
      jobLabel: 'AI Doc Split → packets',
      jobKind: 'doc_split_and_packets',
      background: true,
      thinking: 'Split combined PDFs',
      doing: 'Starting',
    })
    updateBatchLiveActivity('b1', {
      phase: 'classifying',
      thinking: 'Decide RC / BOL / INV',
      doing: 'Classifying page 1',
      progressPercent: 30,
    })
    const live = getBatchLiveActivity('b1')
    expect(live?.background).toBe(true)
    expect(live?.thinking).toContain('RC / BOL')
    expect(live?.doing).toBe('Classifying page 1')
    expect(isBatchLiveActivityRunning(live)).toBe(true)
    expect(live?.recentSteps.at(-1)).toBe('Classifying page 1')
  })

  it('marks finished so debug can show last outcome', () => {
    startBatchLiveActivity('b1', {
      jobLabel: 'Background batch pipeline',
      doing: 'Running',
    })
    finishBatchLiveActivity('b1', {
      phase: 'succeeded',
      thinking: 'Done',
      doing: 'Created 2 packets',
    })
    const live = getBatchLiveActivity('b1')
    expect(live?.phase).toBe('succeeded')
    expect(isBatchLiveActivityRunning(live)).toBe(false)
    expect(live?.progressPercent).toBe(100)
  })
})
