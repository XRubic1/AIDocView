# Feature 2 — Limited Payment Posting & Credyx Confirmation

> Applies to: **both tiers** (with tier differences)
> Priority: High.
> Status: not implemented.

## 1. Problem

Most remittances go to the Credyx email, so Credyx — not the client — is the source of
truth for money received. But today:

- `postClientPayment()` in `src/services/clientPaymentService.ts` creates payments with
  `status: 'confirmed'` immediately and updates the invoice (`paid` / short) in the same
  call. A client can mark anything paid with no oversight.
- There is **no admin payment-posting workspace** — admins can only close invoices from
  `AdminInvoiceDetailView`; there is no remittance intake flow even though Credyx will
  post most payments.
- No tier or capability checks exist anywhere in the payment path.

**Requirement:** clients can still post payments, but limited — client-posted payments
are **pending until Credyx confirms**. Credyx gets a proper posting + confirmation
workspace.

## 2. Payment lifecycle (target)

The `Payment.status: 'pending' | 'confirmed'` lifecycle already exists
(`src/types/payment.ts`), and invoice totals already derive from confirmed payments only
(`getConfirmedPaymentTotal` in `src/data/mockPayments.ts`). The change is in who creates
what status:

```
Client posts payment ──► status: pending ──► Credyx confirms ──► status: confirmed
                                        └──► Credyx rejects ──► status: rejected (new)

Credyx posts payment ──► status: confirmed (direct)
```

| Event | Invoice effect |
|---|---|
| Client posts (pending) | **No status/paid_amount change.** Invoice shows an "awaiting confirmation" indicator in the client portal (this is fine to show — it reads as normal bank-clearing, unlike the write-off flow). |
| Credyx confirms | Existing `confirmClientPayment()` path: recompute confirmed total, apply `paid`/short via `applyPaymentToInvoice`, variance routing (short/over) fires now. |
| Credyx rejects | Payment marked `rejected` with reason; invoice untouched; client sees the payment as rejected with the (client-safe) reason. |
| Credyx posts directly | Same as today's confirmed flow, but authored by admin. |

### Add to `Payment` type

```ts
status: 'pending' | 'confirmed' | 'rejected'
posted_by?: string
posted_source?: 'client' | 'credyx'
confirmed_by?: string
confirmed_at?: string
rejection_reason?: string     // client-visible wording
```

### Supabase migration

```sql
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'rejected';  -- or widen CHECK constraint
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS posted_source TEXT,
  ADD COLUMN IF NOT EXISTS posted_by TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_by TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
```

## 3. Service changes (`src/services/clientPaymentService.ts`)

### `postClientPayment()`

1. Guard: require `capabilities.canPostPayment` (see spec 4). The caller passes the
   client's capabilities or the service resolves them from the client record —
   **enforce in the service, not just the UI**.
2. Create the payment with `status: 'pending'`, `posted_source: 'client'`.
3. **Do not** call `applyPaymentToInvoice`. Append a client-visible note
   ("Payment of $X reported, awaiting confirmation") to `notes_history`.
4. Variance handling (`PaymentVarianceResolution`) moves to **confirmation time** — a
   pending payment has no variance yet. The post-payment UI shows a simple
   "submitted for confirmation" state instead of the short/over resolution flow.
5. Notify admins: `notifyAdminPaymentReported({ clientName, invoiceNumber, amount })`.

### `confirmClientPayment()` (existing — becomes the main admin path)

Mostly works already. Add: `confirmed_by`/`confirmed_at` stamping, and trigger the
variance flow (short → offer write-off request per spec 1; over → overpayment
acceptance) as an admin-facing step or a client follow-up task.

### New `rejectClientPayment()`

```ts
export function rejectClientPayment(paymentId: string, adminName: string, opts: {
  reason: string   // client-visible, e.g. "No matching remittance received"
}): Payment | undefined
```

Marks the payment `rejected`, appends a client-visible note on the invoice, audit event
`payment_rejected`.

