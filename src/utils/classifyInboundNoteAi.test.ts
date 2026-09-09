import { describe, expect, it } from 'vitest'
import { parseInboxAiClassificationJson } from './classifyInboundNoteAi'

describe('parseInboxAiClassificationJson', () => {
  it('maps lumper hold JSON', () => {
    const r = parseInboxAiClassificationJson({
      classification: 'missing_docs',
      summary: 'On hold for missing lumper $250.',
      confidence: 0.9,
    })
    expect(r?.classification).toBe('missing_docs')
    expect(r?.proposed_actions).toContain('hold_invoice')
    expect(r?.summary).toContain('lumper')
  })

  it('rejects unknown labels', () => {
    expect(parseInboxAiClassificationJson({ classification: 'spam' })).toBeNull()
  })
})
