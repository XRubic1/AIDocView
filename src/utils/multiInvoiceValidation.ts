import { CrossValidationFlag, InvoiceParse, RateConParse } from '../types/documentPipeline'
import { DocumentReviewResult } from '../types/documentReview'
import { ExcelMatchResult, LoadSheetRow } from '../types/loadSheet'
import { reconcileAccessorialAmount } from './accessorialAmountReconciliation'
import { freightAmountsMatch } from './amountMatching'
import { brokersFuzzyMatch } from './brokerFuzzyMatch'
import {
  extractFieldsForInvoiceUnit,
  invoiceNumberFromFileName,
  loadNumberFromFileName,
  loadNumbersMatch,
} from './extractBatchFields'
import { autoMatchExcelRow } from './excelLoadMatching'
import { shouldInvoiceMatchSamePdfOnly } from './reviewRulesEngine'

export interface InvoiceUnit {
  id: string
  sourceDocumentId: string
  fileName: string
  pageNumbers: number[]
  invoice: InvoiceParse
}

export type InvoiceVerificationStatus = 'MATCH' | 'MISMATCH' | 'PARTIAL'

/** Invoice verified against rate con in the same PDF packet. */
export type InvoiceVerificationRole = 'own_packet' | 'unrelated'

export interface RateConRef {
  documentId: string
  fileName: string
  parse: RateConParse
}

export interface InvoiceVerification {
  unit: InvoiceUnit
  status: InvoiceVerificationStatus
  loadMatch: boolean
  amountMatch: boolean
  brokerMatch: boolean
  carrierMatch: boolean
  notes?: string
  /** Rate con used for this check (may be from same PDF or matched by load #). */
  matchedRateCon?: RateConParse
  role: InvoiceVerificationRole
  /** @deprecated All invoices treated equally; always true when role is own_packet. */
  appliesToPrimaryLoad: boolean
  /** Excel row auto-matched from the full load sheet for this invoice. */
  excelMatch?: ExcelMatchResult
  /** Invoice total above rate con but difference matches lumper / unloading evidence. */
  amountExplainedByLumper?: boolean
  lumperReconcileMessage?: string
}

export interface MultiInvoiceResult {
  invoiceCount: number
  verifications: InvoiceVerification[]
  overall: 'COMPLETE' | 'INCOMPLETE' | 'NONE'
  primaryInvoice?: InvoiceParse
  primaryUnitId?: string
  flags: CrossValidationFlag[]
  /** Multiple distinct load numbers across PDFs in one upload. */
  multiLoadUpload: boolean
  distinctLoadNumbers: string[]
  primaryLoadNumber?: string
  primaryAcceptedCount: number
  /** True when the load under review has no acceptable invoice. */
  primaryLoadIncomplete: boolean
}

function normalizeBroker(value?: string | null): string {
  return (value ?? '').trim().toLowerCase()
}

function normalizeLoadKey(value?: string | null): string | undefined {
  const digits = (value ?? '').replace(/\D/g, '')
  return digits || undefined
}

function fallbackInvoiceForDocument(doc: DocumentReviewResult): InvoiceParse | undefined {
  const inv = doc.extraction.primaryInvoice
  if (inv?.load_number || inv?.amount_total != null) return inv

  const rate = doc.extraction.rateConParse
  const fields = doc.extraction.rateConFields
  const loadFromFile = loadNumberFromFileName(doc.fileName)
  const amount =
    doc.extraction.rate ??
    (typeof fields?.rate?.value === 'number' ? fields.rate.value : undefined) ??
    rate?.rate_total

  if (!loadFromFile && amount == null) return undefined

  return {
    load_number: loadFromFile ?? rate?.load_number ?? fields?.loadNumber?.value?.toString(),
    amount_total: amount ?? undefined,
    broker_name: rate?.broker_name ?? fields?.broker?.value?.toString(),
    carrier_name: rate?.carrier_name ?? fields?.carrier?.value?.toString(),
    invoice_number: invoiceNumberFromFileName(doc.fileName),
  }
}

