import { PageDocumentType } from '../types/documentReview'
import { PipelineDocType } from '../types/documentPipeline'

/** Map Prompt 1 doc_type to internal page classification type. */
export function pipelineDocTypeToPageType(docType: string): PageDocumentType {
  const normalized = docType.toUpperCase().replace(/\s+/g, '_')
  const map: Record<string, PageDocumentType> = {
    RATE_CON: 'rate_confirmation',
    BOL: 'bill_of_lading',
    STAMPED_BOL: 'bill_of_lading',
    INVOICE: 'invoice',
    POD: 'proof_of_delivery',
    LUMPER_RECEIPT: 'lumper',
    SCALE_TICKET: 'other',
    DELIVERY_CONFIRMATION: 'other',
    TRAILER_CONTROL_RECORD: 'other',
    BLANK: 'blank',
    UNKNOWN: 'other',
  }
  return map[normalized] ?? 'other'
}

export function pageTypeToPipelineLabel(pageType: PageDocumentType): PipelineDocType | string {
  const map: Partial<Record<PageDocumentType, PipelineDocType>> = {
    rate_confirmation: 'RATE_CON',
    bill_of_lading: 'BOL',
    invoice: 'INVOICE',
    proof_of_delivery: 'POD',
    lumper: 'LUMPER_RECEIPT',
    blank: 'BLANK',
    other: 'UNKNOWN',
  }
  return map[pageType] ?? 'UNKNOWN'
}
