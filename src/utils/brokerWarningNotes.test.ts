import { describe, expect, it } from 'vitest'
import {
  mergeBrokerWarningNotes,
  parseBrokerWarningNotes,
  stripSnapshotStamp,
} from './brokerWarningNotes'

describe('brokerWarningNotes', () => {
  it('strips Snapshot stamps', () => {
    expect(stripSnapshotStamp('[Snapshot 2024-08-10] Inactive')).toBe('Inactive')
    expect(stripSnapshotStamp('[Snapshot] Insurance cancelled')).toBe('Insurance cancelled')
  })

  it('turns jammed Snapshot lines into Inactive + insurance labels', () => {
    const raw =
      '[Snapshot 2024-08-10] Insurance cancelled — last cancel 2013-09-08. Do not book until coverage is confirmed. [Snapshot 2024-08-10] Inactive'
    const parsed = parseBrokerWarningNotes(raw)
    expect(parsed.labels.map((l) => l.text)).toEqual(['Inactive', 'Insurance cancelled'])
    expect(parsed.notes).toEqual([
      'Insurance cancelled — last cancel 2013-09-08. Do not book until coverage is confirmed.',
    ])
  })

  it('does not duplicate identical internal and carrier notes', () => {
    const same = '[Snapshot 2024-08-10] Inactive'
    const merged = mergeBrokerWarningNotes(same, same)
    expect(merged.labels.map((l) => l.id)).toContain('inactive')
    expect(merged.carrierSameAsInternal).toBe(true)
    expect(merged.carrierNotes).toEqual([])
  })
})
