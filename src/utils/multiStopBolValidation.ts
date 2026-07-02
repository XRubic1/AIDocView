import { BolAudit, CrossValidationFlag, RateConDestination, RateConParse } from '../types/documentPipeline'
import { DocumentReviewResult } from '../types/documentReview'
import { bolAuditMeetsDeliveryRequirements } from './bolAuditSanitizer'
import { isDeliveryProofPageType } from './deliveryProofPages'
import { destinationsMatch, formatRateConStop } from './locationMatch'

export interface BolUnit {
  id: string
  sourceDocumentId: string
  fileName: string
  pageNumbers: number[]
  shipTo?: string
  bolAudit?: BolAudit
}

export type StopCoverageStatus =
  | 'COMPLETE'
  | 'MISSING_BOL'
  | 'MISSING_SIGNATURE'
  | 'ADDRESS_MISMATCH'

export interface StopCoverage {
  stopNumber: number
  destinationLabel: string
  destinationAddress: string
  matchedBol?: BolUnit
  signatureOk: boolean
  status: StopCoverageStatus
  notes?: string
}

export interface MultiStopBolResult {
  isMultiStop: boolean
  stopCount: number
  bolUnitCount: number
  stops: StopCoverage[]
  overall: 'COMPLETE' | 'INCOMPLETE'
  flags: CrossValidationFlag[]
}

/** Receiver signature + date required on each stop's BOL (§6). */
export function bolReceiverDeliveryProof(audit?: BolAudit): boolean {
  if (!audit) return false
  const receiverOk =
    audit.signatures.receiver === 'PRESENT' || audit.signatures.receiver === 'PASS_BY_RULE'
  const dateOk =
    audit.signatures.receiver_date === 'PRESENT' || audit.signatures.receiver_date === 'PASS_BY_RULE'
  return receiverOk && dateOk
}

function stopLabel(dest: RateConDestination, index: number): string {
  const parts = [dest.name, dest.city, dest.state].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : `Stop ${dest.stop_number ?? index + 1}`
}

/** Collect one BOL unit per audited page or per BOL file. */
export function extractBolUnitsFromBatch(documents: DocumentReviewResult[]): BolUnit[] {
  const units: BolUnit[] = []

  for (const doc of documents) {
    const pageAudits = doc.extraction.bolPageAudits
    if (pageAudits?.length) {
      pageAudits.forEach((entry) => {
        units.push({
          id: `${doc.documentId}-p${entry.pageNumber}`,
          sourceDocumentId: doc.documentId,
          fileName: doc.fileName,
          pageNumbers: [entry.pageNumber],
          shipTo: entry.audit.ship_to ?? entry.shipTo,
          bolAudit: entry.audit,
        })
      })
      continue
    }

    const bolPageNumbers =
      doc.extraction.pageClassifications
        ?.filter((page) => isDeliveryProofPageType(page.pageType) && !page.skipped)
        .map((page) => page.pageNumber) ?? []

    const hasBol =
      doc.extraction.documentType === 'bill_of_lading' ||
      doc.extraction.documentType === 'proof_of_delivery' ||
      doc.extraction.documentType === 'delivery_confirmation' ||
      bolPageNumbers.length > 0 ||
      Boolean(doc.extraction.bolAudit)

    if (!hasBol) continue

    units.push({
      id: doc.documentId,
      sourceDocumentId: doc.documentId,
      fileName: doc.fileName,
      pageNumbers: bolPageNumbers.length > 0 ? bolPageNumbers : [1],
      shipTo: doc.extraction.bolAudit?.ship_to ?? doc.extraction.shipTo,
      bolAudit: doc.extraction.bolAudit,
    })
  }

  return units
}

function matchScore(destinationAddress: string, bolShipTo?: string): number {
  if (!bolShipTo) return 0
  const match = destinationsMatch(destinationAddress, bolShipTo)
  if (match !== true) return 0
  const left = destinationAddress.toLowerCase()
  const right = bolShipTo.toLowerCase()
  if (left === right) return 100
  if (left.includes(right) || right.includes(left)) return 80
  return 60
}

/**
 * Rate con with multiple delivery stops requires one signed BOL per stop (AIDocView §10).
 */
