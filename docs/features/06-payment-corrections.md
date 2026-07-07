# Feature 6 — Payment Corrections: Move Funds & Unprocess

> Applies to: **both tiers** (client portal + admin), capability-gated
> Priority: High — pairs with spec 2; mis-posted payments are unfixable today.
> Status: not implemented.

## 1. Problem

There is no way to correct a wrongly posted payment. Once `postClientPayment()` runs,
the payment row exists and the invoice is marked `paid` (or short) — the only "fix" is
manual data surgery. Two correction actions are needed, both launched from the
**Payments tab**:

1. **Move Funds** — payment was posted to the wrong invoice/load: unapply it from the
   source invoice and apply it to the correct one, leaving a note on both invoices
   ("Funds moved from Invoice … Load … due to: {user note}").
2. **Unprocess** — payment should never have been posted (wrong load, duplicate, typo):
   fully reverse it and reopen the invoice.

## 2. Best approach — reverse-and-repost, never mutate in place

Two possible designs:

| Approach | How | Verdict |
|---|---|---|
| **A. Mutate in place** | Change `payment.invoice_id` to the target (move), or delete the payment row (unprocess) | ❌ Rejected. Destroys the audit trail — no record the money ever touched the wrong invoice, reconciliation against remittance emails breaks, and deletes are unrecoverable. |
| **B. Reverse-and-repost** | Mark the original payment `reversed` (kept forever); for a move, create a **new linked payment** on the target invoice | ✅ **Recommended.** Immutable ledger-style history: every payment row is an event, corrections are new events. Both invoices' histories stay truthful, and the link between original and repost makes the money traceable end-to-end. |

This is the standard accounting pattern (void + re-issue), and it matters here
specifically because remittances arrive at the Credyx email — Credyx must always be able
to reconcile "what the bank shows" against payment rows, including mistakes.

### Lifecycle with corrections

```
                                   ┌── unprocess ──► reversed  (terminal)
confirmed ─────────────────────────┤
                                   └── move funds ─► reversed ──link──► new confirmed
                                                                        payment on
                                                                        target invoice
pending (after spec 2) ── move/unprocess = trivial: reject/retarget before confirmation,
                          no invoice impact
```

Reversed payments stay visible in payment history (struck-through / "Reversed" chip),
they just stop counting: `getConfirmedPaymentTotal()` already sums only
`status === 'confirmed'` rows, so exclusion is automatic once the status flips.

## 3. Data model changes

### `src/types/payment.ts`

```ts
status: 'pending' | 'confirmed' | 'rejected' | 'reversed'

// correction metadata
reversed_at?: string
reversed_by?: string
reversal_reason?: string           // the user's note
reversal_type?: 'moved' | 'unprocessed'
moved_to_payment_id?: string       // set on the original when funds were moved
moved_from_payment_id?: string     // set on the repost, links back to the original
```

### Supabase migration

```sql
-- widen payment status enum/check
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'reversed';
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by TEXT,
  ADD COLUMN IF NOT EXISTS reversal_reason TEXT,
  ADD COLUMN IF NOT EXISTS reversal_type TEXT,
  ADD COLUMN IF NOT EXISTS moved_to_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS moved_from_payment_id TEXT;
```

## 4. Core service — `src/services/paymentCorrectionService.ts`

### Shared building block: invoice recompute

Both actions need "re-derive the invoice from its confirmed payments". Today the inverse
only exists for adding money (`applyPaymentToInvoice`). Add:

```ts
/** Re-derive invoice status/paid_amount from confirmed payments after a reversal. */
function recomputeInvoiceFromPayments(invoice: Invoice, authorName: string, note: InvoiceNote): Invoice | undefined
```

Rules:

- `total = getConfirmedPaymentTotal(invoice.id)`
- `total >= amount - 0.01` → stays `paid`; else → `approved` (reopened)
- `paid_amount = total` (or cleared when 0)
- `days_since_expected` recomputed from `expected_payment_date` (not reset to 0 —
  reopening an aged invoice must restore its aging so collections and force-close
  eligibility are correct again)
- Clear `overpayment_accepted_at` when the total no longer exceeds the amount
- Append the provided note to `notes_history`

### `moveFunds()`

```ts
export interface MoveFundsInput {
  paymentId: string
  targetInvoiceId: string
  note: string                    // required — the "due to" reason
}

export function moveFunds(input: MoveFundsInput, authorName: string):
  { reversedPayment: Payment; newPayment: Payment; sourceInvoice: Invoice; targetInvoice: Invoice } | undefined
```

Steps:

1. **Validate**: payment exists and is `confirmed`; target invoice exists, belongs to the
   same client, passes `isPostableForPayment()` (not written off / force-closed /
   write-off-pending), and is not the source invoice; note is non-empty.
2. **Reverse original**: `status: 'reversed'`, `reversal_type: 'moved'`,
   `reversal_reason`, `reversed_by/at`.
3. **Repost on target**: new payment row copying amount/method/reference/dates, with
   `moved_from_payment_id` → original; set `moved_to_payment_id` on the original.
4. **Recompute source invoice** with note:
   > `Funds moved to Invoice {target.invoice_number} (Load {target.load_number ?? '—'}) due to: {note}`
5. **Apply to target invoice** via the existing `applyPaymentToInvoice` path, with note:
   > `Funds moved from Invoice {source.invoice_number} (Load {source.load_number ?? '—'}) due to: {note}`
