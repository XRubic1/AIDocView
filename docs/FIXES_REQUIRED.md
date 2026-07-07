# Fixes Required — Verification Findings

> Result of verifying the implemented work against `docs/features/` specs and
> `docs/LAUNCH_READINESS.md`, plus a deep trace of the batch submission workflow.
> Status: tests pass (32/32) but **the production build fails (107 TS errors)** and
> several features are broken at runtime.
>
> Verified: 2026-07-07

Priority key: **P0** = broken now / blocks build or revenue integrity · **P1** = spec
violation or data loss · **P2** = polish / follow-up.

---

## 1. P0 — Build is broken

`npm run build` runs `tsc && vite build`; `tsc --noEmit` currently reports
**107 errors across 35 files**, so nothing can build or pass the new CI workflow.

Errors that are also **real bugs** (fix these first, they overlap §2–§3):

- [ ] `src/components/batches/AccountingModal.tsx` (213, 279, 319, 329, 337) —
      `formatCurrency` used but never imported → **runtime crash** when the modal opens.
- [ ] `src/components/batches/AdminInvoiceDetailView.tsx:74` — `useAuth().user` does
      not exist; `AuthContext` exposes `session`/`resolved`. Audit actor/userId broken.
- [ ] `src/components/client/BatchStatusWidget.tsx:31` — compares batch status to
      `'approved'`, which isn't in `PendingBatch['status']` (batches end as
      `submitted`) → "Processed" count always under-reports.
- [ ] `src/components/client/RateConFieldEditor.tsx:3`,
      `RateConTrainingSection.tsx:3` — invalid named re-exports (build blockers).
- [ ] `src/pages/ClientBatches.tsx:1370–1371` — incompatible manual-form handler types.
- [ ] `src/services/supabase/tenantMappers.ts:281` — `batch.in_use` nullability.

The remaining errors are mostly noise (unused imports/vars, `null` vs `undefined`)
in: `tenantPersist.ts`, `extractBatchFields.ts`, `invoiceBilledMatch.ts`,
`multiInvoiceValidation.ts`, `paymentCorrectionService.ts`, `SimpleUploadModal.tsx`,
`paperworkSender.ts`, `Settings.tsx` (unused `useEffect`), and ~25 more files —
mechanical cleanup, but all must go for the build to pass.

---

## 2. P0 — Batch submission workflow (confirmed broken at runtime)

- [ ] **Accounting modal crashes on open** — missing `formatCurrency` import (§1).
      Blocks accounting from Ready to Post / Verification / Approval tabs.
- [ ] **Managed doc handoff discards files.** `ManagedDocHandoffView.tsx:32–57`
      sends the admin notification with file *names* only — no storage upload, no
      `setBatchFiles`. The created batch has `total_invoices: 0`, and
      `ReadyToPostTab` requires invoices > 0 to advance → handoff batches are stuck
      forever with no documents. Errors are also swallowed (`catch { /* ignore */ }`).
      Fix: upload files to the `batch-documents` bucket + give admins tooling to build
      invoices from a handoff batch.
- [ ] **AI batch submit never uploads documents.** `submitAiBatch`
      (`batchIntakePipeline.ts:127–135`) only calls the in-memory `setBatchFiles`,
      unlike `submitManualBatch.ts:162–176` which calls
      `uploadBatchInvoiceDocuments`. Documents are lost on refresh; admin AI review
      (`batchAiReviewService.ts:57–78`) then finds zero documents. Fix: mirror the
      manual path (upload + `document_storage_paths`).
- [ ] **Draft batches vanish on login/token refresh.** Auth hydration calls
      `clearTenantStores()` → `clearBatches()`; draft rows are memory-only
      (`tenantPersist.ts:198–201` skips drafts) and the IndexedDB recovery function
      `listDraftRecordsForClient` (`clientBatchDraftStore.ts:119–129`) is **never
      called anywhere**. "Continue draft" fails silently. Fix: rebuild draft rows from
      IndexedDB on portal load, or persist drafts to Supabase.
- [ ] **Admin invoice edits in Ready to Post don't persist.**
      `AdminInvoiceDetailView.tsx:495–512` `handleSave` mutates the prop object and
      `console.log`s — never calls `updateInvoice`/persist. Broker assignment and
      field edits are lost on reload.
- [ ] **Accounting fee recalc not written back** — `AccountingModal.tsx:67–75`
      updates local state only; never calls `updateBatch`/`syncBatchFees`.

---

## 3. P0 — Security actions

