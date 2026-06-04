/** DocSort-only prompts — classify + fingerprint in one call (no audit). */

export const DOC_SORT_FINGERPRINT_PROMPT = `You help freight brokers sort uploaded PDFs into loads. Look at the first page image.

Identify document type and extract ONLY fields useful to match a rate confirmation to its bill of lading (BOL). Do not judge signatures, amounts, or approval.

doc_type:
- RATE_CON — broker load tender / rate confirmation
- BOL — bill of lading (shipper/consignee, freight description)
- OTHER — invoice, POD, lumper, unknown, etc.

load_numbers: every load/PO/reference # visible (strings). Broker PO on rate con is most important.
pickup / delivery: short "City, ST" for origin and final delivery when visible.
broker_name: freight broker (TQL, Landstar, etc.), not the motor carrier.
carrier_name: motor carrier / trucking company on rate con or BOL.
rate_amount: numeric linehaul or total rate in dollars on RATE_CON only (no $ symbol in JSON). Use the main payable rate, not fuel surcharge alone. Omit or null if not visible or not a rate con.
rate_currency: "USD" unless another currency is clearly stated.

JSON only:
{
  "doc_type": "RATE_CON",
  "confidence": 0.92,
  "load_numbers": ["4873729787"],
  "broker_name": "TQL",
  "carrier_name": "ABC Trucking",
  "pickup": "Vandalia, OH",
  "delivery": "Salem, VA",
  "rate_amount": 4300,
  "rate_currency": "USD",
  "notes": ""
}`
