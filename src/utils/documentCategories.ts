import { DocumentType } from '../types/documentReview'

export type DocumentCategory = DocumentType

export const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  'rate_confirmation',
  'bill_of_lading',
  'proof_of_delivery',
  'delivery_confirmation',
  'lumper',
  'other',
]

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  rate_confirmation: 'Rate Confirmation',
  bill_of_lading: 'Bill of Lading',
  proof_of_delivery: 'Proof of Delivery',
  delivery_confirmation: 'Delivery Confirmation',
  lumper: 'Lumper Receipt',
  other: 'Other / Unknown',
}

export const DOCUMENT_CATEGORY_COLORS: Record<DocumentCategory, { bg: string; text: string }> = {
  rate_confirmation: { bg: '#E8F0F2', text: '#113543' },
  bill_of_lading: { bg: '#E8F5E9', text: '#2E7D32' },
  proof_of_delivery: { bg: '#E3F2FD', text: '#1565C0' },
  delivery_confirmation: { bg: '#E8EAF6', text: '#3949AB' },
  lumper: { bg: '#FFF8E1', text: '#B8860B' },
  other: { bg: '#F3F4F6', text: '#6B7280' },
}

export function getCategoryLabel(category: DocumentCategory): string {
  return DOCUMENT_CATEGORY_LABELS[category] ?? 'Unknown'
}

export function normalizeAiDocumentType(value: string): DocumentCategory {
  if (value === 'lumper') return 'lumper'
  if (value === 'rate_confirmation') return 'rate_confirmation'
  if (value === 'bill_of_lading') return 'bill_of_lading'
  if (value === 'proof_of_delivery') return 'proof_of_delivery'
  if (value === 'delivery_confirmation') return 'delivery_confirmation'
  return 'other'
}
