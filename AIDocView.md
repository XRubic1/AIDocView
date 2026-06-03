# Trucking Document AI Agent — Full Product Specification

---

## Overview

An AI-powered document review agent built for trucking/freight operations. The system automatically ingests, classifies, extracts, and cross-validates all paperwork associated with a load — rate confirmations, bills of lading, invoices, PODs, and more — then compares everything against an Excel load sheet to determine if the load is ready to process. Dispatchers can correct the AI mid-workflow and those corrections are saved as permanent rules.

---

## 1. Document Types Supported

The AI must recognize and handle the following document types:

| Document | Abbreviation | Description |
|---|---|---|
| Rate Confirmation | RATE_CON | Broker-issued load details and rate |
| Bill of Lading | BOL | Shipping contract and proof of pickup |
| Invoice | INVOICE | Carrier's billing document |
| Proof of Delivery | POD | Confirms delivery completion |
| Lumper Receipt | LUMPER | Third-party unloading fee receipt |
| Scale Ticket | SCALE | Weight verification document |
| Delivery Confirmation | DELIVERY_CONF | Receiver-issued delivery record |
| Trailer Control Record | TCR | Walmart-style load control document |
| Stamped BOL | STAMPED_BOL | BOL with receiver facility stamp |
| Unknown | UNKNOWN | Flagged for manual review |

---

## 2. Document Ingestion & Classification

- Accept uploads as **PDF, JPG, PNG, or TIFF**
- Support **multi-page PDFs** — each page is classified individually
- Support **batch upload** — multiple files per load in one submission
- The AI classifies every page automatically before any extraction begins
- Pages belonging to the same document type are grouped together
- Pages that cannot be identified are flagged as UNKNOWN and held for dispatcher review
- The AI must handle **multi-stop loads** — multiple BOLs, multiple delivery addresses, multiple PODs all tied to one load number

---

## 3. Data Extraction

### 3.1 Rate Confirmation Extraction

Extract the following fields:

- Load number
- Broker name and MC number
- Carrier name and MC number
- Total rate / amount
- Currency
- Origin: facility name, full address, city, state, zip, pickup date, pickup window (open/close)
- Destinations (multiple): stop number, facility name, full address, city, state, zip, delivery date, delivery window
- Commodity description
- Weight
- Temperature requirements (if applicable)
- Special instructions

### 3.2 BOL Extraction & Validation

Extract and validate:

- Shipper name and address
- Consignee / receiver name and address
- All delivery destinations listed
- BOL number
- Load / PRO number
- Page count (e.g. "page 1 of 3") — flag if pages appear missing
- Legibility check — flag pages that are blurry, rotated, cut off, or faded
- Signature check:
  - Carrier / driver signature — required
  - Shipper signature — required
  - **Receiver / consignee signature — most important**
  - **Receiver date** — must be present alongside receiver signature

### 3.3 Invoice Extraction

Extract the following fields:

- Invoice number (also attempt to read from filename if not found on document)
- Load number
- Broker name
- Carrier name
- Total amount
- Invoice date
- Any additional line items (lumper, detention, fuel surcharge, etc.)

### 3.4 Other Documents

- **POD**: confirm delivery address, receiver name, delivery date
- **Lumper receipt**: amount, facility, date — match against invoice line items if applicable
- **Scale ticket**: weight, date, facility — cross-check against rate con weight
- **Delivery confirmation / TCR / Stamped BOL**: treated as valid receiver confirmation per shipper-specific rules

---

## 4. Excel Load Sheet Integration

The user uploads an Excel file containing one row per load with the following columns:

| Column | Notes |
|---|---|
| Invoice Number | Less critical but used for matching |
| Load Number | Primary matching key |
| Broker | Must match rate con and invoice |
| Amount | Must match invoice total |
| Invoice Date | Less critical |

**Matching behavior:**

