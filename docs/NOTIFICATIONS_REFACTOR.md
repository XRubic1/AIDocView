# Alerts & Notifications — System Audit & Refactor Plan

> How feedback works today (toasts, in-app bells, email, nav badges), what's broken,
> and a refactor plan to unify them into one coherent notification layer.
>
> Audited: 2026-07-07

## TL;DR

**Good news:** blocking `alert()` calls are gone — the app now uses `ToastProvider`
everywhere (~30+ surfaces). Admin in-app notifications persist to Supabase and the
bell works.

**Bad news:** there are **three separate systems** with no shared API, and the **client
notification bell is effectively empty** — `addNotification()` exists but is **never
called**. Client notification preferences in Settings are **UI-only** (not saved).
Email covers only 3 templates; billing/dunning/overdue reminders from spec 07 have no
channel.

**Refactor goal:** one `notificationService` with two delivery modes — **toast**
(ephemeral, immediate) and **inbox** (persistent bell + optional email) — instead of
three ad-hoc paths.

---

## 1. Current architecture (three systems, no shared layer)

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER ACTION                               │
└───────────────────────────┬─────────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
   ToastProvider      In-app bell         Email (Resend)
   (ephemeral)        (persistent)        (async, off-screen)
         │                  │                  │
   showToast()         pushNotification()   sendTransactionalEmail()
   5s auto-dismiss     admin_notifications   send-email edge fn
   bottom-right        notifications table
         │                  │                  │
   ~30+ call sites     Admin: works ✓        3 templates only
                       Client: empty ✗
