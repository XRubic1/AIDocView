import { BuiltInReviewRuleDefinition } from '../types/reviewRules'

/**
 * Built-in review rules — previously hard-coded in validators.
 * Toggle or tune parameters on the Rules page; changes apply on the next review run.
 */
export const BUILT_IN_REVIEW_RULES: BuiltInReviewRuleDefinition[] = [
  {
    id: 'amount_freight_tolerance',
    name: 'Freight amount tolerance',
    category: 'amount',
    description:
      'Rate con total vs invoice total may differ slightly (OCR, rounding, minor line items). Within tolerance = INFO, not REJECT.',
    rationale: 'Small mismatches like $4345 vs $4335 should not block approval.',
    defaultEnabled: true,
    parameters: [
      { key: 'minUsd', label: 'Minimum $ variance', type: 'number', default: 15, min: 0, step: 1 },
      {
        key: 'percent',
        label: 'Percent of larger amount',
        type: 'number',
        default: 0.5,
        unit: '%',
        min: 0,
        max: 10,
        step: 0.1,
      },
    ],
  },
  {
    id: 'invoice_same_pdf_only',
    name: 'Invoice matches rate con in same PDF only',
    category: 'invoice',
    description:
      'Each invoice is verified only against the rate confirmation in the same uploaded file. Other PDFs in the batch are separate loads.',
    rationale: 'Multi-PDF uploads are independent loads, not one combined load.',
    defaultEnabled: true,
  },
  {
    id: 'bol_zip_only_non_blocking',
    name: 'ZIP-only address mismatch is informational',
    category: 'bol',
    description:
      'If street, city, and state match the rate con delivery stop, a ZIP difference alone does not fail the load.',
    rationale: 'ZIP+4 and warehouse ZIP variants are common on BOLs.',
    defaultEnabled: true,
  },
  {
    id: 'bol_carrier_sig_non_blocking',
    name: 'Shipper & carrier signatures not required for approval',
    category: 'bol',
    description:
      'Missing shipper and carrier/driver signatures on the BOL are informational only. Receiver/consignee signature is what matters for delivery approval.',
    rationale:
      'Many brokers only require receiver proof; pickup signatures are often omitted on scanned BOLs.',
    defaultEnabled: true,
  },
  {
    id: 'bol_packet_page_not_bol_page',
    name: 'Ignore PDF packet index vs BOL page count',
    category: 'bol',
    description:
      'Do not treat “page 10 of 12” in a multi-sheet PDF as missing BOL pages when the BOL footer says complete (e.g. 1 of 1).',
    rationale: 'Carrier packets mix rate con, BOL, and receipts in one scan.',
    defaultEnabled: true,
  },
  {
    id: 'bol_single_delivery_merge_sig',
    name: 'Single delivery: signature on any BOL page',
    category: 'bol',
    description:
      'One destination on the rate con: receiver signature on any BOL page in the upload is enough; unsigned copies of the same BOL do not fail.',
    rationale: 'Multi-page BOLs often sign only the last page.',
    defaultEnabled: true,
  },
  {
    id: 'bol_receiver_date_optional_single',
    name: 'Single delivery: receiver date optional on every page',
    category: 'bol',
    description:
      'For single-stop loads, receiver date is not required on every BOL page when receiver signature is present somewhere.',
    defaultEnabled: true,
  },
  {
    id: 'bol_core_address_pass',
    name: 'Pass destination when core address matches',
    category: 'bol',
    description:
      'Programmatically set destination PASS when ship-to street/city/state match the rate con stop, even if the model flagged ZIP.',
    defaultEnabled: true,
  },
  {
    id: 'carrier_ocr_excel_correction',
    name: 'Correct carrier name using Excel + OCR patterns',
    category: 'excel',
    description:
      'When Excel includes a carrier column, use it to fix common OCR errors (e.g. 405 vs 4US) on rate con and invoice.',
    defaultEnabled: true,
  },
  {
    id: 'cross_single_delivery_date_relaxed',
    name: 'Cross-check: relaxed receiver date for single delivery',
    category: 'bol',
    description:
      'Final cross-validation does not require receiver date on every page for single-destination loads when signature rules passed.',
    defaultEnabled: true,
  },
  {
    id: 'bol_signature_authenticity_review',
    name: 'Suspected fake BOL signatures → review only',
    category: 'bol',
    description:
      'When the BOL validator flags a signature as possibly forged, stamped, or digitally placed, route the load to review instead of auto-rejecting.',
    rationale:
      'Fraud indicators need human judgment; a visible mark alone is not enough to decline delivery proof.',
    defaultEnabled: true,
  },
  {
    id: 'broker_fuzzy_match',
    name: 'Broker name fuzzy match',
    category: 'general',
    description: 'Allow minor broker name variations between rate con, invoice, and Excel.',
    defaultEnabled: true,
  },
  {
    id: 'load_number_flexible_match',
    name: 'Flexible load number matching',
    category: 'general',
    description: 'Match load numbers across documents when digits align (formatting differences OK).',
    defaultEnabled: true,
  },
]

/** Default shipper-specific guidance (also editable via shipper rules). */
export const DEFAULT_SHIPPER_RULE_ENTRIES = [
  {
    shipper: 'Walmart',
    rule: 'A stamp or Walmart delivery confirmation replaces receiver signature. Check delivery confirmation or trailer control pages for stamp.',
  },
]
