import { FIELD_UNCERTAINTY_THRESHOLD } from '../config/rateConRules'
import { AppliedRelaxationRule, BolAudit } from '../types/documentPipeline'
import { DocumentReviewResult, PageClassification } from '../types/documentReview'
import { isDeliveryProofPageType } from './deliveryProofPages'

const SUBSTITUTE_RECEIVER_EVIDENCE =
  /\b(walmart|stamp|stamped|tcr|trailer\s+control|delivery\s+confirmation|receiver\s+stamp|facility\s+stamp|warehouse\s+stamp|pod)\b/i

const RECEIVER_SIGNATURE_EVIDENCE =
  /\b(receiver|consignee)\b.{0,30}\b(signature|signed|stamp|initial|mark|x\b|proof)\b|\bsigned\s+by\b|\bsignature\s+(found|present|visible)\b/i

export type FailClosedVerdict = 'APPROVED' | 'NEEDS_REVIEW' | 'REJECTED'

export interface FailClosedApprovalGateInput {
  reviewDocuments: DocumentReviewResult[]
  proposedOverall: FailClosedVerdict
  /** Minimum page-classification confidence for non-blank pages (default: FIELD_UNCERTAINTY_THRESHOLD). */
  classificationConfidenceThreshold?: number
}

export interface FailClosedApprovalGateResult {
  overall: FailClosedVerdict
  invariantFailures: string[]
  flags: Array<{ field: string; message: string }>
  appliedRelaxationRules: AppliedRelaxationRule[]
}

export function hasReceiverSignatureEvidence(audit: BolAudit): boolean {
  const localization = audit.signatures.receiver_localization
  if (
    localization &&
    localization.w > 0 &&
    localization.h > 0 &&
    localization.description.trim().length > 0
  ) {
    return true
  }

  const text = [
    audit.destination_notes ?? '',
    audit.legibility_notes ?? '',
    ...(audit.signatures.applied_rules ?? []).map((r) => r.evidence),
    ...(audit.flags ?? []),
  ]
    .join(' ')
    .trim()

  if (!text) return false
  return RECEIVER_SIGNATURE_EVIDENCE.test(text) || SUBSTITUTE_RECEIVER_EVIDENCE.test(text)
}

export function hasSubstituteReceiverEvidence(audit: BolAudit): boolean {
  const detectionText = [
    audit.destination_notes ?? '',
    audit.legibility_notes ?? '',
    ...(audit.flags ?? []),
    ...(audit.signatures.applied_rules ?? [])
      .filter((rule) => rule.field === 'receiver')
      .map((rule) => rule.evidence),
  ].join(' ')

  return (
    SUBSTITUTE_RECEIVER_EVIDENCE.test(detectionText) ||
    RECEIVER_SIGNATURE_EVIDENCE.test(detectionText)
  )
}

/** Receiver signature is acceptable only with PRESENT/PASS_BY_RULE and positive evidence. */
export function receiverSignatureMeetsFailClosedInvariant(audit: BolAudit): boolean {
  const receiver = audit.signatures.receiver
  if (receiver === 'PRESENT') {
    return hasReceiverSignatureEvidence(audit)
  }
  if (receiver === 'PASS_BY_RULE') {
    return hasSubstituteReceiverEvidence(audit)
  }
  return false
}

function getBolAuditForPage(extraction: DocumentReviewResult['extraction'], pageNumber: number): BolAudit | undefined {
  const perPage = extraction.bolPageAudits?.find((entry) => entry.pageNumber === pageNumber)?.audit
  if (perPage) return perPage

  const deliveryPages =
    extraction.pageClassifications?.filter(
      (page) => isDeliveryProofPageType(page.pageType) && !page.skipped
    ) ?? []

  if (deliveryPages.length === 1 && deliveryPages[0].pageNumber === pageNumber) {
    return extraction.bolAudit
  }

  if (deliveryPages.length > 1 && extraction.bolAudit) {
    return extraction.bolAudit
  }

  return extraction.bolAudit
}

function collectDeliveryProofPages(documents: DocumentReviewResult[]): Array<{
  fileName: string
  page: PageClassification
}> {
  const rows: Array<{ fileName: string; page: PageClassification }> = []
  for (const doc of documents) {
    for (const page of doc.extraction.pageClassifications ?? []) {
      if (!isDeliveryProofPageType(page.pageType) || page.skipped) continue
      rows.push({ fileName: doc.fileName, page })
    }
  }
  return rows
}

