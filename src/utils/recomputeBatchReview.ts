import { BatchDocumentReviewResult, DocumentReviewResult } from '../types/documentReview'
import { LoadSheetRow } from '../types/loadSheet'
import {
  extractBatchContext,
  runCrossValidation,
  runPerPacketCrossValidation,
} from '../services/crossValidationService'
import {
  autoMatchExcelRow,
  findBestExcelRow,
  matchLoadSheetToDocuments,
} from './excelLoadMatching'
import { extractBatchFields } from './extractBatchFields'
import { buildLoadAuditSummary } from './loadAuditSummary'
import {
  computeBatchOverallConfidence,
  computeDocumentReviewConfidence,
} from './reviewConfidence'
import { getPerPacketCrossValidation } from './perPacketVerification'
import { evaluateRequiredDocuments, mergeOverallStatus } from './requiredDocuments'
import { countDeliveryProofPages } from './deliveryProofPages'
import { applyFailClosedApprovalGate } from './failClosedApprovalGate'
import { reconcileCarrierNameAcrossDocuments } from './carrierOcrCorrection'
import { shouldUseCarrierOcrExcelCorrection } from './reviewRulesEngine'
import {
  buildRateConsFromBatch,
  extractInvoiceUnitsFromBatch,
  isInvoiceAcceptedForLoad,
  validateMultiInvoiceCoverage,
} from './multiInvoiceValidation'
import {
  extractBolUnitsFromBatch,
  validateMultiStopBolCoverage,
} from './multiStopBolValidation'
import { applyEffectiveRateToParse } from './effectiveRateAmount'
import { formatRateConStop } from './locationMatch'

