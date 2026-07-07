# Feature 5 — Self-Service Batch Review & Notes

> Applies to: **Self-Service** (Managed batches are worked by a Credyx A/R representative)
> Priority: **Later update** — documented now for planning.
> Status: not implemented. Prerequisite work (persisted notes) should land first.

## 1. Problem

Every batch — including self-service ones — currently flows through the internal admin
pipeline (`ready_to_post → verification → approval` in `src/pages/Batches.tsx`) worked
by Credyx staff. The intended split:

- **Managed:** Credyx A/R rep reviews paperwork and works the batch (today's behavior).
- **Self-Service:** the client works their own batches — reviewing paperwork and leaving
  notes — with Credyx keeping a lighter touch.

There is no client-facing batch review tooling, and the admin-side review notes
(`BatchReviewTab.tsx` `reviewNotes`, `VerificationTab.tsx` `verificationNotes`) are
**local component state that is never persisted** — so even the foundation for a shared
notes thread doesn't exist yet.

## 2. Scope decision (recommended)

Self-service client review **replaces the working stage, not final approval**:

```
Managed:       client handoff ─► Credyx rep works ready_to_post ─► verification ─► approval
Self-Service:  client builds batch ─► CLIENT reviews paperwork + notes ─► submits
                                                    │
                                                    ▼
                              Credyx verification ─► approval   (retained, lighter)
```

Credyx retains verification/approval as the fee-relevant checkpoint; the client's review
replaces the `ready_to_post` working stage for their own batches. This keeps one
pipeline model and avoids trust issues around self-approved paperwork.

## 3. Prerequisite — persisted, shared notes

Must land before (or with) this feature, and is also required by spec 1's
internal-note visibility:

### Batch-level notes

```ts
// src/types/admin.ts — PendingBatch gains:
notes_history?: BatchNote[]

export interface BatchNote {
  id: string
  note: string
  created_by: string
  created_at: string
  author_role: 'client' | 'credyx'
  visibility: 'client' | 'internal'   // internal = Credyx-only
  stage?: 'review' | 'verification' | 'approval'
}
```

```sql
ALTER TABLE batches ADD COLUMN IF NOT EXISTS notes_history JSONB;
```

### Migration of existing UI-only notes

`BatchReviewTab` / `VerificationTab` textareas start writing to `notes_history`
(visibility `internal`, stage tagged) instead of throwing input away on unmount. This is
worth doing immediately even before the client-facing feature — Credyx currently loses
its own review notes.

Invoice-level notes already persist (`invoices.notes_history`) and already have a client
note path (`addClientInvoiceNote` in `clientInvoiceActions.ts`); they gain the
`visibility` flag via spec 1.

## 4. Client-facing batch review workspace

### Where

Extend `src/pages/ClientBatches.tsx` batch detail with a **Review** mode for
self-service clients (`canReviewOwnBatches`), modeled on the admin
`ReadyToPostTab` / `BatchReviewTab` composition but scoped to the client's own data.

### What the client can do per invoice in a batch

| Action | Backing |
|---|---|
| View extracted fields + attached paperwork (BOL, rate con, POD) | Existing document viewing (`document_doc_ids`, storage paths); AI review summary (`ai_review_status` / `ai_review_summary`) shown read-only |
| Flag an invoice as "needs attention" / resolve the flag | New per-invoice client flag (reuse note with a `type`, or lightweight `client_review_status` field) |
| Leave notes (invoice-level and batch-level) | Persisted notes with `author_role: 'client'`, `visibility: 'client'` |
| Replace/add a document | Existing upload paths, gated by capability |
| Confirm review complete → submit batch to Credyx verification | Batch status transition |

Clients never see internal-visibility notes; Credyx sees everything, with author badges
("Client" vs rep name) in the admin tabs.

### What the client cannot do

- Approve invoices into the fee-billable state (Credyx verification/approval does that).
- See internal Credyx notes or the AI review's internal gate details beyond the
  summary surfaced today.

## 5. Admin-side changes

- `Batches.tsx` pipeline tabs render the shared notes thread (client + internal) per
  batch/invoice.
- Self-service batches arriving in verification show a "client-reviewed" indicator with
  the client's flags resolved/outstanding.
- Managed handoff batches are untouched — rep workflow stays as-is. Consider the formal
  rep-assignment model (`clients.assigned_rep_id`) alongside this work so Managed
  clients have a named A/R representative; today `batches.in_use_by` is a display
  string only.

## 6. Capability flag

`canReviewOwnBatches` (spec 4): Self-Service `true`, Managed `false`. Service-level
guard on any client-callable batch note/flag/submit mutation.

## 7. Edge cases

- **Tier switch with a batch mid-review:** Self-Service → Managed hands the batch to
  the rep pipeline at its current stage; client review UI becomes read-only. Notes
  thread persists across the switch.
- **Client edits after submit:** once a batch enters Credyx verification, client review
  actions lock (notes remain allowed).
- **Concurrent editing:** reuse the existing `in_use` / `in_use_by` lock so a client and
  a Credyx admin don't work the same batch simultaneously.

## 8. Acceptance criteria

- [ ] Admin review/verification notes persist to `batches.notes_history` (no more lost
      textarea state) — deliverable even before the client feature ships.
- [ ] Self-service batch detail offers the review workspace: paperwork viewing,
      flags, persisted notes, submit-to-verification.
- [ ] Managed clients never see the review workspace; rep flow unchanged.
- [ ] Note visibility is respected: internal notes never render in the client portal;
      client notes appear in admin tabs with author attribution.
- [ ] Credyx verification/approval remains mandatory before invoices become
      fee-billable, for both tiers.
- [ ] Batch locking prevents concurrent client/admin editing.