/** Collect one invoice unit per PDF — each gets its own Excel row match. */
export function extractInvoiceUnitsFromBatch(documents: DocumentReviewResult[]): InvoiceUnit[] {
  const units: InvoiceUnit[] = []

  for (const doc of documents) {
    const pageAudits = doc.extraction.invoicePageAudits
    if (pageAudits?.length) {
      pageAudits.forEach((entry) => {
        units.push({
          id: `${doc.documentId}-inv-p${entry.pageNumber}`,
          sourceDocumentId: doc.documentId,
          fileName: doc.fileName,
          pageNumbers: [entry.pageNumber],
          invoice: entry.invoice,
        })
      })
      continue
    }

    const invoicePages =
      doc.extraction.pageClassifications
        ?.filter((page) => page.pageType === 'invoice')
        .map((page) => page.pageNumber) ?? []

    if (doc.extraction.primaryInvoice) {
      units.push({
        id: doc.documentId,
        sourceDocumentId: doc.documentId,
        fileName: doc.fileName,
        pageNumbers: invoicePages.length > 0 ? invoicePages : [1],
        invoice: doc.extraction.primaryInvoice,
      })
      continue
    }

    const fallback = fallbackInvoiceForDocument(doc)
    if (fallback) {
      units.push({
        id: `${doc.documentId}-fallback`,
        sourceDocumentId: doc.documentId,
        fileName: doc.fileName,
        pageNumbers: [1],
        invoice: fallback,
      })
    }
  }

  return units
}

/** Rate con parse per uploaded PDF that contains rate confirmation pages. */
export function buildRateConsFromBatch(documents: DocumentReviewResult[]): RateConRef[] {
  const refs: RateConRef[] = []
  for (const doc of documents) {
    const parse = doc.extraction.rateConParse
    if (!parse) continue
    // Skip BOL / delivery-proof attachments that may hallucinate a rate-con parse.
    const isBol =
      doc.extraction.documentType === 'bill_of_lading' ||
      (doc.extraction.pageClassifications ?? []).some(
        (p) =>
          p.pageType === 'bill_of_lading' ||
          p.pageType === 'proof_of_delivery' ||
          p.pageType === 'delivery_confirmation'
      )
    const looksLikeRateCon =
      doc.extraction.documentType === 'rate_confirmation' ||
      Boolean(doc.extraction.rateConFields) ||
      (doc.extraction.pageClassifications ?? []).some((p) => p.pageType === 'rate_confirmation') ||
      /rate|confirmation|\brc\b/i.test(doc.fileName)
    if (isBol && !looksLikeRateCon) continue
    if (!looksLikeRateCon && !parse.load_number) continue
    if (parse.load_number || parse.rate_total != null || parse.broker_name) {
      refs.push({
        documentId: doc.documentId,
        fileName: doc.fileName,
        parse,
      })
    }
  }
  return refs
}

export function detectDistinctLoadNumbers(
  rateCons: RateConRef[],
  invoiceUnits: InvoiceUnit[]
): string[] {
  const loads = new Set<string>()
  const add = (value?: string | null) => {
    const key = normalizeLoadKey(value)
    if (key) loads.add(key)
  }
  rateCons.forEach((ref) => add(ref.parse.load_number))
  invoiceUnits.forEach((unit) => add(unit.invoice.load_number))
  return [...loads]
}

interface ResolvedRateCon {
  rateCon?: RateConParse
  role: InvoiceVerificationRole
}

/** Each invoice is compared to the rate con in its own PDF (default) or by load # when rule allows. */
export function resolveRateConForInvoice(
  unit: InvoiceUnit,
  rateCons: RateConRef[]
): ResolvedRateCon {
  const samePacket = rateCons.find((ref) => ref.documentId === unit.sourceDocumentId)
  if (samePacket) {
    return { rateCon: samePacket.parse, role: 'own_packet' }
  }
  if (!shouldInvoiceMatchSamePdfOnly()) {
    const invLoad = normalizeLoadKey(unit.invoice.load_number)
    if (invLoad) {
      const byLoad = rateCons.find((ref) => normalizeLoadKey(ref.parse.load_number) === invLoad)
      if (byLoad) return { rateCon: byLoad.parse, role: 'own_packet' }
    }
  }
  return { rateCon: undefined, role: 'unrelated' }
}