export function validateMultiStopBolCoverage(
  rateConParse: RateConParse | undefined,
  bolUnits: BolUnit[]
): MultiStopBolResult {
  const destinations = rateConParse?.destinations?.filter(Boolean) ?? []
  const stopCount = destinations.length > 0 ? destinations.length : 1
  const isMultiStop = stopCount > 1
  const flags: CrossValidationFlag[] = []

  if (!isMultiStop) {
    const singleOk =
      bolUnits.length === 0 ||
      bolUnits.some((unit) => bolAuditMeetsDeliveryRequirements(unit.bolAudit, rateConParse))
    if (bolUnits.length > 0 && !singleOk) {
      flags.push({
        level: 'ERROR',
        field: 'bol_signature',
        message:
          'BOL is missing receiver signature, receiving date (multi-stop), or has blocking delivery issues.',
      })
    }
    return {
      isMultiStop: false,
      stopCount: 1,
      bolUnitCount: bolUnits.length,
      stops: [],
      overall: bolUnits.length === 0 ? 'INCOMPLETE' : singleOk ? 'COMPLETE' : 'INCOMPLETE',
      flags:
        bolUnits.length === 0
          ? [
              {
                level: 'WARNING',
                field: 'multi_stop_bol_missing',
                message: 'No bill of lading found. Delivery stop cannot be verified.',
              },
            ]
          : flags,
    }
  }

  if (bolUnits.length < stopCount) {
    flags.push({
      level: 'ERROR',
      field: 'multi_stop_bol_count',
      message: `Rate con has ${stopCount} delivery stops but only ${bolUnits.length} BOL document(s)/page(s) detected. Upload one signed BOL per stop.`,
    })
  }

  const usedUnitIds = new Set<string>()
  const stops: StopCoverage[] = destinations.map((dest, index) => {
    const stopNumber = dest.stop_number ?? index + 1
    const destinationAddress = formatRateConStop(dest) ?? stopLabel(dest, index)

    let bestUnit: BolUnit | undefined
    let bestScore = 0
    for (const unit of bolUnits) {
      if (usedUnitIds.has(unit.id)) continue
      const score = matchScore(destinationAddress, unit.shipTo)
      if (score > bestScore) {
        bestScore = score
        bestUnit = unit
      }
    }

    if (bestUnit && bestScore > 0) {
      usedUnitIds.add(bestUnit.id)
      const signatureOk = bolReceiverDeliveryProof(bestUnit.bolAudit)
      let status: StopCoverageStatus = signatureOk ? 'COMPLETE' : 'MISSING_SIGNATURE'
      let notes = `Matched BOL: ${bestUnit.fileName} (page ${bestUnit.pageNumbers.join(', ')})`

      if (!signatureOk) {
        flags.push({
          level: 'ERROR',
          field: `stop_${stopNumber}_signature`,
          message: `Stop ${stopNumber} (${stopLabel(dest, index)}): BOL found but receiver signature and/or receiving date is missing.`,
        })
      }

      return {
        stopNumber,
        destinationLabel: stopLabel(dest, index),
        destinationAddress,
        matchedBol: bestUnit,
        signatureOk,
        status,
        notes,
      }
    }

    flags.push({
      level: 'ERROR',
      field: `stop_${stopNumber}_missing_bol`,
      message: `Stop ${stopNumber} (${stopLabel(dest, index)}): no BOL found for this delivery address.`,
    })

    return {
      stopNumber,
      destinationLabel: stopLabel(dest, index),
      destinationAddress,
      signatureOk: false,
      status: 'MISSING_BOL',
      notes: 'No matching BOL in upload',
    }
  })

  const unmatchedUnits = bolUnits.filter((unit) => !usedUnitIds.has(unit.id))
  unmatchedUnits.forEach((unit) => {
    flags.push({
      level: 'WARNING',
      field: 'extra_bol',
      message: `BOL "${unit.fileName}" (page ${unit.pageNumbers.join(', ')}) does not match any rate con delivery stop.`,
    })
  })

  const overall: MultiStopBolResult['overall'] = stops.every((stop) => stop.status === 'COMPLETE')
    ? 'COMPLETE'
    : 'INCOMPLETE'

  if (overall === 'INCOMPLETE') {
    flags.push({
      level: 'ERROR',
      field: 'multi_stop_coverage',
      message: `Multi-stop load: ${stops.filter((s) => s.status === 'COMPLETE').length} of ${stopCount} stops have a signed BOL.`,
    })
  }

  return {
    isMultiStop: true,
    stopCount,
    bolUnitCount: bolUnits.length,
    stops,
    overall,
    flags,
  }
}
