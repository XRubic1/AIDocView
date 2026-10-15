import { reviewResultFromFingerprint } from '../products/docSort/utils/docExtractJson'
import type { DocSortFingerprint } from '../products/docSort/types'
import type { DocumentReviewResult, ExtractedDocumentData } from '../types/documentReview'

/** Saved snapshot docs; `confidence` is missing on snapshots written before it was persisted. */
type CatalogDoc = Pick<
  DocSortFingerprint,
  'docId' | 'fileName' | 'kind' | 'loadNumbers' | 'broker' | 'extract'
> & { confidence?: number }

/** BOL / support files are attached without a field read. Keep them on the packet. */
function unextractedAttachment(saved: CatalogDoc): ExtractedDocumentData | null {
  if (saved.kind !== 'bill_of_lading' && saved.kind !== 'lumper' && saved.kind !== 'other') {
    return null
  }
  return {
    documentType:
      saved.kind === 'bill_of_lading' ? 'bill_of_lading' : saved.kind === 'lumper' ? 'lumper' : 'other',
    hasSignature: false,
    confidence: saved.confidence ?? 0.5,
    fieldsFound: [],
    notes: 'Attached with the rate con. Fields were not read.',
  }
}

/**
 * Review rows from saved extracts. A BOL binder with no extract does not
 * discard the rate con extract on the same packet.
 */
export function packetReviewsFromCatalog(
  docIds: string[],
  catalog: Map<string, CatalogDoc>
): DocumentReviewResult[] | null {
  if (docIds.length === 0) return null

  const reviews: DocumentReviewResult[] = []
  let hasRateConExtract = false

  for (const docId of docIds) {
    const saved = catalog.get(docId)
    if (!saved) return null
    const extract = saved.extract ?? unextractedAttachment(saved)
    if (!extract) return null
    if (
      saved.extract &&
      (saved.kind === 'rate_confirmation' ||
        saved.extract.documentType === 'rate_confirmation' ||
        saved.extract.rateConParse)
    ) {
      hasRateConExtract = true
    }
    const rebuilt = reviewResultFromFingerprint({
      docId,
      fileName: saved.fileName || docId,
      kind: saved.kind,
      confidence: saved.confidence ?? 0.9,
      loadNumbers: saved.loadNumbers ?? [],
      broker: saved.broker,
      extract,
    })
    if (!rebuilt) return null
    reviews.push(rebuilt)
  }

  if (!hasRateConExtract) return null
  return reviews
}
