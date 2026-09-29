import { describe, expect, it, vi } from 'vitest'
import { getClientBatchAiProgress } from './clientBatchAiProgress'
import { estimateBatchProcessingEta, formatDurationMinutes } from './batchProcessingEta'
import { markPacketCreationQueued } from './packetCreationQueue'

describe('getClientBatchAiProgress', () => {
  it('hides progress for manual batches', () => {
    const result = getClientBatchAiProgress({
      uploadMode: 'manual',
      sortStatus: 'ready',
      invoices: [{ ai_review_status: 'not_run' }],
    })
    expect(result.show).toBe(false)
    expect(result.phase).toBe('idle')
  })

  it('shows processing when job is pending', () => {
    const result = getClientBatchAiProgress({
      uploadMode: 'ai',
      sortStatus: 'ready',
      invoices: [
        { ai_review_status: 'not_run' },
        { ai_review_status: 'ready' },
      ],
      job: {
        id: 'j1',
        batch_id: 'b1',
        status: 'pending',
      },
    })
    expect(result.phase).toBe('processing')
    expect(result.show).toBe(true)
    expect(result.completed).toBe(1)
    expect(result.total).toBe(2)
    expect(result.detail).toBe('Checked 1 of 2 loads')
    expect(result.etaShortLabel).toBeTruthy()
  })

  it('shows done when job succeeded', () => {
    const result = getClientBatchAiProgress({
      uploadMode: 'ai',
      sortStatus: 'ready',
      invoices: [
        { ai_review_status: 'ready' },
        { ai_review_status: 'needs_work' },
      ],
      job: {
        id: 'j1',
        batch_id: 'b1',
        status: 'succeeded',
      },
    })
    expect(result.phase).toBe('done')
    expect(result.label).toBe('Invoices ready to review')
    expect(result.percent).toBe(100)
  })

  it('shows processing when job failed so carriers never see Rework', () => {
    const result = getClientBatchAiProgress({
      uploadMode: 'ai',
      sortStatus: 'ready',
      invoices: [{ ai_review_status: 'not_run' }],
      job: {
        id: 'j1',
        batch_id: 'b1',
        status: 'failed',
        last_error: 'timeout',
      },
    })
    expect(result.phase).toBe('processing')
    expect(result.label).toBe('Processing…')
    expect(result.detail).toContain('Credyx is finishing')
  })

  it('shows processing for rework batch status', () => {
    const result = getClientBatchAiProgress({
      uploadMode: 'handoff',
      batchStatus: 'rework',
      sortStatus: 'failed',
      invoices: [],
    })
    expect(result.phase).toBe('processing')
    expect(result.label).toBe('Processing…')
    expect(result.show).toBe(true)
  })

  it('uses optimistic processing right after submit', () => {
    const result = getClientBatchAiProgress({
      uploadMode: 'ai',
      sortStatus: 'ready',
      invoices: [{ ai_review_status: 'not_run' }],
      optimisticProcessing: true,
    })
    expect(result.phase).toBe('processing')
    expect(result.show).toBe(true)
  })

  it('shows processing for managed handoff jobs', () => {
    const result = getClientBatchAiProgress({
      uploadMode: 'handoff',
      sortStatus: 'ready',
      invoices: [{ ai_review_status: 'not_run' }],
      job: {
        id: 'j1',
        batch_id: 'b1',
        status: 'running',
      },
    })
    expect(result.phase).toBe('processing')
    expect(result.show).toBe(true)
  })

  it('shows done when every invoice finished even if job still pending', () => {
    const result = getClientBatchAiProgress({
      uploadMode: 'ai',
      sortStatus: 'sorting',
      invoices: [
        { ai_review_status: 'ready' },
        { ai_review_status: 'needs_work' },
        { ai_review_status: 'needs_work' },
      ],
      job: {
        id: 'j1',
        batch_id: 'b1',
        status: 'pending',
      },
    })
    expect(result.phase).toBe('done')
    expect(result.percent).toBe(100)
    expect(result.show).toBe(true)
  })

  it('shows done when job succeeded even with stale sorting flag', () => {
    const result = getClientBatchAiProgress({
      uploadMode: 'ai',
      sortStatus: 'sorting',
      invoices: [
        { ai_review_status: 'ready' },
        { ai_review_status: 'running' },
      ],
      job: {
        id: 'j1',
        batch_id: 'b1',
        status: 'succeeded',
      },
    })
    expect(result.phase).toBe('done')
  })

  it('shows waiting in line while another batch is being created', () => {
    const mem = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => mem.get(key) ?? null,
      setItem: (key: string, value: string) => {
        mem.set(key, value)
      },
      removeItem: (key: string) => {
        mem.delete(key)
      },
    })
    markPacketCreationQueued('batch-q', true)
    const result = getClientBatchAiProgress({
      batchId: 'batch-q',
      uploadMode: 'handoff',
      batchStatus: 'creating',
      sortStatus: 'sorting',
      invoices: [],
      job: {
        id: 'j-q',
        batch_id: 'batch-q',
        status: 'pending',
        kind: 'sort_and_verify',
      },
    })
    expect(result.label).toBe('Waiting in line')
    expect(result.detail).toContain('Another batch is being created')
    markPacketCreationQueued('batch-q', false)
    vi.unstubAllGlobals()
  })
})

describe('estimateBatchProcessingEta', () => {
  it('formats duration labels', () => {
    expect(formatDurationMinutes(60)).toBe('about 1 minute')
    expect(formatDurationMinutes(180)).toBe('about 3 minutes')
  })

  it('estimates 16 packets at more than 20 minutes', () => {
    const eta = estimateBatchProcessingEta({
      fileCount: 16,
      invoiceTotal: 16,
      phase: 'processing',
      startedAt: new Date().toISOString(),
    })
    expect(eta).not.toBeNull()
    expect(eta!.remainingSeconds).toBeGreaterThan(20 * 60)
    expect(eta!.remainingSeconds).toBeLessThan(45 * 60)
    expect(eta!.label).toMatch(/about \d+ minutes/)
    expect(eta!.shortLabel).toMatch(/min left/)
  })
})

describe('AI creation timeout', () => {
  it('never marks a batch timed out', async () => {
    const { isBatchAiCreationTimedOut, getBatchAiCreationTimeoutAt } = await import(
      './batchProcessingEta'
    )
    const startedAt = new Date(Date.now() - 3 * 60 * 60_000).toISOString()
    expect(getBatchAiCreationTimeoutAt({ startedAt, fileCount: 4 })).toBeNull()
    expect(
      isBatchAiCreationTimedOut(
        { startedAt, fileCount: 16, invoiceTotal: 0 },
        Date.now()
      )
    ).toBe(false)
  })
})
