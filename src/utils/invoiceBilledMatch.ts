import { InvoiceParse, RateConParse } from '../types/documentPipeline'
import { ExcelFieldMatch, ExcelMatchResult, LoadSheetRow } from '../types/loadSheet'
import { freightAmountsMatch } from './amountMatching'
import { brokersFuzzyMatch } from './brokerFuzzyMatch'
import { loadNumbersMatch } from './extractBatchFields'

function field(
  fieldKey: string,
  label: string,
  status: ExcelFieldMatch['status'],
  billedValue: string | undefined,
  expectedValue: string | undefined,
  message: string
): ExcelFieldMatch {
  return {
    field: fieldKey,
    label,
    status,
    excelValue: billedValue,
    documentValue: expectedValue,
    message,
  }
}

/**
 * Compare carrier invoice (billed amounts) to rate con when no Excel sheet is provided.
 * Returns the same shape as Excel cross-check for shared UI.
 */
export function buildInvoiceBilledMatch(
  invoice: InvoiceParse,
  rateCon?: RateConParse
): ExcelMatchResult | undefined {
  if (!rateCon) return undefined

  const fields: ExcelFieldMatch[] = []
  const billedLoad = invoice.load_number?.trim()
  const rateLoad = rateCon.load_number?.trim()

  if (billedLoad || rateLoad) {
    const match =
      billedLoad && rateLoad
        ? loadNumbersMatch(billedLoad, rateLoad)
        : !billedLoad && Boolean(rateLoad)
    fields.push(
      field(
        'load_number',
        'Load Number',
        billedLoad && rateLoad ? (match ? 'MATCH' : 'MISMATCH') : match ? 'MATCH' : 'WARNING',
        billedLoad,
        rateLoad,
        billedLoad && rateLoad
          ? match
            ? 'Load number on the invoice matches the rate confirmation.'
            : `Invoice shows load ${billedLoad}; rate confirmation shows ${rateLoad}.`
          : rateLoad
            ? 'Load number is not printed on the invoice — using the rate confirmation for this PDF.'
            : 'Load number missing on both the invoice and rate confirmation.'
      )
    )
  }

  const billedAmount = invoice.amount_total
  const rateAmount = rateCon.rate_total
  if (billedAmount != null || rateAmount != null) {
    const match =
      billedAmount != null && rateAmount != null
        ? freightAmountsMatch(billedAmount, rateAmount)
        : false
    fields.push(
      field(
        'amount',
        'Amount',
        billedAmount != null && rateAmount != null ? (match ? 'MATCH' : 'MISMATCH') : 'WARNING',
        billedAmount != null ? `$${billedAmount.toFixed(2)}` : undefined,
        rateAmount != null ? `$${rateAmount.toFixed(2)}` : undefined,
        billedAmount != null && rateAmount != null
          ? match
            ? 'Invoice amount matches the rate confirmation.'
            : `Invoice amount $${billedAmount} does not match rate confirmation $${rateAmount}.`
          : 'Amount missing on the invoice or rate confirmation.'
      )
    )
  }

  const billedBroker = invoice.broker_name?.trim()
  const rateBroker = rateCon.broker_name?.trim()
  if (billedBroker || rateBroker) {
    const match =
      billedBroker && rateBroker ? brokersFuzzyMatch(billedBroker, rateBroker) : false
    fields.push(
      field(
        'broker',
        'Broker',
        billedBroker && rateBroker ? (match ? 'MATCH' : 'MISMATCH') : 'WARNING',
        billedBroker,
        rateBroker,
        billedBroker && rateBroker
          ? match
            ? 'Broker name matches the rate confirmation.'
            : `Invoice broker (${billedBroker}) does not match rate confirmation (${rateBroker}).`
          : 'Broker name missing on the invoice or rate confirmation.'
      )
    )
  }

  if (invoice.invoice_number?.trim()) {
    fields.push(
      field(
        'invoice_number',
        'Invoice Number',
        'SKIPPED',
        invoice.invoice_number,
        undefined,
        'Invoice number from carrier bill (informational).'
      )
    )
  }

  const hasMismatch = fields.some((f) => f.status === 'MISMATCH')
  const hasWarning = fields.some((f) => f.status === 'WARNING')
  const overall: ExcelMatchResult['overall'] = hasMismatch
    ? 'MISMATCH'
    : hasWarning
      ? 'PARTIAL'
      : 'MATCH'

  const row: LoadSheetRow = {
    rowIndex: 0,
    loadNumber: invoice.load_number,
    broker: invoice.broker_name,
    carrier: invoice.carrier_name,
    amount: invoice.amount_total ?? undefined,
    invoiceNumber: invoice.invoice_number,
    invoiceDate: invoice.invoice_date,
  }

  return {
    row,
    fields,
    overall,
    matchedAt: new Date().toISOString(),
  }
}
