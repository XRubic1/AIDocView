# App Status Audit — Working / Broken / Missing

> Full-app review: type check + test suite run fresh, admin portal, client portal,
> services, persistence, auth, and a re-verification of the July fix list
> (`docs/FIXES_REQUIRED.md`) against current code.
>
> Audited: 2026-08-05
>
> Companion docs: `docs/INVOICE_LIFECYCLE_FIXES.md` (demo seed lifecycle bugs) ·
> `docs/DEMO_VS_APP_FEATURES.md` (demo coverage gaps) · `docs/FIXES_REQUIRED.md`
> (July list — of its actionable items: ~28 fixed, ~18 partial, ~18 still broken)

Priority key: **P0** = broken now / blocks build or revenue integrity ·
**P1** = wrong behavior or data loss · **P2** = incomplete feature · **P3** = polish.

---

## Health snapshot

| Check | Result |
|---|---|
| Test suite (`vitest run`) | ✅ **118/118 pass** (27 files) |
| Type check / prod build (`tsc && vite build`) | ❌ **10 errors → build fails** (was 107 in July) |
| Auth (admin + client) | ✅ Solid — JWT `app_metadata` roles, protected layouts, super-admin gating |
| Supabase field mapping | ⚠️ Payments fully mapped; invoices missing 3 collections-chase fields |
| Console noise | ~40 `console.log` remain; `alert()` only in `BatchAiConfirmPanel.tsx` |

### What's working (verified, not just assumed)

- **Admin**: Payment Posting (all queues: pending, awaiting receipt, disputes,
  write-offs, corrections), Admin Invoices + workspace, Batches/CreateBatch, Clients,
  Brokers, Billing + reimbursements, Accounting reports, Audit dashboard, Users
  (real staff CRUD), Admin Docs, Assistant, Calendar.
- **Client**: Invoices (list/filters/detail/post-from-detail/disputes), Payments
  (receipt confirm + dispute for managed), Batches (manual create, AI preview, managed
  handoff, draft resume), Documents vault, Collections, Brokers, Reports + CSV export,
  Settings (profile/password/notifications/preferences), Tutorials/onboarding,
  Enroll + Waitlist (real persistence).
- **July P0s that are now fixed**: accounting modal crash, handoff file discard,
  AI batch doc upload, draft-batch restore, ready-to-post edit persistence, client
  self-confirm bypass, write-off request stripping for clients, broker packet
  attachments, anonymous enrollment alert.

---

## P0 — Broken now

### 1. Production build fails — 10 TypeScript errors
`npm run build` (`tsc && vite build`) cannot complete. All are optional-date misuse
(`string | undefined` into `new Date()` / typed arrays):

- `src/components/client/dashboard/DashboardInvoiceList.tsx:14,37`
- `src/components/collections/CollectionsInvoiceModal.tsx:38`
- `src/data/clientDemoData.ts:182`
- `src/pages/AdminDashboard.tsx:63`
- `src/pages/ClientCollections.tsx:203` (×2)
- `src/utils/cashCollectionForecast.ts:122,188`
- `src/utils/clientActivityMetrics.ts:117`

Mechanical fixes (null-guard or fallback date). An 11th error in
`ClientShortPayments.tsx` was introduced and fixed today.

### 2. OpenAI API key still exposed in `.env`
`VITE_OPENAI_API_KEY` remains in local `.env` (flagged P0 in July). Vite inlines
`VITE_*` vars into the client bundle. The chat service now uses the edge proxy, but:
- key rotation at OpenAI is not evidenced;
- `getOpenAIApiKey` helper still exists (`src/utils/aiReview.ts:207`);
- stale "uses your API key" copy in `BatchAiUploadFlow.tsx:436`,
  `BatchAiReviewPanel.tsx:55`, `LoadReviewWorkbench.tsx:278`.

### 3. `openai-proxy` edge function has no spend limits
`supabase/functions/openai-proxy/index.ts:8-16` accepts any admin **or client** JWT
with no rate/spend caps — any logged-in carrier can burn API budget.

