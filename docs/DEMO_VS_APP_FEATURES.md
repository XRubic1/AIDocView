# Demo Data vs App Features — Coverage Audit

> Comparison of what the application actually supports (type unions + rendered UI)
> against what the demo seed (`scripts/seedDemoClient.ts`) writes. Answers: which
> statuses/features exist, which the demo uses, which it skips, and which "statuses"
> in the client portal are derived display buckets rather than stored values.
>
> Audited: 2026-08-05 · Updated: 2026-08-06 · Companion: `docs/INVOICE_LIFECYCLE_FIXES.md`

**Headline finding:** the demo writes **only valid** stored statuses. After the
2026-08-06 seed expansion, lifecycle queues that were empty (write-off approval,
pending payments, receipt disputes, invoice/batch review) now have demo rows.
Remaining gaps are niche (`payment_kind: 'over'`, dispute `under_review` /
`closed`, batch `approval` / `processing` mid-states).

---

## 1. Invoice statuses

Stored union (`src/types/invoice.ts`):
`pending · approved · rejected · hold · paid · force_closed · written_off · write_off_pending`

| Status | App behavior | Demo | Notes |
|---|---|---|---|
| `approved` | Open A/R, ages, chase eligible | ✅ bulk | Open / overdue / confirm / short / etc. |
| `paid` | Closed, fee billable | ✅ | Includes overpaid-confirmed #2409 |
| `hold` | Amber pill, blocks posting | ✅ | #2203 missing BOL + #2414 receipt dispute |
| `force_closed` | Managed-only close, fee billable, exits aging | ✅ | #2001 |
| `written_off` | Fee-exempt, masked write-off | ✅ | #2411 (approved) |
| `write_off_pending` | Awaiting Credyx approval; client sees "Written off" | ✅ | **#2412** — admin write-off queue |
| `pending` | Awaiting Credyx review | ✅ | **#2416** — Pending tab + AI `running` |
| `rejected` | Failed review, in Closed bucket | ✅ | **#2417** — AI `needs_work` |

### Client-portal pills are derived, not stored

`getInvoiceListPriorityBucket` / `ClientInvoices` filters compute these at render time:

| Pill | Derivation |
|---|---|
| **Confirm payment** | Any payment on the invoice with status `awaiting_receipt` |
| **Short paid** | Confirmed cash > 0 and < invoice amount |
| **Overdue** | `approved` + ≥ 15 days past expected pay |
| **Open** | `approved`, not overdue/short/confirm |
| **Active** | Everything not paid/closed |
| **Closed** | `force_closed`, `written_off`, `rejected` |

There is **no** stored `overdue`, `open`, `confirm`, or `short_paid` invoice status.
If a demo script or marketing asset needs status names, use the stored union or these
derived labels — don't invent intermediate ones.

---

## 2. Payment statuses

Union (`src/types/payment.ts`):
`pending · awaiting_receipt · disputed · confirmed · rejected · reversed`

