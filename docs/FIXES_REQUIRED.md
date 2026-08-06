# Fixes Required — Verification Findings

> Result of verifying the implemented work against `docs/features/` specs and
> `docs/LAUNCH_READINESS.md`, plus a deep trace of the batch submission workflow.
>
> **Re-verified: 2026-08-06** — production build is green (`tsc --noEmit` = 0 errors).
> Most P0 runtime bugs from the original 2026-07-07 audit are fixed. Remaining
> items are ops steps, polish, and a short P1/P2 tail.
>
> Original finding (2026-07-07): tests passed but build failed with 107 TS errors.

Priority key: **P0** = broken now / blocks build or revenue integrity · **P1** = spec
violation or data loss · **P2** = polish / follow-up.

Checkbox legend: `[x]` fixed in code · `[ ]` still open · `[~]` partial / ops-only.

---

## 1. P0 — Build is broken

**Status: FIXED** — `tsc --noEmit` reports **0 errors** (was 107 across 35 files).

- [x] `AccountingModal.tsx` — `formatCurrency` imported; modal no longer crashes.
- [x] `AdminInvoiceDetailView.tsx` — uses `useAuth().resolved` / `session` (not `.user`).
- [x] `BatchStatusWidget.tsx` — processed batches use `status === 'submitted'`.
- [x] `RateConFieldEditor` / `RateConTrainingSection` — valid re-exports.
- [x] `ClientBatches.tsx` — manual-form handler types compatible.
- [x] `tenantMappers.ts` — `batch.in_use` nullability (`?? false`).
- [x] Remaining mechanical TS noise (optional dates / `null` vs `undefined`) cleared
      including `DashboardInvoiceList`, `CollectionsInvoiceModal`, `clientDemoData`,
      `AdminDashboard`, `ClientCollections`, `cashCollectionForecast`,
      `clientActivityMetrics`.

---

## 2. P0 — Batch submission workflow (confirmed broken at runtime)

**Status: FIXED** (fee open-time recalc still local-only — acceptable).

- [x] **Accounting modal crashes on open** — `formatCurrency` import present.
- [x] **Managed doc handoff discards files** — uploads via `uploadBatchInvoiceDocuments`;
      admin handoff workspace builds invoices from documents.
- [x] **AI batch submit never uploads documents** — `submitAiBatch` uploads + sets
      `document_storage_paths` (mirrors manual path).
- [x] **Draft batches vanish on login** — `restoreClientDraftBatches` /
      `listDraftRecordsForClient` wired from `hydrateStores`.
- [x] **Admin invoice edits in Ready to Post don't persist** — `handleSave` uses
      `updateInvoiceAsync`.
- [~] **Accounting fee recalc not written back** — save path persists via
      `applyBatchFeeTerms` / `syncClientBatchFees`; open-time `useEffect` still updates
      local display only (no silent write on open).

---

## 3. P0 — Security actions

- [~] **Rotate the OpenAI API key.** `.env` no longer contains `VITE_OPENAI_API_KEY`.
      **Ops:** confirm the key was rotated at OpenAI and set only as the
      `openai-proxy` Edge Function secret `OPENAI_API_KEY`.
- [x] **Port `reviewExplainChatService` to the proxy** — uses `postOpenAIChatCompletions`.
      Stale “set `VITE_OPENAI_API_KEY`” UI copy scrubbed in main batch/AI flows
      (`BatchAiUploadFlow`, `BatchAiReviewPanel`, `LoadReviewWorkbench`,
      `ReviewExplainChat`, `DocumentReviewResults`, `batchAiReviewService`).
      `getOpenAIApiKey()` remains as a deprecated/legacy helper for eval paths.
- [~] **Edge function authorization** — `send-email` restricts broker/Credyx templates
      to admin; public templates (incl. enrollment alert) allowed. `openai-proxy`
      still allows any authenticated admin **or** linked client — **no spend limits**.
      Tighten further if needed.

---

## 4. P0 — Revenue-integrity spec violations

- [x] **Clients can self-confirm pending payments** — client pending confirm path
      removed; Credyx admin confirms. Client may only confirm **awaiting_receipt**
      when `canConfirmPaymentReceipt` (managed).
- [x] **Fake-confirm on failure** — zero/failed confirms show error; no local success.
- [x] **Admin can force-close Self-Service invoices** — Force Close gated to managed
      tier in `AdminInvoiceDetailView`. Dashboard force-close rate scoped to managed
      clients (`AdminDashboard`).
- [x] **Capability bypasses in services** — guards on mark-paid / post / write-off;
      `submitManualBatch` now asserts `canCreateBatch` (admin paths use `skipSetupGate`).

---

## 5. P1 — Spec gaps by feature

### Spec 02 — Payment posting
- [x] `rejected` status chip + `rejection_reason` tooltip on client payments.
- [x] Reject logs distinct `payment_rejected` audit event.
- [ ] No dedicated "reported, awaiting confirmation" success state after client post
      (form clears; toast only).