function lumperContextForUnit(
  unit: InvoiceUnit,
  documents?: DocumentReviewResult[]
): { lumperAmounts: number[]; invoiceLineItems: Array<{ description?: string; amount?: number | null }> } {
  const doc = documents?.find((entry) => entry.documentId === unit.sourceDocumentId)
  const lumperAmounts =
    doc?.extraction.lumperPageAudits
      ?.map((entry) => entry.amount ?? 0)
      .filter((amount) => amount > 0) ?? []
  const invoiceLineItems =
    doc?.extraction.invoicePageAudits
      ?.filter((entry) => unit.pageNumbers.includes(entry.pageNumber))
      .flatMap((entry) => entry.invoice.line_items ?? []) ?? []
  return { lumperAmounts, invoiceLineItems }
}

function verifyOneInvoice(
  unit: InvoiceUnit,
  rate?: RateConParse,
  documents?: DocumentReviewResult[]
): Omit<InvoiceVerification, 'role' | 'appliesToPrimaryLoad' | 'matchedRateCon'> {
  const inv = unit.invoice
  const rateLoad = rate?.load_number
  /** Invoice is compared to rate con; Excel is a separate billed cross-check when provided. */
  const rateAmount = rate?.rate_total ?? null
  const rateBroker = rate?.broker_name

  const invLoad = inv.load_number?.trim()
  /** Same-PDF invoices often omit load # — rate con in the file is authoritative. */
  const loadMatch = rateLoad
    ? invLoad
      ? loadNumbersMatch(rateLoad, invLoad)
      : true
    : Boolean(invLoad)
  let amountMatch =
    rateAmount != null ? freightAmountsMatch(rateAmount, inv.amount_total) : inv.amount_total != null
  let amountExplainedByLumper = false
  let lumperReconcileMessage: string | undefined
  if (!amountMatch && rateAmount != null && inv.amount_total != null) {
    const { lumperAmounts, invoiceLineItems } = lumperContextForUnit(unit, documents)
    const lumperReconcile = reconcileAccessorialAmount({
      rateConParse: rate,
      invoiceAmount: inv.amount_total,
      invoiceLineItems,
      lumperAmounts,
    })
    if (lumperReconcile.explained) {
      amountExplainedByLumper = true
      lumperReconcileMessage = lumperReconcile.message
    }
  }
  const brokerMatch =
    rateBroker && inv.broker_name
      ? brokersFuzzyMatch(normalizeBroker(rateBroker), normalizeBroker(inv.broker_name))
      : true
  const carrierMatch =
    rate?.carrier_name && inv.carrier_name
      ? brokersFuzzyMatch(normalizeBroker(rate.carrier_name), normalizeBroker(inv.carrier_name))
      : true

  let status: InvoiceVerificationStatus = 'MATCH'
  if (!loadMatch) status = 'MISMATCH'
  else if (!amountMatch && !amountExplainedByLumper) status = 'MISMATCH'
  else if (!brokerMatch) status = 'PARTIAL'
  else if (amountExplainedByLumper) status = 'PARTIAL'

  const notes = [
    !loadMatch && invLoad && rateLoad
      ? `The invoice shows load ${invLoad}, but the rate confirmation shows ${rateLoad}.`
      : !loadMatch && !invLoad && rateLoad
        ? `Could not read a load number on the invoice (rate confirmation shows ${rateLoad}). Try Teach AI or draw a box on the load #.`
        : undefined,
    amountMatch
      ? undefined
      : amountExplainedByLumper
        ? lumperReconcileMessage
        : inv.amount_total != null && rateAmount != null
          ? `The invoice amount ($${inv.amount_total.toLocaleString()}) does not match the rate confirmation ($${rateAmount.toLocaleString()}).`
          : 'The invoice amount could not be compared to the rate confirmation.',
    brokerMatch ? undefined : 'The broker name on the invoice does not match the rate confirmation.',
    loadMatch && amountMatch && brokerMatch && !carrierMatch && rate?.carrier_name && inv.carrier_name
      ? `Carrier on invoice ("${inv.carrier_name}") differs from rate con motor carrier ("${rate.carrier_name}") — not required for invoice approval`
      : undefined,
  ]
    .filter(Boolean)
    .join('; ')

  return {
    unit,
    status,
    loadMatch,
    amountMatch,
    brokerMatch,
    carrierMatch,
    amountExplainedByLumper,
    lumperReconcileMessage,
    notes: notes || undefined,
  }
}

