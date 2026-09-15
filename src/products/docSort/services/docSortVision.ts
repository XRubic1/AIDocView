import { reviewDocumentFile } from '../../../services/documentReviewService'
import { isAiReviewConfigured } from '../../../utils/aiConfigured'
import type { DocSortFingerprint } from '../types'
import { fingerprintFromReview } from '../utils/docExtractJson'

/**
 * Full extract per file (RC, BOL, invoice, lumper) — same JSON verification uses.
 * Replaces the thin 4-page classify pass so load / rate / lane are read correctly.
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

  const result = await reviewDocumentFile(file, docId)
  return fingerprintFromReview(result)
}
