import { describe, expect, it } from 'vitest'
import { getClientBatchAiProgress } from './clientBatchAiProgress'
import { estimateBatchProcessingEta, formatDurationMinutes } from './batchProcessingEta'

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
})

describe('estimateBatchProcessingEta', () => {
  it('formats duration labels', () => {
    expect(formatDurationMinutes(60)).toBe('about 1 minute')
    expect(formatDurationMinutes(180)).toBe('about 3 minutes')
  })

  it('estimates from file count', () => {
    const eta = estimateBatchProcessingEta({
      fileCount: 4,
      phase: 'processing',
      startedAt: new Date().toISOString(),
    })
    expect(eta).not.toBeNull()
    expect(eta!.remainingSeconds).toBeGreaterThan(40)
    expect(eta!.remainingSeconds).toBeLessThan(10 * 60)
    expect(eta!.shortLabel).toMatch(/min left/)
  })
})

describe('AI creation timeout', () => {
  it('is not timed out before ETA + grace', async () => {
    const { isBatchAiCreationTimedOut, AI_CREATION_TIMEOUT_GRACE_MS } = await import(
      './batchProcessingEta'
    )
    const startedAt = new Date().toISOString()
    expect(
      isBatchAiCreationTimedOut({
        startedAt,
        fileCount: 4,
        invoiceTotal: 0,
      })
    ).toBe(false)
    const started = Date.parse(startedAt)
    // Just after start — still within window.
    expect(
      isBatchAiCreationTimedOut(
        { startedAt, fileCount: 4 },
        started + 60_000
      )
    ).toBe(false)
    // Far past ETA + grace.
    expect(
      isBatchAiCreationTimedOut(
        { startedAt, fileCount: 4 },
        started + 60 * 60_000 + AI_CREATION_TIMEOUT_GRACE_MS
      )
    ).toBe(true)
  })
})
