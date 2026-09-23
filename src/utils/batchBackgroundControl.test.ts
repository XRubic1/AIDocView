import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../data/mockBatches', () => ({
  getBatchById: vi.fn(),
  updateBatch: vi.fn(),
}))

vi.mock('../services/supabase/tenantDataLiveSync', () => ({
  notifyTenantDataUpdated: vi.fn(),
}))

vi.mock('./docSplitterAutoPipeline', () => ({
  abortDocSplitPipeline: vi.fn(() => true),
  unlockBatchAfterDocSplit: vi.fn(),
}))

vi.mock('../services/credyx/batchBackgroundPipeline', () => ({
  clearBackgroundPipelineInflight: vi.fn(),
}))

vi.mock('../services/batchReworkService', () => ({
  markBatchNeedsRework: vi.fn(async () => {}),
}))

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: () => false,
  getSupabase: () => null,
}))

import { getBatchById } from '../data/mockBatches'
import {
  abortBackgroundPipeline,
  beginBackgroundPipelineAbort,
  stopAllBatchBackgroundWork,
} from './batchBackgroundControl'
import { abortDocSplitPipeline } from './docSplitterAutoPipeline'
import { markBatchNeedsRework } from '../services/batchReworkService'

describe('batchBackgroundControl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getBatchById).mockReturnValue({
      id: 'b1',
      batch_number: 'B-1',
      client_id: 'c1',
      client_name: 'Carrier',
      in_use: true,
      in_use_by: 'AI Doc Split',
    } as never)
  })

  it('aborts registered background signal', () => {
    const signal = beginBackgroundPipelineAbort('b1')
    expect(signal.aborted).toBe(false)
    expect(abortBackgroundPipeline('b1')).toBe(true)
    expect(signal.aborted).toBe(true)
    expect(abortBackgroundPipeline('b1')).toBe(false)
  })

  it('stopAll with rework aborts Doc Split and marks rework', async () => {
    beginBackgroundPipelineAbort('b1')
    await stopAllBatchBackgroundWork('b1', {
      outcome: 'rework',
      reason: 'boom',
    })
    expect(abortDocSplitPipeline).toHaveBeenCalledWith('b1')
    expect(markBatchNeedsRework).toHaveBeenCalledWith(
      'b1',
      'boom',
      expect.objectContaining({ skipStop: true })
    )
  })
})
