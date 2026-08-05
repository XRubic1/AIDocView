import { describe, expect, it } from 'vitest'
import { formatPhoneNumber } from './formatPhoneNumber'

describe('formatPhoneNumber', () => {
  it('formats a full 10-digit number', () => {
    expect(formatPhoneNumber('5551234567')).toBe('(555) 123-4567')
  })

  it('formats as the user types', () => {
    expect(formatPhoneNumber('5')).toBe('5')
    expect(formatPhoneNumber('555')).toBe('555')
    expect(formatPhoneNumber('5551')).toBe('(555) 1')
    expect(formatPhoneNumber('555123')).toBe('(555) 123')
    expect(formatPhoneNumber('5551234')).toBe('(555) 123-4')
  })

  it('strips non-digits and caps at 10', () => {
    expect(formatPhoneNumber('(555) 123-4567 ext 99')).toBe('(555) 123-4567')
    expect(formatPhoneNumber('555-123-45678901')).toBe('(555) 123-4567')
  })

  it('drops a leading US country code 1', () => {
    expect(formatPhoneNumber('15551234567')).toBe('(555) 123-4567')
    expect(formatPhoneNumber('+1 (555) 123-4567')).toBe('(555) 123-4567')
  })

  it('returns empty for empty/whitespace', () => {
    expect(formatPhoneNumber('')).toBe('')
    expect(formatPhoneNumber('   ')).toBe('')
  })
})