/** Re-run cross-validation and summary after user corrects fields (no new API calls). */
export function recomputeBatchReview(
  documents: DocumentReviewResult[],
  previous: BatchDocumentReviewResult,
  excelRow?: LoadSheetRow | null,
  excelRows?: LoadSheetRow[] | null,
  excelFileName?: string | null
): BatchDocumentReviewResult {
  const reviewResults = documents
  const { rateConDoc, bolData, rateConParse: rawParse } = extractBatchContext(reviewResults)
  const bolAudit =
    bolData?.audit ??
    reviewResults.find((doc) => doc.extraction.bolAudit)?.extraction.bolAudit

  let effectiveRateConParse = rawParse
    ? applyEffectiveRateToParse(rawParse, rateConDoc)
    : rateConDoc?.extraction.rateConParse
      ? applyEffectiveRateToParse(rateConDoc.extraction.rateConParse, rateConDoc)
      : undefined

  const invoiceUnits = extractInvoiceUnitsFromBatch(reviewResults)
  const batchFieldsEarly = extractBatchFields(reviewResults)
  const sheetRowsEarly = excelRows ?? undefined
  let resolvedExcelRowEarly = excelRow ?? undefined
  if (!resolvedExcelRowEarly && sheetRowsEarly?.length) {
    resolvedExcelRowEarly = findBestExcelRow(sheetRowsEarly, batchFieldsEarly)
  }

  let carrierReconcileFlag: ReturnType<typeof reconcileCarrierNameAcrossDocuments>['flag'] | undefined
  if (shouldUseCarrierOcrExcelCorrection()) {
    const carrierReconcile = reconcileCarrierNameAcrossDocuments(
      effectiveRateConParse,
      invoiceUnits,
      resolvedExcelRowEarly?.carrier
    )
    if (carrierReconcile.parse) {
      effectiveRateConParse = carrierReconcile.parse
    }
    carrierReconcileFlag = carrierReconcile.flag
  }

  const rateConsInBatch = buildRateConsFromBatch(reviewResults).map((ref) => ({
    ...ref,
    parse: applyEffectiveRateToParse(
      ref.parse,
      reviewResults.find((doc) => doc.documentId === ref.documentId)
    ),
  }))

  const sheetRows = sheetRowsEarly
  let resolvedExcelRow = resolvedExcelRowEarly
  const batchFields = batchFieldsEarly
  const primaryLoadNumber = resolvedExcelRow?.loadNumber ?? effectiveRateConParse?.load_number
  const resolvedExcelFileName = excelFileName ?? previous.excelFileName
  const excelMatch = resolvedExcelRow
    ? matchLoadSheetToDocuments(resolvedExcelRow, batchFields, resolvedExcelFileName)
    : sheetRows?.length
      ? autoMatchExcelRow(sheetRows, batchFields, resolvedExcelFileName)
      : previous.excelMatch

  const multiInvoice = validateMultiInvoiceCoverage(
    effectiveRateConParse,
    invoiceUnits,
    resolvedExcelRow?.amount ?? batchFields.amount,
    {
      rateCons: rateConsInBatch,
      primaryLoadNumber,
      primaryRateConDocumentId: rateConDoc?.documentId,
      excelRows: sheetRows,
      excelFileName: resolvedExcelFileName,
      reviewDocuments: reviewResults,
    }
  )

  const primaryExcelFromInvoice = multiInvoice.verifications.find((v) => v.excelMatch)?.excelMatch
  const effectiveExcelMatch = primaryExcelFromInvoice ?? excelMatch
  const effectiveExcelRow = primaryExcelFromInvoice?.row ?? resolvedExcelRow

  const crossValidation = multiInvoice.multiLoadUpload
    ? runPerPacketCrossValidation({
        reviewResults,
        rateCons: rateConsInBatch,
        multiInvoice,
      })
    : runCrossValidation({
        rateConParse: effectiveRateConParse,
        bolAudit,
        reviewDocuments: reviewResults,
        invoiceAmount:
          multiInvoice.primaryInvoice?.amount_total ?? batchFields.amount,
        invoiceLoadNumber:
          multiInvoice.primaryInvoice?.load_number ?? batchFields.invoiceLoadNumber,
        invoiceBroker:
          multiInvoice.primaryInvoice?.broker_name ?? batchFields.broker,
        excelLoadNumber: effectiveExcelRow?.loadNumber,
        excelBroker: effectiveExcelRow?.broker,
        excelAmount: effectiveExcelRow?.amount,
        excelInvoiceNumber: effectiveExcelRow?.invoiceNumber,
      })

  const bolUnits = extractBolUnitsFromBatch(reviewResults)
  const multiStopBol = validateMultiStopBolCoverage(effectiveRateConParse, bolUnits)

  if (carrierReconcileFlag) {
    crossValidation.flags.push(carrierReconcileFlag)
  }

  if (
    !multiInvoice.multiLoadUpload &&
    multiStopBol.overall === 'INCOMPLETE' &&
    crossValidation.overall === 'APPROVED'
  ) {
    crossValidation.overall = 'REJECTED'
  }

  multiInvoice.flags.forEach((flag) => {
    if (!crossValidation.flags.some((f) => f.field === flag.field && f.message === flag.message)) {
      crossValidation.flags.push(flag)
    }
  })

  if (multiInvoice.primaryLoadIncomplete && crossValidation.overall === 'APPROVED') {
    const onlyReviewableGaps = multiInvoice.verifications.every(
      (v) =>
        isInvoiceAcceptedForLoad(v) ||
        v.amountExplainedByLumper ||
        (v.status === 'PARTIAL' && v.loadMatch && v.brokerMatch)
    )
    crossValidation.overall = onlyReviewableGaps ? 'NEEDS_REVIEW' : 'REJECTED'
  }

  const excelOverallWorst = multiInvoice.verifications.reduce<
    'MATCH' | 'PARTIAL' | 'MISMATCH' | undefined
  >((worst, verification) => {
    const o = verification.excelMatch?.overall
    if (!o) return worst
    if (o === 'MISMATCH') return 'MISMATCH'
    if (o === 'PARTIAL' && worst !== 'MISMATCH') return 'PARTIAL'
    if (!worst) return o
    return worst
  }, effectiveExcelMatch?.overall)

  if (excelOverallWorst === 'MISMATCH' && crossValidation.overall === 'APPROVED') {
    crossValidation.overall = 'REJECTED'
  } else if (excelOverallWorst === 'PARTIAL' && crossValidation.overall === 'APPROVED') {
    crossValidation.overall = 'NEEDS_REVIEW'
  }

  const allPageClassifications = reviewResults.flatMap(
    (doc) => doc.extraction.pageClassifications ?? []
  )
  const bolPageCount = countDeliveryProofPages(allPageClassifications)

  const requiredDocs = evaluateRequiredDocuments({
    rateConParse: effectiveRateConParse,
    bolAudit,
    bolPageCount,
    pageClassifications: allPageClassifications,
    hasExtractedInvoice: multiInvoice.invoiceCount > 0,
    hasExcelBilling: Boolean(
      excelRows?.length || previous.excelMatch || multiInvoice.verifications.some((v) => v.excelMatch)
    ),
    reviewDocuments: reviewResults,
    multiLoadUpload: multiInvoice.multiLoadUpload,
  })

  requiredDocs.flags.forEach((flag) => {
    if (!crossValidation.flags.some((f) => f.field === flag.field && f.message === flag.message)) {
      crossValidation.flags.push(flag)
    }
  })

  crossValidation.overall = mergeOverallStatus(crossValidation.overall, requiredDocs.documentGate)

  const failClosedGate = applyFailClosedApprovalGate({
    reviewDocuments: reviewResults,
    proposedOverall: crossValidation.overall,
  })
  if (failClosedGate.overall !== crossValidation.overall) {
    crossValidation.overall = failClosedGate.overall
  }
  crossValidation.failClosedInvariantFailures = failClosedGate.invariantFailures
  crossValidation.appliedRelaxationRules = failClosedGate.appliedRelaxationRules
  failClosedGate.flags.forEach((flag) => {
    if (!crossValidation.flags.some((f) => f.field === flag.field && f.message === flag.message)) {
      crossValidation.flags.push({
        level: 'WARNING',
        field: flag.field,
        message: flag.message,
      })
    }
  })

  const issues: string[] = []
  const warnings: string[] = []
  crossValidation.flags.forEach((flag) => {
    if (flag.level === 'ERROR') issues.push(flag.message)
    else if (flag.level === 'WARNING') warnings.push(flag.message)
  })

  const auditSummary = buildLoadAuditSummary({
    rateConParse: effectiveRateConParse,
    bolAudit,
    crossValidation,
    multiStopBol,
    multiInvoice,
    pageClassifications: allPageClassifications,
    bolPageCount,
    reviewCost: previous.reviewCost,
    reviewDocuments: reviewResults,
  })

  const rateConDestination =
    formatRateConStop(effectiveRateConParse?.destinations?.[0]) ??
    (typeof rateConDoc?.extraction.rateConFields?.drop?.value === 'string'
      ? rateConDoc.extraction.rateConFields.drop.value
      : undefined)

  const bolShipTo = bolData?.audit?.ship_to ?? bolData?.shipTo

  const batchDraft = {
    ...previous,
    documents: reviewResults,
    rateConDestination,
    bolShipTo,
    bolDestination: bolShipTo,
    issues,
    warnings,
    crossValidation,
    auditSummary,
    excelMatch: effectiveExcelMatch,
    excelFileName: resolvedExcelFileName,
    excelDetectedColumns: previous.excelDetectedColumns,
    multiStopBol,
    multiInvoice,
  }

  const documentsWithConfidence = reviewResults.map((doc) => ({
    ...doc,
    extraction: {
      ...doc.extraction,
      confidence: computeDocumentReviewConfidence(doc, {
        crossOverall: getPerPacketCrossValidation(doc.fileName, batchDraft)?.overall,
      }),
    },
  }))

  return {
    ...batchDraft,
    documents: documentsWithConfidence,
    overallConfidence: computeBatchOverallConfidence(
      documentsWithConfidence,
      crossValidation.overall
    ),
  }
}
