import { PageDocumentType } from '../types/documentReview'
import { PipelineDocType } from '../types/documentPipeline'

/** Human-readable labels for all Phase 1 document types (Section 1). */
export const PIPELINE_DOC_LABELS: Record<PipelineDocType, string> = {
  RATE_CON: 'Rate Confirmation',
  BOL: 'Bill of Lading',
  INVOICE: 'Invoice',
  POD: 'Proof of Delivery',
  LUMPER_RECEIPT: 'Lumper Receipt',
  SCALE_TICKET: 'Scale Ticket',
  DELIVERY_CONFIRMATION: 'Delivery Confirmation',
  TRAILER_CONTROL_RECORD: 'Trailer Control Record',
  STAMPED_BOL: 'Stamped BOL',
  BLANK: 'Blank Page',
  UNKNOWN: 'Unknown',
}

export const PAGE_TYPE_LABELS: Record<PageDocumentType, string> = {
  rate_confirmation: 'Rate Con',
  bill_of_lading: 'BOL',
  proof_of_delivery: 'POD',
  lumper: 'Lumper',
  invoice: 'Invoice',
  blank: 'Blank',
  other: 'Other / Unknown',
}

export function getPipelineDocLabel(docType: string): string {
  const key = docType.toUpperCase().replace(/\s+/g, '_') as PipelineDocType
  return PIPELINE_DOC_LABELS[key] ?? docType
}
