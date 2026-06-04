import { classifyFreightAmounts, freightAmountDifference } from '../utils/amountMatching'
import { reconcileAccessorialAmount } from '../utils/accessorialAmountReconciliation'
import {
  checkRateConBolReferences,
  validateRateLineItems,
} from '../utils/rateConBolReferenceCheck'
import {
  bolAuditHasDeliveryException,
  bolAuditHasSignatureConcern,
  bolAuditHasUnclearSignatureAuthenticity,
  bolAuditMeetsDeliveryRequirements,
  filterBlockingBolFlags,
  getBolFailureReasons,
  getBolSignatureConcernReasons,
  isPickupSignatureMessage,
  isPositiveBolAuditSnippet,
} from '../utils/bolAuditSanitizer'
import { shouldRelaxCrossCheckDateSingleDelivery } from '../utils/reviewRulesEngine'
import { brokersFuzzyMatch } from '../utils/brokerFuzzyMatch'
import { destinationsMatch, formatRateConStop } from '../utils/locationMatch'
import {
  collectBolLoadReferences,
  hasInvoicePages,
  validateLoadNumberCrossCheck,
} from '../utils/loadNumberValidation'
import {
  extractBolUnitsFromBatch,
  validateMultiStopBolCoverage,
} from '../utils/multiStopBolValidation'
import { RateConParse, BolAudit, CrossValidationResult, CrossValidationFlag } from '../types/documentPipeline'
import { DocumentReviewResult } from '../types/documentReview'
import { MultiInvoiceResult, RateConRef } from '../utils/multiInvoiceValidation'

export interface CrossValidationInput {
  rateConParse?: RateConParse
  bolAudit?: BolAudit
  reviewDocuments?: DocumentReviewResult[]
  invoiceAmount?: number | null
  invoiceLoadNumber?: string | null
  invoiceBroker?: string | null
  excelLoadNumber?: string | null
  excelBroker?: string | null
  excelAmount?: number | null
  excelInvoiceNumber?: string | null
}

