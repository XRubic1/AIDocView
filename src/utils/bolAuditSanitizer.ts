import {
  BolAudit,
  RateConParse,
  SignatureAuthenticityStatus,
} from '../types/documentPipeline'
import { coreAddressMatches, formatRateConStop } from './locationMatch'
import {
  shouldMergeBolSignaturesSingleDelivery,
  shouldPassBolCoreAddressMatch,
  shouldRelaxReceiverDateSingleDelivery,
  shouldSanitizeBolPacketPageConfusion,
  shouldUseBolCarrierSigRelaxation,
  shouldUseBolZipOnlyRelaxation,
} from './reviewRulesEngine'
import {
  hasReceiverSignatureEvidence,
  hasSubstituteReceiverEvidence,
} from './failClosedApprovalGate'
import { hasValidReceiverLocalization } from './bolSignatureVerification'
import type { AppliedRelaxationRule } from '../types/documentPipeline'

export interface BolAuditContext {
  /** PDF page number(s) sent to the BOL validator in this call. */
  packetPageNumbers: number[]
  /** All BOL-classified PDF pages in the same upload. */
  allBolPacketPageNumbers: number[]
  /** Total pages in the combined PDF (rate con + BOL + receipts). */
  totalPacketPages: number
}

/** False positives from confusing PDF sheet index with BOL printed pagination. */
const PACKET_PAGE_CONFUSION =
  /incomplete page set|not all pages provided in (?:the )?upload|cannot confirm if all required pages in upload|full upload not provided/i

const PRINTED_COMPLETE = /\b1\s*of\s*1\b|page\s*1\s*of\s*1\b|single[- ]page bol/i

/** Read pagination printed on the BOL form (e.g. "Page 2 of 3", "1 of 4", "1/2"). */
export function parsePrintedBolPagination(text: string): { current: number; total: number } | null {
  if (!text.trim()) return null
  const patterns = [
    /\bpage\s+(\d+)\s+of\s+(\d+)\b/i,
    /\b(\d+)\s+of\s+(\d+)\b/i,
    /\b(\d+)\s*\/\s*(\d+)\b/,
  ]
  for (const re of patterns) {
    const match = text.match(re)
    if (!match) continue
    const current = Number.parseInt(match[1], 10)
    const total = Number.parseInt(match[2], 10)
    // BOL page sets are small; skip date-like fractions (e.g. 3/15).
    if (!Number.isFinite(current) || !Number.isFinite(total) || total < 1 || current < 1) {
      continue
    }
    if (total > 20 || current > total) continue
    return { current, total }
  }
  return null
}

/** Flags from a single BOL image audit — not valid after merge or for whole-PDF approval. */
const PER_PAGE_ONLY_FLAG =
  /BOL page \d+ of \d+ missing|only this page is provided|only this page was provided|check (?:all )?other BOL pages in (?:the )?upload|check all BOL pages in (?:the )?upload|no receiver signature or date visible on this page|NO_RECEIVER_SIGNATURE_ON_THIS_PAGE|No receiver\/consignee signature or mark found on this BOL page|receiver signature per single delivery rule/i

const MISSING_BOL_PAGINATION_FLAG =
  /Missing BOL page\(s\)|missing per printed pagination/i

/** Model flags about forged/stamped signatures — review only, not a hard delivery fail. */
const SIGNATURE_AUTHENTICITY_FLAG =
  /signature.*(faked|forged|fake|digitally|tracing|authenticity|may be stamped|stamped or digitally|not authentic)/i

/**
 * BOL footer shows multi-page printed pagination but upload does not include the full set.
 * If the form does not print a page count, assume OK (do not fail).
 */
export function isGenuineMissingBolPages(audit: BolAudit, context: BolAuditContext): boolean {
  const bolSheetsUploaded = context.allBolPacketPageNumbers.length
  const text = [audit.page_count_notes ?? '', ...(audit.flags ?? [])].join(' ')
  const pagination = parsePrintedBolPagination(text)

  // No printed "X of Y" / "X/Y" on the form → assume complete.
  if (!pagination || pagination.total <= 1) return false

  if (pagination.total > 1 && bolSheetsUploaded >= pagination.total) {
    return false
  }

  if (pagination.total > bolSheetsUploaded) return true
  if (bolSheetsUploaded === 1 && pagination.current !== 1) return true
  if (bolSheetsUploaded === 1 && pagination.total > 1) return true

  return false
}

