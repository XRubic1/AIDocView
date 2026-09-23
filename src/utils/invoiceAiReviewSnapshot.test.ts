import { describe, expect, it } from 'vitest'
import {
  isMalformedAiReviewSnapshotRaw,
  normalizeInvoiceAiReviewSnapshot,
  parseInvoiceAiReviewSnapshot,
} from './invoiceAiReviewSnapshot'
import type { InvoiceAiReviewSnapshot } from '../types/invoiceAiReview'

describe('invoiceAiReviewSnapshot normalize', () => {
  it('detects legacy edge string check rows as malformed', () => {
    const raw = JSON.stringify({
      passCount: 2,
      requiredTotal: 2,
      requiredAll: ['Rate confirmation present', 'BOL present'],
      source: 'batch-ai-process-edge',
    })
    expect(isMalformedAiReviewSnapshotRaw(raw)).toBe(true)
  })

  it('coerces string check rows into labeled ok rows', () => {
    const snap = normalizeInvoiceAiReviewSnapshot({
      headline: 'Good to go',
      detail: 'ok',
      ready: true,
      passCount: 2,
      requiredTotal: 2,
      requiredAll: ['Rate confirmation present', 'BOL present'] as unknown as InvoiceAiReviewSnapshot['requiredAll'],
      requiredFailed: [],
      requiredPassed: [],
      additional: [],
      issues: [],
      warnings: [],
    })
    expect(snap?.requiredAll).toHaveLength(2)
    expect(snap?.requiredAll[0].label).toBe('Rate confirmation present')
    expect(snap?.requiredAll[0].status).toBe('ok')
    expect(snap?.passCount).toBe(2)
  })

  it('parses a well-formed snapshot unchanged', () => {
    const raw = JSON.stringify({
      headline: 'Good to go',
      detail: 'All passed',
      ready: true,
      passCount: 1,
      requiredTotal: 1,
      requiredAll: [
        { id: 'req_bol', label: 'Bill of lading', status: 'ok', summary: 'present' },
      ],
      requiredFailed: [],
      requiredPassed: [],
      additional: [],
      issues: [],
      warnings: [],
      paperwork: { loadNumber: '123' },
    })
    expect(isMalformedAiReviewSnapshotRaw(raw)).toBe(false)
    const snap = parseInvoiceAiReviewSnapshot(raw)
    expect(snap?.paperwork?.loadNumber).toBe('123')
    expect(snap?.requiredAll[0].status).toBe('ok')
  })
})