### Spec 03 — Force-close
- [x] `getOverdueSeverity()` is tier-aware (`hasForceClose`); self-service 90+ day
      invoices use `critical`, not purple `force_close`.
- [x] `isForceCloseApplicable()` used in `ClientCollections` (and capability gates
      elsewhere).
- [x] Self-service collections banner: “aged — awaiting client action” when 90+ day
      open A/R exists.

### Spec 04 — Capability gating
- [x] Managed disputes stay allowed via separate `canOpenDispute`.
- [x] `updateClientTier` audit-logged.
- [ ] `ClientReports.tsx` still has no dedicated force-close / tier metric framing.

### Spec 06 — Payment corrections
- [x] Target + source notes use required Load wording; source note is client-visible.
- [x] Unprocess wording: `Payment of {amount} unprocessed due to:`.
- [x] Same-client check; `force_closed` source blocked; `overpayment_accepted_at`
      cleared on reverse; moved-to payment link fields set.
- [x] `payment_moved` / `payment_unprocessed` audit types; client-path admin notify.
- [ ] No orphaned ad-hoc invoice cleanup on unprocess.
- [ ] Source status validation order still reverses before some target checks
      (written_off sources intentionally allowed).

### Spec 07 — A/R billing
- [x] `$299/mo` removed from `HowItWorks` managed card (A/R % copy).
      `servicePlans` no longer hardcodes `service_fee_monthly: 299`.
- [~] Factoring checkbox in `Clients.tsx` **with audit**; **no `ar_rate_override` UI**.
- [~] Portal lock via `ClientRouteGuard` when locked; warning still mainly on
      Settings billing panel; **no dunning emails**.
- [x] `markBillPaid` unlock + bill-paid audit-logged.
- [ ] Billing tests still thin on reversal credits / force-close / pending-exclusion.

### Spec 01 — Write-off approval
- [x] Admin write-off queue shows broker, invoice/received amounts, request age, and
      invoice detail link (`PaymentPosting`).
- [x] `write_off_request` stripped by `toClientVisibleInvoice()`.
- [x] `writeOffApprovalService` uses awaited `updateInvoiceAsync`.

---

## 6. P1 — Onboarding, email, persistence remainders

- [x] **Anonymous enrollment admin-alert** — `admin_enrollment_alert` is a public
      template on `send-email`.
- [~] **Stub email** — client treats stub as failure; history may still default
      `delivered` briefly before result rewrite in `paperworkSender`.
- [x] Broker packet emails include document attachments.
- [ ] No dunning/billing reminder emails.
- [x] `sessionService` — `resolveSessionWithLinks` falls back to `client_auth_links`
      when JWT lacks `client_id` (used from `AuthContext`).
- [ ] Remaining fire-and-forget persists: sync `updateInvoice` in some admin paths;
      `logAuditEventAsync` still largely unused.
- [~] Hardcoded audit actors `'Admin User'` still appear in places; many flows use
      session-derived names.

---

## 7. P2 — Not yet addressed from the launch doc

- [x] Admin Users page uses real `listAdminStaffUsers` (not mock-only).
- [ ] `AgingAR.tsx` approve/reject/hold/contact still `console.log` stubs.
- [ ] `Accounting.tsx` export still stub (“will be implemented”).
- [~] `Settings.tsx` loads AR policy on mount; SMTP/security tabs still decorative.
- [ ] Console noise / `alert()` leftovers in various flows.
- [ ] Audit log hydration still capped at 10k rows.

---

## 8. Deployment checklist (ops — code ready)

- [ ] Apply migration `20260707180000_credyx_rls_production.sql` (and later ones) to
      the Supabase project — **RLS is only fixed once this is applied**.
- [ ] Run `scripts/createAdmin.ts` (service role) to provision the first admin.
- [ ] Deploy edge functions: `openai-proxy` (secret: rotated `OPENAI_API_KEY`),
      `send-email` (`RESEND_API_KEY`), `provision-client-auth`.
- [ ] Confirm production hosting env contains only `VITE_SUPABASE_URL` +
      `VITE_SUPABASE_PUBLISHABLE_KEY` (no OpenAI key).
- [ ] End-to-end smoke test: enroll → admin approve → invite email → client login →
      manual batch submit → admin pipeline → payment posting → billing run.

---

## Suggested order of attack (remaining)

1. ~~§1 build errors~~ — **done**.
2. ~~§2 batch workflow breakage~~ — **done**.
3. §3 ops — rotate/confirm OpenAI key + deploy proxy; optional spend limits.
4. ~~§4 revenue-integrity~~ — **done** in code.
5. Remaining §5–§6: post-payment success UX, `ar_rate_override` UI, dunning emails,
   ad-hoc cleanup on unprocess, billing test coverage.
6. §7 polish (`AgingAR` / Accounting export stubs), then §8 deployment + smoke test.
