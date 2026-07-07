# Launch Readiness — What Must Be Implemented Before Launch

> Deep-dive audit of auth/security, data persistence, and feature/integration completeness.
> Verdict: **strong functional prototype, not launchable yet.** The blockers are auth,
> tenant isolation, email, and persistence — not the tier features in `docs/features/`
> (though specs 01–02 there are also launch blockers).
>
> Audited: 2026-07-07

---

## Tier 0 — Security blockers (fix before ANY real customer data)

### 0.1 Admin portal has no authentication or route guards

- `src/pages/Login.tsx` (~33–46): mock login, accepts **any** email/password, sets
  `localStorage.isAuthenticated` — comment says so explicitly.
- `src/App.tsx` (~61–94): all admin routes (`/admin/dashboard`, `/batches`, `/clients`,
  `/users`, `/accounting`, `/engine`, `/dev/*`) are registered **without any guard**.
  `AdminLayout` reads localStorage for display only and never blocks access.
- **Anyone can navigate directly to any admin URL and see every client's data.**

**Fix:** Real admin auth (Supabase Auth with `app_metadata.role = 'admin'`, or an IdP) +
an `AdminProtectedLayout` guard wrapping every admin route. Note `credyx_is_admin()`
already exists in SQL but is dead code — nothing creates admin users today.

### 0.2 Supabase RLS tenant isolation is effectively disabled

- `supabase/migrations/20260706210000_credyx_fix_rls_anon.sql`: redefines
  `credyx_auth_not_configured()` as `auth.role() = 'anon'`.
- The browser **always** uses the anon/publishable key (`src/lib/supabase.ts`), so the
  bypass clause OR'd into every tenant policy (`credyx_can_access_client`) is always
  true. Anyone with the public URL + anon key (both in the JS bundle) can read/write
  **all** tenant rows via the REST API.
- Compounding it: `src/main.tsx` → `hydrateAllStores()` loads **every tenant's**
  invoices, batches, payments, audit logs, and documents into every visitor's browser.
- Also: `20260706260000_credyx_clients_ops_update.sql` lets any `authenticated` user
  UPDATE any client row; brokers table is writable by `anon`/`authenticated`.

**Fix:** Remove `credyx_auth_not_configured()` from all production policies; scope
hydration to the authenticated principal (admin JWT or the client's own `client_id`
from JWT); drop the broad `authenticated` write grants.

### 0.3 OpenAI API key ships in the browser bundle

- `src/utils/openaiFetch.ts`, `src/config/aiReview.ts`, DocSort services: read
  `VITE_OPENAI_API_KEY` and call the OpenAI API directly from the browser.
- Key is extractable from built JS → unbounded third-party spend.

**Fix:** Proxy all OpenAI calls through a backend (Supabase Edge Function is the natural
fit) holding the key server-side, with per-client rate/spend limits. The existing cost
caps and 429 backoff logic can move with it.

### 0.4 Client identity is a forgeable localStorage string

- `src/components/client/ClientRouteGuard.tsx`: checks
  `localStorage.clientAuthenticated === 'true'`.
- `src/context/ClientPortalContext.tsx`: tenant identity = `localStorage.clientId` —
  never validated against a session/JWT. Change it in DevTools → other client's data
  (trivially, given 0.2).
- No Supabase auth mode: `clientAuthService` returns `{ ok: true }` and login only
  checks the email exists — **any password works**.
- No password reset anywhere; client "change password" is an `alert()` stub
  (`ClientSettings.tsx` ~274–283).

**Fix:** Bind the portal to a real Supabase session (`onAuthStateChange`, expiry);
derive `client_id` from the JWT / `client_auth_links`, never localStorage; implement
password reset; remove the no-Supabase auth bypass for production builds.

---

## Tier 1 — Broken product flows (the funnel doesn't work end-to-end)

### 1.1 Onboarding dead-ends: approved clients cannot log in

- `enrollClientAuth()` (`src/services/clientAuthService.ts`) and the
  `credyx_enrollment_auth_link` RPC migration exist but are **never called**.
  Enrollment (`useEnrollForm.ts`) only creates the client row — no password, no auth
  account, no invite.
- Admin approval (`Clients.tsx` status dropdown) triggers nothing outward — the
  "we'll email you when activated" copy is marketing only.

**Fix:** On approval (or enrollment), create the Supabase Auth user + link, and send an
invite/set-password email. This depends on 1.2.

### 1.2 No email integration exists — and the business model runs on email

Zero send implementations (no provider, no SMTP client, no Edge Function):

- "Send documents to broker" (`AdminInvoiceDetailView.tsx` ~452–474) is a
  `console.log` that appends a **fake** `document_send_history` record marked
  delivered — and doesn't even persist it (`setCurrentInvoice` only, no
  `updateInvoice`). `paperworkSender.ts` same pattern on batch approval.
- Remittance address exists only as text on generated PDFs (`pdfTemplate.ts`); no
  inbound intake.
- No activation, dunning, notification, or password emails. Admin/client notifications
  are in-app only (admin ones are in-memory, lost on refresh).
- Admin Settings SMTP tab is decorative (`Settings.tsx` — save is a TODO).

**Fix (minimum for launch):** one transactional provider (Resend/SendGrid/Postmark) via
Edge Function for: client invite/activation, broker document packets (making
`document_send_history` real and persisted), and admin alerts for enrollments/handoffs.
Inbound remittance parsing can stay manual (Credyx reads the inbox and uses the admin
posting workspace — spec 02) at launch.