function strengthenIncompleteBolAudit(audit: BolAudit, context: BolAuditContext): BolAudit {
  const text = [audit.page_count_notes ?? '', ...(audit.flags ?? [])].join(' ')
  const pagination = parsePrintedBolPagination(text)
  const flags = [...(audit.flags ?? [])]

  const missingMsg = pagination
    ? `Missing BOL page(s): document shows page ${pagination.current} of ${pagination.total} but upload only has ${context.allBolPacketPageNumbers.length} BOL sheet(s) (PDF page ${context.allBolPacketPageNumbers.join(', ')}).`
    : 'Missing BOL page(s): printed pagination indicates an incomplete BOL set in this upload.'

  if (!flags.some((flag) => /missing bol page/i.test(flag))) {
    flags.push(missingMsg)
  }

  const page_count_notes =
    audit.page_count_notes?.trim() ||
    (pagination
      ? `BOL is marked page ${pagination.current} of ${pagination.total} — additional BOL pages are not in this upload.`
      : 'Incomplete BOL page set.')

  const updated: BolAudit = {
    ...audit,
    page_count: 'INCOMPLETE',
    page_count_notes,
    flags,
    overall: 'NEEDS_REVIEW',
  }
  updated.overall = recomputeBolOverall(updated)
  return updated
}

/** Model often treats "PDF page 10 of 12" as missing BOL pages — correct when BOL says 1 of 1. */
export function sanitizeBolPageCountAudit(audit: BolAudit, context: BolAuditContext): BolAudit {
  if (isGenuineMissingBolPages(audit, context)) {
    return strengthenIncompleteBolAudit(audit, context)
  }

  const combinedText = [audit.page_count_notes ?? '', ...(audit.flags ?? [])].join(' ')
  const pagination = parsePrintedBolPagination(combinedText)

  // No printed pagination (or single-page) → always OK, even if the model guessed INCOMPLETE.
  if (
    (!pagination || pagination.total <= 1) &&
    (audit.page_count === 'INCOMPLETE' ||
      audit.page_count === 'FAIL' ||
      audit.page_count === 'UNKNOWN' ||
      audit.page_count === 'PARTIAL')
  ) {
    const cleared: BolAudit = {
      ...audit,
      page_count: 'PASS',
      page_count_notes:
        audit.page_count_notes?.trim() ||
        'No printed page count on BOL — assumed complete.',
      flags: (audit.flags ?? []).filter(
        (flag) =>
          !PACKET_PAGE_CONFUSION.test(flag) &&
          !MISSING_BOL_PAGINATION_FLAG.test(flag) &&
          !PER_PAGE_ONLY_FLAG.test(flag)
      ),
    }
    cleared.overall = recomputeBolOverall(cleared, undefined)
    return cleared
  }

  if (!shouldSanitizeBolPacketPageConfusion()) {
    const passthrough = { ...audit }
    passthrough.overall = recomputeBolOverall(passthrough, undefined)
    return passthrough
  }

  const confusesPacketIndex =
    PACKET_PAGE_CONFUSION.test(combinedText) ||
    (context.totalPacketPages > 1 &&
      new RegExp(`\\b${context.totalPacketPages}\\b`).test(combinedText) &&
      /\bpage\s+\d+\s+of\s+${context.totalPacketPages}\b/i.test(combinedText) &&
      !PRINTED_COMPLETE.test(combinedText))

  const printedCompleteOnBol = PRINTED_COMPLETE.test(combinedText)

  let page_count = audit.page_count
  let page_count_notes = audit.page_count_notes
  let flags = [...(audit.flags ?? [])]

  const uploadHasFullBolSet =
    pagination != null &&
    pagination.total > 1 &&
    context.allBolPacketPageNumbers.length >= pagination.total

  if (
    (page_count === 'INCOMPLETE' || page_count === 'UNKNOWN') &&
    (confusesPacketIndex || printedCompleteOnBol || uploadHasFullBolSet)
  ) {
    const bolPagesLabel =
      context.allBolPacketPageNumbers.length > 1
        ? `PDF pages ${context.allBolPacketPageNumbers.join(', ')}`
        : `PDF page ${context.packetPageNumbers[0] ?? '?'}`

    page_count = 'PASS'
    page_count_notes = printedCompleteOnBol
      ? `BOL shows complete pagination on the form (e.g. 1 of 1). ${bolPagesLabel} in a ${context.totalPacketPages}-page upload is normal — packet page numbers are not BOL page counts.`
      : `Complete BOL for this stop. ${bolPagesLabel} in a ${context.totalPacketPages}-page carrier packet (rate con + receipts) is not missing BOL pages.`

    flags = flags.filter(
      (flag) =>
        !PACKET_PAGE_CONFUSION.test(flag) &&
        !PER_PAGE_ONLY_FLAG.test(flag) &&
        !MISSING_BOL_PAGINATION_FLAG.test(flag)
    )
    if (uploadHasFullBolSet && pagination) {
      page_count_notes = `Complete BOL: upload has ${context.allBolPacketPageNumbers.length} BOL sheet(s) covering printed pages 1–${pagination.total} (this image shows page ${pagination.current} of ${pagination.total}).`
    }
  }

  const withOverall = { ...audit, page_count, page_count_notes, flags }
  withOverall.overall = recomputeBolOverall(withOverall, undefined)
  return withOverall
}

