import { describe, expect, it } from 'vitest'
import { parseEmlString } from './parseDroppedEmail'

describe('parseEmlString', () => {
  it('reads From, subject, and body', () => {
    const parsed = parseEmlString(
      `From: AP <ap@broker.com>\nSubject: Invoice 123\n\nPlease note this invoice is on hold.\n`
    )
    expect(parsed.fromAddress).toBe('ap@broker.com')
    expect(parsed.subject).toBe('Invoice 123')
    expect(parsed.bodyText).toContain('on hold')
  })
})
