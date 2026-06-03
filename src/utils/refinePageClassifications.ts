import { PageClassification, PageDocumentType } from '../types/documentReview'

const RATE_CON_NOTE_HINTS =
  /rate\s*con|load\s*confirm|tender|note\s+to\s+carrier|carrier\s+agreement|terms\s+and\s+conditions|pickup|delivery|commodity|broker|motor\s+carrier|mc[#\s]|dot[#\s]|accessorial|penalt|temperature|reefer|tql|instructions\s+for\s+submission|load\s+details|carrier\s+requirements|shipper|consignee/i

const LUMPER_NOTE_HINTS =
  /lumper|unload(?:ing)?|pallet|warehouse\s+receipt|comcheck|com\s*check|efs\s|paid\s+to\s+unload|unloading\s+fee|receiver\s+receipt|vendor\s+payment|food\s+lion|distribution\s+center/i

/** Rate con continuation pages mis-tagged as INVOICE (not carrier freight bills). */
const RATE_CON_MISLABELED_AS_INVOICE =
  /invoice\s+with\s+instructions|submission\s+instructions|payment\s+(instructions\s+)?to\s+broker|factoring|quick\s+pay|tql.*payment\s+instructions/i

/** Carrier billing document to broker — keep as INVOICE even if it precedes the rate con PDF. */
const CARRIER_FREIGHT_INVOICE =
  /carrier[- ]issued\s+invoice|freight\s+invoice|invoice\s+to\s+(tql|the\s+broker)|remit\s*-?\s*to|please\s+pay|line\s*haul|not\s+part\s+of\s+(the\s+)?broker\s+packet/i

function isCarrierFreightInvoice(page: PageClassification): boolean {
  if (page.pageType !== 'invoice') return false
  const notes = page.notes ?? ''
  return (
    CARRIER_FREIGHT_INVOICE.test(notes) ||
    /carrier[- ]issued/i.test(notes) && /not\s+part\s+of/i.test(notes)
  )
}

function reclassify(
  page: PageClassification,
  pageType: PageDocumentType,
  reason: string
): PageClassification {
  const skipped = pageType === 'blank'
  return {
    ...page,
    pageType,
    skipped,
    skipReason: skipped ? 'Blank or unreadable page' : undefined,
    notes: page.notes ? `${reason} · ${page.notes}` : reason,
  }
}

function looksLikeRateConContinuation(page: PageClassification): boolean {
  if (isCarrierFreightInvoice(page)) return false
  const notes = page.notes ?? ''
  if (RATE_CON_NOTE_HINTS.test(notes)) return true
  if (page.pageType === 'invoice' && RATE_CON_MISLABELED_AS_INVOICE.test(notes)) return true
  if (page.pageType === 'other' && notes.length > 0) return true
  return false
}

function looksLikeLumper(page: PageClassification): boolean {
  return page.pageType === 'lumper' || LUMPER_NOTE_HINTS.test(page.notes ?? '')
}

function isDeliveryDocument(page: PageClassification): boolean {
  return (
    page.pageType === 'bill_of_lading' ||
    page.pageType === 'proof_of_delivery' ||
    page.pageType === 'lumper'
  )
}

/**
 * Correct common mini-model mistakes: rate con packet pages tagged INVOICE/UNKNOWN,
 * and warehouse lumper receipts tagged INVOICE.
 */
export function refinePageClassifications(pages: PageClassification[]): PageClassification[] {
  if (pages.length === 0) return pages

  let refined = pages.map((page) => ({ ...page }))

  // 1) Invoice → lumper when notes clearly describe unloading receipts
  refined = refined.map((page) => {
    if (page.pageType !== 'invoice') return page
    if (!looksLikeLumper(page)) return page
    return reclassify(page, 'lumper', 'Adjusted: warehouse/lumper receipt (not freight invoice)')
  })

  // 2) Unknown/other → rate con when notes describe carrier/load/broker content
  refined = refined.map((page) => {
    if (page.pageType !== 'other' && page.pageType !== 'invoice') return page
    if (looksLikeLumper(page)) return page
    if (!looksLikeRateConContinuation(page)) return page
    return reclassify(page, 'rate_confirmation', 'Adjusted: part of rate confirmation packet')
  })

  const rateConIndices = refined
    .map((page, index) => (page.pageType === 'rate_confirmation' ? index : -1))
    .filter((index) => index >= 0)

  if (rateConIndices.length === 0) return refined

  const firstBolIndex = refined.findIndex((page) => page.pageType === 'bill_of_lading')
  const expandEnd = firstBolIndex >= 0 ? firstBolIndex : refined.length

  const minRate = Math.min(...rateConIndices)
  const maxRate = Math.max(...rateConIndices)

  // 3) Fill gaps and trailing packet pages before first BOL (invoice/unknown between rate con pages)
  for (let index = minRate; index < expandEnd; index += 1) {
    const page = refined[index]
    if (isDeliveryDocument(page) || isCarrierFreightInvoice(page)) continue
    if (page.pageType !== 'invoice' && page.pageType !== 'other') continue
    if (looksLikeLumper(page)) continue
    refined[index] = reclassify(
      page,
      'rate_confirmation',
      'Adjusted: rate con continuation (same upload packet)'
    )
  }

  // 4) Cover page(s) before first rate con page — only mis-tagged broker forms, not carrier invoices
  if (minRate > 0) {
    for (let index = 0; index < minRate; index += 1) {
      const page = refined[index]
      if (isDeliveryDocument(page) || looksLikeLumper(page) || isCarrierFreightInvoice(page)) {
        continue
      }
      if (page.pageType !== 'invoice' && page.pageType !== 'other') continue
      refined[index] = reclassify(
        page,
        'rate_confirmation',
        'Adjusted: rate con cover/terms (precedes rate con pages)'
      )
    }
  }

  // 5) Pages after last rate con index but before BOL (pages 6–8 in typical TQL packets)
  for (let index = maxRate + 1; index < expandEnd; index += 1) {
    const page = refined[index]
    if (isDeliveryDocument(page) || isCarrierFreightInvoice(page)) continue
    if (page.pageType !== 'invoice' && page.pageType !== 'other') continue
    if (looksLikeLumper(page)) continue
    refined[index] = reclassify(
      page,
      'rate_confirmation',
      'Adjusted: rate con terms/addenda before BOL'
    )
  }

  return applyCarrierSubmissionPageOrder(refined)
}

/**
 * Typical carrier submission: page 1 = carrier invoice, then broker rate con pages, then BOL.
 */
function applyCarrierSubmissionPageOrder(pages: PageClassification[]): PageClassification[] {
  if (pages.length < 3) return pages
  if (pages.some((page) => page.pageType === 'invoice')) return pages

  const rateConCount = pages.filter((page) => page.pageType === 'rate_confirmation').length
  const hasBol = pages.some((page) => page.pageType === 'bill_of_lading')

  if (!hasBol || rateConCount < 2 || pages[0].pageType !== 'rate_confirmation') {
    return pages
  }

  const refined = pages.map((page) => ({ ...page }))
  refined[0] = {
    ...reclassify(
      pages[0],
      'invoice',
      'Adjusted: page 1 is carrier invoice (standard order: invoice → rate con → BOL)'
    ),
    skipped: false,
    skipReason: 'Carrier invoice — billed information (extracted during review)',
  }
  return refined
}