### 4. Demo self-destructs: awaiting-confirm payments auto-confirm on load
Seeded confirmation deadlines equal the seed day, so
`processExpiredReceiptConfirmations()` fires on the Payments page and silently
confirms all four Confirm-payment demos. Full detail + fix:
`docs/INVOICE_LIFECYCLE_FIXES.md` issue 1.

---

## P1 — Wrong behavior / data loss

### Data persistence
1. **Collections chase state doesn't survive refresh.** `collections_needs_attention`,
   `collections_last_inquiry_at`, `collections_followup_at` exist in
   `src/types/invoice.ts:79-81` and in the DB migration
   (`20260717160000_broker_collections_prefs.sql`), but are **omitted from
   `tenantMappers.ts`** (`InvoiceRow` / `invoiceToRow` / `invoiceRowToInvoice`) — the
   chase queue writes them and loses them.
2. **Client money actions are fire-and-forget.** Notes, disputes, mark-paid,
   write-off, receipt confirm/dispute all use sync `updateInvoice`/`addPayment`
   (`persistWithFeedback`) — UI reports success before Supabase write completes;
   awaited `*Async` variants exist but are barely used
   (`clientPaymentService.ts:207-275`, `clientInvoiceActions.ts:46-120,219-351`,
   `paymentReceiptConfirmationService.ts:161-239`).
3. **Managed handoff files can be session-only.** Without Supabase configured, the
   batch row persists but attachments live in memory
   (`ManagedDocHandoffView.tsx:74-88`).

### Dead or misleading UI paths
4. **"Post Payment" CTA leads nowhere.** `ClientDashboard.tsx:537` navigates to
   `/client/payments`, which has no post-payment UI; the fully built
   `PostPaymentForm.tsx` is **never imported anywhere**. Posting only works from
   invoice detail.
5. **Aging A/R action buttons are no-ops.** Approve/Reject/Hold/Release only
   `console.log` (`AgingAR.tsx:29-47`); "View Documents" in the same modal is also a
   stub (`InvoiceDetailModal.tsx:114-116`).

### Capability-gating inconsistencies
6. **Pay Variances uses the wrong flag.** `ClientShortPayments.tsx:796` gates actions
   on `canRunInvoiceOps` while Invoices/Batches/Collections use `canOpenDispute` —
   managed clients lose Dispute/Upload only on that page.
7. **Dashboard nudges self-service into confirm flows they can't complete.**
   `ClientDashboardV2.tsx:184-211` and `MobileEmptyDashboard.tsx:283-293` surface
   `awaiting_receipt` items without checking `canConfirmPaymentReceipt`.
8. **`submitManualBatch` has no `canCreateBatch` guard**
   (`submitManualBatch.ts:64-73`) — managed clients could create batches by calling
   the service path.
9. **Accept overpayment offered before receipt is confirmed** — same asymmetry the
   write-off gate fixed today. Detail: `docs/INVOICE_LIFECYCLE_FIXES.md` issue 2.

### Auth / audit correctness
10. **`sessionService` trusts JWT `client_id` only** — no `client_auth_links`
    fallback (`sessionService.ts:14-18`); July item still open.
11. **Audit actors hardcoded** in places (`AdminInvoiceDetailView.tsx:248,614,709`
    — `'Admin User'`); rejected payments still logged as `payment_received`
    (`clientPaymentService.ts:1158-1169`); `markBillPaid` unlock not audit-logged
    (`arBillingService.ts:627-650`).

---

## P2 — Incomplete features