```

### 1.1 Toasts — ephemeral action feedback

| Item | Detail |
|---|---|
| **Implementation** | `src/components/ui/ToastProvider.tsx` |
| **API** | `showToast(message, variant?)` where `variant` = `'success' \| 'error' \| 'info'` |
| **Mount** | Wrapped in `App.tsx` inside `BrowserRouter` |
| **Animation** | `.toast-enter` in `src/index.css:41–48` (works — fixed since earlier audit) |
| **Persist bridge** | `setPersistFailureHandler` on mount → failed DB writes show error toast |
| **Helper** | `useAsyncAction` (`src/hooks/useAsyncAction.ts`) — pending + toast wrapper — **defined but never used** outside its own file |

**Coverage:** validation errors, save success/failure, payment posting, write-off
approve/deny, billing actions, batch submit, password change, document training, etc.

**Gaps:**

- No `'warning'` variant (billing overdue uses `'info'` or inline banners instead).
- No action button ("Retry", "View queue") on toasts.
- No stacking cap — rapid errors can fill the screen.
- No loading/pending toast (mutations use button disabled state instead — fine, but
  inconsistent).
- Messages are free-form strings — no title/body structure, no i18n keys.
- `AdminInvoiceDetailView.tsx` alone has ~25 `showToast` calls — works, but noisy and
  inconsistent copy ("Email sent successfully" vs "Invoice closed successfully").

### 1.2 In-app notifications — persistent bell dropdown

| Item | Admin | Client |
|---|---|---|
| **Service** | `adminNotificationService.ts` | `mockNotifications.ts` |
| **Storage** | `admin_notifications` table (Supabase) | `notifications` table (Supabase) |
| **Hydration** | `hydrateAdminNotifications()` on admin session | `hydrateNotifications()` scoped by `client_id` |
| **UI** | `NotificationBell` in `AdminLayout.tsx:414` + legacy `admin/Header.tsx:96` | `NotificationBell` in `ClientLayout.tsx:466` |
| **Subscribe** | `CustomEvent('admin-notifications-updated')` — same-tab only | Load once on mount — **no subscribe, no refresh** |
| **Mark read** | Persists via `persistOrThrow` | Single: `markNotificationRead()` persists; **Mark all read: local state only** (`ClientLayout.tsx:469–471`) |
| **Creation** | 6 `notifyAdmin*` functions — actively called | **`addNotification()` never called anywhere** |

**Admin notification producers (working):**

| Event | Function | Link target |
|---|---|---|
| Client enrolls | `notifyAdminClientEnrolled` | `/clients` |
| Managed doc handoff | `notifyAdminDocHandoff` | `/batches` |
| Client uploads docs to invoice | `notifyAdminClientDocumentUpload` | `/invoice-search?invoice=…` |
| Write-off requested | `notifyAdminWriteOffRequested` | `/payment-posting` |
| Client reports payment | `notifyAdminPaymentReported` | `/payment-posting` |

**Client notification producers:** **none.** The bell UI exists but will always show
"No notifications" unless rows are manually inserted in the DB.

**NotificationBell gaps:**

- Footer button **"View All Notifications"** (`NotificationBell.tsx:335`) has **no
  `onClick` handler** — dead UI.
- No notification center page exists for either portal.
- Admin bell is mounted **twice** — `AdminLayout` (sidebar layout) and `admin/Header.tsx`
  (older top nav — check which routes still use Header vs AdminLayout).
- Type misuse: enrollment uses `type: 'batch_submitted'`; write-off uses
  `type: 'payment_pending'` — icons/colors in the bell won't match semantics.
- `paymentCorrectionService.ts:189` calls `notifyAdminPaymentReported` on **move funds**
  — wrong event type and misleading admin message.

### 1.3 Email — transactional, async

| Item | Detail |
|---|---|
| **Client API** | `src/services/emailService.ts` → `supabase.functions.invoke('send-email')` |
| **Edge function** | `supabase/functions/send-email/index.ts` (Resend) |
| **Templates today** | `client_invite`, `broker_packet`, `admin_enrollment_alert` |

**Producers:**

- Enrollment → admin alert email (`useEnrollForm.ts:71–74`)
- Batch approval / invoice send → broker packet (`paperworkSender.ts:39`)
- Client activation → invite (`provision-client-auth` edge function)

**Gaps:**

- No email templates for: billing overdue (spec 07 1/2/3-month escalation), payment
  confirmed, write-off approved/denied, batch status changes, overdue invoice alerts.
- `broker_packet` sends **HTML body only — no attachments** (despite "attached documents"
  copy).
- Without `RESEND_API_KEY`, edge function returns `{ ok: false, stub: true }` with
  HTTP 503 — callers must treat non-ok; some paths still mark send history
  `delivered` prematurely (`paperworkSender.ts`).
- Client Settings notification toggles (`invoiceApproved`, `paymentReceived`,
  `overdueAlerts`, etc.) are **never read by any sender** — decorative.

### 1.4 Nav badges — operational queues (separate from notifications)

`AdminLayout.tsx:98–104` computes badge counts from live service queries:

- `pendingBatches`, `pendingPayments`, `pendingWriteOffs`

These appear on sidebar nav items via `adminNav.ts` `badgeKeys`. This pattern works and
should **stay separate** from the notification bell — badges = actionable queue depth;
bell = event log.

---

## 2. Confirmed bugs & inconsistencies

| # | Issue | Evidence | Severity |
|---|---|---|---|
| N1 | **Client bell always empty** | `addNotification()` only defined in `mockNotifications.ts:16` — zero call sites | High |
| N2 | **Client "Mark all read" doesn't persist** | `ClientLayout.tsx:469–471` updates React state only | Medium |
| N3 | **Client bell never refreshes** | `useEffect` loads once on `resolvedClientId`; no subscribe/realtime | Medium |
| N4 | **Notification prefs not saved** | `ClientSettings.tsx:528–543` toggles exist; `handleSave` (`266–291`) never writes `notificationSettings` | High |
| N5 | **"View All Notifications" dead button** | `NotificationBell.tsx:329–336` — no handler | Low |
| N6 | **Wrong admin notify on move funds** | `paymentCorrectionService.ts:189` → `notifyAdminPaymentReported` | Medium |
| N7 | **Wrong notification types** | Enrollment → `batch_submitted`; write-off → `payment_pending` | Low |
| N8 | **`useAsyncAction` unused** | Only defined in `useAsyncAction.ts` — no adoption | Medium (DX) |
| N9 | **ContactBrokerModal copy — no feedback** | `ContactBrokerModal.tsx:23` — `// TODO: Show toast` | Low |
| N10 | **Duplicate admin bell** | `AdminLayout` + `admin/Header` both mount `NotificationBell` | Low |
| N11 | **Email prefs disconnected from email sends** | Settings toggles vs zero consumer code | High |
| N12 | **No billing/dunning notifications** | Spec 07 escalation has computed standing only — no inbox or email | High |

---

## 3. Target architecture — unified notification layer

### 3.1 Design principles

