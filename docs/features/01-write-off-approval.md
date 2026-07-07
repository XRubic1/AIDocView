# Feature 1 — Write-Off Approval (Hidden Credyx Confirmation)

> Applies to: **both tiers**
> Priority: **High** — this is an active fee-avoidance leak today.
> Status: not implemented.

## 1. Problem

Write-offs are fee-exempt while force-closes bill the collection fee:

- `src/utils/invoiceFees.ts` → `isFeeBillableInvoice()` excludes `written_off` (and
  `rejected`) from fee calculation.
- `src/services/clientInvoiceActions.ts` → `closeClientInvoiceAsUncollectable()` lets a
  client write off a short-paid invoice in **one step with no approval** — only a note
  is required.

**Abuse vector:** post a $1 payment on a load, write off the balance, and the entire
invoice drops out of the fee base. Nothing stops this today.

**Requirement:** every client-initiated write-off must be confirmed by Credyx before the
fee exemption applies — and the approval step must be **completely invisible to the
client**. The client experience stays a simple one-step "close as uncollectable".

## 2. Status state machine

New internal invoice status: `write_off_pending`.

```
                        client requests write-off
approved (short-paid) ─────────────────────────────► write_off_pending
                                                        │
                                        Credyx approves │ Credyx denies
                                                        ▼         ▼
                                                  written_off   approved (reopened)
                                                  (fee-exempt)  (still fee-billable)
```

Rules while `write_off_pending`:

| Concern | Behavior |
|---|---|
| Fee calculation | **Still billable.** `isFeeBillableInvoice()` must treat `write_off_pending` as billable; exemption applies only on `written_off`. |
| Payment posting | Blocked, same as `written_off` (`isPostableForPayment()` in `src/utils/invoiceAging.ts` must exclude it). |
| Client portal display | Masked — the client sees the invoice as written off (see §4). |
| Admin portal display | Real status, shown in the approval queue. |
| Force-close eligibility | Excluded from `isForceCloseEligible()`. |
| Aging / collections lists | Excluded from overdue and collections work queues in both portals. |

## 3. Data model changes

### TypeScript (`src/types/invoice.ts`)

```ts
// Invoice.status union gains:
status: '...' | 'write_off_pending'

// InvoiceNote gains a visibility flag (default 'client' for back-compat):
export interface InvoiceNote {
  // ...existing fields...
  visibility?: 'client' | 'internal'
}

// New tracking block on Invoice:
write_off_request?: {
  requested_by: string
  requested_at: string
  client_note: string
  received_amount: number      // confirmed payments at request time
  shortfall: number            // amount being written off
  resolved_at?: string
  resolved_by?: string
  resolution?: 'approved' | 'denied'
  internal_note?: string       // Credyx reasoning — never sent to client
}
```

### Supabase migration (new file, e.g. `supabase/migrations/<ts>_write_off_approval.sql`)

```sql
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'write_off_pending';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS write_off_request JSONB;
-- notes_history is already JSONB; visibility lives inside each note object.
```

RLS: no new policies needed for the column, but client-facing selects should not need to
hide `write_off_request` — masking happens in the app layer (mock-store parity). If
stricter isolation is wanted later, expose a client-safe view.

## 4. Client-side masking layer

The client must never see `write_off_pending` or any approval language.

Create `src/utils/clientInvoiceView.ts`:

```ts
/** Map internal statuses to what the client portal displays. */
export function toClientVisibleStatus(status: Invoice['status']): Invoice['status'] {
  return status === 'write_off_pending' ? 'written_off' : status
}

/** Notes safe to render in the client portal. */
export function clientVisibleNotes(notes?: InvoiceNote[]): InvoiceNote[] {
  return (notes ?? []).filter((n) => n.visibility !== 'internal')
}
```

Apply in every client-portal surface that renders invoice status or notes:

- `src/pages/ClientInvoices.tsx`
- `src/pages/ClientPayments.tsx` (postable-invoice lists)
- `src/pages/ClientBatches.tsx` / batch detail invoice rows
- `src/components/client/InvoiceDetailWorkspace.tsx` (status badge + notes thread)
- `src/pages/ClientShortPayments.tsx`
- Client dashboard stats that bucket by status

**Decision (recommended):** while pending, the client sees the invoice as
`written_off` immediately (optimistic). This keeps the flow invisible. The alternative —
a neutral "closing" state — leaks the existence of a review step and is not recommended.

