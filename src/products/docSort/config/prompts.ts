/** DocSort-only prompts — classify + fingerprint in one call (no audit). */

export const DOC_SORT_FINGERPRINT_PROMPT = `You help trucking A/R staff package uploaded PDFs into loads. You may see several pages of the SAME file.

These pages are ONE document, not separate invoices:
- Rate confirmation page 1: broker, load #, pickup/delivery
- Later pages: driver instructions, pay breakdown, terms, signatures
If ANY page is a rate confirmation / load tender, doc_type is RATE_CON even when later pages look like instructions.
If ANY page is a bill of lading, doc_type is BOL.
Do not invent a new invoice from an instructions-only page.

load_numbers: broker load / rate confirmation / PO only — the number that identifies THIS shipment. Never trailer #, truck/unit # (like 0040), SCAC, PRO, BOL number unless it is clearly the load, or page counts.
pickup / delivery: short "City, ST" when visible.
pickup_date / delivery_date: calendar dates on the page (pickup or delivery / ship). Use YYYY-MM-DD when you can. Different dates mean different loads.
broker_name: freight broker, not the motor carrier and not the shipper.
carrier_name: motor carrier / trucking company.
rate_amount: numeric payable linehaul or total in dollars (no $). Look at EVERY page — the amount is often not on page 1. Omit or null if not visible.
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
  "pickup_date": "2026-03-11",
  "delivery_date": "2026-03-12",
  "rate_amount": 4300,
  "rate_currency": "USD",
  "notes": ""
}`