const ZIP_ONLY_FLAG = /\bzip\s*code\s*mismatch\b/i

const RECEIVER_SIG_MISSING_FLAG =
  /\breceiver signature(\s+and date)?\s+missing\b/i

/** Shipper / carrier / driver pickup signatures — not required when rule enabled. */
const PICKUP_SIGNATURE_FLAG =
  /\b(shipper|carrier|driver|pickup)(\s*\/\s*driver)?(\s+signature|\s+signatures)?\b/i

function appendAppliedRule(
  rules: AppliedRelaxationRule[],
  rule: AppliedRelaxationRule
): AppliedRelaxationRule[] {
  const exists = rules.some(
    (entry) =>
      entry.field === rule.field && entry.rule === rule.rule && entry.evidence === rule.evidence
  )
  return exists ? rules : [...rules, rule]
}

/** Rules may waive secondary fields only; receiver PASS_BY_RULE requires substitute evidence. */
function enforceRelaxationRulesFence(audit: BolAudit): BolAudit {
  let signatures = { ...audit.signatures }
  let flags = [...(audit.flags ?? [])]
  let appliedRules = [...(signatures.applied_rules ?? [])]

  if (signatures.receiver === 'PASS_BY_RULE' && !hasSubstituteReceiverEvidence(audit)) {
    signatures = {
      ...signatures,
      receiver: 'MISSING',
      rule_applied: null,
      applied_rules: appliedRules.filter((rule) => rule.field !== 'receiver'),
    }
    flags.push(
      'Receiver PASS_BY_RULE rejected: rule requires substitute evidence (e.g. Walmart stamp/TCR) but none was detected.'
    )
  } else if (signatures.receiver === 'PASS_BY_RULE' && hasSubstituteReceiverEvidence(audit)) {
    const evidence =
      audit.destination_notes?.trim() ||
      audit.flags?.find((flag) => hasSubstituteReceiverEvidence({ ...audit, flags: [flag] })) ||
      signatures.rule_applied ||
      'Substitute delivery evidence detected on document.'
    appliedRules = appendAppliedRule(appliedRules, {
      field: 'receiver',
      result: 'PASS_BY_RULE',
      rule: signatures.rule_applied ?? 'Shipper rule',
      evidence,
    })
  }

  if (
    signatures.receiver === 'PRESENT' &&
    !hasReceiverSignatureEvidence(audit)
  ) {
    signatures = { ...signatures, receiver: 'UNCLEAR' }
    flags.push(
      'Receiver signature marked PRESENT but evidence is weak or unclear; verify consignee signature area.'
    )
  }

  return {
    ...audit,
    signatures: { ...signatures, applied_rules: appliedRules.length ? appliedRules : undefined },
    flags,
  }
}

function isPickupSignatureFlag(flag: string): boolean {
  if (!PICKUP_SIGNATURE_FLAG.test(flag)) return false
  return (
    /\b(missing|not\s+(found|present|required|provided|visible)|absent|unsigned|unclear)\b/i.test(
      flag
    ) ||
    /\bsignature\s+missing\b/i.test(flag) ||
    /\bno\s+(shipper|carrier|driver)\b/i.test(flag) ||
    /\b(shipper|carrier|driver)\b.*\bunsigned\b/i.test(flag)
  )
}

/** Cross-check / UI text about non-blocking pickup signatures. */
export function isPickupSignatureMessage(text: string): boolean {
  if (!shouldUseBolCarrierSigRelaxation()) return false
  const flag = text.trim()
  if (!flag) return false
  if (
    /\b(receiver|consignee)\b/i.test(flag) &&
    !/\b(shipper|carrier|driver|pickup)\b/i.test(flag)
  ) {
    return false
  }
  if (isPickupSignatureFlag(flag)) return true
  if (
    /\b(shipper|carrier|driver)\b/i.test(flag) &&
    /\b(signature|signed|sign)\b/i.test(flag) &&
    /\b(missing|absent|unsigned|not\s+required|informational|optional)\b/i.test(flag)
  ) {
    return true
  }
  if (/\bboth\s+shipper\s+and\s+carrier\b/i.test(flag)) return true
  if (/\bpickup\s+signature\b/i.test(flag)) return true
  return false
}