### 1.3 Persistence silently loses data even with Supabase configured

- Nearly every write is fire-and-forget: `void persist(...).catch(console.error)`
  (`mockInvoices.ts`, `mockPayments.ts`, `mockBatches.ts`, `auditLogger.ts`, +more).
  UI reports success while the DB write may have failed — no retry, no user feedback.
- Mutations that never persist at all:
  - "Mark broker contacted" mutates the in-memory invoice directly
    (`AdminDashboard.tsx` ~354–359) — lost on refresh.
  - Client-uploaded invoice documents live in an in-memory Map
    (`invoiceDocumentStore.ts`) — **files never reach storage** (admin path does).
  - Batch drafts: IndexedDB only, device-local.
  - Admin notifications and admin users: in-memory React state.
  - Client settings (profile/remittance/notification prefs): only page size saves.
  - Collections `payment_status`: component state only.
- Hydration failures are silent (empty stores, no error UI).

**Fix:** Await critical persists with user-visible error handling (a toast system is
also missing, see 2.5); persist the listed mutations; upload client invoice files to
the `batch-documents` bucket like the admin path.

### 1.4 Money paths — already specced in `docs/features/`

- **Write-off fee leak (spec 01):** one-click client write-off → fee-exempt. Active
  revenue leak; launch blocker.
- **Payment posting (spec 02):** client payments post instantly `confirmed`
  (`clientPaymentService.ts` ~101), contradicting the remittance model; no admin
  posting/confirmation workspace exists.
- Payment corrections (spec 06) strongly recommended at launch; force-close gating
  (03) and capability coverage (04) can follow fast; batch review (05) is post-launch.

---

## Tier 2 — Operational readiness (launch week, not launch day)

| # | Gap | Evidence |
|---|-----|----------|
| 2.1 | **Billing is entirely mock** — and the pricing model itself is wrong: the flat $299 is a placeholder. Real pricing is $99 base + tiered % of client A/R volume with a factoring discount (see `docs/features/07-ar-based-billing.md`). Launch decision: bill via **Payoneer payment requests** (business is MK-based; Stripe requires a supported-country entity — revisit via Atlas/MoR later). Needed: real bill computation from invoice data + admin billing run view; no card checkout required at launch | `billingService.ts` ("Mock billing summary"), `servicePlans.ts` flat fees |
| 2.2 | **No admin user provisioning or RBAC** — Users page is React state with an empty seed; "Edit User" button has no handler; roles never enforced | `Users.tsx`, `mockUsers.ts` |
| 2.3 | **Decorative settings** — force-close days, aging buckets, session timeout, SMTP: all UI-only; runtime uses hardcoded `AR_POLICY` | `Settings.tsx` vs `invoiceAging.ts` |
| 2.4 | **Dev/test routes public in prod** — `/dev/load-review`, `/dev/rules`, `/test`, `/sort`; landing page even links to one | `App.tsx` ~60, 88–94 |
| 2.5 | **No error boundaries, no toast system** — failures are `alert()`, inline, or silent | no `ErrorBoundary` in `src/` |
| 2.6 | **Deploy hygiene** — lint is `echo 'Linting skipped'`, no CI, no deploy config, no `.env.example`, ~38 `console.log`s, stale Next.js README | `package.json`, repo root |
| 2.7 | **Audit trail not trustworthy** — client-side, hardcoded `'Admin User'` actors, anon-insertable, fire-and-forget persist, 10k hydration cap | `auditLogger.ts`, `ApprovalTab.tsx` |
| 2.8 | **Stub admin actions** — AgingAR approve/reject/hold, accounting export (`alert`), broker call/email buttons are `console.log`s | `AgingAR.tsx` ~30–50, `Accounting.tsx` ~151 |
| 2.9 | **Test coverage** — 7 unit test files, all utils; nothing on auth, payments, enrollment, or pages; eval harness not in CI | `src/utils/*.test.ts` |
| 2.10 | **File upload validation client-side** — `accept` attribute only; storage-layer 50MB/MIME limits are the only guard; `.xls/.xlsx` accepted in UI but rejected by bucket allowlist | `ClientDocuments.tsx`, storage migrations |

---

## What is already production-shaped

- Supabase schema + tenant persist layer (11 migrations, mappers, storage buckets)
- AI review pipeline: per-PDF cost caps, 429 retry/backoff, TPM throttle, eval fixtures
- Invoice PDF generation; client report CSV + audit CSV exports
- Client portal UX patterns (route guard structure, loading/empty states, pagination)
- TypeScript strict mode

---

## Recommended sequence to launch

1. **Lock the doors** (Tier 0): fix RLS anon bypass + scoped hydration → real admin
   auth + route guards → session-bound client auth → move OpenAI server-side.
   Nothing else matters while these are open.
2. **Make the funnel real** (1.1 + 1.2): email provider + auth account creation on
   approval. A client must be able to enroll, get approved, receive an invite, and
   log in with a real password.
3. **Stop the silent data loss** (1.3): awaited persists + toasts, persist the
   never-persisted mutations, client invoice files to storage.
4. **Close the money paths** (1.4): feature specs 01 (write-off approval) and
   02 (pending payments + admin posting workspace), then 06 (corrections).
5. **Operational pass** (Tier 2): billing integration, admin provisioning, remove dev
   routes, error boundaries/toasts, CI + deploy config, wire or remove decorative
   settings.

Items 1–4 are the launch gate. Tier 2 items 2.1 (billing) and 2.4 (dev routes) should
also land before public launch; the rest can trail by days, not months.
