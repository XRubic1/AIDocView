import { ExcelFieldMatch, ExcelMatchResult, LoadSheetRow } from '../types/loadSheet'
import {
  amountsMatchCents,
  ExtractedBatchFields,
  loadNumbersMatch,
} from './extractBatchFields'
import { freightAmountsMatch } from './amountMatching'
import { matchBrokerCarrierFromExcel } from './brokerCarrierExcelMatch'
import { brokersFuzzyMatch } from './brokerFuzzyMatch'
import { carrierOcrSimilarity } from './carrierOcrCorrection'

const MIN_AUTO_MATCH_SCORE = 22

function invoiceNumbersAlign(excelInv?: string, docInv?: string): boolean {
  if (!excelInv || !docInv) return false
  const a = excelInv.replace(/\D/g, '')
  const b = docInv.replace(/\D/g, '')
  if (a && b && a === b) return true
  return excelInv.trim().toLowerCase() === docInv.trim().toLowerCase()
}

/** Score how well an Excel row matches extracted document fields (higher = better). */
export function scoreExcelRowForFields(row: LoadSheetRow, fields: ExtractedBatchFields): number {
  const docLoad = fields.loadNumber ?? fields.invoiceLoadNumber
  let score = 0

  if (row.loadNumber && docLoad) {
    if (!loadNumbersMatch(row.loadNumber, docLoad)) return -1
    score += 50
  }

  if (row.invoiceNumber && fields.invoiceNumber) {
    if (invoiceNumbersAlign(row.invoiceNumber, fields.invoiceNumber)) score += 35
    else score -= 5
  }

  if (row.amount != null && fields.amount != null) {
    if (amountsMatchCents(row.amount, fields.amount)) score += 25
    else if (freightAmountsMatch(row.amount, fields.amount)) score += 18
    else score -= 15
  }

  if (row.broker && fields.broker && brokersFuzzyMatch(row.broker, fields.broker)) {
    score += 12
  }

  if (row.carrier && fields.carrier) {
    const fuzzy = brokersFuzzyMatch(row.carrier, fields.carrier)
    const ocr = carrierOcrSimilarity(row.carrier, fields.carrier) >= 0.65
    if (fuzzy || ocr) score += 10
  }

  return score
}

/** Find the best-matching Excel row for document fields (searches entire sheet). */
export function findBestExcelRow(
  rows: LoadSheetRow[],
  fields: ExtractedBatchFields,
  minScore = MIN_AUTO_MATCH_SCORE
): LoadSheetRow | undefined {
  let best: LoadSheetRow | undefined
  let bestScore = minScore - 1

  for (const row of rows) {
    const score = scoreExcelRowForFields(row, fields)
    if (score > bestScore) {
      bestScore = score
      best = row
    }
  }

  return best
}

/** Auto-match Excel row and return full field comparison. */
export function autoMatchExcelRow(
  rows: LoadSheetRow[],
  fields: ExtractedBatchFields,
  excelFileName?: string
): ExcelMatchResult | undefined {
  const row = findBestExcelRow(rows, fields)
  if (!row) return undefined
  return matchLoadSheetToDocuments(row, fields, excelFileName)
}

function buildField(
  field: string,
  label: string,
  status: ExcelFieldMatch['status'],
  excelValue: string | undefined,
  documentValue: string | undefined,
  message: string
): ExcelFieldMatch {
  return { field, label, status, excelValue, documentValue, message }
}

function partyFieldStatus(status: 'ok' | 'issue' | 'warning' | 'missing'): ExcelFieldMatch['status'] {
  if (status === 'ok') return 'MATCH'
  if (status === 'issue') return 'MISMATCH'
  return 'WARNING'
}

