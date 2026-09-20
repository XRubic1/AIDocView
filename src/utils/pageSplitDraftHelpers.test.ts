import { describe, expect, it } from 'vitest'
import type { BatchIntakeDraft } from '../types/credyxBatch'
import { draftHasPageSplitChildren } from './pageSplitDraftHelpers'

function emptyDraft(overrides: Partial<BatchIntakeDraft> = {}): BatchIntakeDraft {
  return {
    invoices: [],
    unmatched: { rateCons: [], bols: [], other: [] },
    fileById: new Map(),
    ...overrides,
  }
}

describe('draftHasPageSplitChildren', () => {
  it('detects page-split children without overflowing the stack', () => {
    const draft = emptyDraft({
      unmatched: {
        rateCons: [],
        bols: [],
        other: [
          { docId: 'parent', fileName: 'packet.pdf', kind: 'other' },
          { docId: 'page-split-1', fileName: 'packet-p1.pdf', kind: 'other' },
          { docId: 'page-split-2', fileName: 'packet-p2.pdf', kind: 'other' },
        ],
      },
      fileById: new Map([
        ['parent', new File([new Uint8Array([1])], 'packet.pdf', { type: 'application/pdf' })],
        [
          'page-split-1',
          new File([new Uint8Array([1])], 'packet-p1.pdf', { type: 'application/pdf' }),
        ],
      ]),
    })

    for (let i = 0; i < 50; i++) {
      expect(draftHasPageSplitChildren(draft, 'packet.pdf')).toBe(true)
    }
    expect(draftHasPageSplitChildren(draft, 'other.pdf')).toBe(false)
  })
})
