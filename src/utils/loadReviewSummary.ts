import { BatchDocumentReviewResult, DocumentReviewResult } from '../types/documentReview'
import { ExcelMatchResult } from '../types/loadSheet'
import {
  bolAuditMeetsDeliveryRequirements,
  isPickupSignatureMessage,
  isPositiveBolAuditSnippet,
  parsePrintedBolPagination,
} from './bolAuditSanitizer'
import { amountsMatchCents } from './extractBatchFields'
import { coerceRateValue } from './effectiveRateAmount'
import { freightAmountsMatch } from './amountMatching'
import { matchBrokerCarrierFromExcel } from './brokerCarrierExcelMatch'
import { formatLocationsCompactLine, formatRateConStop, formatStopsForSummary } from './locationMatch'
import { documentHasBolEvidence } from './requiredDocuments'
import { getPerPacketCrossValidation } from './perPacketVerification'
import { CHECK_LABELS, humanizeReviewMessage, REQUIRED_PACKET_CHECK_COUNT } from './reviewMessages'
import {
  ensureRequiredPacketChecks,
  overlayPacketOnFileChecks,
  type PacketOnFileContext,
  type PaperworkFields,
} from './packetOnFileReview'
import { extractBatchContext } from '../services/crossValidationService'

export type LoadCheckStatus = 'ok' | 'issue' | 'warning' | 'info' | 'missing'

export interface LoadCheckRow {
  id: string
  label: string
  status: LoadCheckStatus
  summary: string
  /** Excel vs paperwork side-by-side when applicable */
  detail?: string
  excelValue?: string
  documentValue?: string
}

export interface StructuredLoadReview {
  /** All required checks in review order (load → broker → amount → BOL → stops → carrier → page count). */
  requiredAll: LoadCheckRow[]
  requiredFailed: LoadCheckRow[]
  requiredPassed: LoadCheckRow[]
  additional: LoadCheckRow[]
  requiredTotal: number
  hasExcel: boolean
  paperwork?: PaperworkFields
}

/** Human-readable approval gate copy for the summary header. */
export function getApprovalGateMessage(
  passCount: number,
  total: number
): { headline: string; detail: string; ready: boolean } {
  const failCount = Math.max(0, total - passCount)
  const complete = total === REQUIRED_PACKET_CHECK_COUNT && failCount === 0
  if (complete) {
    return {
      headline: 'Ready to approve',
      detail: `All ${REQUIRED_PACKET_CHECK_COUNT} required checks passed.`,
      ready: true,
    }
  }
  const stillNeeded = Math.max(failCount, REQUIRED_PACKET_CHECK_COUNT - passCount)
  return {
    headline: `${stillNeeded} more check${stillNeeded === 1 ? '' : 's'} must pass to approve`,
    detail: `${passCount} of ${REQUIRED_PACKET_CHECK_COUNT} required checks passing · ${REQUIRED_PACKET_CHECK_COUNT} total required for approval`,
    ready: false,
  }
}

function resolveExcelMatch(
  doc: DocumentReviewResult,
  batch: BatchDocumentReviewResult
): ExcelMatchResult | undefined {
  const perInvoice = batch.multiInvoice?.verifications.find(
    (v) => v.unit.fileName === doc.fileName
  )?.excelMatch
  return perInvoice ?? batch.excelMatch
}

