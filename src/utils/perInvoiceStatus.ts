import { BatchDocumentReviewResult, DocumentReviewResult } from '../types/documentReview'
import { CrossValidationFlag } from '../types/documentPipeline'
import {
  bolAuditMeetsDeliveryRequirements,
  getBolFailureReasons,
  isPickupSignatureMessage,
  isPositiveBolAuditSnippet,
} from './bolAuditSanitizer'
import { documentHasBolEvidence } from './requiredDocuments'
import {
  isInvoiceAcceptedForLoad,
  InvoiceVerification,
} from './multiInvoiceValidation'
import { getPerPacketCrossValidation } from './perPacketVerification'
import { getReviewCostCapUserMessage } from './reviewCost'
import { humanizeReviewMessages } from './reviewMessages'

export type PerInvoiceTone = 'verified' | 'rejected' | 'review' | 'pending'

export interface PerInvoiceDisplayStatus {
  label: string
  tone: PerInvoiceTone
  reasons: string[]
}

const MISSING_BOL_MSG = /bill of lading|BOL.*required|missing_bol|not detected/i
const INVOICE_AMOUNT_MISMATCH_MSG =
  /invoice amount.*does not match.*rate confirmation|does not match the rate confirmation amount/i
const BOL_REF_MISSING_MSG =
  /reference numbers were not found on bill of lading|not found on BOL/i

function isFalseBolReferenceForDoc(
  message: string,
  doc: DocumentReviewResult | undefined
): boolean {
  if (!doc || !BOL_REF_MISSING_MSG.test(message)) return false
  return !documentHasBolEvidence(doc.extraction)
}

function amountExplainedByAccessorial(
  verification: InvoiceVerification | undefined,
  cross: ReturnType<typeof getPerPacketCrossValidation>
): boolean {
  return (
    Boolean(verification?.amountExplainedByLumper) ||
    cross?.amount.status === 'EXPLAINED_BY_LUMPER'
  )
}

function isSupersededAmountRejection(
  message: string,
  verification: InvoiceVerification | undefined,
  cross: ReturnType<typeof getPerPacketCrossValidation>
): boolean {
  if (!amountExplainedByAccessorial(verification, cross)) return false
  return INVOICE_AMOUNT_MISMATCH_MSG.test(message)
}

function isFalseMissingBolForDoc(
  message: string,
  doc: DocumentReviewResult | undefined
): boolean {
  if (!doc || !MISSING_BOL_MSG.test(message)) return false
  return documentHasBolEvidence(doc.extraction)
}

function flagBelongsToFile(flag: CrossValidationFlag, fileName: string): boolean {
  if (flag.field.startsWith(`packet_${fileName}_`)) return true
  if (flag.message.startsWith(`${fileName}:`)) return true
  if (flag.message.includes(`"${fileName}"`)) return true
  if (flag.message.includes(fileName)) return true
  return false
}

function flagsForVerification(
  flags: CrossValidationFlag[],
  verification: InvoiceVerification
): CrossValidationFlag[] {
  const pageKey = verification.unit.pageNumbers.join('_')
  return flags.filter(
    (f) =>
      f.field.includes(`invoice_${pageKey}`) ||
      f.message.includes(verification.unit.fileName)
  )
}

