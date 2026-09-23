/**
 * Unit tests for Doc Split auto pipeline helpers (INV exclusion, already-split skip,
 * status routing, override cancel registry).
 */
import { describe, expect, it } from 'vitest'
import type { BatchIntakeDraft } from '../types/credyxBatch'
import type { DocSortKind } from '../products/docSort/types'
import {
  isInvoiceExcludedFromDocSplitPackets,
  shouldExtractForDocSplitPackets,
  shouldSkipExplodeParent,
  markCategoryForKind,
} from './docSplitterExplode'
import {
  abortDocSplitPipeline,
  batchShouldRunDocSplitPipeline,
  isDocSplitPipelineRunning,
  __testRegisterDocSplitAbort,
} from './docSplitterAutoPipeline'

function emptyDraft(overrides?: Partial<BatchIntakeDraft>): BatchIntakeDraft {
  return {
    batchNumber: 'B-1',
    sortResult: {
      sortedAt: new Date().toISOString(),
      groups: [],
      unmatchedRateCons: [],
      unmatchedBols: [],
      otherDocuments: [],
      totalDocuments: 0,
    },
    invoices: [],
    unmatched: { rateCons: [], bols: [], other: [] },
    fileById: new Map(),
    ...overrides,
  }
}

describe('docSplitterExplode INV / extract policy', () => {
  it('excludes invoice kind from packet extract/match', () => {
    expect(isInvoiceExcludedFromDocSplitPackets('invoice')).toBe(true)
    expect(shouldExtractForDocSplitPackets('invoice')).toBe(false)
    expect(markCategoryForKind('invoice')).toBe('inv')
  })

  it('extracts only RC and BOL', () => {
    const kinds: DocSortKind[] = [
      'rate_confirmation',
      'bill_of_lading',
      'invoice',
      'other',
      'lumper',
    ]
    const extractable = kinds.filter(shouldExtractForDocSplitPackets)
    expect(extractable).toEqual(['rate_confirmation', 'bill_of_lading'])
  })

  it('skips explode when page-split children already exist', () => {
    const draft = emptyDraft({
      unmatched: {
        rateCons: [],
        bols: [],
        other: [
          {
            docId: 'page-split-1',
            fileName: 'combined-p1.pdf',
            kind: 'other',
            confidence: 1,
            loadNumbers: [],
          },
          {
            docId: 'page-split-2',
            fileName: 'combined-p2.pdf',
            kind: 'other',
            confidence: 1,
            loadNumbers: [],
          },
        ],
      },
    })
    expect(shouldSkipExplodeParent(draft, 'combined.pdf')).toBe(true)
    expect(shouldSkipExplodeParent(draft, 'combined-p1.pdf')).toBe(true)
    expect(shouldSkipExplodeParent(draft, 'other.pdf')).toBe(false)
  })
})

describe('batchShouldRunDocSplitPipeline', () => {
  it('returns true for needs_split / mid-flight / sticky flag', () => {
    expect(batchShouldRunDocSplitPipeline({ status: 'needs_split' })).toBe(true)
    expect(batchShouldRunDocSplitPipeline({ status: 'ai_splitting' })).toBe(true)
    expect(batchShouldRunDocSplitPipeline({ status: 'creating_packets' })).toBe(true)
    expect(batchShouldRunDocSplitPipeline({ needs_doc_split: true })).toBe(true)
    expect(batchShouldRunDocSplitPipeline({ status: 'ready_to_post' })).toBe(false)
  })
})

describe('abortDocSplitPipeline override cancel', () => {
  it('abort returns false when nothing is registered', () => {
    expect(abortDocSplitPipeline('missing-batch')).toBe(false)
    expect(isDocSplitPipelineRunning('missing-batch')).toBe(false)
  })

  it('abort cancels a registered controller and clears the registry', () => {
    const controller = __testRegisterDocSplitAbort('batch-override-1')
    expect(isDocSplitPipelineRunning('batch-override-1')).toBe(true)
    expect(abortDocSplitPipeline('batch-override-1')).toBe(true)
    expect(controller.signal.aborted).toBe(true)
    expect(isDocSplitPipelineRunning('batch-override-1')).toBe(false)
    expect(abortDocSplitPipeline('batch-override-1')).toBe(false)
  })
})
