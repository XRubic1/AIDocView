import { describe, expect, it } from 'vitest'
import { isAutoInvoiceCreationEnabled, normalizeAiPolicy, AI_POLICY } from './aiPolicy'

describe('automatic AI invoice creation', () => {
  it('stays on when the setting has never been saved', () => {
    expect(normalizeAiPolicy({ aiEnabled: true }).autoInvoiceCreationEnabled).toBe(true)
    expect(normalizeAiPolicy(null).autoInvoiceCreationEnabled).toBe(true)
  })

  it('turns off only when saved as off', () => {
    expect(
      normalizeAiPolicy({ aiEnabled: true, autoInvoiceCreationEnabled: false })
        .autoInvoiceCreationEnabled
    ).toBe(false)
  })

  it('reads the live policy flag', () => {
    const previous = AI_POLICY.autoInvoiceCreationEnabled
    AI_POLICY.autoInvoiceCreationEnabled = false
    try {
      expect(isAutoInvoiceCreationEnabled()).toBe(false)
    } finally {
      AI_POLICY.autoInvoiceCreationEnabled = previous
    }
  })
})