/** Load #, amount, and broker align — sufficient to approve invoice for this load. */
export function isInvoiceAcceptedForLoad(verification: InvoiceVerification): boolean {
  const amountOk = verification.amountMatch || Boolean(verification.amountExplainedByLumper)
  return verification.loadMatch && amountOk && verification.brokerMatch
}

function scoreVerification(verification: InvoiceVerification): number {
  let score = 0
  if (verification.loadMatch) score += 40
  if (verification.amountMatch) score += 40
  else if (verification.amountExplainedByLumper) score += 35
  if (verification.brokerMatch) score += 15
  if (verification.carrierMatch) score += 5
  if (verification.status === 'MATCH') score += 5
  return score
}

export interface MultiInvoiceValidationOptions {
  rateCons?: RateConRef[]
  primaryLoadNumber?: string | null
  primaryRateConDocumentId?: string | null
  /** Full Excel sheet — each invoice picks its own matching row. */
  excelRows?: LoadSheetRow[]
  /** Uploaded Excel file name — carrier account identifier. */
  excelFileName?: string
  /** Same-PDF lumper pages and invoice lines for accessorial reconciliation. */
  reviewDocuments?: DocumentReviewResult[]
}

/**
 * Verify each invoice against the rate con in its own PDF only (no cross-PDF comparison).
 */