function normalizeName(value?: string | null): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Programmatic cross-validation (Prompt 4 rules) — fast baseline before optional AI pass. */
export function runCrossValidation(input: CrossValidationInput): CrossValidationResult {
  const flags: CrossValidationFlag[] = []
  const rate = input.rateConParse
  const bol = input.bolAudit

  const bolReferences = input.reviewDocuments
    ? collectBolLoadReferences(input.reviewDocuments)
    : bol?.load_number
      ? [bol.load_number]
      : []

  const loadCheck = validateLoadNumberCrossCheck({
    rateConLoad: rate?.load_number,
    bolReferences,
    invoiceLoad: input.invoiceLoadNumber,
    excelLoad: input.excelLoadNumber,
    hasInvoiceDocument: input.reviewDocuments
      ? hasInvoicePages(input.reviewDocuments)
      : Boolean(input.invoiceLoadNumber),
  })

  const loadStatus = loadCheck.status
  const loadDetails = loadCheck.details
  loadCheck.flags.forEach((flag) => flags.push(flag))

  const rcRefCheck = checkRateConBolReferences(rate, bolReferences)
  const hasBolEvidence =
    Boolean(bol) ||
    bolReferences.length > 0 ||
    (input.reviewDocuments?.some((doc) =>
      doc.extraction.pageClassifications?.some((page) => page.pageType === 'bill_of_lading')
    ) ??
      false)
  if (hasBolEvidence && !rcRefCheck.allMatched) {
    const msg = rcRefCheck.partialMatch
      ? `Some rate confirmation reference numbers were found on BOL, but these are missing: ${rcRefCheck.missing.join(', ')}.`
      : `Rate confirmation reference numbers were not found on BOL: ${rcRefCheck.missing.join(', ')}.`
    flags.push({
      level: 'WARNING',
      field: 'bol_reference_partial',
      message: msg,
    })
  }

  const lineItemCheck = validateRateLineItems(rate)
  if (!lineItemCheck.isValid) {
    flags.push({
      level: 'WARNING',
      field: 'rate_line_items_total',
      message:
        lineItemCheck.message ??
        'Rate confirmation line items do not add up to the stated total rate.',
    })
  }

  const rateBroker = normalizeName(rate?.broker_name)
  const excelBroker = normalizeName(input.excelBroker)
  const invoiceBroker = normalizeName(input.invoiceBroker)
  let brokerStatus: 'MATCH' | 'MISMATCH' = 'MATCH'
  let brokerDetails = 'Broker names align.'
  const brokers = [rateBroker, excelBroker, invoiceBroker].filter(Boolean)
  if (brokers.length >= 2) {
    const first = brokers[0]
    const brokerMismatch = brokers.some((name) => !brokersFuzzyMatch(first, name))
    if (brokerMismatch) {
      brokerStatus = 'MISMATCH'
      brokerDetails =
        'The broker name is not the same on the rate confirmation, invoice, and/or Excel sheet.'
      flags.push({ level: 'ERROR', field: 'broker', message: brokerDetails })
    }
  }

  const rateAmount = rate?.rate_total ?? null
  const invoiceAmount = input.invoiceAmount ?? input.excelAmount ?? null
  let amountStatus: 'MATCH' | 'MISMATCH' | 'OVERAGE_EXPLAINED' | 'EXPLAINED_BY_LUMPER' = 'MATCH'
  let amountDetails = 'Freight amounts match (or no invoice amount to compare).'
  let difference: number | null = null
  if (rateAmount != null && invoiceAmount != null) {
    difference = freightAmountDifference(rateAmount, invoiceAmount)
    const comparison = classifyFreightAmounts(rateAmount, invoiceAmount)
    if (comparison === 'mismatch') {
      const invoiceLines = input.reviewDocuments
        ?.flatMap((doc) => doc.extraction.invoicePageAudits?.map((entry) => entry.invoice.line_items ?? []) ?? [])
        .flat()
        .filter((line): line is { description?: string; amount?: number | null } => Boolean(line))
      const lumperAmounts = input.reviewDocuments
        ?.flatMap((doc) => doc.extraction.lumperPageAudits?.map((entry) => entry.amount ?? 0) ?? [])
        .filter((amount) => amount > 0)

      const lumperReconcile = reconcileAccessorialAmount({
        rateConParse: rate,
        invoiceAmount,
        invoiceLineItems: invoiceLines,
        lumperAmounts,
      })
      if (lumperReconcile.explained) {
        amountStatus = 'EXPLAINED_BY_LUMPER'
        amountDetails =
          lumperReconcile.message ??
          'Invoice-rate difference is explained by lumper / unloading charges.'
        flags.push({ level: 'WARNING', field: 'amount_lumper', message: amountDetails })
      } else {
        amountStatus = 'MISMATCH'
        amountDetails = `The rate confirmation amount ($${rateAmount.toLocaleString()}) does not match the billed invoice amount ($${invoiceAmount.toLocaleString()}) — difference $${Math.abs(difference ?? 0).toFixed(2)}.`
        flags.push({ level: 'ERROR', field: 'amount', message: amountDetails })
      }
    } else if (comparison === 'close') {
      amountStatus = 'OVERAGE_EXPLAINED'
      amountDetails = `Rate con $${rateAmount} vs invoice $${invoiceAmount} — within $${Math.abs(difference ?? 0).toFixed(2)} (OK for freight).`
      flags.push({
        level: 'INFO',
        field: 'amount_variance',
        message: amountDetails,
      })
    }
  }

  let carrierStatus: 'CONFIRMED' | 'WARNING' | 'MISMATCH' = 'CONFIRMED'
  let carrierDetails = 'Carrier from rate con; no conflicting carrier on BOL audit.'
  if (rate?.carrier_name && bol?.ship_to) {
    const carrierNorm = normalizeName(rate.carrier_name)
    const shipToNorm = normalizeName(bol.ship_to)
    if (shipToNorm.includes(carrierNorm) && carrierNorm.length > 3) {
      carrierStatus = 'WARNING'
      carrierDetails =
        'Could not confirm carrier — carrier name may appear in consignee field. Please double check.'
      flags.push({ level: 'WARNING', field: 'carrier', message: carrierDetails })
    }
  }

  const bolUnits = input.reviewDocuments ? extractBolUnitsFromBatch(input.reviewDocuments) : []
  const multiStop = validateMultiStopBolCoverage(rate, bolUnits)
  multiStop.flags.forEach((flag) => flags.push(flag))

  const stopCount = multiStop.isMultiStop ? multiStop.stopCount : rate?.destinations?.length ?? 1
  let multiStatus: 'COMPLETE' | 'INCOMPLETE' = multiStop.overall
  const missingStops = multiStop.stops
    .filter((stop) => stop.status !== 'COMPLETE')
    .map((stop) => stop.stopNumber)

  const multiDetails = multiStop.isMultiStop
    ? `${multiStop.stops.filter((s) => s.status === 'COMPLETE').length}/${stopCount} stops with signed BOL`
    : bolUnits.length === 0
      ? 'No BOL — delivery stop not verified'
      : multiStop.overall === 'COMPLETE'
        ? 'Single delivery stop with signed BOL'
        : multiStop.flags.find((f) => f.level === 'ERROR')?.message ??
          'Single delivery: BOL missing receiver signature or delivery proof'

  if (bol?.page_count === 'INCOMPLETE' || bol?.page_count === 'FAIL') {
    const pageNotes = bol.page_count_notes?.trim() ?? ''
    const pageMessage = isPositiveBolAuditSnippet(pageNotes)
      ? 'The bill of lading may be missing one or more pages in this upload.'
      : pageNotes ||
        'The bill of lading looks incomplete — not all pages from the form are in this upload.'
    flags.push({
      level: 'ERROR',
      field: 'bol_page_count',
      message: pageMessage,
    })
  }

  const singleDelivery = (rate?.destinations?.length ?? 1) <= 1

  const bolDeliveryOk = bolAuditMeetsDeliveryRequirements(bol, rate)
  if (bolAuditHasDeliveryException(bol)) {
    const exceptionLine =
      getBolFailureReasons(bol!, rate).find((line) => /Delivery exception|Possible delivery exception/i.test(line)) ??
      'Delivery exception is noted on the bill of lading (damage, shortage, or protest).'
    flags.push({
      level: 'WARNING',
      field: 'bol_delivery_exception',
      message: exceptionLine,
    })
  }

  if (bol && (bolAuditHasSignatureConcern(bol) || bolAuditHasUnclearSignatureAuthenticity(bol))) {
    const signatureLine =
      getBolSignatureConcernReasons(bol)[0] ??
      'A signature on the bill of lading may not be authentic — verify before approving.'
    flags.push({
      level: 'WARNING',
      field: 'bol_signature_authenticity',
      message: signatureLine,
    })
  }

  if (bol && !bolDeliveryOk) {
    const receiverMissing =
      bol.signatures.receiver !== 'PRESENT' && bol.signatures.receiver !== 'PASS_BY_RULE'
    const relaxDateForSingleStop = shouldRelaxCrossCheckDateSingleDelivery()
    const dateMissing =
      (!relaxDateForSingleStop || !singleDelivery) &&
      bol.signatures.receiver_date !== 'PRESENT' &&
      bol.signatures.receiver_date !== 'PASS_BY_RULE'
    const pagesBad = bol.page_count === 'INCOMPLETE' || bol.page_count === 'FAIL'
    const bolMessages = filterBlockingBolFlags(bol.flags ?? []).filter(
      (flag) => !bol.page_count_notes?.includes(flag)
    )

    if (receiverMissing || dateMissing || pagesBad) {
      const failureLines = getBolFailureReasons(bol, rate)
      const detail =
        failureLines[0] ||
        bolMessages.find((msg) => !isPickupSignatureMessage(msg)) ||
        'Missing receiver signature or delivery proof on the bill of lading.'
      failureLines.slice(1).forEach((line, index) => {
        flags.push({
          level: 'ERROR',
          field: `bol_audit_${index + 1}`,
          message: line,
        })
      })
      flags.push({
        level: 'ERROR',
        field: 'bol_audit',
        message: detail,
      })
    } else if (bolMessages.length > 0) {
      const blockingMsgs = bolMessages.filter((msg) => !isPickupSignatureMessage(msg))
      if (blockingMsgs.length > 0) {
        flags.push({
          level: 'ERROR',
          field: 'bol_audit',
          message: blockingMsgs[0],
        })
      }
    }
  } else if (bol && (bol.flags?.length ?? 0) > 0) {
    const notes = (bol.flags ?? []).filter(
      (flag) => filterBlockingBolFlags([flag]).length === 0
    )
    if (notes.length > 0) {
      flags.push({
        level: 'INFO',
        field: 'bol_audit_notes',
        message: `BOL notes (non-blocking): ${notes.join('; ')}`,
      })
    }
  }

  if (bol?.destination_match === 'FAIL') {
    flags.push({
      level: 'ERROR',
      field: 'destination',
      message:
        bol.destination_notes ||
        'The delivery address on the bill of lading does not match the rate confirmation.',
    })
  } else if (bol?.destination_match === 'PASS') {
    // BOL validator already confirmed destination — do not second-guess with a weaker string compare.
  } else {
    const rateConDelivery = formatRateConStop(rate?.destinations?.[0])
    if (rateConDelivery && bol?.ship_to && destinationsMatch(rateConDelivery, bol.ship_to) === false) {
      flags.push({
        level: 'ERROR',
        field: 'destination',
        message:
          'The delivery address on the rate confirmation does not match the ship-to address on the bill of lading.',
      })
    }
  }

  const hasError = flags.some((flag) => flag.level === 'ERROR')
  const hasBlockingWarning = flags.some(
    (flag) => flag.level === 'WARNING' && !isPickupSignatureMessage(flag.message)
  )
  let overall: CrossValidationResult['overall'] = 'APPROVED'
  if (hasError) overall = 'REJECTED'
  else if (bol && !bolDeliveryOk) overall = 'NEEDS_REVIEW'
  else if (hasBlockingWarning) overall = 'NEEDS_REVIEW'

  return {
    load_number: { status: loadStatus, details: loadDetails },
    broker: { status: brokerStatus, details: brokerDetails },
    amount: {
      status: amountStatus,
      rate_con_amount: rateAmount,
      invoice_amount: invoiceAmount,
      difference,
      details: amountDetails,
    },
    carrier: { status: carrierStatus, details: carrierDetails },
    multi_stop_coverage: {
      status: multiStatus,
      missing_stops: missingStops,
      stop_count: stopCount,
      bol_unit_count: multiStop.bolUnitCount,
      details: multiDetails,
    },
    overall,
    flags,
  }
}