- [ ] **Rotate the OpenAI API key.** `.env` contains a live `sk-proj-…` key that was
      used from browser code. Rotate it at OpenAI, set the new key only as the
      `openai-proxy` edge function secret, and delete `VITE_OPENAI_API_KEY` from
      `.env`.
- [ ] **Port `reviewExplainChatService.ts` to the proxy** — it still calls OpenAI
      directly from the browser with the `VITE_` key (`:35–58`). Also remove
      `getOpenAIApiKey()` from `config/aiReview.ts:207` and the stale
      "set VITE_OPENAI_API_KEY" copy in `BatchAiUploadFlow.tsx`,
      `BatchAiReviewPanel.tsx`, `LoadReviewWorkbench.tsx` (replace with proxy
      deployment guidance).
- [ ] **Edge function authorization** — `openai-proxy` and `send-email`
      (`broker_packet` template) accept any authenticated user, including clients.
      Restrict to admin where appropriate; add spend limits on the proxy.

---

## 4. P0 — Revenue-integrity spec violations

- [ ] **Clients can self-confirm pending payments.** `ClientPayments.tsx:826–980`
      exposes Confirm + an inline confirm form calling `confirmClientPayment()`.
      Spec 02's entire control (and the collected-based billing from spec 07) depends
      on Credyx being the only confirmer. Remove the client-side confirm path.
- [ ] **Fake-confirm on failure** — when `confirmClientPayment` returns `undefined`,
      `ClientPayments.tsx:305–319` marks the payment confirmed locally anyway.
- [ ] **Admin can force-close Self-Service invoices.** `AdminInvoiceDetailView.tsx`
      (~180–234, 2415) always offers Force Close, no tier check, no service guard —
      spec 03's admin half. Also scope the dashboard force-close rate
      (`AdminDashboard.tsx:83–95`) to managed clients.
- [ ] **Capability bypasses in services** — no guard on:
      `markClientInvoiceAsPaid`, `postClientPaymentOnNewInvoice`
      (`canPostPayment`/`canCreateAdHocInvoice`), `closeClientInvoiceAsUncollectable`
      (`canRequestWriteOff`), `submitManualBatch` (`canCreateBatch`), and any path
      applying `force_closed` (`hasForceClose`).

---

## 5. P1 — Spec gaps by feature

### Spec 02 — Payment posting
- [ ] `rejected` status missing from client payment chips
      (`ClientPayments.tsx:62–67`); `rejection_reason` never shown.
- [ ] Reject logs `payment_received` with `action: 'rejected'` — should be a
      distinct `payment_rejected` audit event.
- [ ] No dedicated "reported, awaiting confirmation" success state after client post.

### Spec 03 — Force-close
- [ ] `getOverdueSeverity()` still returns `force_close` (purple styling) for
      self-service 90+ day invoices — severity needs tier awareness.
- [ ] `isForceCloseApplicable()` wrapper is dead code — either use it everywhere or
      remove it.
- [ ] Admin collections queues: no "aged — awaiting client action" framing for
      self-service.

### Spec 04 — Capability gating
- [ ] Managed clients can no longer open disputes (spec says disputes stay allowed) —
      `enableClientActions={canRunInvoiceOps}` on `ClientInvoices.tsx:620` and
      `ClientBatches.tsx:1450` gates dispute too. Needs a separate `canOpenDispute`
      or carve-out.
- [ ] `updateClientTier` has no audit log (`clientRegistry.ts:234–248`).
- [ ] `ClientReports.tsx` has no tier awareness for force-close metrics.