1. **Toasts = immediate feedback** for the actor who just clicked something (success,
   error, validation). Never use toasts for events the user didn't trigger (those go to
   the inbox).
2. **Inbox = persistent event log** for things that happened while you were away or that
   need a link to follow up. Both portals get one.
3. **Email = optional delivery** of inbox events, gated by user preferences (client) or
   always-on for critical admin alerts.
4. **One service, two channels** — callers don't choose toast vs inbox vs email
   individually; they describe an *event* and the service routes it.

### 3.2 Proposed module layout

```
src/services/notifications/
├── types.ts              # NotificationEvent, DeliveryChannel, Audience
├── notificationService.ts # notify(event) — routes to toast/inbox/email
├── toastChannel.ts       # wraps ToastProvider (or moves provider here)
├── inboxChannel.ts       # unified push + hydrate + markRead (admin + client)
├── emailChannel.ts       # wraps emailService + template registry + pref checks
├── templates/            # email HTML builders (move from edge function or mirror)
└── events.ts             # typed event factories (paymentReported, batchApproved, …)
```

### 3.3 Core API (sketch)

```ts
/** Who should see this, and how. */
export type NotifyAudience = 'actor' | 'client' | 'admin' | 'admin_and_client'

export interface NotifyEvent {
  id?: string
  type: NotificationType          // extend enum — see §3.4
  audience: NotifyAudience
  title: string
  message: string
  link?: string
  linkLabel?: string
  metadata?: Record<string, unknown>

  /** Delivery — service applies defaults if omitted. */
  toast?: { variant: ToastVariant; message?: string }  // actor-only, immediate
  inbox?: { clientId?: string }                        // persistent bell
  email?: { template: EmailTemplate; to?: string }     // async, pref-gated
}

export function notify(event: NotifyEvent): void
```

**Default routing rules:**

| Audience | Toast | Inbox | Email |
|---|---|---|---|
| `actor` (user just clicked) | ✓ if `event.toast` set | — | — |
| `admin` | — | ✓ admin bell | ✓ if critical (enrollment, write-off) |
| `client` | — | ✓ client bell | ✓ if prefs allow |
| `admin_and_client` | — | both inboxes | per rules above |

