import { RATE_CON_FIELD_LABELS, RateConFieldKey } from '../config/rateConRules'
import { DocumentReviewResult, FieldRegionBox } from '../types/documentReview'

/** All fields the user can mark with a bounding box. */
export const BOL_FIELD_LABELS: Record<string, string> = {
  bol_shipFrom: 'BOL Ship From',
  bol_shipTo: 'BOL Ship To',
  bol_receiverSignature: 'BOL Receiver signature',
  bol_shipper_signature: 'BOL Shipper signature',
  bol_carrier_signature: 'BOL Carrier signature',
  bol_receivingDate: 'BOL Receiving date',
  bol_loadNumber: 'BOL Load number',
}

export const ANNOTATABLE_FIELD_LABELS: Record<string, string> = {
  ...RATE_CON_FIELD_LABELS,
  ...BOL_FIELD_LABELS,
}

export interface AnnotatableField {
  key: string
  label: string
  sourcePage?: number
  aiValue?: string | number | boolean
  confidence?: number
  labelHint?: string
  reasoning?: string
  group: 'rate_con' | 'bol'
}

/** Build a short explanation of why the AI chose a field value. */
export function getFieldAiExplanation(field: AnnotatableField): string {
  if (field.reasoning?.trim()) return field.reasoning.trim()

  const parts: string[] = []
  if (field.labelHint?.trim()) parts.push(field.labelHint.trim())
  if (field.sourcePage) parts.push(`Found on page ${field.sourcePage}`)
  if (field.confidence !== undefined) {
    parts.push(`${Math.round(field.confidence * 100)}% confidence`)
  }

  if (parts.length > 0) return parts.join(' · ')
  return 'No explanation from the AI yet — re-run review or use Read boxed area after marking a region.'
}

/** Collect rate con + BOL fields shown in the training UI. */
export function getAnnotatableFields(result: DocumentReviewResult): AnnotatableField[] {
  const fields: AnnotatableField[] = []
  const { extraction } = result

  if (extraction.rateConFields) {
    ;(Object.keys(RATE_CON_FIELD_LABELS) as RateConFieldKey[]).forEach((key) => {
      const field = extraction.rateConFields?.[key]
      fields.push({
        key,
        label: RATE_CON_FIELD_LABELS[key],
        sourcePage: field?.sourcePage,
        aiValue: field?.value,
        confidence: field?.confidence,
        labelHint: field?.labelHint,
        reasoning: field?.reasoning,
        group: 'rate_con',
      })
    })
  }

  const bolPage =
    extraction.pageClassifications?.find((p) => p.pageType === 'bill_of_lading')?.pageNumber ??
    extraction.pageLegibility?.[0]?.pageNumber ??
    1

  const isBol =
    extraction.documentType === 'bill_of_lading' ||
    extraction.pageClassifications?.some((p) => p.pageType === 'bill_of_lading')

  if (isBol) {
    const bolKeys = [
      'bol_shipFrom',
      'bol_shipTo',
      'bol_receiverSignature',
      'bol_receivingDate',
      'bol_loadNumber',
    ] as const

    const bolValues: Record<(typeof bolKeys)[number], string | number | boolean | undefined> = {
      bol_shipFrom: extraction.shipFrom ?? extraction.origin,
      bol_shipTo: extraction.shipTo ?? extraction.destination,
      bol_receiverSignature: extraction.hasReceiverSignature ? 'Yes' : 'No',
      bol_receivingDate: extraction.receivingDate,
      bol_loadNumber: extraction.loadNumber,
    }

    bolKeys.forEach((key) => {
      const meta = extraction.bolFieldMeta?.[key]
      let reasoning = meta?.reasoning

      if (!reasoning && key === 'bol_receiverSignature' && extraction.signatureNotes?.trim()) {
        reasoning = extraction.signatureNotes.trim()
      }

      fields.push({
        key,
        label: BOL_FIELD_LABELS[key],
        sourcePage: meta?.sourcePage ?? bolPage,
        aiValue: bolValues[key],
        confidence: meta?.confidence ?? extraction.confidence,
        labelHint: meta?.labelHint,
        reasoning,
        group: 'bol',
      })
    })
  }

  return fields
}

export function getFieldLabel(fieldKey: string): string {
  return ANNOTATABLE_FIELD_LABELS[fieldKey] ?? fieldKey
}

export { getAiFieldRegions } from './aiReviewRegions'

/** Map UI field key to rate con key when updating structured extraction. */
export function isRateConFieldKey(key: string): key is RateConFieldKey {
  return key in RATE_CON_FIELD_LABELS
}
