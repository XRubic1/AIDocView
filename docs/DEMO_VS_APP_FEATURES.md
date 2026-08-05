# Demo Data vs App Features — Coverage Audit

> Comparison of what the application actually supports (type unions + rendered UI)
> against what the demo seed (`scripts/seedDemoClient.ts`) writes. Answers: which
> statuses/features exist, which the demo uses, which it skips, and which "statuses"
> in the client portal are derived display buckets rather than stored values.
>
> Audited: 2026-08-05 · Companion doc: `docs/INVOICE_LIFECYCLE_FIXES.md`

**Headline finding:** the demo does **not** write any status outside the app's type
unions — every stored value is valid. The confusion comes from three things:

1. Client-portal pills (*Confirm payment, Short paid, Open, Overdue, Active, Closed*)
   are **derived buckets**, not stored invoice statuses.
2. The demo **skips entire lifecycle stages** (review/pending states, approval queues),
   so several app screens are permanently empty in the demo.
3. The demo writes some **admin-only / dormant fields** that the client portal never
   renders, which can look like phantom features.

---

## 1. Invoice statuses

Stored union (`src/types/invoice.ts`):
`pending · approved · rejected · hold · paid · force_closed · written_off · write_off_pending`

| Status | App behavior | Demo | Notes |
|---|---|---|---|
| `approved` | Open A/R, ages, chase eligible | ✅ 13 invoices | Bulk of the demo |
| `paid` | Closed, fee billable | ✅ 7 | Includes overpaid-confirmed #2409 |
| `hold` | Amber pill, blocks posting | ✅ 2 | Dispute-driven holds |
| `force_closed` | Managed-only close, fee billable, exits aging | ✅ 1 | #2001 |
| `written_off` | Fee-exempt, masked write-off | ✅ 1 | #2411 (pre-resolved) |
| `pending` | Awaiting Credyx review | ❌ never seeded | **"Pending 0" tab is always empty** |
| `rejected` | Failed review, in Closed bucket | ❌ never seeded | Rejection flow not demoable |
| `write_off_pending` | Awaiting Credyx approval; client sees "Written off" | ❌ never seeded | **Admin write-off approval queue starts empty** — #2411 ships already approved. Reachable at runtime by requesting a write-off. |

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
| `confirmed` | Applied to received totals | ✅ 12 rows |
| `awaiting_receipt` | Managed carrier must confirm (30-day auto-confirm) | ✅ 4 rows |
| `pending` | **Client-posted payment awaiting Credyx approval** — the whole self-service posting flow | ❌ never seeded |
| `disputed` | Receipt dispute → invoice goes on hold, admin resolves | ❌ never seeded |
| `rejected` | Dispute resolved against posting / payment reversed out | ❌ never seeded |
| `reversed` | Payment corrections (moved / unprocessed) | ❌ never seeded |

Payment kinds: `normal` ✅ · `short` ✅ (chargeback #2410) · `over` ❌ (overpay
correction rows never demoed — demo overpays are single inflated `normal` payments).
`short_pay_reason`: `chargeback` ✅ · `wrong_amount` ❌.

---

## 3. Batch statuses

Union (`src/types/admin.ts` `PendingBatch`):
`draft · ready_to_post · verification · approval · submitted · processing · documents_uploaded`
plus AI `sort_status`: `pending · sorting · ready · failed`.

The demo seeds **only `submitted`** (all five batches, reviewed same day). Never
demoable from seed data: batch review pipeline (verification → approval), drafts,
processing, AI DocSort states, `upload_mode` (`ai` / `manual` / `handoff` — unset).

---

## 4. Dispute & doc statuses

- **Invoice disputes** (`open · under_review · resolved · closed`): demo uses `open`
  (hold scenarios) and `resolved` (#2204). `under_review` / `closed` never appear.
- **Payment receipt disputes**: feature exists (`openPaymentReceiptDispute` → invoice
  hold → admin resolve/requeue) but no seeded example.
- **Document send** (`sent · delivered · failed`): demo uses `delivered` only; no
  failed sends, no multi-part packets.
- **Vault docs** (`approval_status`): demo seeds all `approved` — the pending-approval
  and rejection review flow (managed setup gate) starts empty. No expiring docs.
- **AI review** (`not_run · running · ready · needs_work`): demo writes `ready` on
  everything (`running` only for `pending` invoices, which don't exist — see §1).
  `needs_work` — the interesting admin state — is never shown.

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
stripping (`toClientVisibleInvoice`) both work correctly in the demo.

---

## 6. Feature coverage matrix

| App feature | Demo coverage |
|---|---|
| Invoice aging buckets + overdue chase | ✅ Good spread (current → 91+) |
| PPW send history + broker follow-up notes | ✅ |
| Receipt confirmation (managed) | ✅ 4 invoices (⚠️ P0 deadline bug — see lifecycle doc) |
| Short pay → confirm → write-off request | ✅/⚠️ end state seeded, queue stage skipped |
| Overpayment accept | ✅ #2408/#2409 |
| Chargeback correction | ✅ #2410 |
| Force close (managed) | ✅ #2001 |
| Fee terms snapshot (1% billable) | ✅ uniform — no trial/flat/exempt variety |
| Collection statuses C/B / W/P (admin) | ✅ |
| Invoice disputes | ✅ open + resolved |
| **Client-posted payments (pending approval)** | ❌ not seeded |
| **Payment receipt disputes** | ❌ not seeded |
| **Payment corrections (move / unprocess / reverse)** | ❌ not seeded |
| **Write-off approval queue (admin)** | ❌ starts empty |
| **Invoice review pipeline (pending / rejected)** | ❌ not seeded |
| **Batch review pipeline (verification / approval / drafts / AI sort)** | ❌ only `submitted` |
| **Vault doc approval flow / expiry reminders** | ❌ all pre-approved, no expiries |
| **AI review `needs_work`** | ❌ everything `ready` |

---

## 7. Recommendations

Ranked by demo value; all are seed-only changes unless noted.

1. **Seed one `write_off_pending` invoice** (client already requested, Credyx not yet
   approved) so the admin write-off queue and the client-side "Written off (masked)"
   state are both demoable. Keep #2411 as the completed example.
2. **Seed one client-posted `pending` payment** on an open invoice — exercises the
   Credyx payment-posting approval queue and the self-service story.
3. **Seed one `disputed` receipt payment** (invoice on hold with
   `hold_reason` = receipt dispute) — currently a dead feature in demos.
4. **Seed one `pending` + one `rejected` invoice** in the current-month batch so the
   review pipeline and the Pending/Closed tabs populate honestly (also makes
   `ai_review_status: 'running'` and `needs_work` reachable).
5. **Vary fee terms** across batches (one trial batch, one flat-fee) so accounting
   screens don't show a uniform 1%.
6. Optional: one `failed` document send + resend, one vault doc `pending` approval,
   one expiring COI — each lights up an existing notification/queue surface.
7. When writing demo scripts/marketing: reference stored statuses or derived pill
   names from §1 only. Do not use stage names that don't exist in the app (e.g.
   "invoice verified" is a *step label*, not a status; "delivered" is not an invoice
   state — see `.cursor/rules/credyx-marketing-prompts.mdc` stepper rules).