function isNonBlockingBolFlag(flag: string): boolean {
  if (shouldUseBolZipOnlyRelaxation() && ZIP_ONLY_FLAG.test(flag)) return true
  if (shouldUseBolCarrierSigRelaxation() && isPickupSignatureFlag(flag)) return true
  if (SIGNATURE_AUTHENTICITY_FLAG.test(flag)) return true
  if (/trusting primary bol audit localization/i.test(flag)) return true
  return false
}

export function normalizeSignatureAuthenticity(
  value: unknown
): SignatureAuthenticityStatus {
  const text = String(value ?? '')
    .trim()
    .toUpperCase()
  if (text === 'NOTED') return 'NOTED'
  if (text === 'UNCLEAR') return 'UNCLEAR'
  return 'NONE'
}

export function mergeSignatureAuthenticity(
  left: SignatureAuthenticityStatus,
  right: SignatureAuthenticityStatus
): SignatureAuthenticityStatus {
  if (left === 'NOTED' || right === 'NOTED') return 'NOTED'
  if (left === 'UNCLEAR' || right === 'UNCLEAR') return 'UNCLEAR'
  return 'NONE'
}

/** Receiver/shipper/carrier mark may be forged, stamped, or digitally placed. */
export function bolAuditHasSignatureConcern(audit: BolAudit | undefined): boolean {
  if (!audit?.signatures) return false
  const sig = audit.signatures
  return (
    sig.receiver_authenticity === 'NOTED' ||
    sig.shipper_authenticity === 'NOTED' ||
    sig.carrier_authenticity === 'NOTED'
  )
}

export function bolAuditHasUnclearSignatureAuthenticity(
  audit: BolAudit | undefined
): boolean {
  if (!audit?.signatures) return false
  const sig = audit.signatures
  return (
    sig.receiver_authenticity === 'UNCLEAR' ||
    sig.shipper_authenticity === 'UNCLEAR' ||
    sig.carrier_authenticity === 'UNCLEAR'
  )
}

/** Plain-language lines for suspected fake signatures (review, not auto-reject). */
export function getBolSignatureConcernReasons(audit: BolAudit): string[] {
  const reasons: string[] = []
  const sig = audit.signatures
  const add = (role: string, auth?: SignatureAuthenticityStatus) => {
    if (auth === 'NOTED') {
      reasons.push(
        `The ${role} signature on the bill of lading may be forged, stamped, or digitally added — verify authenticity.`
      )
    } else if (auth === 'UNCLEAR') {
      reasons.push(
        `The ${role} signature authenticity on the bill of lading is unclear — manual review recommended.`
      )
    }
  }
  add('receiver', sig.receiver_authenticity)
  add('shipper', sig.shipper_authenticity)
  add('carrier', sig.carrier_authenticity)

  ;(audit.flags ?? []).forEach((flag) => {
    if (SIGNATURE_AUTHENTICITY_FLAG.test(flag) && !reasons.some((r) => r.includes(flag.slice(0, 40)))) {
      reasons.push(flag)
    }
  })

  return [...new Set(reasons.map((r) => r.trim()).filter(Boolean))]
}

/** True when this BOL flag should block approval or cross-check. */
export function isBolFlagBlocking(flag: string): boolean {
  if (PACKET_PAGE_CONFUSION.test(flag)) return false
  if (PER_PAGE_ONLY_FLAG.test(flag)) return false
  if (MISSING_BOL_PAGINATION_FLAG.test(flag)) return false
  if (RECEIVER_SIG_MISSING_FLAG.test(flag)) return false
  if (isNonBlockingBolFlag(flag)) return false
  return true
}

export function filterBlockingBolFlags(flags: string[]): string[] {
  return flags.filter(isBolFlagBlocking)
}