| Area | Gap |
|---|---|
| **Admin Settings** | Only the Invoices A/R-policy tab persists; profile/notifications/security/system tabs are decorative but always toast "Settings saved" (`Settings.tsx:172-278`) |
| **Accounting export** | Button toasts "will be implemented" (`Accounting.tsx:154`) |
| **Write-off approval queue UI** | Thin — missing broker, received/shortfall amounts, age, invoice link (`PaymentPosting.tsx:817-823`) |
| **Billing emails** | No dunning/reminder sends; standing computed only (`arBillingService.ts:493-507`) |
| **Force-close severity** | `getOverdueSeverity()` tier-unaware; `isForceCloseApplicable()` dead code (`invoiceAging.ts:144-154`) |
| **Client Reports** | Not tier-aware for force-close metrics |
| **Payment corrections (client)** | `PaymentCorrectionModals.tsx` orphaned — never imported |
| **Assistant** | Replies are mock (`buildMockAssistantReplies`), no live model backend |
| **AI document upload** | Explicitly WIP/preview but clickable (`ClientSubmitDocsView.tsx:241-251`) |
| **localStorage-only persistence** | Shared calendar events (`sharedCalendarEvents.ts`) and broker notes (`clientBrokers.ts:111-160`) never reach Supabase |
| **Audit hydration cap** | Hard 10k row cap (`auditLogger.ts:68-69,110-111`) |
| **Dead stub components** | `BatchReviewTab.tsx`, `InvoiceDetailTab.tsx`, `inboxAiScaffold.ts`, `listPendingPaymentsFromStore` — unreferenced |
| **Collections broker list** | `useMemo(..., [])` snapshot never refreshes (`Collections.tsx:18-58`) |
| **Pricing copy drift** | Marketing still shows `+$299/mo` (`HowItWorks.tsx:515`) vs `$99` app fee in `servicePlans.ts`; no `ar_rate_override` admin UI |
| **Demo seed coverage** | Several app queues start empty (pending payments, receipt disputes, write-off approvals, review pipeline) — see `docs/DEMO_VS_APP_FEATURES.md` §7 |
| **Unprocessed ad-hoc cleanup** | `unprocessPayment` leaves orphaned ad-hoc invoices (`paymentCorrectionService.ts:202-230`) |

---

## P3 — Polish

- Hardcoded chrome identities: `userName="Admin User"` (`Collections.tsx:71`,
  `AgingAR.tsx:55`); `"James Doe"` fallback (`clientNav.ts:112`).
- Hardcoded "days since login / away" on both client dashboards
  (`ClientDashboard.tsx:307`, `ClientDashboardV2.tsx:149`).
- Waitlist "founding spots" counter hardcoded at 68/100 (`Waitlist.tsx:204-206`).
- Mojibake in Payment Posting placeholders (`PaymentPosting.tsx:221,1073,1118`).
- `window.alert` in `BatchAiConfirmPanel.tsx:243,248`.
- Contact-broker copy has no toast (`ContactBrokerModal.tsx:21-23`).
- Dual dashboards in nav (V2 default + Classic) — mobile card-stack home only exists
  on Classic; consider consolidating.
- `canEditProfile` capability flag never read (dead flag).
- Untracked junk in repo root: `scripts/fix-ts-build*.cjs/js` one-off scripts,
  `tsc-audit.log` — delete or gitignore.

---

## Ops items (cannot verify from code)

- RLS migration `20260707180000_credyx_rls_production.sql` — **applied?**
- OpenAI key **rotated** at provider?
- Edge functions deployed with current secrets?
- Production `.env` contents.

---

## Suggested execution order

1. **P0.1** — Fix the 10 TS errors (≈1 focused pass; all optional-date guards) →
   restores `npm run build` and CI.
2. **P0.2/0.3** — Remove `VITE_OPENAI_API_KEY` from `.env` + rotate key; delete
   `getOpenAIApiKey` + stale copy; add spend/rate cap to `openai-proxy`.
3. **P0.4** — Seed deadline fix + re-seed (`INVOICE_LIFECYCLE_FIXES.md` issue 1).
4. **P1 persistence** — Map the 3 collections-chase fields; move client money paths
   to awaited `*Async` persists.
5. **P1 UI/gating** — Mount `PostPaymentForm` on Payments (or retarget CTAs); align
   Pay Variances gating to `canOpenDispute`; gate dashboard confirm nudges; wire or
   hide Aging A/R buttons; overpayment-accept gate; `submitManualBatch` guard.
6. **P2** — Settings honesty (disable non-persisting tabs), write-off queue columns,
   accounting export, billing reminders, dead-code sweep.
7. **P3** — identity/copy/log cleanup pass.
