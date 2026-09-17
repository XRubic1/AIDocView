import { FIELD_UNCERTAINTY_THRESHOLD } from './rateConRules'

/** Compact classifier hints — full disambiguation lives in code/refinement. */
export const CLASSIFIER_DISAMBIGUATION_RULES = `
Key distinctions:
- RATE_CON: broker load tender (TQL, Landstar, etc.) — all pages of the same broker packet, including terms/notes pages.
- INVOICE: carrier bill to broker for payment (often page 1 before rate con in a submission).
- LUMPER_RECEIPT: warehouse unloading receipt (lumper, COMcheck, EFS) — not linehaul invoice.
- BOL: shipper/consignee blocks, freight description, signatures.
- UNKNOWN only if illegible; if it mentions load/broker/pickup/delivery, prefer the best freight type.`

/** Prompt 1 — Document Classifier (per page). */
export const DOCUMENT_CLASSIFIER_PROMPT = `Classify one freight document page image.

${CLASSIFIER_DISAMBIGUATION_RULES}

Types: RATE_CON | BOL | INVOICE | POD | LUMPER_RECEIPT | SCALE_TICKET | DELIVERY_CONFIRMATION | TRAILER_CONTROL_RECORD | STAMPED_BOL | BLANK | UNKNOWN

JSON only:
{"page_number":1,"doc_type":"RATE_CON","confidence":0.97,"is_blank":false,"is_legible":true,"notes":""}`

/** Prompt 1b — classify several pages in one API call. */
export function buildMultiPageClassifierPrompt(pageNumbers: number[]): string {
  const list = pageNumbers.join(', ')
  return `Classify ${pageNumbers.length} freight page image(s) in order (pages ${list}).

${CLASSIFIER_DISAMBIGUATION_RULES}

Types per page: RATE_CON | BOL | INVOICE | POD | LUMPER_RECEIPT | SCALE_TICKET | DELIVERY_CONFIRMATION | TRAILER_CONTROL_RECORD | STAMPED_BOL | BLANK | UNKNOWN

JSON only:
{"pages":[{"page_number":1,"doc_type":"RATE_CON","confidence":0.97,"is_blank":false,"is_legible":true,"notes":""}]}`
}

/** Prompt 2 — Rate Con Extractor. */
export function buildRateConExtractorPrompt(): string {
  return `Extract fields from this rate confirmation. JSON only; null if not visible; do not guess.

Carrier vs broker: carrier = motor carrier; broker = who arranged load. Landstar-branded docs → broker Landstar, not agency office names.
Watch OCR on carrier prefix (405 vs 4US). Include source_region (0–1 box) per field in "fields" when confidence < ${FIELD_UNCERTAINTY_THRESHOLD}.

Also: rate_line_items (linehaul/fuel/unloading/detention/other), bol_reference_numbers.
emailDomain: domain only from a broker contact email on the page (e.g. werner.com from ap@werner.com). Never invent.

{
  "load_number":"","broker_name":"","broker_mc":"","carrier_name":"","carrier_mc":"",
  "rate_total":null,"rate_currency":"USD",
  "origin":{"name":"","address":"","city":"","state":"","zip":"","pickup_date":"","pickup_time_open":"","pickup_time_close":""},
  "destinations":[{"stop_number":1,"name":"","address":"","city":"","state":"","zip":"","delivery_date":"","delivery_time_open":"","delivery_time_close":""}],
  "commodity":"","weight":"","temperature":"","special_instructions":"",
  "rate_line_items":[{"description":"","amount":null,"category":"linehaul"}],
  "bol_reference_numbers":[],
  "confidence":0.9,
  "fields":{"carrier":{"value":"","confidence":0.9,"reasoning":"","source_region":null},"broker":{"value":"","confidence":0.9,"reasoning":"","source_region":null},"rate":{"value":null,"confidence":0.9,"reasoning":"","source_region":null},"emailDomain":{"value":"","confidence":0.9,"reasoning":"","source_region":null},"loadNumber":{"value":"","confidence":0.9,"reasoning":"","source_region":null},"pickup":{"value":"","confidence":0.9,"reasoning":"","source_region":null},"drop":{"value":"","confidence":0.9,"reasoning":"","source_region":null}}
}`
}

/** Prompt — Invoice extractor (single or multi-page). */
export function buildInvoiceExtractorPrompt(rateConContext?: string): string {
  const rateBlock = rateConContext ? `\nExpected load: ${rateConContext}\n` : ''
  return `Extract carrier freight invoice fields (bill to broker).${rateBlock}
JSON only; null if not visible. Watch carrier OCR (0/O/U).
{"invoice_number":"","load_number":"","broker_name":"","carrier_name":"","amount_total":null,"invoice_date":"","line_items":[{"description":"","amount":null}],"confidence":0.9,"notes":""}`
}