/** Human-readable BOL failure lines for UI (not pass-style destination/page notes). */
export function getBolFailureReasons(
  audit: BolAudit,
  rateConParse?: RateConParse
): string[] {
  const reasons: string[] = []
  const sig = audit.signatures
  const singleDelivery = isSingleDeliveryLoad(rateConParse)
  const relaxDate = shouldRelaxReceiverDateSingleDelivery()

  if (sig.receiver !== 'PRESENT' && sig.receiver !== 'PASS_BY_RULE') {
    if (sig.receiver === 'MISSING') {
      reasons.push('The receiver (consignee) signature is missing on the bill of lading.')
    } else if (sig.receiver === 'UNCLEAR') {
      reasons.push(
        'The receiver signature is unclear — check the consignee signature box on the bill of lading.'
      )
    } else {
      reasons.push('Could not confirm a receiver signature on the bill of lading.')
    }
  }

  if (
    (!relaxDate || !singleDelivery) &&
    sig.receiver_date !== 'PRESENT' &&
    sig.receiver_date !== 'PASS_BY_RULE'
  ) {
    if (sig.receiver_date === 'MISSING') {
      reasons.push('The delivery date is missing next to the receiver signature on the bill of lading.')
    } else if (sig.receiver_date === 'UNCLEAR') {
      reasons.push('The delivery date on the bill of lading is unclear or unreadable.')
    }
  }

  if (audit.page_count === 'INCOMPLETE' || audit.page_count === 'FAIL') {
    const text = [audit.page_count_notes ?? '', ...(audit.flags ?? [])].join(' ')
    const pagination = parsePrintedBolPagination(text)
    // Only fail when the form prints a multi-page count and pages are missing.
    if (pagination && pagination.total > 1) {
      reasons.push(
        `BOL is incomplete: form shows page ${pagination.current} of ${pagination.total} but not all BOL pages are in this upload.`
      )
    }
  }

  if (audit.destination_match === 'FAIL') {
    reasons.push(
      audit.destination_notes?.trim() ||
        'BOL delivery address does not match the rate con destination.'
    )
  }

  if (audit.legibility === 'FAIL') {
    reasons.push('BOL is not legible enough to verify delivery proof.')
  }

  const exceptions = audit.delivery_exceptions
  if (exceptions) {
    const noted: string[] = []
    if (exceptions.damages === 'NOTED') noted.push('damages')
    if (exceptions.shortage === 'NOTED') noted.push('shortage')
    if (exceptions.protest === 'NOTED') noted.push('received under protest')
    if (noted.length > 0) {
      reasons.push(
        `Delivery exception noted on BOL: ${noted.join(', ')}.${exceptions.notes ? ` ${exceptions.notes}` : ''}`
      )
    } else if (
      exceptions.damages === 'UNCLEAR' ||
      exceptions.shortage === 'UNCLEAR' ||
      exceptions.protest === 'UNCLEAR'
    ) {
      reasons.push(
        `Possible delivery exception on BOL is unclear.${exceptions.notes ? ` ${exceptions.notes}` : ''}`
      )
    }
  }

  getBolSignatureConcernReasons(audit).forEach((line) => reasons.push(line))

  filterBlockingBolFlags(audit.flags ?? []).forEach((flag) => {
    if (!reasons.some((r) => r.includes(flag.slice(0, 40)))) reasons.push(flag)
  })

  return [...new Set(reasons.map((r) => r.trim()).filter(Boolean))]
}

/** Pass-style audit text that should not appear as a rejection reason. */
export function isPositiveBolAuditSnippet(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  return (
    /matches rate con/i.test(t) ||
    /zip code matches/i.test(t) ||
    /single[- ]page bol is complete/i.test(t) ||
    /no indication of additional bol pages/i.test(t) ||
    (/bol header shows/i.test(t) && /page:\s*1/i.test(t) && !/missing|incomplete|needs review/i.test(t)) ||
    (/consignee.*matches/i.test(t) && !/does not|mismatch|fail/i.test(t))
  )
}

/** Delivery approval: receiver proof + destination; not shipper/carrier pickup signatures. */
export function bolAuditMeetsDeliveryRequirements(
  audit: BolAudit | undefined,
  rateConParse?: RateConParse
): boolean {
  if (!audit) return false
  if (audit.legibility === 'FAIL') return false
  if (audit.destination_match === 'FAIL') return false
  if (audit.page_count === 'INCOMPLETE' || audit.page_count === 'FAIL') {
    const text = [audit.page_count_notes ?? '', ...(audit.flags ?? [])].join(' ')
    const pagination = parsePrintedBolPagination(text)
    // No printed multi-page count → do not block approval.
    if (pagination && pagination.total > 1) return false
  }

  const sig = audit.signatures
  const receiverOk =
    sig.receiver === 'PRESENT' || sig.receiver === 'PASS_BY_RULE'
  if (!receiverOk) return false

  const singleDelivery = isSingleDeliveryLoad(rateConParse)
  const dateOk =
    sig.receiver_date === 'PRESENT' || sig.receiver_date === 'PASS_BY_RULE'
  if (!singleDelivery && !dateOk) return false

  return filterBlockingBolFlags(audit.flags ?? []).length === 0
}

type SigStatus = BolAudit['signatures']['receiver']

