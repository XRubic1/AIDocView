import { describe, expect, it } from 'vitest'
import { batchCodeCandidates, pickAvailableBatchCode } from './clientBatchCode'

describe('clientBatchCode', () => {
  it('generates ABCL then ABCO then ABLO then ABLG for ABC LOGISTICS INC', () => {
    const codes = [...batchCodeCandidates('ABC LOGISTICS INC')].slice(0, 4)
    expect(codes).toEqual(['ABCL', 'ABCO', 'ABLO', 'ABLG'])
  })

  it('skips taken codes', () => {
    const code = pickAvailableBatchCode('ABC LOGISTICS INC', new Set(['ABCL']))
    expect(code).toBe('ABCO')
  })
})