6. **Variance**: return the target's variance (short/over) so the UI can route to the
   existing `PaymentVarianceResolution` flow, same as a fresh post.
7. **Audit**: one `payment_moved` event carrying both invoice ids, both payment ids,
   amount, and the note. Notify admins when a client performed the move.

### `unprocessPayment()`

```ts
export interface UnprocessPaymentInput {
  paymentId: string
  note: string                    // required
}

export function unprocessPayment(input: UnprocessPaymentInput, authorName: string):
  { reversedPayment: Payment; invoice: Invoice } | undefined
```

Steps:

1. Validate: payment is `confirmed`; note non-empty.
2. Reverse: `status: 'reversed'`, `reversal_type: 'unprocessed'`, reason, by/at.
3. Recompute the invoice with note:
   > `Payment of {amount} unprocessed due to: {note}`
4. Audit `payment_unprocessed`; notify admins when client-initiated.
5. **Ad-hoc invoice cleanup**: if the invoice was created solely for this payment
   (`postClientPaymentOnNewInvoice` path) and now has zero confirmed payments, prompt
   "This invoice was created for this payment — remove it too?" → reject/void the
   ad-hoc invoice rather than leaving an empty open invoice.

## 5. UI — Payments tab

### Client portal (`src/pages/ClientPayments.tsx`)

Per-row actions on confirmed payments (kebab menu or inline buttons):

- **Move funds** → modal:
  1. Source summary (invoice, load, amount, date, reference).
  2. Target picker — searchable list from `listPostableInvoices()` scoped to the client,
     showing invoice number, load, broker, amount, open balance; same-invoice excluded.
  3. Required reason field ("due to…").
  4. **Preview panel** before confirm: "Invoice A reopens as unpaid ($X outstanding) ·
     Invoice B becomes paid / short by $Y" — the user must see both consequences.
- **Unprocess** → confirm dialog with required reason and the same consequence preview
  ("Invoice A returns to unpaid, $X outstanding, aging resumes"). Destructive styling.
- History rendering: reversed payments stay listed, struck-through with a "Reversed"
  chip and a tooltip/expando showing the reason and (for moves) a link to the new
  payment / target invoice.

### Admin portal

The same two actions in the admin payment workspace (spec 2's confirmation queue /
remittance workspace), available on any client's payments. Admin corrections skip the
client-capability gate but use the identical service functions.

### Capability gating (extends spec 4)

```ts
canCorrectPayments: boolean   // Self-Service: true, Managed: false (Credyx corrects for them)
```

Follows `canPostPayment` logic: if Managed clients can't post, they can't correct either
— they contact Credyx (or open a dispute) and Credyx uses the admin tooling. Enforced in
`paymentCorrectionService`, not just the UI.

## 6. Interaction with the other specs

- **Spec 2 (pending payments):** once client posts are pending-until-confirmed, most
  client mistakes get caught before confirmation — a pending payment can simply be
  edited/withdrawn by the client or rejected by Credyx with no invoice impact. Move
  Funds / Unprocess is then primarily for **confirmed** payments (i.e. mistakes that
  survived confirmation, or Credyx's own posting errors). The spec works both before and
  after spec 2 lands.
- **Spec 1 (write-off approval):** an invoice in `write_off_pending` can't be a move
  target, and reversing a payment on it is blocked until the request resolves —
  otherwise the write-off snapshot (received amount / shortfall) goes stale.
  Conversely, `recomputeInvoiceFromPayments` reopening an invoice restores aging, which
  feeds the force-close eligibility (spec 3) correctly.
- **Fees:** moving/unprocessing funds never changes the fee base — fees derive from
  invoiced amounts and invoice status (`invoiceFees.ts`), not payments. No fee-abuse
  vector here, which is why clients can be trusted with it (with audit + admin
  notifications).

## 7. Edge cases

- **Partial moves** (split one payment across two invoices): out of scope for v1 — move
  is all-or-nothing. Workaround: unprocess, then post two payments. Revisit if usage
  demands it.
- **Reversing an already-reversed payment**: guard — `reversed` is terminal.
- **Move target reaches overpaid**: variance routing fires exactly like a fresh post;
  the existing overpayment acceptance flow handles it.
- **Source invoice had been written off after the payment** (status changed since):
  block with "resolve invoice status first" — reversals only run against
  `paid`/`approved` invoices.
- **Cross-client targets**: hard-blocked in the service (client scope check), even for
  admins by default — moving money between clients is a different (rare) operation that
  should stay manual.
- **Concurrent correction**: two users unprocessing the same payment — second call fails
  the `confirmed` status check.

## 8. Acceptance criteria

- [ ] Payments tab shows Move Funds and Unprocess on confirmed payments (capability-gated).
- [ ] Move: original payment becomes `reversed` and stays in history; a linked new
      payment lands on the target; both invoices get the "Funds moved …due to:" note in
      the exact source/target wording.
- [ ] Unprocess: payment `reversed`, invoice reopens with correct status, restored
      aging, and the "unprocessed due to:" note.
- [ ] Consequence preview shown before both actions; reason is mandatory.
- [ ] Reversed payments never count in totals, summaries, or dashboards.
- [ ] Invalid targets (written off, force-closed, write-off pending, other client,
      same invoice) are unselectable and rejected by the service.
- [ ] Every correction produces an audit event; client-initiated corrections notify
      admins.
- [ ] Orphaned ad-hoc invoices are offered for cleanup on unprocess.