function bestSignatureStatus(...values: SigStatus[]): SigStatus {
  const rank: Record<string, number> = {
    PRESENT: 5,
    PASS_BY_RULE: 4,
    UNCLEAR: 3,
    MISSING: 1,
  }
  let best: SigStatus = 'MISSING'
  let bestRank = 0
  values.forEach((value) => {
    const r = rank[value] ?? 0
    if (r > bestRank) {
      bestRank = r
      best = value
    }
  })
  return best
}

export function isSingleDeliveryLoad(rateConParse?: RateConParse): boolean {
  return (rateConParse?.destinations?.length ?? 1) <= 1
}

function receiverPresentOnAudit(audit: BolAudit): boolean {
  const r = audit.signatures.receiver
  return r === 'PRESENT' || r === 'PASS_BY_RULE'
}

export function bolAuditHasDeliveryException(audit: BolAudit | undefined): boolean {
  if (!audit?.delivery_exceptions) return false
  const ex = audit.delivery_exceptions
  return ex.damages === 'NOTED' || ex.shortage === 'NOTED' || ex.protest === 'NOTED'
}

/** After merging per-page BOL audits, reconcile printed "Page X of Y" across sheets. */
function reconcileMergedBolPageCount(audits: BolAudit[]): Pick<
  BolAudit,
  'page_count' | 'page_count_notes' | 'flags'
> {
  const bolSheetCount = audits.length
  let maxTotal = 1
  const currents = new Set<number>()
  const allFlags = audits.flatMap((a) => a.flags ?? [])
  const allNotes = audits.map((a) => a.page_count_notes ?? '').join(' ')

  audits.forEach((audit) => {
    const text = [audit.page_count_notes ?? '', ...(audit.flags ?? [])].join(' ')
    const p = parsePrintedBolPagination(text)
    if (p) {
      maxTotal = Math.max(maxTotal, p.total)
      currents.add(p.current)
    }
  })

  const paginationFromNotes = parsePrintedBolPagination(allNotes)
  if (paginationFromNotes) {
    maxTotal = Math.max(maxTotal, paginationFromNotes.total)
    currents.add(paginationFromNotes.current)
  }

  const covered =
    maxTotal <= 1
      ? bolSheetCount >= 1
      : bolSheetCount >= maxTotal &&
        (currents.size >= maxTotal ||
          (currents.has(1) && currents.has(maxTotal)) ||
          audits.some((a) => a.page_count === 'PASS'))

  if (!covered) {
    return {
      page_count: 'INCOMPLETE',
      page_count_notes: audits.find((a) => a.page_count_notes)?.page_count_notes ?? '',
      flags: [...new Set(allFlags)],
    }
  }

  return {
    page_count: 'PASS',
    page_count_notes: `Complete BOL: ${bolSheetCount} sheet(s) in upload (printed pagination 1–${maxTotal} of ${maxTotal}).`,
    flags: filterBlockingBolFlags([...new Set(allFlags)]),
  }
}