function mergePerPacketCrossValidation(
  packets: Array<{ fileName: string; result: CrossValidationResult }>,
  multiInvoice: MultiInvoiceResult
): CrossValidationResult {
  const flags: CrossValidationFlag[] = [
    {
      level: 'INFO',
      field: 'multi_load_upload',
      message: `${packets.length} PDF(s) in this upload — each load verified independently (invoice vs rate con in the same file).`,
    },
  ]

  packets.forEach(({ fileName, result }) => {
    result.flags.forEach((flag) => {
      if (flag.field === 'multi_load_upload') return
      flags.push({
        ...flag,
        field: `packet_${fileName}_${flag.field}`,
        message: `${fileName}: ${flag.message}`,
      })
    })
  })

  multiInvoice.flags.forEach((flag) => {
    if (!flags.some((existing) => existing.message === flag.message)) {
      flags.push(flag)
    }
  })

  const allLoadsMatch = packets.every((p) => p.result.load_number.status === 'MATCH')
  const allBrokersMatch = packets.every((p) => p.result.broker.status === 'MATCH')
  const allAmountsOk = packets.every(
    (p) => p.result.amount.status === 'MATCH' || p.result.amount.status === 'OVERAGE_EXPLAINED'
      || p.result.amount.status === 'EXPLAINED_BY_LUMPER'
  )
  const invoicesComplete = multiInvoice.overall === 'COMPLETE'

  const anyPacketRejected = packets.some((p) => p.result.overall === 'REJECTED')
  const anyPacketNeedsReview = packets.some((p) => p.result.overall === 'NEEDS_REVIEW')

  let overall: CrossValidationResult['overall'] = 'APPROVED'
  if (!invoicesComplete || anyPacketRejected) {
    overall = 'REJECTED'
  } else if (anyPacketNeedsReview) {
    overall = 'NEEDS_REVIEW'
  }

  const summarize = (pick: (r: CrossValidationResult) => string) =>
    packets.map((p) => `${p.fileName}: ${pick(p.result)}`).join(' · ')

  const multiStopComplete = packets.every((p) => p.result.multi_stop_coverage.status === 'COMPLETE')

  return {
    load_number: {
      status: allLoadsMatch ? 'MATCH' : 'MISMATCH',
      details: summarize((r) => r.load_number.details),
    },
    broker: {
      status: allBrokersMatch ? 'MATCH' : 'MISMATCH',
      details: summarize((r) => r.broker.details),
    },
    amount: {
      status: allAmountsOk ? 'MATCH' : 'MISMATCH',
      rate_con_amount: null,
      invoice_amount: null,
      difference: null,
      details: summarize((r) => r.amount.details),
    },
    carrier: {
      status: 'CONFIRMED',
      details: summarize((r) => r.carrier.details),
    },
    multi_stop_coverage: {
      status: multiStopComplete ? 'COMPLETE' : 'INCOMPLETE',
      missing_stops: [],
      stop_count: packets.length,
      bol_unit_count: packets.length,
      details: `${packets.filter((p) => p.result.multi_stop_coverage.status === 'COMPLETE').length}/${packets.length} PDF(s) with complete BOL`,
    },
    overall,
    flags,
  }
}