/** Compare Excel row to extracted document fields (Section 4). */
export function matchLoadSheetToDocuments(
  row: LoadSheetRow,
  extracted: ExtractedBatchFields,
  excelFileName?: string
): ExcelMatchResult {
  const fields: ExcelFieldMatch[] = []

  if (row.loadNumber) {
    const docLoad = extracted.loadNumber
    const match = docLoad ? loadNumbersMatch(row.loadNumber, docLoad) : false
    fields.push(
      buildField(
        'load_number',
        'Load Number',
        docLoad ? (match ? 'MATCH' : 'MISMATCH') : 'WARNING',
        row.loadNumber,
        docLoad,
        docLoad
          ? match
            ? 'Load number matches the paperwork.'
            : `Excel shows load ${row.loadNumber}, but the paperwork shows ${docLoad}.`
          : 'Load number was not found on the rate confirmation or invoice yet.'
      )
    )
  }

  const partyMatch = matchBrokerCarrierFromExcel(
    excelFileName,
    row.broker,
    extracted.broker,
    extracted.carrier
  )

  if (excelFileName || row.broker) {
    fields.push(
      buildField(
        'carrier',
        'Carrier (Excel file name)',
        partyFieldStatus(partyMatch.carrier.status),
        partyMatch.carrier.excelValue,
        partyMatch.carrier.documentValue,
        partyMatch.carrier.summary
      )
    )
    fields.push(
      buildField(
        'broker',
        partyMatch.swapLikely ? 'Broker (Excel Debtor, swap corrected)' : 'Broker',
        partyFieldStatus(partyMatch.broker.status),
        partyMatch.broker.excelValue,
        partyMatch.broker.documentValue,
        partyMatch.broker.summary
      )
    )
  } else if (row.carrier) {
    const docCarrier = extracted.carrier
    const fuzzyMatch = docCarrier ? brokersFuzzyMatch(row.carrier, docCarrier) : false
    const ocrMatch = docCarrier ? carrierOcrSimilarity(row.carrier, docCarrier) >= 0.65 : false
    const match = fuzzyMatch || ocrMatch
    fields.push(
      buildField(
        'carrier',
        'Carrier',
        docCarrier ? (match ? 'MATCH' : 'MISMATCH') : 'WARNING',
        row.carrier,
        docCarrier,
        docCarrier
          ? match
            ? fuzzyMatch
              ? 'Carrier name matches (fuzzy).'
              : 'Carrier matches Excel with OCR-tolerant comparison (e.g. 405 vs 4US).'
            : `Carrier on Excel (${row.carrier}) does not match the paperwork (${docCarrier}).`
          : 'Carrier name was not found on the paperwork yet.'
      )
    )
  }

  if (row.amount != null) {
    const docAmount = extracted.amount
    const match = docAmount != null ? amountsMatchCents(row.amount, docAmount) : false
    fields.push(
      buildField(
        'amount',
        'Amount',
        docAmount != null ? (match ? 'MATCH' : 'MISMATCH') : 'WARNING',
        `$${row.amount.toFixed(2)}`,
        docAmount != null ? `$${docAmount.toFixed(2)}` : undefined,
        docAmount != null
          ? match
            ? 'Amount matches exactly.'
            : `Excel amount $${row.amount.toFixed(2)} does not match the paperwork amount $${docAmount.toFixed(2)}.`
          : 'Amount was not found on the paperwork yet.'
      )
    )
  }

  if (row.invoiceNumber) {
    const docInv = extracted.invoiceNumber
    const match =
      docInv &&
      (row.invoiceNumber.replace(/\D/g, '') === docInv.replace(/\D/g, '') ||
        row.invoiceNumber.toLowerCase() === docInv.toLowerCase())
    fields.push(
      buildField(
        'invoice_number',
        'Invoice Number',
        docInv ? (match ? 'MATCH' : 'WARNING') : 'SKIPPED',
        row.invoiceNumber,
        docInv,
        docInv
          ? match
            ? 'Invoice number aligns.'
            : `Invoice # differs: Excel "${row.invoiceNumber}" vs documents "${docInv}".`
          : 'Invoice number on Excel only (less critical).'
      )
    )
  }

  if (row.invoiceDate) {
    fields.push(
      buildField(
        'invoice_date',
        'Invoice Date',
        'SKIPPED',
        row.invoiceDate,
        extracted.invoiceDate,
        'Invoice date stored on Excel row (informational).'
      )
    )
  }

  const hasMismatch = fields.some((field) => field.status === 'MISMATCH')
  const hasWarning = fields.some((field) => field.status === 'WARNING')
  let overall: ExcelMatchResult['overall'] = 'MATCH'
  if (hasMismatch) overall = 'MISMATCH'
  else if (hasWarning) overall = 'PARTIAL'

  return {
    row,
    fields,
    overall,
    matchedAt: new Date().toISOString(),
  }
}
