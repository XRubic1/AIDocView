# Feature 4 — Capability Gating Extension (Money Pages + Service Enforcement)

> Applies to: **infrastructure for all tier differences**
> Priority: Medium — underpins specs 1–3; closes the "both tiers look identical" gap.
> Status: partially implemented (matrix exists; coverage and enforcement are the gap).

## 1. Problem

`src/utils/clientCapabilities.ts` is the right pattern and already gates batch creation,
vault uploads, remittance editing, and invoice ops **inside batch detail**. But:

1. **Coverage gap:** `ClientInvoices.tsx`, `ClientPayments.tsx`,
   `ClientCollections.tsx`, `ClientReports.tsx` ignore capabilities entirely. A Managed
   client blocked from invoice actions in batch detail gets full actions on the Invoices
   page — this inconsistency is why the tiers feel identical.
2. **UI-only enforcement:** no service function checks capabilities. Anything the UI
   hides is still callable (`clientPaymentService.ts`, `clientInvoiceActions.ts`).
3. **Missing flags:** the matrix has no concept of payment posting, write-off requests,
   or force-close.

## 2. Target capabilities matrix

```ts
export interface ClientCapabilities {
  // ── existing ──
  canCreateBatch: boolean
  canUseAiUpload: boolean
  canUseManualBatch: boolean
  canSubmitDocHandoff: boolean
  canUploadVault: boolean
  canEditRemittance: boolean
  canRunInvoiceOps: boolean
  canEditProfile: boolean
  // ── new ──
  canPostPayment: boolean         // spec 2 — post pending payments
  canCreateAdHocInvoice: boolean  // spec 2 — unmatched-remittance invoice
  canRequestWriteOff: boolean     // spec 1 — hidden-approval write-off request
  hasForceClose: boolean          // spec 3 — force-close applies to this client
  canReviewOwnBatches: boolean    // spec 5 — later update
}
```

| Flag | Self-Service | Managed | Notes |
|---|---|---|---|
| `canPostPayment` | true | **false** (default — confirm with product) | Pending-until-confirmed either way |
| `canCreateAdHocInvoice` | true (flagged for review) | false | |
| `canRequestWriteOff` | true | true | Abuse control is the hidden approval, not the tier |
| `hasForceClose` | **false** | **true** | |
| `canReviewOwnBatches` | true (later) | false | |

## 3. Page coverage to add

| Page | Gating to apply |
|---|---|
| `ClientInvoices.tsx` | Action buttons (mark paid, dispute, upload docs, close short-pay) honor `canRunInvoiceOps` / `canRequestWriteOff` — same rules as batch detail today. Managed: read-only invoice list with dispute allowed (product call). |
| `ClientPayments.tsx` | Post-payment form behind `canPostPayment`; ad-hoc invoice flow behind `canCreateAdHocInvoice`; Managed sees history + "Credyx posts payments from remittances" banner. |
| `ClientCollections.tsx` | Force-close framing behind `hasForceClose` (spec 3); action affordances follow `canRunInvoiceOps`. |
| `ClientShortPayments.tsx` | Close-as-uncollectable behind `canRequestWriteOff`. |
| `ClientReports.tsx` | Content is view-only; only force-close metrics need tier awareness (spec 3). |
| `ClientDashboard.tsx` | CTA tiles respect the new flags (e.g. hide "Post payment" quick action for Managed). |

Managed pages that lose actions should get the same pattern already used elsewhere
(e.g. remittance panel): a short banner explaining Credyx handles it, not silently
missing buttons.

## 4. Service-level enforcement

UI gating is presentation; enforcement lives in the services. Pattern:

```ts
// src/utils/clientCapabilities.ts
export function assertCapability(
  capabilities: ClientCapabilities,
  flag: keyof ClientCapabilities,
  action: string
): void {
  if (!capabilities[flag]) {
    throw new CapabilityError(`${action} is not available on this service plan`)
  }
}
```

Guard call sites (resolve capabilities from the client record inside the service, or
require the caller to pass them):

| Service function | Required flag |
|---|---|
| `postClientPayment`, `postClientPaymentOnNewInvoice`, `markClientInvoiceAsPaid` | `canPostPayment` |
| `createAdHocInvoiceForPayment` | `canCreateAdHocInvoice` |
| `closeClientInvoiceAsUncollectable` (→ write-off request, spec 1) | `canRequestWriteOff` |
| Batch submit paths (`submitManualBatch`, AI pipeline) | `canCreateBatch` (already UI-gated; add service guard) |
| Any function applying `force_closed` | client tier must be managed (`hasForceClose`) |

When Supabase is active, mirror the critical guards with RLS/constraints where feasible
(e.g. deny `force_closed` updates for self-service clients via a trigger or policy).
Mock-store mode relies on the service guards.

## 5. Tier-change semantics

`updateClientTier()` (`src/services/clientRegistry.ts`) can flip a client live from the
admin Plan tab. Rules:

- Capabilities recompute on next portal load (already automatic via
  `ClientPortalContext` reading the client record).
- **In-flight items drain, they don't cancel:** pending payments and pending write-off
  requests continue through their queues regardless of the new tier.
- Batch drafts (`clientBatchDraftService`): a Self-Service → Managed switch strands
  drafts the client can no longer submit. Show a notice in the portal ("Your plan
  changed — Credyx will take over these documents; use Send Docs") rather than deleting.
- Audit: `updateClientTier` should log an audit event with old → new tier (verify it
  does; add if missing).

## 6. Acceptance criteria

- [ ] New flags exist in the matrix with the values in §2; all existing consumers
      unchanged.
- [ ] Managed client sees consistent behavior across Batches detail, Invoices, Payments,
      Collections — no page grants actions another page blocks.
- [ ] Every blocked action has a "managed by Credyx" explanation banner, not a silent gap.
- [ ] Calling a guarded service function without the capability throws/returns a refusal
      even if the UI is bypassed.
- [ ] Tier switch mid-session: capabilities update on reload; pending queue items
      unaffected; audit trail records the change.
