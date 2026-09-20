# Client UI — Pre-ship polish checklist

> **Goal:** Ship a calm, finance-grade carrier portal. Consistency + trust UX — not a redesign.  
> **Scope:** Light mode only. Dark mode / Assistant depth / self-service extras are deferred.  
> **Created:** 2026-09-20

---

## Templates (locked — copy these, don’t invent)

| Role | Canonical source | Rules |
| --- | --- | --- |
| **List page** | `src/pages/ClientInvoices.tsx` | `.cursor/rules/client-portal-ui.mdc` |
| **Detail panel** | `src/components/client/PaymentConfirmationPanel.tsx` | `.cursor/rules/detail-panel-design.mdc` |

**How to use this:** For every surface below, open Invoices (list) and Payments → Payment Details (panel) side-by-side. Match structure, density, classes, and scroll behavior before changing pixels.

`InvoiceDetailPanel` should **converge on** the Payment Details composition (header → status summary → activity/notes scroll → footer actions). Do not invent a third detail language.

---

## Definition of done

### A. List page (match Invoices)

- [ ] `ClientLayout` + `flushMain`; no page-level `h1` + subtitle hero
- [ ] Stat strip (if needed) + `client-page-toolbar` + `dashboard-table--compact`
- [ ] Sortable headers via `ClientSortableHeader` (actions column excluded)
- [ ] Rows vertically centered; `status-pill` / buttons mid-aligned
- [ ] Scroll: only `client-table-scroll`; header + toolbar + `client-page-footer` pinned
- [ ] Pagination: 25 / 50 / 100; `Showing X–Y of Z`; respects `getInitialListPageSize()`
- [ ] Empty state: one icon + title + one help line
- [ ] Light mode only; uses `--cp-*` / `useClientTheme()` — no one-off hex walls

### B. Detail panel (match Payment Details)

- [ ] Compact header (eyebrow + entity id + party + prev/next + close)
- [ ] Soft status summary band + tight 2×2 meta grid (no hero amount)
- [ ] Activity / notes: filters on one row; **only this region scrolls**
- [ ] Footer: primary/secondary only when an action exists
- [ ] Desktop = resizable sidebar; mobile = full-page `variant="mobile"` with back
- [ ] Density matches Payment Details (summary stays short; timeline owns height)

### C. Trust UX (every money / doc mutation on that surface)

- [ ] Mutation buttons show pending + disable re-entry (no double-submit)
- [ ] Success / failure via toast — **no `alert()`**
- [ ] Persist failures surfaced to the user (not silent `console.error` “success”)
- [ ] Obvious empty / error / loading states (no blank freeze)

### D. Mobile (same journey)

- [ ] Usable on phone: list → open detail → act → back
- [ ] Tap targets OK; no horizontal page scroll; bottom nav doesn’t collide with footer CTAs

---

## Priority order (do in this order)

| Pass | Focus | Why |
| --- | --- | --- |
| **0** | Lock templates + fix template gaps | Everything else copies these |
| **1** | Money journeys | Trust; highest ship risk |
| **2** | Docs / batches journeys | Primary carrier workflow |
| **3** | Other list pages | Visual consistency |
| **4** | Shell, feedback, cleanup | Boot, toasts, dead UI |
| **—** | Deferred | Dark mode, Assistant polish, self-service |

---

## Pass 0 — Templates (start here)

Treat as golden references. Only change them to fix gaps in the recipes above — then freeze as the pattern.

### 0.1 Invoices list — `ClientInvoices.tsx`

- [x] Canonical list shell (flush, toolbar, table scroll, footer) — **template**
- [x] Detail-open: table keeps `min-width` + horizontal scroll (columns don’t crush)
- [x] Narrower default detail width on mid-size screens
- [ ] Spot-check vs Definition A (sort, pagination, empty, mobile stack cards)
- [ ] Confirm Need Attention / filters don’t break pinned chrome
- [ ] No leftover page hero or redundant banners

### 0.2 Payment Details — `PaymentConfirmationPanel.tsx`

