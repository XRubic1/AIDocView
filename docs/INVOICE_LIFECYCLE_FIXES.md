# Invoice Lifecycle Audit — Issues & Fixes

> Trace of every seeded invoice scenario (`scripts/seedDemoClient.ts`, seed as-of
> **2026-08-05**) through the client portal lifecycle: created → verified → invoiced →
> payment → confirm → variance resolution → closed. Each scenario was checked for date
> coherence, status/pill correctness, visible actions, and timeline order.
>
> Audited: 2026-08-05

Priority key: **P0** = demo breaks itself at runtime · **P1** = wrong/premature action
shown to the client · **P2** = data incoherence visible on close inspection ·
**P3** = cosmetic.

---

## Scenario-by-scenario results

| # | Invoice | Scenario | Lifecycle result |
|---|---------|----------|------------------|
| 2002/2101/2102/2201/2301 | Paid (older months) | Clean | ✅ No issues — dates ascend, stepper completes, payment 3 days before due |
| 2400 | Paid this month | Clean-ish | ⚠️ P2 — due date clamped to 8/5 breaks net-15 terms (issue 4) |
| 2103/2202/2302 | Open / overdue | Clean | ✅ Chase notes ascend, aging buckets correct, collection dates ≤ 8/5 |
| 2001 | Force-closed (uncollectable, fee billable) | Clean | ✅ Out of aging, close note explains 90+ days, no payment rows |
| 2304 | Full payment awaiting confirm | **Broken** | ❌ P0 auto-confirms on page load (issue 1) |
| 2305 | Short pay awaiting confirm ($2,550 / $3,000) | **Broken** | ❌ P0 auto-confirm (issue 1) · ✅ write-off correctly hidden until confirmed |
| 2406 | Full payment awaiting confirm | **Broken** | ❌ P0 auto-confirm (issue 1) |
| 2407 | Short paid, confirmed (lumper $200) | Incoherent dates | ⚠️ P2 — payment confirmed same day invoice created, before PPW sent (issue 3) |
| 2408 | Overpaid, awaiting confirm (+$125) | **Broken** | ❌ P0 auto-confirm (issue 1) · ❌ P1 Accept overpayment offered before receipt confirmed (issue 2) |
| 2409 | Overpaid, confirmed (+$85) — "closed then overpaid" | Incoherent dates | ✅ Accept-excess flow correct · ⚠️ P2 payment dated before invoice date (issue 3) |
| 2410 | Paid then chargeback −$350 — "closed then short paid" | Incoherent dates | ✅ Reopens to Short paid, write-off available (correct) · ⚠️ P2 full payment 7 days before invoice existed (issue 3) |
| 2411 | Short paid → written off (uncollectable) | Incoherent dates | ✅ Write-off request/approval trail correct, fee-exempt · ⚠️ P2 payment 12 days before invoice date; due date 9 days before invoice date (issue 3) |
| 2403 | Callback (C/B) | Incoherent dates | ⚠️ P2 — due/expected (Jul 30) predates invoice date (Aug 2) (issue 3) |

Lifecycle mechanics that verified **correct** end-to-end:

- Confirming a short remittance keeps status `approved`, sets `paid_amount`, moves the
  invoice to the **Short paid** bucket, and only then exposes **Write off**
  (`canCloseShortPaymentAsUncollectable` now requires confirmed cash — added 2026-08-05).
- Chargeback (`payment_kind: 'short'`) correctly subtracts from received, reopens a paid
  invoice as Short paid, and allows write-off (both payments confirmed).
- Write-off approval trail: request note → `write_off_pending` (masked as *Written off*
  for the client) → admin approve → `written_off`, fee-exempt.
- Force-close stays fee-billable and leaves aging/chase — distinct from write-off.
- Overpayment acceptance stamps `overpayment_accepted_at` and closes the variance row.

---

## Issue 1 — P0: Awaiting-confirm payments auto-confirm on page load

**Invoices affected:** 2304, 2305, 2406, 2408 (every `awaiting_receipt` demo).

The seed sets `client_confirmation_deadline` to the as-of day itself (2026-08-05).
`processExpiredReceiptConfirmations()` (called on `ClientPayments` mount) treats a
deadline of `new Date('2026-08-05')` — midnight UTC — as already expired, so the first
visit to `/client/payments` silently confirms all four payments as **"Credyx (auto)"**
and every *Confirm payment* pill vanishes. It also explains the "0 days until
auto-confirm" text in the detail panel.

**Root cause:** the 8/5 date-clamp was applied to the confirmation *deadline*, which is
an action-due date, not recorded activity. Deadlines must be allowed to sit in the
future; the "nothing after 8/5" rule should only govern things that already happened
(invoice dates, payments, notes, timestamps).

**Fix (seed only):**

- [ ] In `scripts/seedDemoClient.ts`, set `deadline = addDays(payDate, 30)` in the
      `awaiting_confirm`, `short_awaiting`, and `over_awaiting` scenarios (matches
      `CLIENT_RECEIPT_CONFIRMATION_DAYS = 30` used by the app for real postings).
- [ ] Exempt `client_confirmation_deadline` from the final clamp pass in
      `buildInvoice` (currently `clampDateStr` drags it back to 8/5).
- [ ] Exclude `client_confirmation_deadline` from the `verify-dates` walker (or assert
      it is **after** as-of instead).
- [ ] Re-seed: `npm run seed-demo -- "ABC Trucking"`.

---

