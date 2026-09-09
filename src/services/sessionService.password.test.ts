import { describe, expect, it } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { userMustSetPassword } from './sessionService'

function user(meta: Record<string, unknown>): User {
  return { user_metadata: meta } as User
}

describe('userMustSetPassword', () => {
  it('is true only when metadata flag is set', () => {
    expect(userMustSetPassword(user({ must_set_password: true }))).toBe(true)
    expect(userMustSetPassword(user({ must_set_password: false }))).toBe(false)
    expect(userMustSetPassword(user({}))).toBe(false)
    expect(userMustSetPassword(null)).toBe(false)
  })
})