/** Per-PDF status aligned with cross-validation, BOL, and invoice checks (not load/broker/amount only). */
export function getPerInvoiceDisplayStatus(
  fileName: string,
  batch: BatchDocumentReviewResult
): PerInvoiceDisplayStatus {
  const doc = batch.documents.find((d) => d.fileName === fileName)
  const verification = batch.multiInvoice?.verifications.find(
    (v) => v.unit.fileName === fileName
  )
  const cross = getPerPacketCrossValidation(fileName, batch)
  const reasons: string[] = []

  const batchFlags = batch.crossValidation?.flags ?? []

  batchFlags
    .filter((f) => flagBelongsToFile(f, fileName))
    .forEach((f) => {
      if (f.level === 'ERROR' || f.level === 'WARNING') {
        if (isPickupSignatureMessage(f.message)) return
        const msg = f.message.replace(new RegExp(`^${fileName}:\\s*`), '')
        if (isFalseMissingBolForDoc(msg, doc)) return
        if (isFalseBolReferenceForDoc(msg, doc)) return
        if (isSupersededAmountRejection(msg, verification, cross)) return
        reasons.push(msg)
      }
    })

  if (verification) {
    flagsForVerification(batchFlags, verification).forEach((f) => {
      if (f.level === 'ERROR' || f.level === 'WARNING') reasons.push(f.message)
    })
    // Notes are already included in batch ERROR flags — avoid duplicate rejection lines.
  }

  cross?.flags
    .filter(
      (f) =>
        (f.level === 'ERROR' || f.level === 'WARNING') && !isPickupSignatureMessage(f.message)
    )
    .forEach((f) => {
      if (isSupersededAmountRejection(f.message, verification, cross)) return
      if (isFalseBolReferenceForDoc(f.message, doc)) return
      if (!isPositiveBolAuditSnippet(f.message)) reasons.push(f.message)
    })

  const excelMatch = verification?.excelMatch ?? batch.excelMatch
  excelMatch?.fields
    .filter((field) => field.status === 'MISMATCH' || field.status === 'WARNING')
    .forEach((field) => reasons.push(field.message))

  if (doc?.extraction.bolAudit) {
    const bolOk = bolAuditMeetsDeliveryRequirements(
      doc.extraction.bolAudit,
      doc.extraction.rateConParse
    )
    if (!bolOk) {
      getBolFailureReasons(doc.extraction.bolAudit, doc.extraction.rateConParse).forEach((r) =>
        reasons.push(r)
      )
    }
  }

  batch.issues
    .filter((issue) => issue.includes(fileName))
    .forEach((issue) => {
      if (!isFalseMissingBolForDoc(issue, doc) && !isPositiveBolAuditSnippet(issue)) {
        reasons.push(issue)
      }
    })

  let uniqueReasons = [...new Set(reasons.map((r) => r.trim()).filter(Boolean))]
  if (doc?.costCapExceeded && doc.costCapMessage) {
    uniqueReasons = [doc.costCapMessage, ...uniqueReasons.filter((r) => r !== doc.costCapMessage)]
  }
  uniqueReasons = uniqueReasons.filter(
    (r) =>
      !isPickupSignatureMessage(r) &&
      !isFalseMissingBolForDoc(r, doc) &&
      !isFalseBolReferenceForDoc(r, doc) &&
      !isPositiveBolAuditSnippet(r)
  )

  const excelMismatch = excelMatch?.fields.some((field) => field.status === 'MISMATCH')

  const bolFails =
    doc?.extraction.bolAudit &&
    !bolAuditMeetsDeliveryRequirements(doc.extraction.bolAudit, doc.extraction.rateConParse)

  const crossErrorsForDoc =
    cross?.flags.filter(
      (f) =>
        f.level === 'ERROR' &&
        !isPickupSignatureMessage(f.message) &&
        !isFalseMissingBolForDoc(f.message, doc) &&
        !isSupersededAmountRejection(f.message, verification, cross)
    ) ?? []

  const hasErrors =
    (cross?.overall === 'REJECTED' && crossErrorsForDoc.length > 0) ||
    batchFlags.some(
      (f) =>
        flagBelongsToFile(f, fileName) &&
        f.level === 'ERROR' &&
        !isPickupSignatureMessage(f.message) &&
        !isFalseMissingBolForDoc(f.message, doc) &&
        !isSupersededAmountRejection(f.message, verification, cross)
    ) ||
    (verification != null &&
      !isInvoiceAcceptedForLoad(verification) &&
      !amountExplainedByAccessorial(verification, cross)) ||
    Boolean(bolFails)

  if (hasErrors) {
    if (uniqueReasons.length === 0 && cross?.overall === 'REJECTED') {
      cross.flags
        .filter((f) => f.level === 'ERROR')
        .forEach((f) => uniqueReasons.push(f.message))
    }
  }

  if (hasErrors) {
    const plainReasons = humanizeReviewMessages(
      uniqueReasons.length > 0
        ? uniqueReasons
        : ['This load failed one or more verification checks.']
    )
    return {
      label: 'Rejected',
      tone: 'rejected',
      reasons: plainReasons,
    }
  }

  if (doc?.costCapExceeded) {
    return {
      label: 'Review',
      tone: 'review',
      reasons: humanizeReviewMessages(
        uniqueReasons.length > 0
          ? uniqueReasons
          : [getReviewCostCapUserMessage()]
      ),
    }
  }

  const hasWarningsOnly =
    uniqueReasons.length > 0 &&
    !batchFlags.some((f) => flagBelongsToFile(f, fileName) && f.level === 'ERROR') &&
    cross?.overall !== 'REJECTED'

  const bolOk = doc?.extraction.bolAudit
    ? bolAuditMeetsDeliveryRequirements(
        doc.extraction.bolAudit,
        doc.extraction.rateConParse
      )
    : true

  if (
    cross?.overall === 'NEEDS_REVIEW' &&
    !hasErrors &&
    bolOk &&
    uniqueReasons.length === 0
  ) {
    return { label: 'Verified', tone: 'verified', reasons: [] }
  }

  if (
    cross?.overall === 'NEEDS_REVIEW' ||
    hasWarningsOnly ||
    excelMismatch
  ) {
    return {
      label: 'Review',
      tone: 'review',
      reasons: humanizeReviewMessages(uniqueReasons),
    }
  }

  if (
    verification &&
    isInvoiceAcceptedForLoad(verification) &&
    (cross?.overall === 'APPROVED' || cross == null) &&
    bolOk
  ) {
    return { label: 'Verified', tone: 'verified', reasons: [] }
  }

  if (doc) {
    return {
      label: 'Review',
      tone: 'review',
      reasons: humanizeReviewMessages(uniqueReasons),
    }
  }

  return { label: 'Pending', tone: 'pending', reasons: [] }
}

