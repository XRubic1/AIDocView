import { describe, expect, it } from 'vitest'
import {
  applyEmailDomain,
  canSuggestEmailDomain,
  extractEmailDomain,
} from './emailDomain'

describe('extractEmailDomain', () => {
  it('returns domain after @', () => {
    expect(extractEmailDomain('ap@Broker.com')).toBe('broker.com')
  })

  it('returns null without a domain', () => {
    expect(extractEmailDomain('')).toBeNull()
    expect(extractEmailDomain('no-at')).toBeNull()
    expect(extractEmailDomain('missing@')).toBeNull()
    expect(extractEmailDomain('local@nodot')).toBeNull()
  })
})

describe('applyEmailDomain', () => {
  it('appends the shared domain to the local part', () => {
    expect(applyEmailDomain('paperwork', 'broker.com')).toBe('paperwork@broker.com')
    expect(applyEmailDomain('ap@other.com', 'broker.com')).toBe('ap@broker.com')
  })

  it('returns empty when local part is empty', () => {
    expect(applyEmailDomain('', 'broker.com')).toBe('')
    expect(applyEmailDomain('@broker.com', 'broker.com')).toBe('')
  })
})

describe('canSuggestEmailDomain', () => {
  it('suggests only for local-part typing with domain enabled', () => {
    expect(canSuggestEmailDomain('ap', 'broker.com', true)).toBe(true)
    expect(canSuggestEmailDomain('', 'broker.com', true)).toBe(false)
    expect(canSuggestEmailDomain('ap@broker.com', 'broker.com', true)).toBe(false)
    expect(canSuggestEmailDomain('ap', 'broker.com', false)).toBe(false)
    expect(canSuggestEmailDomain('ap', null, true)).toBe(false)
  })
})