export function validateMultiInvoiceCoverage(
  rateConParse: RateConParse | undefined,
  invoiceUnits: InvoiceUnit[],
  _excelAmount?: number | null,
  options?: MultiInvoiceValidationOptions
): MultiInvoiceResult {
  const flags: CrossValidationFlag[] = []
  const rateCons =
    options?.rateCons ??
    (rateConParse
      ? [{ documentId: 'primary', fileName: 'rate con', parse: rateConParse }]
      : [])

  const distinctLoadNumbers = detectDistinctLoadNumbers(rateCons, invoiceUnits)
  const multiLoadUpload = distinctLoadNumbers.length > 1

  if (invoiceUnits.length === 0) {
    return {
      invoiceCount: 0,
      verifications: [],
      overall: 'NONE',
      flags: [],
      multiLoadUpload: false,
      distinctLoadNumbers: [],
      primaryAcceptedCount: 0,
      primaryLoadIncomplete: false,
    }
  }

  const verifications: InvoiceVerification[] = invoiceUnits.map((unit) => {
    const resolved = resolveRateConForInvoice(unit, rateCons)
    const unitFields = extractFieldsForInvoiceUnit(unit, resolved.rateCon)
    const excelMatch = options?.excelRows?.length
      ? autoMatchExcelRow(options.excelRows, unitFields, options.excelFileName)
      : undefined
    const base = verifyOneInvoice(unit, resolved.rateCon, options?.reviewDocuments)
    return {
      ...base,
      matchedRateCon: resolved.rateCon,
      role: resolved.role,
      appliesToPrimaryLoad: resolved.role === 'own_packet',
      excelMatch,
    }
  })

  const acceptedCount = verifications.filter(isInvoiceAcceptedForLoad).length
  const sorted = [...verifications].sort((a, b) => scoreVerification(b) - scoreVerification(a))
  const best = sorted[0]

  if (multiLoadUpload) {
    flags.push({
      level: 'INFO',
      field: 'multi_load_upload',
      message: `${invoiceUnits.length} invoice(s) in ${rateCons.length} PDF(s) — each verified against its own rate con only.`,
    })
  }

  verifications.forEach((verification) => {
    const inv = verification.unit.invoice
    const fileRef = `${verification.unit.fileName} (p. ${verification.unit.pageNumbers.join(', ')})`

    if (verification.role === 'unrelated') {
      flags.push({
        level: 'WARNING',
        field: `invoice_${verification.unit.pageNumbers.join('_')}`,
        message:
          'No rate confirmation was found in this PDF — the invoice cannot be verified against a rate con in the same file.',
      })
      return
    }

    if (
      !options?.excelRows?.length &&
      verification.role === 'own_packet' &&
      isInvoiceAcceptedForLoad(verification)
    ) {
      flags.push({
        level: 'INFO',
        field: `invoice_${verification.unit.pageNumbers.join('_')}_billed`,
        message: `Invoice ${fileRef}: billed load #, amount, and broker match rate con (no Excel sheet).`,
      })
    }

    if (verification.excelMatch?.overall === 'MISMATCH') {
      const excelIssues = verification.excelMatch.fields
        .filter((f) => f.status === 'MISMATCH')
        .map((f) => f.message)
        .join('; ')
      flags.push({
        level: 'ERROR',
        field: `invoice_${verification.unit.pageNumbers.join('_')}_excel`,
        message:
          excelIssues ||
          `The invoice does not match your Excel row for load ${verification.excelMatch.row.loadNumber}.`,
      })
    } else if (verification.excelMatch?.overall === 'PARTIAL') {
      flags.push({
        level: 'WARNING',
        field: `invoice_${verification.unit.pageNumbers.join('_')}_excel`,
        message: `Invoice ${fileRef}: matched Excel row ${verification.excelMatch.row.loadNumber} with warnings.`,
      })
    } else if (verification.excelMatch?.overall === 'MATCH') {
      flags.push({
        level: 'INFO',
        field: `invoice_${verification.unit.pageNumbers.join('_')}_excel`,
        message: `Invoice ${fileRef}: matched Excel row (load ${verification.excelMatch.row.loadNumber}${verification.excelMatch.row.invoiceNumber ? `, inv ${verification.excelMatch.row.invoiceNumber}` : ''}).`,
      })
    }

    if (verification.amountExplainedByLumper && verification.lumperReconcileMessage) {
      flags.push({
        level: 'WARNING',
        field: `invoice_${verification.unit.pageNumbers.join('_')}_amount_lumper`,
        message: verification.lumperReconcileMessage,
      })
    }

    if (verification.status === 'MISMATCH') {
      flags.push({
        level: 'ERROR',
        field: `invoice_${verification.unit.pageNumbers.join('_')}`,
        message: verification.notes || 'The carrier invoice does not match the rate confirmation in this PDF.',
      })
    } else if (verification.status === 'PARTIAL') {
      if (verification.amountExplainedByLumper) {
        // Lumper message already pushed above; skip duplicate partial note.
      } else {
        flags.push({
          level: 'WARNING',
          field: `invoice_${verification.unit.pageNumbers.join('_')}`,
          message:
            verification.notes || 'The carrier invoice only partly matches the rate confirmation.',
        })
      }
    } else if (
      isInvoiceAcceptedForLoad(verification) &&
      !verification.carrierMatch &&
      verification.matchedRateCon?.carrier_name &&
      inv.carrier_name
    ) {
      flags.push({
        level: 'INFO',
        field: `invoice_${verification.unit.pageNumbers.join('_')}_carrier`,
        message: `Invoice carrier "${inv.carrier_name}" differs from rate con carrier "${verification.matchedRateCon.carrier_name}" — load, amount, and broker match.`,
      })
    }
  })

  const allAccepted = acceptedCount === verifications.length && acceptedCount > 0
  const primaryLoadIncomplete = verifications.length > 0 && acceptedCount < verifications.length

  const overall: MultiInvoiceResult['overall'] =
    invoiceUnits.length === 0 ? 'NONE' : allAccepted ? 'COMPLETE' : 'INCOMPLETE'

  if (allAccepted) {
    flags.push({
      level: 'INFO',
      field: 'multi_invoice_verified',
      message: `All ${acceptedCount} invoice(s) match their rate con (load #, amount, broker).`,
    })
  }

  return {
    invoiceCount: invoiceUnits.length,
    verifications,
    overall,
    primaryInvoice: best?.unit.invoice,
    primaryUnitId: best?.unit.id,
    flags,
    multiLoadUpload,
    distinctLoadNumbers,
    primaryLoadNumber: (options?.primaryLoadNumber ?? rateConParse?.load_number) ?? undefined,
    primaryAcceptedCount: acceptedCount,
    primaryLoadIncomplete,
  }
}
