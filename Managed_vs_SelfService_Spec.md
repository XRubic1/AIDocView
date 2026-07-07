# Managed vs Self-Service — Tier Differentiation Spec

> Status: **Planning document** — captures current state, target behavior, and implementation
> notes for differentiating the two service tiers. Nothing in this file is implemented yet
> unless marked as existing.
>
> **Detailed per-feature implementation specs live in [`docs/features/`](./docs/features/README.md):**
> write-off approval, payment posting, force-close gating, capability gating extension,
> and self-service batch review. This file remains the high-level overview.
>
> Last updated: 2026-07-07

---

## 1. Problem Statement

Clients choose between **Self-Service** and **Managed** at enrollment (`/enroll`), and the
choice is persisted (`clients.service_tier`), but the day-to-day experience is nearly
identical. The existing capabilities matrix only gates batch creation, vault uploads, and
remittance editing. The pages where the tiers should actually diverge — **Payments,
Invoices, Collections** — have no tier gating at all, and the underlying services have no
guards.

### Tier definitions (business intent)

| | Managed | Self-Service |
|---|---|---|
| Batch work (review paperwork, notes) | Credyx A/R representative | Client works their own batches *(later update, see §3)* |
| Payment posting | Mostly Credyx (remittances go to Credyx email) | Client posts, but **limited** — pending Credyx confirmation |
| Write-offs | Credyx decides | Client requests; **hidden Credyx approval** required (§5) |
| Force-close after aging period | Yes — fee applies | **No force-close at all** — client handles own collections, no fee (§6) |

---

## 2. Current State (as of this writing)

### What already differs by tier

Central matrix: `src/utils/clientCapabilities.ts`, consumed via `ClientPortalContext` /
`useClientCapabilities()`.

| Capability | Self-Service | Managed | Enforced in |
|---|---|---|---|
| `canCreateBatch` / AI / manual | Yes | No (doc handoff only) | `ClientBatches.tsx` → `ManagedDocHandoffView` |
| `canUploadVault` | Yes | No | `ClientDocuments.tsx` |
| `canEditRemittance` | Yes | No | `ClientSettings.tsx` |
| `canRunInvoiceOps` (batch detail only) | Yes | No | `ClientBatches.tsx` |
| Billing line items (mock) | $99/mo | $99 + $299/mo | `billingService.ts`, `servicePlans.ts` |

### What does NOT differ (the gap)

- `ClientPayments.tsx`, `ClientInvoices.tsx`, `ClientCollections.tsx`, `ClientReports.tsx`
  — zero tier awareness. Managed clients get full invoice ops here despite being blocked
  in batch detail (inconsistent).
- `clientPaymentService.ts` — no tier/limit checks. Client-posted payments are created
  with `status: 'confirmed'` immediately (`postClientPayment`, line ~101).
- Write-offs (`closeClientInvoiceAsUncollectable` in `clientInvoiceActions.ts`) —
  single-step client action, no approval. `written_off` invoices are **fee-exempt**
  (`invoiceFees.ts` → `isFeeBillableInvoice`), which is the abuse vector: post $1,
  write off the rest, avoid the collection fee.
- Force-close eligibility badges (`isForceCloseEligible` in `invoiceAging.ts`,
  `AR_POLICY.forceCloseDays = 90`) show for all tiers in both portals. Force-close is a
  manual admin action; `force_closed` invoices remain fee-billable.
- Enforcement is **UI-only**. Service functions themselves have no capability guards.

### Known adjacent issues

- Admin Settings "Force Close After (days)" field is not wired to `AR_POLICY` (hardcoded 90).
- Admin batch review notes (`BatchReviewTab.tsx` `reviewNotes`, `VerificationTab.tsx`
  `verificationNotes`) are local component state — never persisted. Invoice-level
  `notes_history` IS persisted.
- No formal A/R rep model — `batches.in_use_by` / `reviewed_by` are display strings.
- Enrollment forces `status: 'pending'` for both tiers (`useEnrollForm.ts`), requiring
  admin activation even for Self-Service.

---

## 3. Batch Workflow

### Managed (target)

- Client submits documents via handoff (`ManagedDocHandoffView`) — already exists.
- Credyx A/R rep works the batch through the internal pipeline
  (`ready_to_post → verification → approval`) — already exists.
- **Gap:** no rep assignment model. Consider `clients.assigned_rep_id` or per-batch
  assignment beyond the current `in_use_by` string.

