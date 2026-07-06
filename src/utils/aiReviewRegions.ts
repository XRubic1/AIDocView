import { BolAudit } from '../types/documentPipeline'
import { DocumentReviewResult, FieldRegionBox } from '../types/documentReview'
import { RATE_CON_FIELD_LABELS, RateConFieldKey } from '../config/rateConRules'
import {
  localizationToRegion,
  remapBolAuditSignatureLocalizations,
} from './bolSignatureVerification'
import { isDeliveryProofPageType } from './deliveryProofPages'
import { remapRegionToPacketPage } from './fieldRegionMapping'

export interface AiReviewRegion {
  id: string
  label: string
  region: FieldRegionBox
  description?: string
  kind: 'rate_con' | 'bol_signature'
}

const SIGNATURE_REGION_KEYS = [
  ['receiver_localization', 'bol_receiverSignature', 'BOL Receiver signature'],
  ['shipper_localization', 'bol_shipper_signature', 'BOL Shipper signature'],
  ['carrier_localization', 'bol_carrier_signature', 'BOL Carrier signature'],
] as const

function remapRegionForDisplay(
  region: FieldRegionBox,
  packetPageNumbers: number[]
): FieldRegionBox {
  const defaultPage = packetPageNumbers[0] ?? region.pageNumber
  return remapRegionToPacketPage(region, packetPageNumbers, defaultPage) ?? region
}

function addBolAuditRegions(
  regions: AiReviewRegion[],
  audit: BolAudit | undefined,
  packetPageNumbers: number[],
  seen: Set<string>
): void {
  if (!audit?.signatures || packetPageNumbers.length === 0) return

  const normalized = remapBolAuditSignatureLocalizations(
    audit,
    packetPageNumbers.map((pageNumber) => ({ pageNumber }))
  )

  for (const [localizationKey, id, label] of SIGNATURE_REGION_KEYS) {
    if (seen.has(id)) continue
    const localization = normalized.signatures[localizationKey]
    if (!localization) continue

    seen.add(id)
    regions.push({
      id,
      label,
      region: remapRegionForDisplay(localizationToRegion(localization), packetPageNumbers),
      description: localization.description,
      kind: 'bol_signature',
    })
  }
}

function deliveryProofPageNumbers(result: DocumentReviewResult): number[] {
  return (result.extraction.pageClassifications ?? [])
    .filter((page) => isDeliveryProofPageType(page.pageType) && !page.skipped)
    .map((page) => page.pageNumber)
}

/** All AI-suggested source boxes for a reviewed document (rate con + BOL signatures). */
export function getAiReviewRegions(result: DocumentReviewResult): AiReviewRegion[] {
  const regions: AiReviewRegion[] = []
  const seen = new Set<string>()
  const { extraction } = result
  const allReviewImages = result.debugLog.images ?? [result.debugLog.image]
  const deliveryPages = deliveryProofPageNumbers(result)

  if (extraction.rateConFields) {
    ;(Object.keys(RATE_CON_FIELD_LABELS) as RateConFieldKey[]).forEach((key) => {
      const field = extraction.rateConFields?.[key]
      if (!field?.sourceRegion) return

      const packetPages = allReviewImages.map((image) => image.pageNumber)
      regions.push({
        id: key,
        label: RATE_CON_FIELD_LABELS[key],
        region: remapRegionForDisplay(field.sourceRegion, packetPages),
        description: field.reasoning?.trim() || field.labelHint?.trim() || undefined,
        kind: 'rate_con',
      })
      seen.add(key)
    })
  }

  for (const entry of extraction.bolPageAudits ?? []) {
    addBolAuditRegions(regions, entry.audit, [entry.pageNumber], seen)
  }

  if (extraction.bolAudit) {
    addBolAuditRegions(regions, extraction.bolAudit, deliveryPages, seen)
  }

  return regions
}

/** Map for FieldRegionSelector / training UI (key → normalized box). */
export function getAiFieldRegions(result: DocumentReviewResult): Record<string, FieldRegionBox> {
  const map: Record<string, FieldRegionBox> = {}
  getAiReviewRegions(result).forEach((entry) => {
    map[entry.id] = entry.region
  })
  return map
}

export function getAiReviewRegionsForPage(
  result: DocumentReviewResult,
  pageNumber: number
): AiReviewRegion[] {
  return getAiReviewRegions(result).filter((entry) => entry.region.pageNumber === pageNumber)
}