- AI reads the Excel row and compares every field against the extracted document data
- Minor formatting differences are acceptable (e.g. `12345` vs `LN-12345`)
- Broker name fuzzy match — handle abbreviations and slight variations
- Amount must match to the cent, unless additional charges are present and explained
- If any field does not match, a flag is raised with the specific mismatch detail

---

## 5. Cross-Validation Engine

The AI compares all documents against each other and against the Excel row:

### 5.1 Load Number
- Must be consistent across rate con, BOL, invoice, and Excel row
- Flag any mismatch with exact values found in each document

### 5.2 Broker
- Compare broker name across all documents
- Flag if different documents show different broker names

### 5.3 Amount
- Invoice total must match rate con rate
- If invoice includes additional charges (lumper, detention), these are noted but do not automatically fail the check
- Flag any unexplained difference

### 5.4 Carrier — Disambiguation Logic (Important)

The AI must **not lock on the first carrier name mismatch**. When a different company name is found:

1. First check if that name is a shipper, consignee, or facility — not the carrier
2. Check if it could be a DBA or alternate name for the same carrier
3. Only raise a `CARRIER_MISMATCH` flag if the name cannot be placed in any other role
4. If unresolved after two passes, raise a **WARNING** (not an error) with the message:
   > *"Could not confirm carrier — please double check"*

### 5.5 Destination Matching
- Delivery addresses on the BOL must match the destinations on the rate con
- Minor formatting differences acceptable — use judgment
- Flag any address that clearly does not match

### 5.6 Multi-Stop Coverage
- For loads with multiple destinations, verify a BOL exists for each stop
- Flag any stops that have no corresponding paperwork

---

## 6. BOL Signature Rules

### 6.1 Standard Requirements

| Signature | Required | Priority |
|---|---|---|
| Carrier / driver | Yes | High |
| Shipper | Yes | Medium |
| Receiver / consignee | Yes | **Critical** |
| Receiver date | Yes | **Critical** |

### 6.2 Shipper-Specific Overrides

Certain shippers do not provide traditional signatures. The AI must support a **rules database** that overrides standard signature requirements based on the shipper.

**Example — Walmart:**
- Walmart does not provide a live receiver signature
- Instead, they provide a **Trailer Control Record (TCR)**, a **stamped delivery confirmation**, or a **stamped BOL**
- The presence of a Walmart stamp on any of these documents counts as valid receiver confirmation
- The AI must be taught this rule and apply it automatically on future Walmart loads

Rules are added by dispatchers through the training interface (see Section 8).

---

## 7. Final Determination

After all checks are complete, the AI produces one of three outcomes:

| Status | Meaning |
|---|---|
| ✅ APPROVED | All documents present, all fields match, ready to process |
| ⚠️ NEEDS REVIEW | One or more warnings — dispatcher must review before processing |
| ❌ REJECTED | Critical mismatch or missing required document — cannot process |

---

## 8. Human-in-the-Loop Training

Dispatchers can correct the AI at any point during review. This is a core feature — not an afterthought.

### 8.1 How It Works

1. AI produces an audit result with a flag (e.g. "Receiver signature missing")
2. Dispatcher clicks **"This is wrong"** next to the flag
3. Dispatcher types an explanation (e.g. "This is a Walmart load — the stamp on page 8 is their confirmation method")
4. AI extracts a reusable rule from that explanation
5. Dispatcher confirms or edits the rule before saving
6. Rule is saved to the knowledge base
7. All future loads matching the trigger condition apply this rule automatically

### 8.2 Rule Structure

Each saved rule contains:

- **Rule ID** — short unique slug (e.g. `walmart-stamp-receiver`)
- **Trigger** — shipper name, document type, and plain-English condition
- **Override** — which check is overridden, what the new result is, and why
- **Created by** — dispatcher name or ID
- **Example note** — description of the real load that created the rule

### 8.3 Rule Management

- Dispatchers can view all saved rules in a dedicated settings page
- Rules can be edited, disabled, or deleted
- Rules show how many loads they have been applied to
- Admins can approve or reject new rules before they go live (optional toggle)

