import { describe, expect, it } from 'vitest'
import type { InvoiceNote } from '../types/invoice'
import { getOpenClientAttention } from './clientAttention'

function note(partial: Partial<InvoiceNote> & Pick<InvoiceNote, 'id' | 'created_at'>): InvoiceNote {
  return { note: '', created_by: 'Credyx', type: 'status_update', ...partial }
}

describe('getOpenClientAttention', () => {
  it('returns null when Credyx never asked the carrier for anything', () => {
    expect(getOpenClientAttention({ notes_history: [note({ id: 'a', created_at: '2026-10-01T00:00:00Z' })] })).toBeNull()
  })

  it('returns the open request with its message', () => {
    const result = getOpenClientAttention({
      notes_history: [
        note({
          id: 'a',
          created_at: '2026-10-01T00:00:00Z',
          client_attention: 'open',
          attention_message: 'Upload the signed BOL',
        }),
      ],
    })
    expect(result?.message).toBe('Upload the signed BOL')
    expect(result?.noteId).toBe('a')
  })

  it('treats a later resolve as closing the request', () => {
    expect(
      getOpenClientAttention({
        notes_history: [
          note({ id: 'a', created_at: '2026-10-01T00:00:00Z', client_attention: 'open', attention_message: 'x' }),
          note({ id: 'b', created_at: '2026-10-02T00:00:00Z', client_attention: 'resolved' }),
        ],
      })
    ).toBeNull()
  })

  it('reopens when a new request comes after a resolve', () => {
    const result = getOpenClientAttention({
      notes_history: [
        note({ id: 'a', created_at: '2026-10-01T00:00:00Z', client_attention: 'open', attention_message: 'first' }),
        note({ id: 'b', created_at: '2026-10-02T00:00:00Z', client_attention: 'resolved' }),
        note({ id: 'c', created_at: '2026-10-03T00:00:00Z', client_attention: 'open', attention_message: 'second' }),
      ],
    })
    expect(result?.message).toBe('second')
  })
})