## Issue 2 — P1: Accept overpayment offered before receipt is confirmed

**Invoice affected:** 2408 (overpay awaiting confirm) and any real overpay in the same state.

`canAcceptOverpayment` (`src/utils/overPayments.ts`) uses
`getInvoiceAppliedForVariance`, which **includes `awaiting_receipt` remittances**, and
only checks invoice status. So while the carrier still needs to confirm the $2,225
remittance, the detail panel simultaneously shows **Confirm payment** and **Accept
overpayment** — the client can "accept" excess cash they haven't confirmed receiving.

This is the same asymmetry fixed for write-offs on 2026-08-05
(`canCloseShortPaymentAsUncollectable` now requires confirmed cash and no
awaiting-receipt rows).

**Fix (app logic, mirrors the write-off gate):**

- [ ] In `src/utils/overPayments.ts`, block `canAcceptOverpayment` when
      `hasAwaitingReceiptPayment(invoice.id, payments)` (import from
      `utils/shortPayments`) and compute the overage from **confirmed** received
      (`getInvoiceReceivedAmount`) instead of applied-for-variance.
- [ ] Verify callers pick up the gate: `InvoiceDetailPanel` (`canAcceptOver`),
      `ClientShortPayments` overpayments tab, `PaymentVarianceResolution`.
- [ ] Confirm `acceptClientOverpayment` in `src/services/clientInvoiceActions.ts`
      enforces the same rule server-side (defense in depth, like
      `closeClientInvoiceAsUncollectable` does for write-offs).
- [ ] Add unit tests alongside `shortPayments.test.ts` (e.g. `overPayments.test.ts`):
      awaiting → blocked, confirmed → allowed, already accepted → blocked.

---

## Issue 3 — P2: Current-month variance invoices have payments older than the invoice

**Invoices affected:** 2407, 2409, 2410, 2411, 2403 (and mildly 2400/2408).

To keep invoice days ≤ 5, the current-month showcase invoices were moved to Aug 1–5,
but their payment/chase dates are keyed to `today − N` days, producing impossible
sequences visible in the Activity timeline:

| Invoice | Invoice date | Conflicting event |
|---------|--------------|-------------------|
| 2411 | Aug 5 | Payment received **Jul 24** (12 days before invoice); due date Jul 27 |
| 2410 | Aug 4 | Paid in full **Jul 28**, 7 days before the invoice existed |
| 2409 | Aug 3 | Payment received **Aug 2**, before invoice + PPW |
| 2407 | Aug 1 | Payment confirmed Aug 1 14:20, before approval (Aug 2) and PPW (Aug 3) |
| 2403 | Aug 2 | Expected pay date **Jul 30** predates the invoice |

**Fix (seed only) — re-anchor the variance showcase to July:**

- [ ] Move specs `m0-short-confirmed`, `m0-over-await`, `m0-over-confirmed`,
      `m0-chargeback`, `m0-short-writeoff`, and `m0-callback` to `monthsAgo: 1`
      (July, `batch: 1`) with days ~8–20, so the order
      *invoice → approval → PPW → due → payment → confirm → resolution* holds with all
      activity ≤ 8/5.
- [ ] Alternatively (smaller diff): key `payDate`/chase offsets off `invDate`
      (e.g. `addDays(invDate, termsDaysUsed + n)`) instead of `today − n`, then clamp.
- [ ] Extend `verify-dates` to also assert per-invoice ordering:
      `invoice_date ≤ approved_at ≤ ppw sent ≤ payment_date ≤ confirmed_at ≤ resolved_at`
      and `invoice_date ≤ due_date`.

---

## Issue 4 — P2 (decision needed): Due dates clamped to 8/5 break stated terms

`buildInvoice` clamps `due_date`/`expected_payment_date` to the as-of day. Invoice 2400
(Aug 3, net-15) shows **due Aug 5** instead of Aug 18; the `m0-open-*` invoices (net-30,
created Aug 1–5) all show **due today**.

A due date is a schedule commitment, not recorded activity — a future due date does not
violate "no activity after 8/5" and is what a real book of fresh invoices looks like.

- [ ] **Recommended:** stop clamping `due_date` / `expected_payment_date` (and drop the
      forced `daysPastExpected ≥ 0`), restoring `daysPastExpected: -N` for
      current-month open invoices so the aging chart has a "current" bucket that isn't
      all due-today.
- [ ] If the hard rule "no dates after 8/5 anywhere" stands, keep as-is and accept the
      terms mismatch — note it in demo scripts so nobody chases it as a bug.

---

## Issue 5 — P3: Terms label vs overridden due date

When `daysPastExpected` overrides the due date, `termsDays` no longer matches
(e.g. 2305: net-30 stated, effective 7 days). Not rendered anywhere in the client UI
today, so cosmetic — but the mismatch will surface if terms are ever displayed.

- [ ] Optional: compute a display-consistent `termsDays` in the seed when
      `daysPastExpected` is set, or omit terms for those specs.

---

## Suggested execution order

1. Issue 1 (P0) — seed deadline fix + clamp exemption + re-seed. Unblocks the whole
   Confirm-payment demo track.
2. Issue 2 (P1) — overpayment gate (app code + tests). Same pattern as the shipped
   write-off gate.
3. Issue 3 (P2) — re-anchor July for variance showcase + ordering assertions in
   `verify-dates`.
4. Issue 4 (P2) — decide on future due dates; implement if accepted.
5. Issue 5 (P3) — optional cleanup.
