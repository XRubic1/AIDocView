import { extractBatchContext, runCrossValidation } from '../services/crossValidationService'
import { BatchDocumentReviewResult } from '../types/documentReview'
import { CrossValidationFlag, CrossValidationResult } from '../types/documentPipeline'
import {
  bolAuditMeetsDeliveryRequirements,
  isSingleDeliveryLoad,
} from './bolAuditSanitizer'
import { documentHasBolEvidence } from './requiredDocuments'
import { CHECK_LABELS, humanizeReviewMessage } from './reviewMessages'

export interface VerificationCheckRow {
  label: string
  ok: boolean
  detail?: string
}

function checkOk(status: string): boolean {
  return (
    status === 'MATCH' ||
    status === 'CONFIRMED' ||
    status === 'COMPLETE' ||
    status === 'OVERAGE_EXPLAINED' ||
    status === 'EXPLAINED_BY_LUMPER'
  )
}

/** Cross-validation for one primary PDF; sibling BOL attachments count in single-packet mode. */
export function getPerPacketCrossValidation(
  fileName: string,
  batchResult: BatchDocumentReviewResult
): CrossValidationResult | null {
  const doc = batchResult.documents.find((d) => d.fileName === fileName)
  if (!doc) return null

  const verification = batchResult.multiInvoice?.verifications.find(
    (v) => v.unit.fileName === fileName
  )

  const rateConParse = doc.extraction.rateConParse
  if (!rateConParse && verification?.role === 'unrelated') {
    return batchResult.crossValidation ?? null
  }

  const multiLoad = batchResult.multiInvoice?.multiLoadUpload === true
  let bolAudit = doc.extraction.bolAudit
  let reviewDocuments = [doc]

  // Single Credyx packet: RC PDF may not contain the BOL — use sibling attachments.
  if (!multiLoad && !documentHasBolEvidence(doc.extraction)) {
    const { bolData } = extractBatchContext(batchResult.documents)
    if (bolData) {
      bolAudit = bolData.audit ?? bolAudit
      const bolDoc = batchResult.documents.find((d) => d.fileName === bolData.fileName)
      reviewDocuments = bolDoc ? [doc, bolDoc] : [...batchResult.documents]
    } else if (batchResult.documents.length > 1) {
      reviewDocuments = [...batchResult.documents]
    }
  }

  return runCrossValidation({
    rateConParse,
    bolAudit,
    reviewDocuments,
    invoiceAmount: verification?.unit.invoice.amount_total,
    invoiceLoadNumber: verification?.unit.invoice.load_number,
    invoiceBroker: verification?.unit.invoice.broker_name,
    excelLoadNumber: verification?.excelMatch?.row.loadNumber,
    excelBroker: verification?.excelMatch?.row.broker,
    excelAmount: verification?.excelMatch?.row.amount,
    excelInvoiceNumber: verification?.excelMatch?.row.invoiceNumber,
  })
}

/** Six verification rows + error messages for one invoice PDF. */
export function buildPerInvoiceVerificationChecks(
  fileName: string,
  batchResult: BatchDocumentReviewResult
): { rows: VerificationCheckRow[]; errors: CrossValidationFlag[] } {
  const doc = batchResult.documents.find((d) => d.fileName === fileName)
  const cross = getPerPacketCrossValidation(fileName, batchResult)

  if (!doc || !cross) {
    return { rows: [], errors: [] }
  }

  const multiLoad = batchResult.multiInvoice?.multiLoadUpload === true
  const packetBol = extractBatchContext(batchResult.documents).bolData
  const bol = doc.extraction.bolAudit ?? (!multiLoad ? packetBol?.audit : undefined)
  const rateConParse = doc.extraction.rateConParse
  const singleDelivery = isSingleDeliveryLoad(rateConParse)
  const bolOk = bolAuditMeetsDeliveryRequirements(bol, rateConParse)
  const bolPresent =
    documentHasBolEvidence(doc.extraction) ||
    (!multiLoad &&
      batchResult.documents.some((d) => documentHasBolEvidence(d.extraction)))

  const receiverOk =
    bol?.signatures.receiver === 'PRESENT' || bol?.signatures.receiver === 'PASS_BY_RULE'

  const bolDetail = bol
    ? bolOk
      ? singleDelivery
        ? 'Delivery address matches; receiver signed.'
        : 'Delivery address matches; receiver signed.'
      : [
          bol.destination_match === 'PASS'
            ? undefined
            : 'Delivery address does not match the rate confirmation.',
          receiverOk ? undefined : 'Receiver signature is missing or unclear.',
        ]
          .filter(Boolean)
          .join(' ')
    : bolPresent
      ? 'BOL present on packet — audit incomplete.'
      : multiLoad
        ? 'No bill of lading found in this PDF.'
        : 'No bill of lading found on this packet.'

  const rows: VerificationCheckRow[] = [
    {
      label: CHECK_LABELS.loadNumber,
      ok: checkOk(cross.load_number.status),
      detail: humanizeReviewMessage(cross.load_number.details),
    },
    {
      label: CHECK_LABELS.broker,
      ok: checkOk(cross.broker.status),
      detail: humanizeReviewMessage(cross.broker.details),
    },
    {
      label: CHECK_LABELS.amount,
      ok: checkOk(cross.amount.status),
      detail: humanizeReviewMessage(cross.amount.details),
    },
    {
      label: CHECK_LABELS.bol,
      ok: bolPresent && bolOk,
      detail: bolDetail,
    },
    {
      label: CHECK_LABELS.multiStop,
      ok: checkOk(cross.multi_stop_coverage.status),
      detail: humanizeReviewMessage(cross.multi_stop_coverage.details ?? ''),
    },
    {
      label: CHECK_LABELS.carrier,
      ok: checkOk(cross.carrier.status),
      detail: humanizeReviewMessage(cross.carrier.details),
    },
  ]

  const errors = cross.flags
    .filter((f) => f.level === 'ERROR')
    .map((f) => ({ ...f, message: humanizeReviewMessage(f.message) }))

  return { rows, errors }
}
