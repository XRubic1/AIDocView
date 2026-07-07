# Loading States & User Feedback — UX Improvement Plan

> Where the app feels blank, frozen, or silent — and where to add loading screens,
> pending states, and feedback. Based on a full audit of boot, routing, page loads,
> mutations, AI flows, and error surfacing.
>
> Audited: 2026-07-07

## TL;DR — the five highest-impact fixes

1. **Branded boot/hydration screen** — today it's a blank page, then plain text
   "Loading…" while multi-second data hydration runs.
2. **Route code splitting** — all ~35 pages ship as one bundle (pdfjs, jspdf,
   recharts, xlsx, html2canvas included), so first paint waits on everything.
3. **Kill `alert()`** — ~50+ blocking `alert()` calls vs only 7 surfaces using the
   toast system.
4. **Pending states on every mutation button** — several money actions (confirm,
   reject, write-off approve, process batch) have zero pending UI → double-submit risk.
5. **Surface persist failures** — most writes are optimistic with silent
   `console.error` on failure; the user sees success while data may not have saved.

---

## 1. Current state summary

| Surface | Today | Quality |
|---|---|---|
| Boot / auth / hydration | Blank `#root` → text-only "Loading…" (`AdminProtectedLayout.tsx:20–25`, `ClientRouteGuard.tsx:33–38`) | Poor |
| Route transitions | No `React.lazy`/`Suspense`; single bundle (`App.tsx:5–41`, default `vite.config.ts`) | Poor |
| Client list pages | Instant from in-memory stores; good designed empty states; **no** loading/skeletons; `useClientDemoSnapshot().loading` exists but is never consumed | Mixed |
| Admin list pages | Instant from stores; empty states are mostly plain `<td>` text | Mixed |
| Login / Enroll | Spinner + disabled button — the good pattern | Good |
| AI batch upload (client) | 3-step stepper + phase messages + indeterminate bar (`BatchAiUploadFlow.tsx:436–458`) | Good |
| AI batch review (admin) | Text-only progress, no spinner (`BatchAiReviewPanel.tsx:54–72`) | Weak |
| Mutation feedback | Split brain: 7 toast surfaces vs ~50+ `alert()` sites; many buttons with no pending state | Fragmented |
| Persist errors | `void persist(...).catch(console.error)` almost everywhere; `persistOrThrow` used only on a few critical paths | Poor |
| Skeletons | Zero (`skeleton`/`animate-pulse`: 0 matches in `src/`) | Missing |
| Animations | Subtle CSS transitions exist (`clientPortal.css`); `motion` package installed but never imported; toast `animate-in` classes reference a Tailwind plugin that isn't installed (likely inert) | Mixed |

---

## 2. Missing primitives (build these first, ~1 day)

None of these exist; everything below reuses them.

### `src/components/ui/Spinner.tsx`
Lucide `Loader2` with `animate-spin` is hand-rolled in ~15 places. One component,
three sizes. Replace ad-hoc usages opportunistically.

### `src/components/ui/PageLoader.tsx`
Full-area branded loader: Credyx wordmark + spinner + optional message line
("Signing you in…", "Loading your workspace…"). Used by boot, route guards, and
Suspense fallbacks. Respect `prefers-reduced-motion` (pattern already in
`useCountUp.ts:14–24`).

### `src/components/ui/Skeleton.tsx`
Simple `animate-pulse` block + a `SkeletonRows` helper (n rows matching table/list
layout). Used during snapshot refetch and lazy-route loads.

### `src/components/ui/EmptyState.tsx`
The client-portal rule already defines the pattern (icon + title + one help line —
`.cursor/rules/client-portal-ui.mdc:150`) and `AdminBatchesListView` already has
`emptyTitle`/`emptyHint` props. Extract to a shared component and adopt it on the
plain-text admin empties: `PaymentPosting.tsx:476–480`, `Clients.tsx:370`,
`Users.tsx:190`, `Brokers.tsx:220`, `Collections.tsx:91,208`, `AuditDashboard.tsx:506`.

### `useAsyncAction` hook
Wraps a mutation: returns `{ run, isPending }`, disables re-entry, shows an error
toast on throw. This one hook fixes the double-submit class of bugs everywhere.

---

## 3. Boot & hydration experience (P0)