| Status | App behavior | Demo |
|---|---|---|
| `confirmed` | Applied to received totals | ✅ |
| `awaiting_receipt` | Managed carrier must confirm (30-day auto-confirm) | ✅ 4 rows — deadlines = payDate+30 (not clamped to as-of) |
| `pending` | Client-posted payment awaiting Credyx approval | ✅ **#2413** |
| `disputed` | Receipt dispute → invoice hold, admin resolves | ✅ **#2414** |
| `reversed` | Payment corrections (unprocessed / moved) | ✅ **#2415** (`reversal_type: unprocessed`) |
| `rejected` | Dispute resolved against posting | ❌ still not seeded (reachable by resolving #2414 as reject) |

Payment kinds: `normal` ✅ · `short` ✅ (chargeback #2410) · `over` ❌ (overpays remain single inflated `normal` rows).
`short_pay_reason`: `chargeback` ✅ · `wrong_amount` ❌.

---

## 3. Batch statuses

Union (`src/types/admin.ts` `PendingBatch`):
`draft · ready_to_post · verification · approval · submitted · processing · documents_uploaded`
plus AI `sort_status`: `pending · sorting · ready · failed`.

| Status / field | Demo |
|---|---|
| `submitted` | ✅ five monthly batches (M0–M4) |
| `verification` | ✅ **REVIEW** batch (#2416/#2417) — `upload_mode: ai`, `sort_status: ready` |
| `draft` | ✅ **DRAFT** batch — empty, `sort_status: pending` |
| `ready_to_post` / `approval` / `processing` | ❌ not seeded |
| `upload_mode` | ✅ `manual` / `handoff` / `ai` |
| Fee terms | ✅ M4 **trial** · M2 **$50 flat** · others **1% billable** |

---

## 4. Dispute & doc statuses

- **Invoice disputes** (`open · under_review · resolved · closed`): ✅ `open` (hold #2203) + `resolved` (#2204). `under_review` / `closed` never appear.
- **Payment receipt disputes**: ✅ #2414 (`funds_not_received`, status `open`, invoice hold).
- **Document send** (`sent · delivered · failed`): ✅ `delivered` everywhere; ✅ `failed` + resent `delivered` on #2415.
- **Vault docs** (`approval_status`): ✅ mostly `approved`; ✅ **IFTA pending** approval; ✅ COI **expires as-of day** (reminder surface).
- **AI review** (`not_run · running · ready · needs_work`): ✅ `running` on pending #2416 · `needs_work` on rejected #2417 · `ready` elsewhere.

---

## 5. Fields the demo writes that the client portal never renders

These are valid `Invoice` fields but **admin-only** (shown in `InvoiceDetailModal` /
`AdminInvoiceDetailView`) or currently dormant. Harmless, but don't reference them in
client-facing demo scripts:

| Field | Seeded value | Rendered where |
|---|---|---|
| `verification_status` | `'Email'` on every invoice | Admin detail views only |
| `contact_persons` / `selected_contact_person` | `['AP Desk', 'Dispatcher']` / `'AP Desk'` | Admin detail views only |
| `collection_status` (`C/B` / `W/P`) + `collection_date` | On chase scenarios | Admin chase queue / calendar — not client portal |
| `remittance_snapshot` | `null` | Fraud-flagging feature; inert when null |
| `ai_confirmed_at/by` | Set on all | Admin AI review context |

Client-invisible by design: `write_off_pending` masking and `write_off_request`
stripping (`toClientVisibleInvoice`) both work correctly in the demo (#2411 + #2412).

---

## 6. Feature coverage matrix

| App feature | Demo coverage |
|---|---|
| Invoice aging buckets + overdue chase | ✅ Good spread (current → 91+) |
| PPW send history + broker follow-up notes | ✅ (+ failed send/resend on #2415) |
| Receipt confirmation (managed) | ✅ 4 invoices — deadlines stay 30 days out |
| Short pay → confirm → write-off request | ✅ #2411 done · #2412 pending queue |
| Overpayment accept | ✅ #2408/#2409 |
| Chargeback correction | ✅ #2410 |
| Force close (managed) | ✅ #2001 |
| Fee terms snapshot | ✅ trial / flat / 1% variety across batches |
| Collection statuses C/B / W/P (admin) | ✅ |
| Invoice disputes | ✅ open + resolved |
| Client-posted payments (pending approval) | ✅ #2413 |
| Payment receipt disputes | ✅ #2414 |
| Payment corrections (unprocess / reverse) | ✅ #2415 |
| Write-off approval queue (admin) | ✅ #2412 |
| Invoice review pipeline (pending / rejected) | ✅ #2416 / #2417 |
| Batch review pipeline (verification / drafts / AI sort) | ✅ REVIEW + DRAFT batches |
| Vault doc approval flow / expiry reminders | ✅ pending IFTA + expiring COI |
| AI review `needs_work` | ✅ #2417 |

---

## 7. Remaining optional polish

Ranked by demo value; all are seed-only.

1. Seed a `payment_kind: 'over'` correction child (today overpays are inflated `normal` rows).
2. Seed `short_pay_reason: 'wrong_amount'` alongside the existing chargeback.
3. Seed payment status `rejected` (or resolve #2414 live in the admin demo script).
4. Seed dispute statuses `under_review` / `closed`.
5. Seed batch mid-states `approval` / `processing` / `ready_to_post` if those screens need static data.
6. When writing demo scripts/marketing: reference stored statuses or derived pill
   names from §1 only. Do not use stage names that don't exist in the app (e.g.
   "invoice verified" is a *step label*, not a status; "delivered" is not an invoice
   state — see `.cursor/rules/credyx-marketing-prompts.mdc` stepper rules).

**Re-seed after pull:** `npm run seed-demo -- "ABC Trucking"`  
**Date audit:** `npm run seed-demo -- verify-dates`
