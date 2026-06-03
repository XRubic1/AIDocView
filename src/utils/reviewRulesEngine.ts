import { getBuiltInRuleParams, isBuiltInRuleEnabled } from './reviewRulesStore'

/** Amount tolerance from Rules page (percent stored as whole number, e.g. 0.5 = 0.5%). */
export function getAmountToleranceSettings(): { minUsd: number; percentFraction: number } {
  if (!isBuiltInRuleEnabled('amount_freight_tolerance')) {
    return { minUsd: 0, percentFraction: 0 }
  }
  const params = getBuiltInRuleParams('amount_freight_tolerance')
  const minUsd = params.minUsd ?? 15
  const percentWhole = params.percent ?? 0.5
  return { minUsd, percentFraction: percentWhole / 100 }
}

export function shouldUseBolZipOnlyRelaxation(): boolean {
  return isBuiltInRuleEnabled('bol_zip_only_non_blocking')
}

export function shouldUseBolCarrierSigRelaxation(): boolean {
  return isBuiltInRuleEnabled('bol_carrier_sig_non_blocking')
}

export function shouldSanitizeBolPacketPageConfusion(): boolean {
  return isBuiltInRuleEnabled('bol_packet_page_not_bol_page')
}

export function shouldMergeBolSignaturesSingleDelivery(): boolean {
  return isBuiltInRuleEnabled('bol_single_delivery_merge_sig')
}

export function shouldRelaxReceiverDateSingleDelivery(): boolean {
  return isBuiltInRuleEnabled('bol_receiver_date_optional_single')
}

export function shouldPassBolCoreAddressMatch(): boolean {
  return isBuiltInRuleEnabled('bol_core_address_pass')
}

export function shouldInvoiceMatchSamePdfOnly(): boolean {
  return isBuiltInRuleEnabled('invoice_same_pdf_only')
}

export function shouldUseCarrierOcrExcelCorrection(): boolean {
  return isBuiltInRuleEnabled('carrier_ocr_excel_correction')
}

export function shouldRelaxCrossCheckDateSingleDelivery(): boolean {
  return isBuiltInRuleEnabled('cross_single_delivery_date_relaxed')
}