- [x] Canonical detail composition — **template**
- [ ] Spot-check vs Definition B (density, scroll regions, mobile variant)
- [ ] Confirm / dispute footer pending + toast (Definition C)
- [ ] Prev/next follows filtered list order

### 0.3 Invoice detail — `InvoiceDetailPanel.tsx`

Align to Payment Details (same visual language; reuse BEM / structure where possible).

- [x] Sidebar header density matches invoices table header (`th` size)
- [x] Removed footer **Note** button (use Activity tab / compose instead)
- [ ] Header / summary / activity / footer match Definition B
- [ ] Sidebar + mobile variants parity with Payment Details
- [ ] Notes / activity scroll-only region; no whole-panel scroll
- [ ] Mutation actions: pending + toast (Definition C)
- [ ] Used consistently from Invoices, Aging A/R, Collections, Need Attention

**Exit criteria for Pass 0:** Opening an invoice and a payment detail feels like the same product family.

---

## Pass 1 — Money journeys

### Journey: Payments

| Surface | File | List (A) | Detail (B) | Trust (C) | Mobile (D) |
| --- | --- | --- | --- | --- | --- |
| Payments list | `ClientPayments.tsx` | [ ] | — | [ ] | [ ] |
| Payment Details | `PaymentConfirmationPanel.tsx` | — | [ ] Pass 0 | [ ] | [ ] |
| Post payment | `PostPaymentForm.tsx` | — | — | [ ] | [ ] |

Notes:

- [ ] Post-payment success state is clear (no dead-end after confirm)
- [ ] Replace any `alert()` on this path with toasts
- [ ] Pending on confirm / dispute / post

### Journey: Pay variances (short payments)

| Surface | File | List (A) | Detail (B) | Trust (C) | Mobile (D) |
| --- | --- | --- | --- | --- | --- |
| Short payments | `ClientShortPayments.tsx` | [ ] | [ ] | [ ] | [ ] |

- [ ] Match Invoices list chrome (no hero, pinned footer)
- [ ] Detail (if any) follows Payment Details — not a one-off modal stack

### Journey: Aging A/R + Collections

| Surface | File | List (A) | Detail (B) | Trust (C) | Mobile (D) |
| --- | --- | --- | --- | --- | --- |
| Aging A/R | `ClientCollections.tsx` | [ ] | InvoiceDetail | [ ] | [ ] |
| Collections queue | `ClientCollectionsQueue.tsx` | [ ] | InvoiceDetail | [ ] | [ ] |
| Need Attention | `ClientAttention.tsx` | [ ] | InvoiceDetail | [ ] | [ ] |

- [ ] Same InvoiceDetail pattern as Invoices (Pass 0.3)
- [ ] Stat/filter chrome doesn’t break table-only scroll

---

## Pass 2 — Docs / batches journeys

### Journey: Submit docs → AI confirm → batches list

| Surface | File | List (A) | Detail / flow | Trust (C) | Mobile (D) |
| --- | --- | --- | --- | --- | --- |
| Batches hub | `ClientBatches.tsx` | [ ] | tabs / create | [ ] | [ ] |
| AI upload | `BatchAiUploadFlow.tsx` | — | stepper OK | [ ] | [ ] |
| AI confirm | `BatchAiConfirmPanel.tsx` | — | [ ] | [ ] | [ ] |
| Doc pane | `CompactPacketDocPane.tsx` | — | chrome polish | [ ] | [ ] |
| Document Vault | `ClientDocuments.tsx` | [ ] | [ ] | [ ] | [ ] |

Notes:

- [ ] Batches nested tabs use `client-flush-shell` so pinned footer still works
- [ ] Hide/remove client-facing debug (`BatchAiAssignmentDebug`, etc.) for production
- [ ] Submit / process: pending + toast; no double-submit
- [ ] Upload progress remains visible (keep current stepper quality)

---

## Pass 3 — Other list / account pages

Align to Invoices list recipe; no redesign.