## 5. Client request flow (changes to existing code)

`closeClientInvoiceAsUncollectable()` in `src/services/clientInvoiceActions.ts`:

1. Keep the existing guards (`canCloseShortPaymentAsUncollectable`, required note).
2. Set status to `write_off_pending` instead of `written_off`.
3. Populate `write_off_request` with requester, note, received amount, shortfall.
4. Append the close note to `notes_history` with `visibility: 'client'` (the client
   wrote it; they can see it).
5. Audit event: keep `invoice_closed` but with `close_type: 'write_off_requested'` in
   metadata — audit log is admin-facing.
6. Notify admins via `src/services/adminNotificationService.ts`:
   `notifyAdminWriteOffRequested({ clientId, clientName, invoiceNumber, shortfall })`.

No changes to the client UX in `ShortPaymentCloseModal.tsx` /
`PaymentVarianceResolution.tsx` — same form, same confirmation. The only difference is
what happens server-side afterward.

## 6. Admin approval queue

### Location

New tab **"Write-Off Approvals"** on the admin Collections page (or a dedicated
Approvals section if payment confirmation from spec 2 lands in the same place). Badge
count of pending requests in admin nav.

### Queue row content

Invoice number, client, broker, invoice amount, received amount, shortfall (the amount
at stake), client's note, request age, link to full invoice detail with payment history.

### Actions — new service `src/services/writeOffApprovalService.ts`

```ts
export function listPendingWriteOffs(): Invoice[]
// invoices where status === 'write_off_pending'

export function approveWriteOff(invoiceId: string, adminName: string, internalNote?: string): Invoice | undefined
// → status 'written_off', resolve write_off_request,
//   append INTERNAL note, recompute batch fee via syncBatchFeeSync,
//   audit: close_type 'written_off', approved_by

export function denyWriteOff(invoiceId: string, adminName: string, opts: {
  internalNote: string           // required — why it was denied (admin-only)
  clientNote?: string            // optional client-visible message, generic wording
}): Invoice | undefined
// → status back to 'approved', paid_amount stays at received total,
//   days_since_expected recomputed from expected_payment_date,
//   append internal note (+ optional client-visible note),
//   audit: close_type 'write_off_denied'
```

Fee sync: `approveWriteOff` must call the existing recompute path
(`src/services/syncBatchFeeSync.ts`) so `calculateBatchFeeCalculation` drops the invoice
from the billable base. Denial requires no fee change (it never left the base).

### Denial — what the client sees

The invoice **silently reopens** as an open short-paid invoice. Recommended client
communication: an optional client-visible note worded as a collections update (e.g.
"Balance reviewed — this load remains collectible"), never "your write-off was denied".
Since the client optimistically saw it as written off, the reopen will be visible;
the generic note explains it without revealing the approval mechanism.

## 7. Edge cases

- **Payment arrives while pending** (e.g. Credyx posts a remittance): deny the request
  implicitly or block posting until resolved. Recommended: payment posting on
  `write_off_pending` is blocked (§2); Credyx sees the pending request in the queue and
  denies it first, then posts.
- **Duplicate requests:** `canCloseShortPaymentAsUncollectable` must return false when
  status is already `write_off_pending`.
- **Tier change while pending:** request survives and drains through the queue normally.
- **Admin-initiated write-off** (from `AdminInvoiceDetailView` close dropdown): skips the
  queue — goes straight to `written_off`. Credyx is the approver; self-approval is
  implicit.
- **Batch fee already invoiced/settled:** if the batch's fee has been billed before
  approval lands, approval should flag the batch for fee adjustment rather than silently
  recomputing (surface in the accounting view).

## 8. Acceptance criteria

- [ ] Client "close as uncollectable" produces `write_off_pending`, not `written_off`.
- [ ] Client portal renders the pending invoice as written off everywhere; no UI text,
      status, note, or network-visible field says "pending approval".
- [ ] Fee calculation still includes `write_off_pending` invoices.
- [ ] Admin queue lists pending requests with shortfall and client note; approve/deny work.
- [ ] Approve → `written_off`, fee base shrinks, internal note recorded.
- [ ] Deny → invoice reopens as `approved`, fee unchanged, internal reason recorded,
      optional generic client note shown.
- [ ] Internal notes never render in any client-portal component.
- [ ] Payment posting is blocked while pending.
- [ ] Admins are notified on new requests.