Call sites replace scattered `showToast` + `notifyAdmin*` pairs with one `notify()` call
where both channels are needed, and keep bare `showToast` for pure validation ("field
required") that shouldn't hit the inbox.

### 3.4 Extend `NotificationType`

Add missing types instead of misusing existing ones:

```ts
export type NotificationType =
  | 'invoice_approved' | 'invoice_on_hold' | 'invoice_rejected'
  | 'payment_received' | 'payment_pending' | 'payment_rejected'
  | 'batch_submitted' | 'batch_reviewed' | 'batch_approved'
  | 'write_off_requested' | 'write_off_approved' | 'write_off_denied'
  | 'payment_correction' | 'payment_moved' | 'payment_unprocessed'
  | 'document_uploaded' | 'enrollment_received'
  | 'billing_overdue' | 'billing_warning' | 'billing_locked'
  | 'overdue_alert' | 'system_alert'
```

Update `NotificationBell` icon/color maps for the new types.

### 3.5 Client notification producers (wire these)

Events that should call `notify({ audience: 'client', inbox: … })` but don't today:

| Event | When | Link |
|---|---|---|
| `batch_reviewed` / `batch_approved` | Admin moves batch through pipeline | `/client/batches?batch=…` |
| `invoice_approved` / `invoice_on_hold` / `invoice_rejected` | Admin invoice actions | `/client/invoices?highlight=…` |
| `payment_received` | Credyx confirms client-reported payment | `/client/payments` |
| `payment_rejected` | Credyx rejects pending payment | `/client/payments` |
| `write_off_approved` | Client sees invoice as written off (masked pending OK) | `/client/invoices?…` |
| `billing_overdue` / `billing_warning` | Spec 07 standing at 30/60 days | `/client/settings?tab=billing` |
| `billing_locked` | Account suspended at 90 days | billing lock screen (already exists) |

Admin-side events already mostly wired — migrate to unified `notify()` and fix types.

---

## 4. Toast system improvements (incremental, no big bang)

These can ship **before** the full unified service.

### 4.1 Adopt `useAsyncAction` everywhere

Replace hand-rolled `isSubmitting` + try/catch + `showToast` in:

- `PaymentPosting.tsx` modal actions (confirm, reject, write-off, move, unprocess)
- `PaymentCorrectionModals.tsx`
- `ApprovalTab.tsx` process batch
- `ClientSettings.tsx` / `Settings.tsx` save (partially done — keep pattern)

One hook → consistent pending state + error toast + double-submit guard.

### 4.2 Extend `ToastProvider`

```ts
export type ToastVariant = 'success' | 'error' | 'info' | 'warning'

export interface ToastOptions {
  variant?: ToastVariant
  title?: string           // optional bold first line
  action?: { label: string; onClick: () => void }  // "Retry", "View"
  durationMs?: number      // default 5000; 0 = sticky until dismiss
}
```

- Cap visible stack at **3** (drop oldest).
- Add `role="alert"` on error toasts for screen readers (`aria-live="polite"` on
  container is already there — good).
- **`warning`** variant for billing standing, destructive confirmations.

### 4.3 Validation vs outcome toasts

Convention (document in a short comment atop `ToastProvider.tsx`):

| Use | Example |
|---|---|
| `showToast(msg, 'error')` | "Broker name is required" — inline validation |
| `useAsyncAction` success | "Batch submitted" — mutation completed |
| `notify()` toast leg | Same as success, when part of a larger event |
| Never toast | Events that happened to someone else → inbox only |

### 4.4 Finish stragglers

- [ ] `ContactBrokerModal.tsx:23` — toast on clipboard copy ("Copied").
- [ ] Remove duplicate admin `NotificationBell` from `admin/Header.tsx` if
      `AdminLayout` is the canonical shell.

---

## 5. In-app inbox improvements

### 5.1 Unified inbox service

Merge `adminNotificationService.ts` and `mockNotifications.ts` into
`inboxChannel.ts`:

```ts
export function pushInboxNotification(n: InboxNotification): void
export function getInboxForPrincipal(): Notification[]
export function markInboxRead(id: string): void
export function markAllInboxRead(): void
export function subscribeInbox(onUpdate: () => void): () => void
```

- Admin rows → `admin_notifications` table (unchanged schema).
- Client rows → `notifications` table with `client_id` column (unchanged schema).
- **Both** emit the same `CustomEvent` pattern (or Supabase Realtime when ready).
- Fix client **mark all read** to persist (`ClientLayout.tsx:469–471`).
- Refresh client inbox on focus (mirror `useClientDemoSnapshot` tab-focus refetch).

### 5.2 Notification center page (optional v2)

`/admin/notifications` and `/client/notifications` — full list with filters
(unread/all, by type). Wire the dead "View All Notifications" footer button to these
routes. Not required for launch if the bell dropdown is sufficient.

### 5.3 Realtime (post-launch)

Replace `CustomEvent` with Supabase Realtime subscription on
`admin_notifications` / `notifications` filtered by principal. Same-tab events already
work for admin; cross-tab and multi-admin need Realtime.

---

## 6. Email channel improvements

### 6.1 Template registry

Move template list to a shared config both edge function and app can reference:

| Template | Audience | Trigger |
|---|---|---|
| `client_invite` | Client | Admin activates account |
| `broker_packet` | Broker | Batch approval / manual send |
| `admin_enrollment_alert` | Admin | Public enroll form |
| `client_payment_confirmed` | Client | Admin confirms payment |
| `client_payment_rejected` | Client | Admin rejects payment |
| `client_billing_reminder` | Client | Bill 30/60 days overdue (spec 07) |
| `client_billing_locked` | Client | Account suspended at 90 days |
| `admin_write_off_requested` | Admin | Client requests write-off |

Implement new templates in `send-email/index.ts` + call via `emailChannel.ts`.

### 6.2 Wire client notification preferences

Persist toggles on the client record (JSONB `notification_prefs` on `clients` table):

```ts
notification_prefs?: {
  emailNotifications: boolean
  invoiceApproved: boolean
  paymentReceived: boolean
  overdueAlerts: boolean
  // …
}
```

- `ClientSettings.handleSave` writes them (fix N4).
- `emailChannel.ts` checks prefs before send: `if (!prefs.emailNotifications) return`.
- In-app inbox is **not** gated by email prefs — always deliver to bell.

### 6.3 Honest send status

- Don't mark `document_send_history.status = 'delivered'` until Resend returns `{ ok: true }`.
- Surface send failure as admin toast + failed inbox entry, not silent stub success.

---

## 7. Migration map — what replaces what

| Today | After refactor |
|---|---|
| `showToast('…', 'error')` for validation | Keep as-is (or inline field errors) |
| `showToast('…', 'success')` after mutation | `useAsyncAction` or `notify({ toast: … })` |
| `notifyAdminClientEnrolled(…)` | `notify({ type: 'enrollment_received', audience: 'admin', inbox, email })` |
| `notifyAdminWriteOffRequested(…)` | `notify({ type: 'write_off_requested', … })` |
| `notifyAdminPaymentReported(…)` | `notify({ type: 'payment_pending', … })` — admin only |
| `paymentCorrectionService` → wrong notify | `notify({ type: 'payment_moved' \| 'payment_unprocessed', audience: 'admin' })` |
| *(missing)* client batch approved | `notify({ audience: 'client', type: 'batch_approved', … })` |
| *(missing)* billing overdue | `notify({ audience: 'client', type: 'billing_overdue', email if prefs })` |
| `setPersistFailureHandler` in ToastProvider | Keep — or move to `toastChannel.ts` |
| `persistWithFeedback` | Expand usage; failures can also push `system_alert` inbox entry for admin |

---

## 8. Suggested implementation order

| Phase | Work | Effort | Fixes |
|---|---|---|---|
| **1** | Quick fixes: client mark-all-read persist, wire `addNotification` for 3–4 key client events, fix move-funds notify type, save notification prefs in Settings | ~0.5 day | N1–N4, N6 |
| **2** | Adopt `useAsyncAction` on PaymentPosting modals, ApprovalTab, correction modals | ~0.5 day | N8, double-submit |
| **3** | Extend ToastProvider (warning variant, stack cap, optional action button) | ~0.5 day | UX polish |
| **4** | Unified `inboxChannel.ts` — merge admin + client services, subscribe on client | ~1 day | N2, N3, N10 |
| **5** | `notificationService.ts` + `events.ts` — migrate admin producers | ~1 day | N7, architecture |
| **6** | Client event producers (batch status, payments, billing standing) | ~1 day | N1, N12 |
| **7** | Email templates + pref gating + honest send status | ~1–2 days | N11, N12, broker attachments |
| **8** | Notification center pages + Realtime (optional) | post-launch | N5 |

Phases **1–3** are low-risk and can ship independently. Phase **4–5** is the structural
refactor. Phase **6–7** completes the product loop (clients actually get notified).

---

## 9. Acceptance criteria (refactor complete)

- [ ] Client bell shows real notifications for batch approval, payment confirm/reject,
      and billing warnings.
- [ ] Client notification preferences persist and gate outbound email.
- [ ] "Mark all read" persists for both portals.
- [ ] No mis-typed notification events (`enrollment_received` not `batch_submitted`).
- [ ] Move/unprocess corrections notify admins with correct type and message.
- [ ] `useAsyncAction` used on all modal mutation buttons in money + batch paths.
- [ ] Toast stack capped; `warning` variant available for billing/destructive flows.
- [ ] Email send status honest — no `delivered` before Resend confirms.
- [ ] Single `notify()` entry point for all cross-user events; bare `showToast` only
      for actor-local validation/outcomes.
- [ ] "View All Notifications" navigates to a list page or is removed until one exists.

---

## 10. Files to touch (reference)

| Area | Files |
|---|---|
| Toast | `src/components/ui/ToastProvider.tsx`, `src/hooks/useAsyncAction.ts`, `src/index.css` |
| Inbox (today) | `src/services/adminNotificationService.ts`, `src/data/mockNotifications.ts`, `src/components/NotificationBell.tsx`, `src/components/ClientLayout.tsx`, `src/components/AdminLayout.tsx` |
| Email | `src/services/emailService.ts`, `supabase/functions/send-email/index.ts` |
| Settings prefs | `src/pages/ClientSettings.tsx`, `src/types/client.ts`, migration for `notification_prefs` |
| Producers to wire | `ApprovalTab.tsx`, `writeOffApprovalService.ts`, `clientPaymentService.ts`, `paymentCorrectionService.ts`, `arBillingService.ts` (standing → notify) |
| New (proposed) | `src/services/notifications/*` |