/** Cross-check each PDF packet on its own — never mix load # / broker / amount across files. */
export function runPerPacketCrossValidation(input: {
  reviewResults: DocumentReviewResult[]
  rateCons: RateConRef[]
  multiInvoice: MultiInvoiceResult
}): CrossValidationResult {
  const packets: Array<{ fileName: string; result: CrossValidationResult }> = []

  for (const ref of input.rateCons) {
    const doc = input.reviewResults.find((d) => d.documentId === ref.documentId)
    const verification = input.multiInvoice.verifications.find(
      (v) => v.unit.sourceDocumentId === ref.documentId
    )
    if (!doc || !verification || verification.role === 'unrelated') continue

    packets.push({
      fileName: doc.fileName,
      result: runCrossValidation({
        rateConParse: ref.parse,
        bolAudit: doc.extraction.bolAudit,
        reviewDocuments: [doc],
        invoiceAmount: verification.unit.invoice.amount_total,
        invoiceLoadNumber: verification.unit.invoice.load_number,
        invoiceBroker: verification.unit.invoice.broker_name,
        excelLoadNumber: verification.excelMatch?.row.loadNumber,
        excelBroker: verification.excelMatch?.row.broker,
        excelAmount: verification.excelMatch?.row.amount,
        excelInvoiceNumber: verification.excelMatch?.row.invoiceNumber,
      }),
    })
  }

  if (packets.length === 0) {
    return runCrossValidation({ reviewDocuments: input.reviewResults })
  }

  return mergePerPacketCrossValidation(packets, input.multiInvoice)
}