**Problem:** blank HTML → full JS parse → text "Loading…" while `hydrateStoresForSession`
runs (admin: 8+ parallel table queries incl. up to 10,000 audit rows —
`hydrateStores.ts:88–169`). On slow connections this is many seconds of near-nothing.

**Fixes:**

1. **Inline boot splash in `index.html`** — tiny inline CSS spinner/wordmark inside
   `#root`, replaced when React mounts. Zero-JS, covers the bundle-parse gap.
2. **`PageLoader` in the guards** — replace text-only "Loading…" in
   `AdminProtectedLayout.tsx:20–25` and `ClientRouteGuard.tsx:33–38` with the branded
   loader + contextual message ("Loading your workspace…").
3. **Stage the hydration message** — `AuthContext` knows which phase it's in
   (session → data). Pass a coarse progress label ("Signing you in…" → "Loading your
   data…") to the loader. No need for per-table progress bars.
4. **Trim the payload** — drop the 10k audit-log hydration from boot
   (`hydrateStores.ts:104`); load audit logs lazily when the Audit page opens. This is
   the single biggest hydration win for admins.
5. **Client double-gate** — after auth hydration, `ClientPortalContext` fetches the
   client + tenant data again (`ClientPortalContext.tsx:36–57`). Merge or overlap these
   so the client doesn't wait through two sequential loading screens.

---

## 4. Route code splitting (P0)

All pages are statically imported into one bundle; heavy libs (pdfjs, jspdf, xlsx,
recharts, html2canvas) load before *any* route paints — including the public landing
and enroll pages, which matter most for first impressions.

1. `React.lazy` + `<Suspense fallback={<PageLoader/>}>` per route group:
   **marketing/public**, **client portal**, **admin portal**, **engine/dev tools**.
2. Keep login/enroll in the initial chunk (small, first-visit critical).
3. Dynamic-import heavy libs at usage sites: pdf generation (`generateInvoicePDF`),
   xlsx export, html2canvas — they're action-triggered, not render-critical.
4. Optional: `build.rollupOptions.output.manualChunks` in `vite.config.ts` for
   vendor splitting (react / charts / pdf).

---

## 5. Page-level loading & refresh states (P1)

Pages read hydrated in-memory stores synchronously — instant after boot, which is
good. The gaps are around *refresh* and *first-fetch* moments:

- **`useClientDemoSnapshot().loading` is never consumed** (`useClientDemoSnapshot.ts:17,42,58`).
  On tab refocus the snapshot refetches; during that window dashboards can show zeros.
  Consume `loading`: keep last data visible + a subtle top-bar refresh indicator (do
  NOT blank the page), and show `SkeletonRows` only when there is no previous data.
- **`Billing.tsx`** — `loading` only spins the refresh icon (`Billing.tsx:52–66,216`);
  add a table overlay/skeleton during `hydrateClientBillsFromSupabase`.
- **`Clients.tsx` detail select** — `loadClientTenantData` on select has no pending
  UI; add a right-panel skeleton while it loads.
- Route-level `Suspense` fallbacks (from §4) cover lazy-load gaps automatically.

---

## 6. Mutation feedback (P1) — pending states + toasts everywhere

### Rule to adopt
Every async action: **button pending state** (disabled + `Spinner` + verb-ing label)
→ **toast on success** → **toast/inline on failure**. Never `alert()`. The good
pattern already exists in `PostPaymentForm.tsx:625–633` and `Login.tsx:149–157`;
`useAsyncAction` (§2) makes it one-liner adoptable.

### Missing pending states (double-submit risk today)

| Flow | Location |
|---|---|
| PaymentPosting confirm / reject / write-off approve / deny / move / unprocess modals | `PaymentPosting.tsx:700,802,838,884` |
| ApprovalTab "Process Batch" (async paperwork send, zero pending UI) | `ApprovalTab.tsx:216–228` |
| Client manual batch submit | `ClientManualBatchForm.tsx:303–304` |
| PaymentCorrectionModals (client) — modals stay active during await | `PaymentCorrectionModals.tsx:219,333` |
| ClientSettings / admin Settings save (no `isSaving`) | `ClientSettings.tsx:339–348`, `Settings.tsx:818–829` |
| Billing row actions — disabled but no spinner | `Billing.tsx:250–305` |

### `alert()` elimination (~50+ call sites → toasts)

Worst offenders, in order: `AdminInvoiceDetailView.tsx` (~30+ alerts),
`ApprovalTab.tsx:80–85,128–134`, `ClientBatches.tsx:517,1123–1125,1182,1339`,
`Clients.tsx:288`, `Users.tsx:82`, `Brokers.tsx:130`, `SimpleUploadModal.tsx:93`,
`CollectionsInvoiceModal.tsx:73`, `Accounting.tsx:152`, `DocumentViewer.tsx:223`.
Validation alerts become inline field errors; success/error alerts become toasts.

### Toast system fixes
`ToastProvider.tsx:55` uses `animate-in slide-in-from-right` — classes from a Tailwind
plugin that isn't installed, so entry animation is likely inert. Replace with a small
keyframe in project CSS. Consider adding a `loading` toast variant (spinner toast that
resolves to success/error) for fire-and-forget sends like paperwork emails.

---

## 7. Silent persist failures (P1 — trust issue, not just polish)

Optimistic memory-first writes make the UI feel instant (keep that), but nearly all
Supabase persists are `void persist(...).catch(console.error)`:
`mockInvoices.ts:44,53`, `mockPayments.ts:36,48`, `mockBrokers.ts`,
`mockNotifications.ts`, `auditLogger.ts:53`, `clientDocumentService.ts:112–146`,
`adminNotificationService.ts:75–108`.

1. Central handler: failed persists trigger an error toast ("Change couldn't be saved
   — retry") + a retry callback, instead of silence. Cheapest version: route all
   `void persist…catch` through one `persistWithFeedback()` wrapper that calls
   `useToast` via an event bus (stores aren't React).
2. Expand `persistOrThrow` (`persistHelper.ts`) usage on money paths (write-off
   approval currently uses the fire-and-forget sync `updateInvoice`).
3. `useClientDemoSnapshot` refetch failures: show a dismissible "Data may be out of
   date" banner instead of `console.error` only.

---

## 8. Long-running AI flows (P2)

The client upload stepper is the best UX in the app — extend it:

- **Wire `AnalysisProgressMessage`** (spinner + time estimate via
  `estimateReviewTokens` — currently only used in dev/test paths) into
  `BatchAiUploadFlow`'s processing step.
- **Per-file checklist** — `DocSortProgress` already emits "Scanned X of Y"
  (`docSortRunner.ts:45–72`); render a file list with per-file pending/done/error
  states instead of one indeterminate bar.
- **Cancel/abort** during DocSort processing (AbortController through the pipeline).
- **Admin `BatchAiReviewPanel`** — add spinner + per-invoice row status while the
  review runs (`batchAiReviewService` processes invoices sequentially; surface which
  one is active).

---

## 9. Micro-interactions & polish (P2)

- **Page-enter transitions:** a single ~150ms fade/slide on route content mount
  (CSS class on the route container; `dashboard-section-enter` keyframes already
  exist in `clientPortal.css` — generalize). No router animation lib needed.
- **`motion` package** is installed but unused — either adopt it deliberately for the
  stepper/modals or remove the dependency.
- **Buttons:** ensure all primary buttons have consistent hover/active/disabled
  transitions (client portal CSS mostly has this; admin pages are inconsistent —
  e.g. inline `onMouseEnter` styling in `ApprovalTab.tsx:205–224`).
- **KPI count-up** (`useCountUp`) is only on ClientDashboard — cheap win to add to
  admin dashboard cards.

---

## 10. Suggested implementation order

| Phase | Work | Effort |
|---|---|---|
| 1 | Primitives: `Spinner`, `PageLoader`, `Skeleton`, `EmptyState`, `useAsyncAction`; fix toast animation | ~1 day |
| 2 | Boot: inline splash, branded guard loaders, staged messages, drop audit-log hydration from boot | ~1 day |
| 3 | Route code splitting + Suspense fallbacks + dynamic heavy libs | ~1 day |
| 4 | Mutation sweep: pending states on the §6 list, `alert()` → toast (start with `AdminInvoiceDetailView`, `ApprovalTab`, `ClientBatches`) | 1–2 days |
| 5 | Persist failure surfacing (`persistWithFeedback`) | ~0.5 day |
| 6 | Snapshot `loading` consumption + Billing/Clients refresh states | ~0.5 day |
| 7 | AI flow progress (per-file list, time estimate, cancel) + micro-polish | 1–2 days |

Phases 1–4 change how the app *feels* the most; 5 is the one that protects user trust
in production.
