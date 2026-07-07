import { DocumentReviewResult, PageClassification } from '../types/documentReview'
import { invoiceNumberFromFileName, loadNumberFromFileName } from './extractBatchFields'

/** Apply user page-type corrections and promote mis-tagged page-1 invoice data when needed. */
export function applyPageClassificationCorrections(
  doc: DocumentReviewResult,
  pages: PageClassification[]
): DocumentReviewResult {
  const ext = doc.extraction
  const page1 = pages.find((page) => page.pageNumber === 1)
  const page1NowInvoice = page1?.pageType === 'invoice'
  const hasInvoicePage = pages.some((page) => page.pageType === 'invoice')

  let extraction = { ...ext, pageClassifications: pages }

  if (page1NowInvoice && !ext.primaryInvoice) {
    const rate = ext.rateConParse
    const fields = ext.rateConFields
    const stemLoad = loadNumberFromFileName(doc.fileName)
    const amount =
      rate?.rate_total ??
      ext.rate ??
      (typeof fields?.rate?.value === 'number' ? fields.rate.value : undefined)

    if (stemLoad || amount != null || rate?.load_number) {
      extraction.primaryInvoice = {
        load_number: stemLoad ?? rate?.load_number ?? fields?.loadNumber?.value?.toString(),
        amount_total: amount ?? undefined,
        broker_name: rate?.broker_name ?? fields?.broker?.value?.toString(),
        carrier_name: rate?.carrier_name ?? fields?.carrier?.value?.toString(),
        invoice_number: invoiceNumberFromFileName(doc.fileName),
      }
    }
  }

  if (hasInvoicePage && extraction.documentType === 'rate_confirmation') {
    extraction.documentType = 'invoice' as import('../types/documentReview').DocumentType
  }

  return { ...doc, extraction }
}
