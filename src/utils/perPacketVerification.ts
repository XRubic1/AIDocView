import { runCrossValidation } from '../services/crossValidationService'
import { BatchDocumentReviewResult } from '../types/documentReview'
import { CrossValidationFlag, CrossValidationResult } from '../types/documentPipeline'
import {
  bolAuditMeetsDeliveryRequirements,
  isSingleDeliveryLoad,
} from './bolAuditSanitizer'
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

/** Cross-validation for a single PDF packet (never mixed with other uploads). */
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

  return runCrossValidation({
    rateConParse,
    bolAudit: doc.extraction.bolAudit,
    reviewDocuments: [doc],
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

  const bol = doc.extraction.bolAudit
  const rateConParse = doc.extraction.rateConParse
  const singleDelivery = isSingleDeliveryLoad(rateConParse)
  const bolOk = bolAuditMeetsDeliveryRequirements(bol, rateConParse)

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
    : 'No bill of lading found to review.'

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
      ok: bolOk,
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