function isFalseBolReferenceMessage(message: string, doc: DocumentReviewResult): boolean {
  if (!/reference numbers were not found on bill of lading|not found on BOL/i.test(message)) {
    return false
  }
  return !documentHasBolEvidence(doc.extraction)
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

function formatMoney(amount: number | null | undefined): string {
  if (amount == null) return '—'
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function comparisonDetail(excelValue?: string, documentValue?: string): string | undefined {
  if (!excelValue && !documentValue) return undefined
  return `Excel: ${excelValue ?? '—'} · Paperwork: ${documentValue ?? '—'}`
}

function row(
  id: string,
  label: string,
  status: LoadCheckStatus,
  summary: string,
  options?: { detail?: string; excelValue?: string; documentValue?: string }
): LoadCheckRow {
  return {
    id,
    label,
    status,
    summary: humanizeReviewMessage(summary),
    detail: options?.detail ?? comparisonDetail(options?.excelValue, options?.documentValue),
    excelValue: options?.excelValue,
    documentValue: options?.documentValue,
  }
}

function amountsAlign(excelAmount: number, docAmount: number): boolean {
  return amountsMatchCents(excelAmount, docAmount) || freightAmountsMatch(excelAmount, docAmount)
}

/** Same amount priority as Excel cross-check (rate con parse, not user override alone). */
function paperworkAmountForExcel(
  doc: DocumentReviewResult,
  rate: DocumentReviewResult['extraction']['rateConParse'],
  inv: { amount_total?: number | null } | undefined
): number | undefined {
  const fields = doc.extraction.rateConFields
  return (
    coerceRateValue(fields?.rate?.value) ??
    rate?.rate_total ??
    inv?.amount_total ??
    coerceRateValue(doc.extraction.rate)
  )
}

export interface BuildStructuredLoadReviewOptions {
  excelFileName?: string | null
  /** Compare paperwork to the Credyx packet already on file. */
  packet?: PacketOnFileContext
}

/** Seven required checks in a fixed order — no duplicates. */
export function buildStructuredLoadReview(
  doc: DocumentReviewResult,
  batch: BatchDocumentReviewResult,
  options?: BuildStructuredLoadReviewOptions
): StructuredLoadReview {
  const excelFileName = options?.excelFileName ?? batch.excelFileName
  const cross = getPerPacketCrossValidation(doc.fileName, batch)
  const excel = resolveExcelMatch(doc, batch)
  const hasExcel = Boolean(excel?.row)
  const rate = doc.extraction.rateConParse
  const multiLoad = batch.multiInvoice?.multiLoadUpload === true
  const packetContext = extractBatchContext(batch.documents)
  // Credyx packets often keep BOL as a sibling file — never require it inside the RC PDF.
  const bol =
    doc.extraction.bolAudit ??
    (!multiLoad ? packetContext.bolData?.audit : undefined)
  const bolDetected = multiLoad
    ? documentHasBolEvidence(doc.extraction)
    : batch.documents.some((d) => documentHasBolEvidence(d.extraction)) || Boolean(bol)
  const inv =
    batch.multiInvoice?.verifications.find((v) => v.unit.fileName === doc.fileName)?.unit.invoice ??
    doc.extraction.primaryInvoice
  const bolOk = bolAuditMeetsDeliveryRequirements(bol, rate)

  const rateLoad = rate?.load_number?.trim() || undefined
  const invLoad = inv?.load_number?.trim() || undefined
  const docLoad = rateLoad ?? invLoad ?? doc.extraction.loadNumber?.toString()
  const docBroker = rate?.broker_name ?? inv?.broker_name
  const docCarrier = rate?.carrier_name ?? inv?.carrier_name
  const docAmount = paperworkAmountForExcel(doc, rate, inv)
  const rateAmount = rate?.rate_total ?? coerceRateValue(doc.extraction.rateConFields?.rate?.value)
  const invAmount = inv?.amount_total ?? undefined

  const excelLoad = excel?.row.loadNumber
  const excelDebtor = excel?.row.broker
  const excelAmount = excel?.row.amount

  const partyMatch =
    hasExcel || excelFileName
      ? matchBrokerCarrierFromExcel(excelFileName, excelDebtor ?? undefined, docBroker ?? undefined, docCarrier ?? undefined)
      : null

  const required: LoadCheckRow[] = []

  // 1. Load number — rate con and invoice must agree before Excel match
  const paperworkLoadsConflict =
    Boolean(rateLoad && invLoad && !loadNumbersMatchSimple(rateLoad, invLoad))

  if (paperworkLoadsConflict) {
    required.push(
      row(
        'req_load',
        CHECK_LABELS.loadNumber,
        'issue',
        `Rate con shows load ${rateLoad}, but invoice shows ${invLoad}.`,
        {
          documentValue: `RC ${rateLoad} · INV ${invLoad}`,
          excelValue: excelLoad,
        }
      )
    )
  } else if (hasExcel && excelLoad) {
    const match = docLoad ? loadNumbersMatchSimple(excelLoad, docLoad) : false
    required.push(
      row(
        'req_load',
        CHECK_LABELS.loadNumber,
        docLoad ? (match ? 'ok' : 'issue') : 'warning',
        match
          ? 'Load number matches Excel and paperwork.'
          : docLoad
            ? `Excel shows load ${excelLoad}, but paperwork shows ${docLoad}.`
            : 'Load number was not found on the paperwork.',
        {
          excelValue: excelLoad,
          documentValue:
            rateLoad && invLoad ? `RC ${rateLoad} · INV ${invLoad}` : (docLoad ?? '—'),
        }
      )
    )
  } else if (cross) {
    required.push(
      row(
        'req_load',
        CHECK_LABELS.loadNumber,
        cross.load_number.status === 'MATCH' ? 'ok' : 'issue',
        cross.load_number.details,
        { documentValue: docLoad ?? '—' }
      )
    )
  }

  // 2. Broker name
  if (partyMatch) {
    const broker = partyMatch.broker
    required.push(
      row('req_broker', CHECK_LABELS.broker, broker.status, broker.summary, {
        excelValue: broker.excelValue,
        documentValue: broker.documentValue,
      })
    )
  } else if (cross) {
    required.push(
      row(
        'req_broker',
        CHECK_LABELS.broker,
        cross.broker.status === 'MATCH' ? 'ok' : 'issue',
        cross.broker.details,
        { documentValue: docBroker ?? '—' }
      )
    )
  }

  // 3. Freight amount
  if (
    rateAmount != null &&
    invAmount != null &&
    !amountsAlign(rateAmount, invAmount)
  ) {
    required.push(
      row(
        'req_amount',
        CHECK_LABELS.amount,
        'issue',
        `Rate con amount ${formatMoney(rateAmount)} does not match invoice amount ${formatMoney(invAmount)}.`,
        {
          documentValue: `RC ${formatMoney(rateAmount)} · INV ${formatMoney(invAmount)}`,
          excelValue: excelAmount != null ? formatMoney(excelAmount) : undefined,
        }
      )
    )
  } else if (hasExcel && excelAmount != null) {
    const match = docAmount != null ? amountsAlign(excelAmount, docAmount) : false
    required.push(
      row(
        'req_amount',
        CHECK_LABELS.amount,
        docAmount != null ? (match ? 'ok' : 'issue') : 'warning',
        match
          ? 'Excel and paperwork amounts match.'
          : docAmount != null
            ? `Excel amount ${formatMoney(excelAmount)} does not match the paperwork amount ${formatMoney(docAmount)}.`
            : 'Amount was not found on the paperwork.',
        { excelValue: formatMoney(excelAmount), documentValue: docAmount != null ? formatMoney(docAmount) : '—' }
      )
    )
  } else if (cross) {
    const amountOk = checkOk(cross.amount.status)
    required.push(
      row(
        'req_amount',
        CHECK_LABELS.amount,
        amountOk ? 'ok' : cross.amount.status === 'MISMATCH' ? 'issue' : 'warning',
        cross.amount.details,
        {
          documentValue:
            inv?.amount_total != null
              ? formatMoney(inv.amount_total)
              : docAmount != null
                ? formatMoney(docAmount)
                : '—',
        }
      )
    )
  }

  // 4. Bill of lading
  let bolSummary = multiLoad
    ? 'No bill of lading found in this PDF.'
    : 'No bill of lading found on this packet.'
  if (bolDetected && bol) {
    const receiverOk =
      bol.signatures.receiver === 'PRESENT' || bol.signatures.receiver === 'PASS_BY_RULE'
    if (bolOk) {
      bolSummary = multiLoad
        ? 'Signed and delivery address matches rate confirmation.'
        : packetContext.bolData?.fileName && packetContext.bolData.fileName !== doc.fileName
          ? `Signed BOL on ${packetContext.bolData.fileName}; delivery address matches rate confirmation.`
          : 'Signed and delivery address matches rate confirmation.'
    } else if (!receiverOk) {
      bolSummary = 'Receiver signature is missing or unclear.'
    } else {
      bolSummary = 'Delivery address does not match the rate confirmation.'
    }
  } else if (bolDetected) {
    bolSummary = multiLoad
      ? 'BOL pages detected — audit incomplete.'
      : packetContext.bolData?.fileName && packetContext.bolData.fileName !== doc.fileName
        ? `BOL found on ${packetContext.bolData.fileName} — audit incomplete.`
        : 'BOL pages detected — audit incomplete.'
  }
  required.push(
    row('req_bol', CHECK_LABELS.bol, !bolDetected ? 'missing' : bolOk ? 'ok' : 'issue', bolSummary, {
      documentValue: bolDetected
        ? packetContext.bolData?.fileName && packetContext.bolData.fileName !== doc.fileName
          ? `Present (${packetContext.bolData.fileName})`
          : 'Present'
        : 'Not found',
    })
  )

  // 5. Delivery stops — requires BOL proof
  const fields = doc.extraction.rateConFields
  const pickupFallback =
    fields?.pickup?.value ??
    (rate?.origin ? formatRateConStop(rate.origin) : undefined) ??
    doc.extraction.origin
  const deliveryFallback =
    fields?.drop?.value ??
    (rate?.destinations?.[0] ? formatRateConStop(rate.destinations[0]) : undefined) ??
    doc.extraction.destination
  const stopsDisplay = formatStopsForSummary({
    origin: rate?.origin,
    originFallback: pickupFallback,
    destinations: rate?.destinations,
    deliveryFallback,
  })

  if (!bolDetected) {
    required.push(
      row(
        'req_stops',
        CHECK_LABELS.multiStop,
        'missing',
        multiLoad
          ? 'No BOL. Delivery stop cannot be verified.'
          : 'No BOL on this packet. Delivery stop cannot be verified.',
        { documentValue: stopsDisplay }
      )
    )
  } else if (cross) {
    required.push(
      row(
        'req_stops',
        CHECK_LABELS.multiStop,
        checkOk(cross.multi_stop_coverage.status) ? 'ok' : 'issue',
        (cross.multi_stop_coverage.details ?? ''),
        { documentValue: stopsDisplay }
      )
    )
  } else {
    required.push(
      row(
        'req_stops',
        CHECK_LABELS.multiStop,
        'issue',
        stopsDisplay
          ? `Rate con delivery: ${stopsDisplay}. The BOL is on the packet and was not read, so this stop is not confirmed.`
          : 'The BOL is on the packet and was not read, so delivery stops are not confirmed.',
        { documentValue: stopsDisplay || 'BOL not read' }
      )
    )
  }

  // 6. Carrier name — Excel file name is the carrier account
  if (partyMatch) {
    const carrier = partyMatch.carrier
    required.push(
      row('req_carrier', CHECK_LABELS.carrier, carrier.status, (carrier.summary ?? ''), {
        excelValue: carrier.excelValue,
        documentValue: carrier.documentValue,
      })
    )
  } else if (cross || docCarrier) {
    required.push(
      row(
        'req_carrier',
        CHECK_LABELS.carrier,
        cross && checkOk(cross.carrier.status) ? 'ok' : cross ? 'warning' : 'info',
        cross?.carrier.details ?? 'Carrier from rate confirmation.',
        { documentValue: docCarrier ?? '—' }
      )
    )
  }

  // 7. BOL page count — fail only when printed pagination shows missing pages
  {
    const pageNotes = [
      bol?.page_count_notes ?? '',
      ...(bol?.flags ?? []),
      ...(doc.extraction.bolPageAudits?.flatMap((e) => [
        e.audit.page_count_notes ?? '',
        ...(e.audit.flags ?? []),
      ]) ?? []),
    ].join(' ')
    const printed = parsePrintedBolPagination(pageNotes)
    const pageStatus = bol?.page_count
    const incomplete =
      Boolean(bolDetected && bol) &&
      (pageStatus === 'INCOMPLETE' || pageStatus === 'FAIL') &&
      Boolean(printed && printed.total > 1)

    let pageSummary = 'No bill of lading — page count not checked.'
    if (!bolDetected) {
      pageSummary = multiLoad
        ? 'No bill of lading found in this PDF.'
        : 'No bill of lading found on this packet.'
    } else if (incomplete && printed) {
      pageSummary = `Form shows page ${printed.current} of ${printed.total} — missing BOL page(s) in this upload.`
    } else if (printed && printed.total > 1) {
      pageSummary = `Printed pagination ${printed.current} of ${printed.total} — complete set on file.`
    } else if (printed && printed.total === 1) {
      pageSummary = 'BOL shows page 1 of 1.'
    } else {
      pageSummary = 'No printed page count on BOL — assumed complete.'
    }

    required.push(
      row(
        'req_page_count',
        CHECK_LABELS.pageCount,
        !bolDetected ? 'missing' : incomplete ? 'issue' : 'ok',
        pageSummary,
        {
          documentValue: !bolDetected
            ? 'Not found'
            : printed
              ? `${printed.current}/${printed.total}`
              : 'No page mark',
        }
      )
    )
  }

  const deliveryCompact = formatLocationsCompactLine(rate?.destinations, deliveryFallback)

  const bolShipFrom = [
    ...(doc.extraction.bolPageAudits?.map((e) => e.audit.ship_from).filter(Boolean) ?? []),
    doc.extraction.bolAudit?.ship_from,
  ].filter((s): s is string => Boolean(s))
  const pickupFallbackMerged =
    bolShipFrom.length > 0
      ? [pickupFallback, ...bolShipFrom].filter(Boolean).join('; ')
      : pickupFallback

  const pickupCompact = formatLocationsCompactLine(
    rate?.origin ? [rate.origin] : undefined,
    pickupFallbackMerged
  )

  const extractedDomain = String(fields?.emailDomain?.value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^www\./, '')

  const paperwork: PaperworkFields = {
    loadNumber: docLoad,
    amount: rateAmount ?? docAmount ?? invAmount,
    brokerName: docBroker ?? undefined,
    brokerDomain: extractedDomain.includes('.') ? extractedDomain : undefined,
    carrierName: docCarrier ?? undefined,
    pickup: pickupCompact || undefined,
    destinations: deliveryCompact || undefined,
  }

  const scored = ensureRequiredPacketChecks(
    options?.packet
      ? overlayPacketOnFileChecks(required, options.packet, paperwork)
      : required
  )

  const requiredFailed = scored.filter((check) => check.status !== 'ok')
  const requiredPassed = scored.filter((check) => check.status === 'ok')

  // Additional — route/lane context and non-blocking Excel fields only
  const additional: LoadCheckRow[] = []

  if (partyMatch?.swapLikely) {
    additional.push(
      row(
        'add_swap',
        'Label swap detected',
        'info',
        'The rate con may have broker and carrier reversed. Checks above use the corrected parties.'
      )
    )
  }

  const usedExcelFields = new Set(['load_number', 'broker', 'amount', 'carrier'])

  excel?.fields
    .filter((field) => field.status === 'SKIPPED' || !usedExcelFields.has(field.field))
    .forEach((field) => {
      additional.push(
        row(`add_excel_${field.field}`, field.label, 'info', field.message, {
          excelValue: field.excelValue,
          documentValue: field.documentValue ?? '—',
        })
      )
    })

  if (pickupCompact) {
    additional.push(row('add_pickup', 'Pickup (paperwork)', 'info', pickupCompact))
  }
  if (deliveryCompact) {
    additional.push(row('add_delivery', 'Delivery (paperwork)', 'info', deliveryCompact))
  }

  if (inv?.invoice_number) {
    additional.push(row('add_inv', 'Invoice number (paperwork)', 'info', inv.invoice_number))
  }
  if (inv?.amount_total != null) {
    additional.push(
      row('add_inv_amt', 'Invoice amount (paperwork)', 'info', formatMoney(inv.amount_total))
    )
  }

  cross?.flags
    .filter((f) => f.level === 'ERROR' || f.level === 'WARNING')
    .forEach((f) => {
      if (isFalseBolReferenceMessage(f.message, doc)) return
      if (isPickupSignatureMessage(f.message)) return
      if (isPositiveBolAuditSnippet(f.message)) return
      additional.push(
        row(`add_flag_${f.field}`, f.field.replace(/_/g, ' '), f.level === 'ERROR' ? 'issue' : 'warning', f.message)
      )
    })

  if (doc.costCapExceeded) {
    additional.unshift(
      row(
        'add_cost_cap',
        'Review limit',
        'warning',
        doc.costCapMessage ?? 'AI review exceeded the allowed credit for this load.'
      )
    )
  }

  return {
    requiredAll: scored,
    requiredFailed,
    requiredPassed,
    additional,
    requiredTotal: scored.length,
    hasExcel,
    paperwork,
  }
}

function loadNumbersMatchSimple(a: string, b: string): boolean {
  const left = a.replace(/\D/g, '').replace(/^0+/, '') || a
  const right = b.replace(/\D/g, '').replace(/^0+/, '') || b
  return left === right || left.endsWith(right) || right.endsWith(left)
}

/** Flat list for Technical tab */
export function buildLoadCheckRows(
  doc: DocumentReviewResult,
  batch: BatchDocumentReviewResult
): LoadCheckRow[] {
  const structured = buildStructuredLoadReview(doc, batch)
  return [
    ...structured.requiredFailed,
    ...structured.requiredPassed,
    ...structured.additional,
  ]
}

export function collectLoadReviewIssues(
  doc: DocumentReviewResult,
  batch: BatchDocumentReviewResult
): string[] {
  const structured = buildStructuredLoadReview(doc, batch)
  return structured.requiredFailed.map((check) => {
    if (check.detail) return `${check.label}: ${check.summary} (${check.detail})`
    return `${check.label}: ${check.summary}`
  })
}
