import { describe, expect, it } from 'vitest'
import { assessMcCredit } from './mcCreditAssessment'
import type { McCreditRecord, McCreditSearchResponse } from '../types/mcCreditLookup'

function response(rows: McCreditRecord[]): McCreditSearchResponse {
  return {
    mc: '511639',
    queriedAt: '2026-09-30T00:00:00.000Z',
    results: rows,
  }
}

function row(partial: Partial<McCreditRecord>): McCreditRecord {
  return {
    mc: '511639',
    company: 'Example Broker',
    creditRating: 'A',
    paydex: 25,
    creditScore: 90,
    ...partial,
  }
}

describe('assessMcCredit', () => {
  it('returns unknown when nothing matches', () => {
    const result = assessMcCredit(response([]))
    expect(result.verdict).toBe('unknown')
    expect(result.title).toBe('Not enough data')
  })

  it('avoids a No Buy rating', () => {
    const result = assessMcCredit(response([row({ creditRating: 'F', noBuy: 'NO BUY' })]))
    expect(result.verdict).toBe('avoid')
    expect(result.reasons.some((r) => r.includes('No Buy'))).toBe(true)
  })

  it('does not treat days to pay or a zero as a credit score', () => {
    const result = assessMcCredit(
      response([
        row({ creditScore: 0, paydex: 0 }),
        row({ creditScore: 32, paydex: 32 }),
        row({ creditScore: 96, paydex: 32 }),
      ])
    )
    expect(result.reasons.some((reason) => reason.includes('credit score'))).toBe(false)
    expect(result.reasons).toEqual([])
    expect(result.verdict).toBe('good')
    expect(result.positives.some((item) => item.includes('Strong credit scores (avg 96)'))).toBe(true)
    expect(result.positives.some((item) => item.includes('32 days'))).toBe(true)
  })

  it('uses caution only when a negative is listed', () => {
    const result = assessMcCredit(response([row({ creditRating: 'A', creditScore: 90, paydex: 55 })]))
    expect(result.verdict).toBe('caution')
    expect(result.reasons.some((reason) => reason.includes('55 days'))).toBe(true)
  })

  it('treats an N rating as thin payment history unless invoices are on file', () => {
    const thin = assessMcCredit(
      response([row({ creditRating: 'N', creditScore: 96, paydex: 32 })])
    )
    expect(thin.verdict).toBe('caution')
    expect(thin.reasons.some((reason) => reason.includes('Rated N'))).toBe(true)

    const explained = assessMcCredit(
      response([
        row({
          creditRating: 'N',
          creditScore: 96,
          paydex: 32,
          creditNote: 'Special billing terms on file.',
        }),
      ])
    )
    expect(explained.reasons.some((reason) => reason.includes('Rated N'))).toBe(false)
    expect(explained.verdict).toBe('good')

    const experienced = assessMcCredit(
      response([
        row({
          creditRating: 'N',
          creditScore: 96,
          paydex: 32,
          calcInvCount: { all: 12 },
        }),
      ])
    )
    expect(experienced.reasons.some((reason) => /invoice|Rated N|payment history/i.test(reason))).toBe(false)
    expect(experienced.verdict).toBe('good')
  })

  it('treats strong ratings, scores, and pay speed as good', () => {
    const result = assessMcCredit(
      response([row({ creditRating: 'A', creditScore: 92, paydex: 22 })])
    )
    expect(result.verdict).toBe('good')
    expect(result.company).toBe('Example Broker')
  })
})
