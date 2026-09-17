import { companyNamesFuzzyMatch } from './brokerFuzzyMatch'

/** Carrier account name from the uploaded Excel file name (e.g. "JPP Express.xls"). */
export function carrierNameFromExcelFileName(fileName?: string | null): string | undefined {
  if (!fileName?.trim()) return undefined
  const base = fileName.replace(/\.(xlsx|xls|csv)$/i, '').trim()
  return base || undefined
}

export interface BrokerCarrierPartyMatch {
  status: 'ok' | 'issue' | 'warning' | 'missing'
  summary: string
  excelValue: string
  documentValue: string
  swapCorrected: boolean
}

export interface BrokerCarrierExcelMatch {
  swapLikely: boolean
  carrier: BrokerCarrierPartyMatch
  broker: BrokerCarrierPartyMatch
}

/**
 * Match broker/carrier using factoring conventions:
 * - Excel file name = carrier (motor carrier account)
 * - Excel Debtor column = carrier name on the row when AI swaps labels on rate con
 * - Detect broker/carrier label swap on rate con and compare the corrected parties
 */
export function matchBrokerCarrierFromExcel(
  excelFileName: string | undefined,
  excelDebtor: string | undefined,
  docBroker: string | undefined,
  docCarrier: string | undefined
): BrokerCarrierExcelMatch {
  const fileCarrier = carrierNameFromExcelFileName(excelFileName)
  const swapLikely = detectBrokerCarrierSwap(fileCarrier, excelDebtor, docBroker, docCarrier)

  if (swapLikely && fileCarrier && docBroker && docCarrier) {
    const carrierOk = companyNamesFuzzyMatch(fileCarrier, docBroker)
    const brokerOk = excelDebtor
      ? companyNamesFuzzyMatch(excelDebtor, docCarrier)
      : true
    return {
      swapLikely: true,
      carrier: {
        status: carrierOk ? 'ok' : 'issue',
        summary: carrierOk
          ? 'Carrier matches Excel file name (broker/carrier labels were swapped on the rate con).'
          : `Carrier on Excel file (${fileCarrier}) does not match the party labeled broker on the paperwork (${docBroker}).`,
        excelValue: fileCarrier,
        documentValue: docBroker,
        swapCorrected: true,
      },
      broker: {
        status: excelDebtor ? (brokerOk ? 'ok' : 'issue') : docCarrier ? 'warning' : 'missing',
        summary: excelDebtor
          ? brokerOk
            ? 'Broker matches Excel Debtor (broker/carrier labels were swapped on the rate con).'
            : `Excel Debtor (${excelDebtor}) does not match the party labeled carrier on the paperwork (${docCarrier}).`
          : 'Broker taken from the carrier field on the rate con (labels appear swapped).',
        excelValue: excelDebtor ?? '—',
        documentValue: docCarrier,
        swapCorrected: true,
      },
    }
  }

  const carrierOk =
    fileCarrier && docCarrier ? companyNamesFuzzyMatch(fileCarrier, docCarrier) : false
  const carrier: BrokerCarrierPartyMatch = {
    status: !fileCarrier
      ? docCarrier
        ? 'warning'
        : 'missing'
      : !docCarrier
        ? 'issue'
        : carrierOk
          ? 'ok'
          : 'issue',
    summary: !fileCarrier
      ? 'Excel file name could not be read for carrier check.'
      : !docCarrier
        ? 'Carrier was not found on the rate confirmation.'
        : carrierOk
          ? 'Carrier matches Excel file name.'
          : `Carrier on Excel file (${fileCarrier}) does not match the paperwork carrier (${docCarrier}).`,
    excelValue: fileCarrier ?? '—',
    documentValue: docCarrier ?? '—',
    swapCorrected: false,
  }

  const debtorLooksLikeCarrier =
    Boolean(excelDebtor && docCarrier) && companyNamesFuzzyMatch(excelDebtor, docCarrier)
  const brokerOk =
    excelDebtor && docBroker && !debtorLooksLikeCarrier
      ? companyNamesFuzzyMatch(excelDebtor, docBroker)
      : false

  let broker: BrokerCarrierPartyMatch
  if (debtorLooksLikeCarrier && docBroker) {
    broker = {
      status: 'warning',
      summary:
        'Excel Debtor matches the carrier on the paperwork, not the broker. Broker is verified on the rate con only.',
      excelValue: excelDebtor ?? '—',
      documentValue: docBroker,
      swapCorrected: false,
    }
  } else if (excelDebtor && docBroker) {
    broker = {
      status: brokerOk ? 'ok' : 'issue',
      summary: brokerOk
        ? 'Broker matches Excel Debtor.'
        : `Broker on Excel Debtor (${excelDebtor}) does not match the paperwork broker (${docBroker}).`,
      excelValue: excelDebtor,
      documentValue: docBroker,
      swapCorrected: false,
    }
  } else {
    broker = {
      status: docBroker ? 'warning' : 'missing',
      summary: excelDebtor
        ? 'Broker was not found on the paperwork to compare with Excel Debtor.'
        : 'No Debtor value on the Excel row.',
      excelValue: excelDebtor ?? '—',
      documentValue: docBroker ?? '—',
      swapCorrected: false,
    }
  }

  return { swapLikely, carrier, broker }
}

export function detectBrokerCarrierSwap(
  excelFileCarrier: string | undefined,
  excelDebtor: string | undefined,
  docBroker: string | undefined,
  docCarrier: string | undefined
): boolean {
  if (!excelFileCarrier || !docBroker || !docCarrier) return false

  const fileMatchesLabeledBroker = companyNamesFuzzyMatch(excelFileCarrier, docBroker)
  const fileMatchesLabeledCarrier = companyNamesFuzzyMatch(excelFileCarrier, docCarrier)
  if (!fileMatchesLabeledBroker || fileMatchesLabeledCarrier) return false

  if (
    excelDebtor &&
    companyNamesFuzzyMatch(excelDebtor, docCarrier) &&
    !companyNamesFuzzyMatch(excelDebtor, docBroker)
  ) {
    return true
  }

  return fileMatchesLabeledBroker && !fileMatchesLabeledCarrier
}
