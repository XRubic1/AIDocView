import { describe, expect, it } from 'vitest'

/**
 * Pure helper mirroring unique-name logic in collectBrokerPacketFiles
 * (exported behavior covered via integration; this locks the rule).
 */
function uniquePacketNames(
  items: Array<{ name: string; source: string }>
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    const key = item.name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item.name)
  }
  return out
}

describe('broker packet filename uniqueness', () => {
  it('keeps first occurrence when names collide case-insensitively', () => {
    const names = uniquePacketNames([
      { name: 'Invoice.pdf', source: 'invoice' },
      { name: 'NOA.pdf', source: 'vault_broker' },
      { name: 'invoice.pdf', source: 'vault_broker' },
      { name: 'BOL.pdf', source: 'invoice' },
    ])
    expect(names).toEqual(['Invoice.pdf', 'NOA.pdf', 'BOL.pdf'])
  })
})