### Self-Service (target — LATER UPDATE, document only for now)

Clients need tooling to work their own batches:

- **Review paperwork** — client-facing batch review workspace (analogous to the admin
  `ReadyToPostTab` / `BatchReviewTab`, scoped to their own batches).
- **Leave notes** — persisted notes on batches and invoices, visible to both client and
  Credyx.

Prerequisites:

1. Persist batch-level review notes (new `batches.notes_history JSONB` or reuse
   invoice-level `notes_history` pattern). Current admin review notes are UI-only and
   must be persisted first so both sides share one thread.
2. Note visibility flag (`internal` vs `client_visible`) — also required by §5.
3. Decide whether self-service batches still pass through the internal admin pipeline
   (verification/approval by Credyx) or whether the client's own review replaces some
   stages. Recommendation: Credyx retains final approval; client review replaces the
   `ready_to_post` working stage.

---

## 4. Payment Posting

### Target behavior (both tiers, with tier differences)

- **Client-posted payments start as `pending`**, not `confirmed`. The
  `pending → confirmed` lifecycle already exists (`confirmClientPayment`); the change is
  in `postClientPayment` (currently hardcodes `status: 'confirmed'`) plus making invoice
  status/paid-amount updates apply only from **confirmed** totals
  (`getConfirmedPaymentTotal` already exists and does this correctly).
- **Credyx confirms payments** — most remittances arrive at the Credyx email, so Credyx
  is the source of truth. Needs a new **admin payment confirmation queue** (no admin
  payment-posting/remittance workspace exists today).
- **Admin-posted payments** (Credyx entering a remittance) post as `confirmed` directly.

### Tier differences

| | Managed | Self-Service |
|---|---|---|
| Client can post payments | Limited / possibly view-mostly | Yes, but pending confirmation |
| Ad-hoc invoice creation from unmatched payment (`createAdHocInvoiceForPayment`) | No (Credyx only) | TBD — recommend Credyx-review before invoice becomes fee-billable |

### Open questions — "limited" needs definition

- Per-payment or per-period amount caps?
- Restrict payment methods clients can self-report?
- Can Managed clients post at all, or only view payment history?

### New capabilities to add to the matrix

```
canPostPayment: boolean          // post pending payments
canCreateAdHocInvoice: boolean   // unmatched-remittance invoice creation
```

Enforce in `clientPaymentService.ts` (service-level guard), not just UI.

---

## 5. Write-Off Approval (hidden from client)

### Why

`written_off` is fee-exempt while `force_closed` bills the fee. A client can post a
trivial payment ($1) and write off the balance to zero out the Credyx fee. Write-offs
must therefore be confirmed by Credyx — **without exposing the approval step to the
client**.

### Target flow

1. Client requests write-off (same UX as today's `closeClientInvoiceAsUncollectable` —
   short-pay close with required note).
2. Invoice moves to a new **internal** status: `write_off_pending`.
   - **Client sees:** the invoice as closed/written-off (or a neutral "closing" state —
     see decision below). No "awaiting Credyx approval" language anywhere in the client
     portal.
   - **Fee impact:** invoice remains **fee-billable** while pending. Fee exemption
     applies only after approval (`isFeeBillableInvoice` must treat `write_off_pending`
     as billable).
3. Credyx reviews in a new **admin write-off approval queue** (invoice amount, received
   amount, shortfall, client note, payment history).
4. **Approve** → status `written_off`, fee recalculated (`syncBatchFeeSync`), internal
   audit entry.
5. **Deny** → invoice reverts to `approved` (open, short-paid), fee remains billable.
   - Decision needed: what the client sees on denial. Options:
     a. Invoice silently reopens with a generic client-visible note from Credyx
        ("balance still collectible / under review") — recommended.
     b. Client is notified the write-off was declined (breaks the "hidden" requirement
        unless worded as a collections update).

### Required changes

- New `invoice_status` enum value `write_off_pending` (DB migration + `types/invoice.ts`).
- Status **masking layer for the client portal**: client-facing views map
  `write_off_pending` → displayed as `written_off` (or "closed"). Admin views show the
  real status.
- **Internal-only notes/audit entries**: add `visibility: 'internal' | 'client'` to
  `InvoiceNote` and filter in all client-portal note rendering. Approval/denial notes and
  audit events must be internal.
- Admin queue UI (could live in Collections or a dedicated Approvals tab) + notification
  to admins on new requests (reuse `adminNotificationService`).
