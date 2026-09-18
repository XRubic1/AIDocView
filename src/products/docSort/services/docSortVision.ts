import { reviewDocumentFile, classifyDocumentFile } from '../../../services/documentReviewService'
import { isAiReviewConfigured } from '../../../utils/aiConfigured'
import type { DocSortFingerprint, DocSortKind } from '../types'
import { fingerprintFromReview, docSortKindFromExtraction } from '../utils/docExtractJson'
import type { ExtractedDocumentData } from '../../../types/documentReview'

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

/**
 * Fast page-type classify for Doc Splitter — marks RC / BOL / INV without full extract.
 */
export async function classifyDocSplitterPage(
  file: File,
  docId: string
): Promise<DocSortFingerprint> {
  if (!isAiReviewConfigured()) {
    throw new Error(
      'AI review requires Supabase. Deploy openai-proxy with OPENAI_API_KEY.'
    )
  }

  const classified = await classifyDocumentFile(file)
  const extraction: ExtractedDocumentData = {
    documentType: classified.documentType,
    hasSignature: false,
    confidence: classified.confidence,
    fieldsFound: [],
    pageClassifications: classified.pageClassifications,
    totalPagesInFile: Math.max(1, classified.pageClassifications.length),
    pagesReviewed: Math.max(1, classified.pageClassifications.length),
    notes: classified.pageClassifications
      .map((page) => page.notes)
      .filter(Boolean)
      .join('; ')
      .slice(0, 240),
  }

  // Prefer page classifications for invoice (primary type resolver skips invoice).
  const kind: DocSortKind = docSortKindFromExtraction(extraction)

  return {
    docId,
    fileName: file.name,
    kind,
    confidence: classified.confidence,
    loadNumbers: [],
    extract: extraction,
    notes: extraction.notes,
  }
}