/** Find rate con and BOL data across batch (including combined PDFs). */
export function extractBatchContext(documents: DocumentReviewResult[]): {
  rateConDoc?: DocumentReviewResult
  bolData?: { shipTo?: string; audit?: BolAudit; fileName: string }
  rateConParse?: RateConParse
} {
  let rateConDoc = documents.find((doc) => doc.extraction.documentType === 'rate_confirmation')
  if (!rateConDoc) {
    rateConDoc = documents.find((doc) => doc.extraction.rateConFields)
  }

  let bolDoc = documents.find((doc) => doc.extraction.documentType === 'bill_of_lading')
  const combinedBol = documents.find(
    (doc) =>
      doc.extraction.pageClassifications?.some((page) => page.pageType === 'bill_of_lading') &&
      (doc.extraction.shipTo || doc.extraction.bolAudit)
  )

  const bolSource = bolDoc ?? combinedBol
  const pipeline = bolSource?.extraction.pipeline ?? rateConDoc?.extraction.pipeline

  return {
    rateConDoc,
    bolData: bolSource
      ? {
          shipTo: bolSource.extraction.shipTo ?? bolSource.extraction.bolAudit?.ship_to,
          audit: bolSource.extraction.bolAudit,
          fileName: bolSource.fileName,
        }
      : combinedBol
        ? {
            shipTo: combinedBol.extraction.shipTo,
            audit: combinedBol.extraction.bolAudit,
            fileName: combinedBol.fileName,
          }
        : undefined,
    rateConParse: rateConDoc?.extraction.rateConParse ?? pipeline?.rateConParse,
  }
}