### Limits ("limited" posting) — proposed defaults, confirm with product

| Limit | Self-Service | Managed |
|---|---|---|
| Can post payments | Yes (pending) | **No** — view-only payment history; Credyx posts everything |
| Ad-hoc invoice from unmatched payment (`createAdHocInvoiceForPayment`) | Yes, but the ad-hoc invoice is flagged for Credyx review before it becomes fee-billable | No |
| Per-payment cap | None (pending status is the control) | n/a |

If Managed clients should retain posting, flip `canPostPayment` to true for Managed —
the pending-confirmation control makes it safe either way.

## 4. Admin workspace

### A. Payment confirmation queue

New admin surface (suggested: **"Payments" tab** on the admin Accounting page, or a
dedicated `/payments` admin route):

- List of `pending` payments: client, invoice, amount, method, reference, reported date,
  variance preview (amount vs invoice balance).
- Actions per row: **Confirm** (opens existing confirm form — method/reference/
  received date), **Reject** (reason required), link to invoice detail.
- Badge count in admin nav.

### B. Remittance posting (Credyx posts directly)

New admin form, reusing the client `PostPaymentForm` patterns:

- Search invoice by number / broker / client → post confirmed payment directly
  (`postAdminPayment()` — same shape as `postClientPayment` but `status: 'confirmed'`,
  `posted_source: 'credyx'`, applies to invoice immediately).
- Unmatched remittance path: create ad-hoc invoice + payment (admin version of
  `postClientPaymentOnNewInvoice`).
- Batch-friendly: after posting, stay on the form with client/broker prefilled
  (remittances arrive in batches via email).

## 5. Client portal changes

- `src/pages/ClientPayments.tsx` / `PostPaymentForm.tsx`:
  - Gate the form on `canPostPayment` (Managed default: hidden, with a note that
    Credyx posts payments from remittances).
  - After submit: "reported, awaiting confirmation" state instead of instant
    variance resolution.
  - Payment history shows status chips: Pending / Confirmed / Rejected (+ reason).
- `src/pages/ClientInvoices.tsx` / `InvoiceDetailWorkspace.tsx`:
  - "Mark as paid" (`markClientInvoiceAsPaid`) routes through the same pending flow —
    it already delegates to `postClientPayment`, so it inherits the change; update its
    success messaging.
- Dashboard/report widgets that sum payments must distinguish confirmed vs pending
  (`PaymentSummary` already has `pending_payments` / `pending_amount` fields).

## 6. Edge cases

- **Client posts, then requests write-off:** the pending payment doesn't count toward
  `received_amount`; the write-off request (spec 1) snapshots **confirmed** totals only.
  If a pending payment exists on the invoice, block the write-off request until it's
  resolved ("payment awaiting confirmation").
- **Invoice force-closed/written-off while a payment is pending:** confirmation must
  re-check `isPostableForPayment` (already does) — reject the payment with an internal
  handoff to reopen the invoice if the money is real.
- **Duplicate reporting:** client reports a payment Credyx already posted from the
  remittance email. Confirmation queue should surface "invoice already paid/partially
  paid" so the admin rejects the duplicate instead of double-applying.
- **Tier change:** pending payments survive and drain through the queue.

## 7. Acceptance criteria

- [ ] Client-posted payments are created `pending` and do not change invoice status or
      paid amounts.
- [ ] Admin queue lists pending payments; confirm applies the payment with variance
      routing; reject records a client-visible reason.
- [ ] Admin can post confirmed payments directly, including unmatched-remittance
      ad-hoc invoices.
- [ ] `canPostPayment` is enforced in `clientPaymentService`, not only in the UI.
- [ ] Managed clients (default) cannot post; they see history + "Credyx posts payments"
      messaging.
- [ ] Payment status chips (pending/confirmed/rejected) render in client payment history.
- [ ] Dashboards/summaries never count pending payments as received money.
- [ ] Write-off requests are blocked while a pending payment exists on the invoice.