- Applies to **both tiers** (the abuse vector exists for both).

---

## 6. Force-Close

### Target behavior

| | Managed | Self-Service |
|---|---|---|
| Force-close exists | Yes — Credyx force-closes aged loads; **collection fee applies** | **No** — client handles own collections; no force-close, no fee |
| Aging badges / "force-close eligible" alerts | Shown (client + admin) | Hidden everywhere |
| Admin force-close action | Enabled | Disabled/hidden for self-service clients' invoices |

### Required changes

- Gate `isForceCloseEligible` consumers by client tier:
  - Client portal: `ClientInvoices`, `InvoiceDetailWorkspace` badges/alerts.
  - Admin: `AdminInvoiceDetailView` close dropdown ("Force Close" option),
    `AdminDashboard` force-close rate stat (exclude self-service clients).
- Self-service aged invoices resolve via client payment posting or the write-off request
  flow (§5) instead.
- Optional: wire the admin Settings "Force Close After (days)" field to `AR_POLICY`
  (currently decorative) — per-client or global override.
- Note: `force_closed` stays fee-billable, `written_off` stays fee-exempt
  (`invoiceFees.ts`) — unchanged.

---

## 7. Cross-Cutting Work

### Capabilities matrix extension (`clientCapabilities.ts`)

Proposed additions:

| Capability | Self-Service | Managed |
|---|---|---|
| `canPostPayment` | true (pending confirmation) | TBD (limited or false) |
| `canCreateAdHocInvoice` | TBD | false |
| `canRequestWriteOff` | true (hidden approval) | true (hidden approval) |
| `hasForceClose` | **false** | **true** |
| `canReviewOwnBatches` (later) | true | false |

Apply `canRunInvoiceOps` (or the new granular flags) consistently on
`ClientInvoices.tsx`, `ClientPayments.tsx`, `ClientCollections.tsx` — currently only
batch detail respects it.

### Service-level enforcement

UI gating alone is insufficient. Guard in the services themselves:
`clientPaymentService.ts`, `clientInvoiceActions.ts` — check the client's tier/capability
before mutating. (When Supabase is active, mirror with RLS/constraints where possible.)

### Database migrations needed

1. `invoice_status` + `write_off_pending`.
2. Note visibility column/flag on notes (JSONB shape change in `notes_history`).
3. (Later) `batches.notes_history` for persisted batch review notes.
4. (Optional) `clients.assigned_rep_id` for the Managed A/R rep model.

### Tier-change handling

`updateClientTier()` can flip a client live. Define behavior for in-flight items:
pending write-off requests, pending payments, force-close-eligible invoices, open drafts.
Minimum: recompute capabilities on next load (already happens via context); decide
whether pending approvals survive a tier switch (recommend: yes, they drain normally).

### Enrollment

Both tiers currently enroll as `pending`. Consider auto-activating Self-Service
(`useEnrollForm.ts` hardcodes `status: 'pending'`; `clientRegistry.createClient` already
defaults self-service to `active` when status is omitted).

---

## 8. Suggested Implementation Order

1. **Write-off approval flow (§5)** — active revenue leak; highest priority.
2. **Pending-by-default client payments + admin confirmation queue (§4)** — aligns with
   remittances arriving at Credyx.
3. **Tier-gate force-close (§6)** — mostly conditional rendering + admin action gating.
4. **Extend capability gating to Invoices/Payments/Collections pages (§7)** — closes the
   "both tiers look the same" complaint.
5. **Self-service batch review + persisted notes (§3)** — the declared "later update".

---

## 9. Open Decisions (need product input)

| # | Question | Recommendation |
|---|---|---|
| 1 | What exactly does "limited" payment posting mean (caps, methods, Managed access)? | Pending-until-confirmed for all client posts; Managed clients view-mostly |
| 2 | What does the client see while a write-off is pending / after denial? | Show as written-off while pending; on denial, reopen with a generic collections note |
| 3 | Do self-service batches still require Credyx verification/approval stages? | Yes — client review replaces the working stage, Credyx keeps final approval |
| 4 | Formal A/R rep assignment for Managed clients? | Add `assigned_rep_id` when internal user roles become real (currently mock-only) |
| 5 | Auto-activate Self-Service enrollments? | Yes, unless KYC/vetting is required for all clients |
| 6 | Can self-service clients create ad-hoc invoices from unmatched payments? | Allow, but flag for Credyx review before fee-billable |
