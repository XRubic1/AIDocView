import { reviewDocumentFile } from '../../../services/documentReviewService'
import { isAiReviewConfigured } from '../../../utils/aiConfigured'
import type { DocSortFingerprint } from '../types'
import { fingerprintFromReview } from '../utils/docExtractJson'

/**
 * Full extract per file (RC, BOL, invoice, lumper) — same JSON verification uses.
 * Single signature pass for speed — packet creation is the vision pass.
 */
export async function fingerprintDocSortFile(
  file: File,
  docId: string
): Promise<DocSortFingerprint> {
  if (!isAiReviewConfigured()) {
    throw new Error(
      'AI review requires Supabase. Deploy openai-proxy with OPENAI_API_KEY.'
    )
  }

  const result = await reviewDocumentFile(file, docId, { signatureConsensusRuns: 1 })
  return fingerprintFromReview(result)
}