---

## 9. Output — Dispatcher Report

Every load produces a summary report readable in under 10 seconds:

```
OVERALL STATUS: ✅ APPROVED

LOAD: 98765 | BROKER: Echo Global Logistics | AMOUNT: $1,850.00

DOCUMENTS RECEIVED:
- Rate confirmation ✅
- BOL — 3 pages ✅
- Invoice ✅
- POD ✅

FLAGS:
ℹ️  INFO — Lumper receipt present. $150 added to invoice total. Within acceptable range.

RULES APPLIED:
- walmart-stamp-receiver: Receiver signature check passed via Walmart TCR stamp (page 8)
```

---

## 10. Multi-Stop Load Handling

- The AI tracks each pickup and delivery as a separate stop
- Each stop requires its own BOL
- BOLs are matched to stops by address comparison
- If a stop is missing paperwork, it is flagged individually
- The load cannot be fully approved if any stop is missing its BOL or receiver signature (unless overridden by a shipper rule)

---

## 11. User Interface Requirements

### 11.1 Upload Screen
- Drag-and-drop or file picker for documents
- Upload Excel load sheet separately or alongside documents
- Show upload progress and page count detected per file

### 11.2 Review Screen
- Show each document with its classified type and extracted fields
- Side-by-side view: document image on left, extracted data on right
- Color-coded flags: red = error, yellow = warning, blue = info
- Each flag has a **"This is wrong"** button to trigger the training flow
- Approve / send back buttons at the top

### 11.3 Training / Correction Flow
- Inline modal — dispatcher never leaves the review screen
- AI shows the rule it intends to save before committing
- Dispatcher can edit the rule text before confirming

### 11.4 Rules Management Page
- Table of all saved rules
- Filter by shipper, document type, or field
- Enable / disable toggle per rule
- Usage count and last applied date

### 11.5 Load History
- Searchable list of all processed loads
- Filter by status, broker, date range
- Click any load to see full audit trail

---

## 12. Technical Requirements

### 12.1 AI Models
- **Primary reasoning and extraction:** Claude Sonnet (Anthropic API) — best for structured extraction and cross-validation logic
- **Scanned / degraded document OCR:** GPT-4o Vision (OpenAI API) — better accuracy on faxed, handwritten, or low-quality scans
- Route documents automatically: clean digital PDFs → Claude, scanned/handwritten → GPT-4o

### 12.2 Cost Optimization
- Use Batch API (50% cost reduction) for non-urgent processing
- Enable prompt caching for repeated extraction schemas
- Process each page once and cache results — do not re-process unless document changes

### 12.3 Backend
- Python (FastAPI) or Node.js (Express)
- PostgreSQL database for rules, load history, and extracted data
- PDF-to-image conversion before sending to vision models
- Excel parsing via openpyxl (Python) or SheetJS (Node)

### 12.4 Frontend
- React web application
- Mobile-responsive for dispatcher use on tablets
- Role-based access: dispatcher, manager, admin

### 12.5 Security
- All documents stored encrypted at rest
- Access logs for every document view
- Documents auto-deleted after configurable retention period (default 90 days)

---

## 13. Future Features (Phase 2)

- **Email ingestion** — automatically pull documents from a designated inbox
- **TMS integration** — push approved load data directly into a TMS (e.g. McLeod, Aljex, Rose Rocket)
- **Carrier scorecard** — track which carriers frequently have paperwork issues
- **Broker scorecard** — track rate con quality and accuracy by broker
- **Mobile app** — driver-facing upload app for submitting docs from the road
- **Audit export** — export load audit reports as PDF for factoring companies or compliance
- **Duplicate detection** — flag if the same invoice or load number has been submitted before

---

## 14. Out of Scope (Version 1)

- No driver payroll or settlement calculations
- No load planning or dispatching
- No real-time GPS or ELD integration
- No automated payment processing

---

*Document version: 1.0 — Initial specification*
*Last updated: June 2026*