/** Merge per-page BOL audits — for one delivery, any page with receiver sig is enough. */
export function mergeBolPageAudits(
  audits: BolAudit[],
  rateConParse?: RateConParse
): BolAudit | undefined {
  if (audits.length === 0) return undefined
  if (audits.length === 1) {
    return finalizeBolAudit(audits[0], rateConParse)
  }

  const singleDelivery = isSingleDeliveryLoad(rateConParse)
  const receiverOnAnyPage = audits.some(receiverPresentOnAudit)

  const merged: BolAudit = {
    ...audits[audits.length - 1],
    signatures: {
      carrier: bestSignatureStatus(...audits.map((a) => a.signatures.carrier)),
      shipper: bestSignatureStatus(...audits.map((a) => a.signatures.shipper)),
      receiver: bestSignatureStatus(...audits.map((a) => a.signatures.receiver)),
      receiver_date: bestSignatureStatus(...audits.map((a) => a.signatures.receiver_date)),
      receiver_authenticity: audits.reduce(
        (acc, a) =>
          mergeSignatureAuthenticity(acc, a.signatures.receiver_authenticity ?? 'NONE'),
        'NONE' as SignatureAuthenticityStatus
      ),
      shipper_authenticity: audits.reduce(
        (acc, a) =>
          mergeSignatureAuthenticity(acc, a.signatures.shipper_authenticity ?? 'NONE'),
        'NONE' as SignatureAuthenticityStatus
      ),
      carrier_authenticity: audits.reduce(
        (acc, a) =>
          mergeSignatureAuthenticity(acc, a.signatures.carrier_authenticity ?? 'NONE'),
        'NONE' as SignatureAuthenticityStatus
      ),
      rule_applied: audits.find((a) => a.signatures.rule_applied)?.signatures.rule_applied ?? null,
    },
    flags: [...new Set(audits.flatMap((a) => a.flags ?? []))],
    destination_match: audits.some((a) => a.destination_match === 'PASS') ? 'PASS' : audits[0].destination_match,
    legibility: audits.every((a) => a.legibility === 'PASS') ? 'PASS' : audits[0].legibility,
    page_count: audits.some((a) => a.page_count === 'INCOMPLETE' || a.page_count === 'FAIL')
      ? 'INCOMPLETE'
      : 'PASS',
    ship_from: audits.find((a) => a.ship_from)?.ship_from,
    ship_to: audits.find((a) => a.ship_to)?.ship_to ?? audits[audits.length - 1].ship_to,
    load_number: audits.find((a) => a.load_number)?.load_number,
    reference_numbers: [
      ...new Set(audits.flatMap((a) => a.reference_numbers ?? [])),
    ],
    delivery_exceptions: audits.reduce<NonNullable<BolAudit['delivery_exceptions']>>(
      (acc, audit) => {
        const ex = audit.delivery_exceptions
        if (!ex) return acc
        const mergeStatus = (
          left: 'NONE' | 'NOTED' | 'UNCLEAR',
          right: 'NONE' | 'NOTED' | 'UNCLEAR'
        ) => {
          if (left === 'NOTED' || right === 'NOTED') return 'NOTED'
          if (left === 'UNCLEAR' || right === 'UNCLEAR') return 'UNCLEAR'
          return 'NONE'
        }
        return {
          damages: mergeStatus(acc.damages, ex.damages),
          shortage: mergeStatus(acc.shortage, ex.shortage),
          protest: mergeStatus(acc.protest, ex.protest),
          notes: [acc.notes, ex.notes].filter(Boolean).join(' ').trim() || undefined,
        }
      },
      { damages: 'NONE', shortage: 'NONE', protest: 'NONE' }
    ),
  }

  if (shouldMergeBolSignaturesSingleDelivery() && singleDelivery && receiverOnAnyPage) {
    merged.signatures.receiver = bestSignatureStatus(
      ...audits.map((a) => a.signatures.receiver)
    )
    const dateOnAnyPage = audits.some(
      (a) =>
        a.signatures.receiver_date === 'PRESENT' ||
        a.signatures.receiver_date === 'PASS_BY_RULE'
    )
    if (!dateOnAnyPage) {
      const mergeRule =
        'Single delivery: receiver signature found on at least one BOL page (date not required on every page).'
      merged.signatures.receiver_date = 'PASS_BY_RULE'
      merged.signatures.rule_applied = mergeRule
      merged.signatures.applied_rules = appendAppliedRule(
        merged.signatures.applied_rules ?? [],
        {
          field: 'receiver_date',
          result: 'PASS_BY_RULE',
          rule: mergeRule,
          evidence: 'Receiver signature present on at least one BOL page in upload.',
        }
      )
    } else {
      merged.signatures.receiver_date = bestSignatureStatus(
        ...audits.map((a) => a.signatures.receiver_date)
      )
    }
    merged.flags = filterBlockingBolFlags(merged.flags ?? [])
    if (!merged.page_count_notes?.includes('receiver')) {
      merged.destination_notes = [
        merged.destination_notes,
        'Receiver signature confirmed on at least one BOL page (single delivery).',
      ]
        .filter(Boolean)
        .join(' ')
    }
  }

  const pageReconcile = reconcileMergedBolPageCount(audits)
  merged.page_count = pageReconcile.page_count
  merged.page_count_notes = pageReconcile.page_count_notes
  merged.flags = pageReconcile.flags

  return finalizeBolAudit(merged, rateConParse)
}