function collectAppliedRules(documents: DocumentReviewResult[]): AppliedRelaxationRule[] {
  const rules: AppliedRelaxationRule[] = []
  const seen = new Set<string>()

  const addFromAudit = (audit: BolAudit | undefined) => {
    if (!audit?.signatures.applied_rules?.length) return
    audit.signatures.applied_rules.forEach((rule) => {
      const key = `${rule.field}|${rule.rule}|${rule.evidence}`
      if (seen.has(key)) return
      seen.add(key)
      rules.push(rule)
    })
  }

  for (const doc of documents) {
    addFromAudit(doc.extraction.bolAudit)
    doc.extraction.bolPageAudits?.forEach((entry) => addFromAudit(entry.audit))
  }

  return rules
}

function isLowConfidenceClassification(page: PageClassification, threshold: number): boolean {
  if (page.isBlank || page.skipped) return false
  if (page.pageType === 'other') return true
  return page.confidence < threshold
}

/**
 * Final fail-closed gate before APPROVED: evidence in, verdict out (no API calls).
 * Downgrades APPROVED to NEEDS_REVIEW when any invariant fails; never upgrades REJECTED.
 */
export function applyFailClosedApprovalGate(
  input: FailClosedApprovalGateInput
): FailClosedApprovalGateResult {
  const threshold = input.classificationConfidenceThreshold ?? FIELD_UNCERTAINTY_THRESHOLD
  const invariantFailures: string[] = []
  const flags: FailClosedApprovalGateResult['flags'] = []
  const appliedRelaxationRules = collectAppliedRules(input.reviewDocuments)

  if (input.proposedOverall !== 'APPROVED') {
    return {
      overall: input.proposedOverall,
      invariantFailures,
      flags,
      appliedRelaxationRules,
    }
  }

  for (const doc of input.reviewDocuments) {
    if (!doc.costCapExceeded) continue
    const message = `Review for "${doc.fileName}" was truncated by the AI cost cap — not all checks completed.`
    invariantFailures.push(message)
    flags.push({ field: `fail_closed_cost_cap_${doc.documentId}`, message })
  }

  for (const doc of input.reviewDocuments) {
    for (const page of doc.extraction.pageClassifications ?? []) {
      if (!isLowConfidenceClassification(page, threshold)) continue
      const label =
        page.pageType === 'other'
          ? `Page ${page.pageNumber} in "${doc.fileName}" has unknown document type`
          : `Page ${page.pageNumber} in "${doc.fileName}" has low classification confidence (${Math.round(page.confidence * 100)}%)`
      invariantFailures.push(label)
      flags.push({
        field: `fail_closed_classification_${doc.documentId}_p${page.pageNumber}`,
        message: label,
      })
    }
  }

  const deliveryPages = collectDeliveryProofPages(input.reviewDocuments)
  for (const { fileName, page } of deliveryPages) {
    const doc = input.reviewDocuments.find((d) => d.fileName === fileName)
    if (!doc) continue
    const audit = getBolAuditForPage(doc.extraction, page.pageNumber)
    if (!audit) {
      const message = `Delivery page ${page.pageNumber} in "${fileName}" was never audited for signatures.`
      invariantFailures.push(message)
      flags.push({
        field: `fail_closed_unaudited_${fileName}_p${page.pageNumber}`,
        message,
      })
      continue
    }

    const receiver = audit.signatures.receiver
    if (receiver === 'UNCLEAR') {
      const message = `Receiver signature on delivery page ${page.pageNumber} in "${fileName}" is unclear.`
      invariantFailures.push(message)
      flags.push({
        field: `fail_closed_receiver_unclear_${fileName}_p${page.pageNumber}`,
        message,
      })
      continue
    }

    if (!receiverSignatureMeetsFailClosedInvariant(audit)) {
      const message =
        receiver === 'PASS_BY_RULE'
          ? `Receiver signature PASS_BY_RULE on delivery page ${page.pageNumber} in "${fileName}" lacks substitute evidence (e.g. Walmart stamp/TCR).`
          : `Receiver signature missing on delivery page ${page.pageNumber} in "${fileName}".`
      invariantFailures.push(message)
      flags.push({
        field: `fail_closed_receiver_${fileName}_p${page.pageNumber}`,
        message,
      })
    }
  }

  if (invariantFailures.length > 0) {
    return {
      overall: 'NEEDS_REVIEW',
      invariantFailures,
      flags,
      appliedRelaxationRules,
    }
  }

  return {
    overall: 'APPROVED',
    invariantFailures,
    flags,
    appliedRelaxationRules,
  }
}