### Spec 06 — Payment corrections
- [ ] Note wording diverges from the required format
      ("Funds moved from Invoice {n} (Load {load}) due to: {note}"): source note is
      `visibility: 'internal'` (client can't see it), target note drops the Load
      segment (`paymentCorrectionService.ts:137–153`); unprocess writes
      "Reversed $X — {reason}" instead of "Payment of {amount} unprocessed due to:".
- [ ] Missing guards: same-client check, source-invoice status validation *before*
      reversing (currently reverses first, then validates target), block when source
      is written_off/force_closed.
- [ ] `overpayment_accepted_at` not cleared when a reversal undoes an overpayment.
- [ ] No admin notification on client-initiated corrections; no `payment_moved` /
      `payment_unprocessed` audit event types.
- [ ] No orphaned ad-hoc invoice cleanup on unprocess.
- [ ] Reversed rows have no link to the moved-to payment/invoice.

### Spec 07 — A/R billing
- [ ] **`servicePlans.ts:29` still has `service_fee_monthly: 299`** and marketing
      still advertises it (`PlanCard.tsx:31–34`, `HowItWorks.tsx:516`); enroll pages
      have no A/R-percentage pricing copy.
- [ ] **No admin UI for `factoring` / `ar_rate_override`** (DB columns + mappers
      exist; `Clients.tsx` has no controls). Factoring changes also need audit logs.
- [ ] 1/2-month overdue reminders compute standing but send no notifications/emails;
      the 2-month "will be locked" warning only shows on the Settings billing panel,
      not portal-wide.
- [ ] `markBillPaid` unlock isn't audit-logged (`arBillingService.ts:387–392`).
- [ ] Billing tests don't cover reversal credits, force-close adjustments, or
      pending-exclusion (only 2 tests).

### Spec 01 — Write-off approval (near-complete; polish)
- [ ] Admin queue rows missing broker, invoice/received amounts, request age, and a
      link to invoice detail (`PaymentPosting.tsx:555–610`).
- [ ] `write_off_request` isn't stripped by `toClientVisibleInvoice()` — not rendered,
      but present in client-side payloads.
- [ ] `writeOffApprovalService` uses sync `updateInvoice` (fire-and-forget persist) —
      switch to the awaited path.

---

## 6. P1 — Onboarding, email, persistence remainders

- [ ] **Anonymous enrollment admin-alert email fails** — `useEnrollForm.ts:71` calls
      `sendTransactionalEmail('admin_enrollment_alert')` but `send-email` requires an
      admin role for that template → 403, silently swallowed. Allow that template for
      anon (rate-limited) or move the alert server-side.
- [ ] **Stub email reports success** — without `RESEND_API_KEY`, `send-email` returns
      `{ ok: true, stub: true }` and `paperworkSender.ts:36` marks history
      `delivered` *before* sending. Treat stub as failure in prod; set status from
      the actual result.
- [ ] Broker packet emails send **no document attachments** (body only).
- [ ] No dunning/billing emails (ties to spec 07 reminders).
- [ ] `sessionService.ts:14–18` resolves `clientId` from JWT only — no
      `client_auth_links` fallback (the SQL helper has one). Stale JWTs after linking
      can't log in until refresh.
- [ ] Remaining fire-and-forget persists: sync `updateInvoice()`
      (used by `AdminDashboard.tsx:354–358` broker-contact and the write-off service),
      `mockBatches`/`mockBrokers`/`mockNotifications`, default `logAuditEvent`
      (`logAuditEventAsync` exists but is unused).
- [ ] Hardcoded audit actors `'user-1'`/`'Admin User'` in `ApprovalTab.tsx:89–139`
      (and elsewhere) — should come from the authenticated session.

---

## 7. P2 — Not yet addressed from the launch doc

- [ ] Admin Users page still mock (`useState(mockUsers)`, dead Edit button, roles
      unenforced beyond binary admin).
- [ ] `AgingAR.tsx:30–50` approve/reject/hold/contact still `console.log` stubs.
- [ ] `Accounting.tsx:152` export still `alert('will be implemented')`.
- [ ] `Settings.tsx` doesn't load persisted AR policy on mount (save works; form
      shows hardcoded defaults). SMTP/security tabs still decorative.
- [ ] ~30 `console.log`s remain; many flows still use `alert()` instead of toasts.
- [ ] Audit log hydration still capped at 10k rows.

---

## 8. Deployment checklist (code is done; these are ops steps)

- [ ] Apply migration `20260707180000_credyx_rls_production.sql` (and the two after
      it) to the Supabase project — **RLS is only fixed once this is applied**.
- [ ] Run `scripts/createAdmin.ts` (service role) to provision the first admin.
- [ ] Deploy edge functions: `openai-proxy` (secret: `OPENAI_API_KEY` — the *new*
      rotated key), `send-email` (secret: `RESEND_API_KEY`), `provision-client-auth`.
- [ ] Confirm `.env` in production hosting contains only `VITE_SUPABASE_URL` +
      `VITE_SUPABASE_PUBLISHABLE_KEY` (no OpenAI key).
- [ ] End-to-end smoke test: enroll → admin approve → invite email → client login →
      manual batch submit → admin pipeline → payment posting → billing run.

---

## Suggested order of attack

1. §1 build errors (start with the six real-bug ones) — unblocks CI/build.
2. §2 batch workflow breakage — handoff files, AI document upload, drafts, admin save.
3. §3 security actions — key rotation is a five-minute task; do it immediately.
4. §4 revenue-integrity violations — client self-confirm, force-close guard,
   capability bypasses.
5. §5–§6 spec gaps and email/persistence remainders.
6. §7 polish, then §8 deployment.