/** Downgrade ZIP-only and carrier-sig noise; align destination when core address matches. */
export function finalizeBolAudit(audit: BolAudit, rateConParse?: RateConParse): BolAudit {
  const fenced = enforceRelaxationRulesFence(audit)

  const rateDest = formatRateConStop(rateConParse?.destinations?.[0])
  let destination_match = fenced.destination_match
  let destination_notes = fenced.destination_notes

  if (
    shouldPassBolCoreAddressMatch() &&
    fenced.ship_to &&
    rateDest &&
    coreAddressMatches(fenced.ship_to, rateDest)
  ) {
    destination_match = 'PASS'
    if (ZIP_ONLY_FLAG.test(destination_notes ?? '') || ZIP_ONLY_FLAG.test((fenced.flags ?? []).join(' '))) {
      destination_notes =
        'Delivery address matches rate con (city/state/street). ZIP may differ (e.g. ZIP+4) — informational only.'
    }
  }

  let blockingFlags: string[] = []
  blockingFlags = filterBlockingBolFlags(fenced.flags ?? [])

  let signatures = fenced.signatures

  if (signatures.receiver === 'PRESENT' && !hasValidReceiverLocalization(fenced)) {
    signatures = {
      ...signatures,
      receiver: 'UNCLEAR',
    }
    blockingFlags = [
      ...blockingFlags,
      'Receiver signature marked PRESENT but no bounding box localization was provided.',
    ]
  }

  const weakReceiverEvidence =
    signatures.receiver === 'PRESENT' &&
    signatures.receiver_date !== 'PRESENT' &&
    !hasReceiverSignatureEvidence(fenced) &&
    !hasValidReceiverLocalization(fenced)
  if (weakReceiverEvidence) {
    signatures = {
      ...signatures,
      receiver: 'UNCLEAR',
    }
    blockingFlags = [
      ...blockingFlags,
      'Receiver signature marked PRESENT but evidence is weak or unclear; verify consignee signature area.',
    ]
  }

  const singleDelivery = isSingleDeliveryLoad(rateConParse)
  const receiverOk =
    signatures.receiver === 'PRESENT' || signatures.receiver === 'PASS_BY_RULE'

  if (
    shouldRelaxReceiverDateSingleDelivery() &&
    singleDelivery &&
    receiverOk
  ) {
    blockingFlags = blockingFlags.filter((flag) => !RECEIVER_SIG_MISSING_FLAG.test(flag))
    if (
      signatures.receiver_date !== 'PRESENT' &&
      signatures.receiver_date !== 'PASS_BY_RULE'
    ) {
      const dateRule =
        signatures.rule_applied ??
        'Single delivery: receiver signature present (date not required on every page).'
      signatures = {
        ...signatures,
        receiver_date: 'PASS_BY_RULE',
        rule_applied: dateRule,
        applied_rules: appendAppliedRule(signatures.applied_rules ?? [], {
          field: 'receiver_date',
          result: 'PASS_BY_RULE',
          rule: dateRule,
          evidence: 'Receiver signature present on audited delivery page.',
        }),
      }
    }
  }

  if (
    shouldUseBolCarrierSigRelaxation() &&
    (signatures.receiver === 'PRESENT' || signatures.receiver === 'PASS_BY_RULE')
  ) {
    const pickupNote =
      'Shipper and carrier signatures are not required for approval (receiver proof is sufficient).'
    const relaxedPickup = (status: BolAudit['signatures']['shipper']) =>
      status === 'MISSING' || status === 'UNCLEAR' ? 'PASS_BY_RULE' : status
    const nextShipper = relaxedPickup(signatures.shipper)
    const nextCarrier = relaxedPickup(signatures.carrier)
    let appliedRules = signatures.applied_rules ?? []
    if (nextShipper === 'PASS_BY_RULE' && signatures.shipper !== 'PASS_BY_RULE') {
      appliedRules = appendAppliedRule(appliedRules, {
        field: 'shipper',
        result: 'PASS_BY_RULE',
        rule: pickupNote,
        evidence: 'Receiver delivery proof sufficient; shipper signature not required.',
      })
    }
    if (nextCarrier === 'PASS_BY_RULE' && signatures.carrier !== 'PASS_BY_RULE') {
      appliedRules = appendAppliedRule(appliedRules, {
        field: 'carrier',
        result: 'PASS_BY_RULE',
        rule: pickupNote,
        evidence: 'Receiver delivery proof sufficient; carrier signature not required.',
      })
    }
    signatures = {
      ...signatures,
      shipper: nextShipper,
      carrier: nextCarrier,
      rule_applied: signatures.rule_applied ?? pickupNote,
      applied_rules: appliedRules.length ? appliedRules : undefined,
    }
    const withoutPickupNoise = (fenced.flags ?? []).filter((f) => !isPickupSignatureMessage(f))
    blockingFlags = filterBlockingBolFlags(withoutPickupNoise)
  }

  const updated: BolAudit = {
    ...fenced,
    destination_match,
    destination_notes,
    flags: blockingFlags,
    signatures,
  }
  if (bolAuditHasDeliveryException(updated)) {
    updated.overall = 'NEEDS_REVIEW'
  }
  updated.overall = recomputeBolOverall(updated, rateConParse)
  if (bolAuditHasDeliveryException(updated) || bolAuditHasSignatureConcern(updated)) {
    updated.overall = 'NEEDS_REVIEW'
  }
  return updated
}

function recomputeBolOverall(
  audit: BolAudit,
  rateConParse?: RateConParse
): BolAudit['overall'] {
  return bolAuditMeetsDeliveryRequirements(audit, rateConParse) ? 'APPROVED' : 'NEEDS_REVIEW'
}