| Surface | File | List (A) | Trust (C) | Mobile (D) | Notes |
| --- | --- | --- | --- | --- | --- |
| Brokers | `ClientBrokers.tsx` | [ ] | [ ] | [ ] | Detail → Payment Details pattern if sidebar |
| Broker detail | `BrokerDetailPanel.tsx` | — | [ ] | [ ] | Match Definition B |
| Reports | `ClientReports.tsx` | [ ] | [ ] | [ ] | Actions first; no hero |
| Dashboard V2 | `dashboard-v2/*` | — | [ ] | [ ] | Already home; light polish only |
| Settings | `ClientSettings.tsx` | — | [ ] | [ ] | Flush settings shell (see UI rule) |
| Tutorials | `ClientTutorials.tsx` | — | — | [ ] | Light pass |
| Login / setup | `ClientLogin.tsx`, `ClientSetupPassword.tsx` | — | [ ] | [ ] | Pending on submit |

---

## Pass 4 — Shell, feedback, cleanup

Cross-cutting (from `docs/UX_LOADING_FEEDBACK.md` — ship-relevant subset):

- [ ] Boot / hydration: branded loader (not blank → plain “Loading…”)
- [ ] Client route guard loading matches branded loader
- [ ] ToastProvider used on money/doc paths; sweep remaining `alert()` on client routes
- [ ] Shared primitives used: `Spinner`, `Skeleton` / `SkeletonRows`, `EmptyState`, `PageLoader` where lists refetch
- [ ] Remove or gate: unused dashboard legacy routes/files, orphaned modals (`PaymentCorrectionModals` if unused), debug panels in client builds
- [ ] Capability gating: nav + pages respect `useClientCapabilities` (no dead links)

**Out of scope for this checklist (defer):**

- Dark mode (`clientPortalDark.css`)
- Full Assistant product polish
- Self-service tier completeness / marketing site
- Bundle code-splitting (nice; not blocking if boot loader is acceptable)

---

## QA gate (before calling polish “done”)

Run once on **desktop light** and once on **phone-width**:

| # | Journey | Pass? |
| --- | --- | --- |
| 1 | Login → Dashboard | [ ] |
| 2 | Batches → create/upload → confirm → see batch | [ ] |
| 3 | Invoices → open detail → note/action → close | [ ] |
| 4 | Need Attention → open → resolve path visible | [ ] |
| 5 | Payments → open Payment Details → confirm/dispute UX | [ ] |
| 6 | Post payment (if enabled) → success/error clear | [ ] |
| 7 | Short payments → open → act | [ ] |
| 8 | Aging A/R → open invoice detail | [ ] |
| 9 | Collections → open invoice detail | [ ] |
| 10 | Documents → find / open | [ ] |
| 11 | Settings → change list page size → lists respect it | [ ] |
| 12 | Double-click primary money CTA → only one submit | [ ] |

---

## Working agreement

1. **Pass 0 first** — don’t restyle Payments/Batches until templates are signed off.
2. One surface at a time; check Definition A/B/C/D before moving on.
3. Prefer shared classes (`dashboard-table`, `client-page-*`, `payment-confirmation-panel*`) over new CSS.
4. If a page needs a detail sidebar, copy Payment Details — never a new modal chrome.
5. Mark checkboxes in this file as work lands so ship status stays visible.

---

## Quick file index

| Template / heavy surface | Path |
| --- | --- |
| Invoices list (template) | `src/pages/ClientInvoices.tsx` |
| Payment Details (template) | `src/components/client/PaymentConfirmationPanel.tsx` |
| Invoice detail (align to template) | `src/components/client/InvoiceDetailPanel.tsx` |
| Payments | `src/pages/ClientPayments.tsx` |
| Post payment | `src/components/client/PostPaymentForm.tsx` |
| Short payments | `src/pages/ClientShortPayments.tsx` |
| Batches | `src/pages/ClientBatches.tsx` |
| AI confirm | `src/components/client/BatchAiConfirmPanel.tsx` |
| Documents | `src/pages/ClientDocuments.tsx` |
| UI rules | `.cursor/rules/client-portal-ui.mdc` |
| Detail rules | `.cursor/rules/detail-panel-design.mdc` |
| Loading/trust audit | `docs/UX_LOADING_FEEDBACK.md` |