/** Batch invoice extraction — one API call for multiple invoice pages. */
export function buildMultiInvoiceExtractorPrompt(pageNumbers: number[], rateConContext?: string): string {
  const rateBlock = rateConContext ? `\nExpected load: ${rateConContext}\n` : ''
  return `Extract carrier invoice fields from ${pageNumbers.length} page(s) (${pageNumbers.join(', ')}).${rateBlock}
One entry per page. JSON only:
{"pages":[{"page_number":1,"invoice_number":"","load_number":"","broker_name":"","carrier_name":"","amount_total":null,"invoice_date":"","line_items":[{"description":"","amount":null}],"confidence":0.9,"notes":""}]}`
}

/** Prompt — Lumper receipt extractor. */
export function buildLumperExtractorPrompt(_rateConContext?: string): string {
  return `Extract lumper/unloading receipt: amount, vendor. JSON only; null if not visible.
{"amount":null,"vendor":"","notes":"","confidence":0.9}`
}

/** Batch lumper extraction. */
export function buildMultiLumperExtractorPrompt(pageNumbers: number[]): string {
  return `Extract lumper/unloading amounts from ${pageNumbers.length} page(s) (${pageNumbers.join(', ')}). JSON only:
{"pages":[{"page_number":1,"amount":null,"vendor":"","notes":"","confidence":0.9}]}`
}

export interface BolValidatorContext {
  /** PDF page index in the combined upload (not BOL printed pagination). */
  packetPageNumbers: number[]
  allBolPacketPageNumbers: number[]
  totalPacketPages: number
}

/** Prompt 3 — BOL Validator (audit against rate con + shipper rules). */
export function buildBolValidatorPrompt(
  rateConJson: string,
  shipperRulesJson: string,
  reviewContext?: BolValidatorContext
): string {
  const contextBlock = reviewContext
    ? `PDF context: ${reviewContext.totalPacketPages} sheets total; BOL sheets ${reviewContext.allBolPacketPageNumbers.join(',')}; this request pages ${reviewContext.packetPageNumbers.join(',')}. "Sheet 10 of 12" is PDF index, not BOL pagination.\n`
    : ''

  return `Audit bill of lading image(s). Check ALL pages — receiver sig/date often on last page.
${contextBlock}
Rate con: ${rateConJson}
Shipper rules (if shipper matches): ${shipperRulesJson}

Rules:
- page_count: use BOL printed pagination only ("Page 1 of 1" / "1/1" = PASS). If the form does NOT print a page count (no "1 of 4", "1/2", etc.), return PASS — assume complete. INCOMPLETE only when the footer clearly shows missing pages (e.g. "2 of 3" / "1/4" without the other pages in this upload).
- destination: PASS if consignee street/city/state match rate con; ZIP-only diff = note only.
- signatures: receiver required for delivery; shipper/carrier optional (informational). Look for ink/stamp/initials in consignee box — not printed text. Single delivery: receiver on any page = PRESENT.
- localization: for EVERY signature status PRESENT, return a normalized bounding box (page, x, y, w, h — 0–1, top-left origin) and a short description of what is inside the box (ink signature / stamp / initials / printed text). The box must fully contain all ink marks — signatures often extend below the printed signature line, so include the full handwritten stroke. Example receiver_localization: {"page":1,"x":0.62,"y":0.81,"w":0.18,"h":0.04,"description":"ink signature in consignee signature line","mark_kind":"ink_signature"}. If you cannot draw a box that includes the ink, do NOT mark PRESENT.
- authenticity: flag NOTED if signature looks traced, stamped, or digitally overlaid.
- delivery_exceptions: NOTED for damage/shortage/protest notes; else NONE.
- reference_numbers: all visible load/BOL/PO numbers.
- ship_from / ship_to: copy the full shipper and consignee facility lines (company + address). Do not leave blank if printed on the form.
- STOLEN-ID / FRAUD RISK (always check):
  1) If the rate-con broker name appears as BOTH shipper/ship-from AND receiver/consignee/ship-to, add a WARNING flag (field hint: broker_as_shipper_and_receiver) — very high risk.
  2) If there is no usable shipper facility AND no usable receiver facility (blank, "as directed", name-only with no address/warehouse/DC), add a WARNING flag (field hint: missing_shipper_receiver_facilities) — very high risk.
  3) Broker on only one end, or one missing facility, still note as WARNING for human review.

JSON only:
{"bol_audit":{"destination_match":"PASS","destination_notes":"","legibility":"PASS","legibility_notes":"","page_count":"PASS","page_count_notes":"","signatures":{"carrier":"PRESENT","shipper":"PRESENT","receiver":"PRESENT","receiver_date":"PRESENT","receiver_authenticity":"NONE","shipper_authenticity":"NONE","carrier_authenticity":"NONE","rule_applied":null,"receiver_localization":{"page":1,"x":0.62,"y":0.81,"w":0.18,"h":0.04,"description":"ink signature in consignee box","mark_kind":"ink_signature"},"shipper_localization":null,"carrier_localization":null},"ship_from":"","ship_to":"","load_number":"","reference_numbers":[],"delivery_exceptions":{"damages":"NONE","shortage":"NONE","protest":"NONE","notes":""},"overall":"APPROVED","flags":[]}}`
}