/** Batch-level errors that are not tied to a specific PDF name. */
export function getBatchLevelRejectionReasons(
  batch: BatchDocumentReviewResult,
  fileNames: string[]
): string[] {
  const reasons: string[] = []
  const allHaveBol = fileNames.every((fn) => {
    const doc = batch.documents.find((d) => d.fileName === fn)
    return doc ? documentHasBolEvidence(doc.extraction) : false
  })
  batch.crossValidation?.flags.forEach((f) => {
    if (f.level !== 'ERROR') return
    const tiedToFile = fileNames.some((fn) => flagBelongsToFile(f, fn))
    if (!tiedToFile) {
      if (allHaveBol && MISSING_BOL_MSG.test(f.message)) return
      reasons.push(f.message)
    }
  })
  batch.issues.forEach((issue) => {
    if (!fileNames.some((fn) => issue.includes(fn))) {
      if (allHaveBol && MISSING_BOL_MSG.test(issue)) return
      reasons.push(issue)
    }
  })
  return humanizeReviewMessages([...new Set(reasons)])
}

export function summarizeBatchStatuses(
  batch: BatchDocumentReviewResult,
  fileNames: string[]
): {
  perFile: Array<{ fileName: string } & PerInvoiceDisplayStatus>
  rejected: Array<{ fileName: string } & PerInvoiceDisplayStatus>
  verifiedCount: number
  rejectedCount: number
  reviewCount: number
} {
  const perFile = fileNames.map((fileName) => ({
    fileName,
    ...getPerInvoiceDisplayStatus(fileName, batch),
  }))
  const rejected = perFile.filter((p) => p.tone === 'rejected')
  const verifiedCount = perFile.filter((p) => p.tone === 'verified').length
  const reviewCount = perFile.filter((p) => p.tone === 'review').length
  return {
    perFile,
    rejected,
    verifiedCount,
    rejectedCount: rejected.length,
    reviewCount,
  }
}
