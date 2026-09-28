import { describe, expect, it } from 'vitest'
import { fillBlueprintNoteTokens } from '../../../supabase/functions/_shared/blueprintNoteTokens'

describe('fillBlueprintNoteTokens', () => {
  it('fills quoted invoice fields and keeps the @', () => {
    const note = fillBlueprintNoteTokens(
      'Paperwork sent to broker via @ "broker-email" - "broker-name", "invoice-number", "load-number"',
      {
        brokerEmail: 'ap@custom.com',
        brokerName: 'TQL',
        invoiceNumber: 'INV-100',
        loadNumber: 'LD-9',
      }
    )
    expect(note).toBe('Paperwork sent to broker via @ ap@custom.com - TQL, INV-100, LD-9')
  })

  it('leaves unknown quotes and uses a dash when a field is missing', () => {
    expect(
      fillBlueprintNoteTokens('Sent "broker-email" for "something-else"', {
        brokerEmail: '',
      })
    ).toBe('Sent — for "something-else"')
  })
})