/** Cheap follow-up: verify a cropped receiver-signature region. */
export function buildSignatureCropVerifyPrompt(): string {
  return `You are verifying a cropped region from a freight bill of lading (receiver/consignee signature area).

Does this crop contain a handwritten signature, a stamp, initials, or only printed text/empty space?

Return JSON only:
{"content":"handwritten_signature|stamp|initials|printed_text|empty|unclear","confidence":0.0-1.0,"notes":"brief reason"}`
}

/** Prompt 4 — Cross-Validator (text-only; no images). */
export function buildCrossValidatorPrompt(
  rateConJson: string,
  bolAuditJson: string,
  invoiceJson: string,
  excelRowJson: string
): string {
  return `You are a freight document cross-validator.

Rate con data:
${rateConJson}

BOL audit:
${bolAuditJson}

Invoice data:
${invoiceJson}

Excel load row:
${excelRowJson}

MATCHING RULES:
- LOAD NUMBER: must match across docs; minor formatting OK
- BROKER: compare names; flag mismatch
- AMOUNT: invoice vs rate con within $0.01 unless overage explained
- CARRIER: do not flag on first mismatch — check shipper/consignee/DBA roles; WARNING if unresolved
- MULTI-STOP: each rate con destination needs BOL coverage
- FRAUD / STOLEN-ID: WARNING if broker appears as both ship_from and ship_to on BOL; WARNING if BOL lacks usable shipper AND receiver facilities

Return JSON only:
{
  "cross_validation": {
    "load_number": {"status": "MATCH" | "MISMATCH", "details": ""},
    "broker": {"status": "MATCH" | "MISMATCH", "details": ""},
    "amount": {"status": "MATCH" | "MISMATCH" | "OVERAGE_EXPLAINED", "rate_con_amount": null, "invoice_amount": null, "difference": null, "details": ""},
    "carrier": {"status": "CONFIRMED" | "WARNING" | "MISMATCH", "details": ""},
    "multi_stop_coverage": {"status": "COMPLETE" | "INCOMPLETE", "missing_stops": []},
    "overall": "APPROVED" | "NEEDS_REVIEW" | "REJECTED",
    "flags": [{"level": "ERROR" | "WARNING" | "INFO", "field": "", "message": ""}]
  }
}`
}

/** Prompt 5 — Human Feedback / Training Loop → reusable shipper rule. */
export function buildDispatcherRulePrompt(
  originalFindingJson: string,
  dispatcherCorrection: string
): string {
  return `A dispatcher reviewed an AI audit and disagrees with findings.

Original AI finding:
${originalFindingJson}

Dispatcher correction:
"${dispatcherCorrection}"

Extract a reusable rule. Return JSON only:
{
  "rule_id": "short-slug",
  "trigger": {
    "shipper_name": "" | null,
    "doc_type": "" | null,
    "condition": "when this rule applies"
  },
  "override": {
    "field": "which check is overridden",
    "result": "PASS_BY_RULE",
    "reason": "explanation for future audits"
  },
  "created_by": "dispatcher",
  "example_note": "brief case description"
}`
}

/** Prompt 6 — Final Summary Report (text-only). */
export function buildFinalSummaryPrompt(auditBundleJson: string): string {
  return `Generate a final processing report for a freight load.

Audit bundle:
${auditBundleJson}

Write a short summary a dispatcher can read in 10 seconds, then list flags.

Return plain text in this format (use emoji as shown):

OVERALL STATUS: ✅ APPROVED  /  ⚠️ NEEDS REVIEW  /  ❌ REJECTED

LOAD: [load number] | BROKER: [broker] | AMOUNT: $[amount]

DOCUMENTS RECEIVED:
- Rate con ✅ or ❌
- BOL (N pages) ✅ or ❌
- Invoice ✅ or ❌
- [missing docs]

FLAGS:
- [ERROR/WARNING bullets]

RULES APPLIED:
- [shipper rules used, or "None"]`
}

/** @deprecated Import from reviewRulesDefaults; kept for existing imports. */
export { DEFAULT_SHIPPER_RULE_ENTRIES as DEFAULT_SHIPPER_RULES } from './reviewRulesDefaults'
