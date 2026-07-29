# Credyx waitlist marketing website — spec

Planning doc for a **public marketing site** modeled on [`/enroll`](../../src/pages/Enroll.tsx), but with **Join the waitlist** instead of full enrollment.

**Related docs**

- Marketing voice & workflow: [`.cursor/rules/credyx-marketing-prompts.mdc`](../../.cursor/rules/credyx-marketing-prompts.mdc)
- Instagram creatives: [`CREATIVE_INVENTORY.md`](./CREATIVE_INVENTORY.md)
- Existing styles: [`src/styles/credyxMarketing.css`](../../src/styles/credyxMarketing.css)
- Existing nav: [`src/components/enroll/EnrollHeader.tsx`](../../src/components/enroll/EnrollHeader.tsx)

---

## 1. Goal

| | Enroll (`/enroll`) | Waitlist site (new) |
| --- | --- | --- |
| Purpose | Full signup — plan pick + client record | Capture interest before launch / capacity |
| CTA | Enroll now | **Join the waitlist** |
| Form | 2 steps + `createClient()` | 1 short form → waitlist table / email |
| Audience | Ready to onboard | Carriers exploring Credyx |

**Positioning (one line):**  
*Credyx is your A/R back office for trucking carriers — paperwork verified, brokers invoiced, payments tracked **on time**. Not factoring.*

---

## 2. Recommended route & nav

| Item | Suggestion |
| --- | --- |
| Primary URL | `/` or `/waitlist` (decide at build time) |
| Alt URL | `/join` → redirect to waitlist |
| Nav CTA | **Join the waitlist** (replaces “Get Started” on public pages) |
| Secondary links | How it works · Product tour · Client login |
| Keep `/enroll` | Hidden or admin-only until waitlist closes |

Update `EnrollHeader` → shared `MarketingHeader` with waitlist CTA when implementing.

---

## 3. Brand colors

Unify **Instagram/product blue** with the **enroll-page layout** (light, Stripe-like).

### Canonical tokens (use on waitlist site)

| Token | Hex | Usage |
| --- | --- | --- |
| `--cx-navy` | `#0F172A` | Headlines, primary buttons, nav brand |
| `--cx-navy-soft` | `#1E293B` | Button hover, dark sections |
| `--cx-blue` | `#1684FE` | **Primary accent** — links, highlights, stepper, badges (matches portal dark + IG) |
| `--cx-blue-soft` | `#EFF6FF` | Accent backgrounds, badges |
| `--cx-ink` | `#16222A` | Body text |
| `--cx-body` | `#4B5D63` | Secondary text |
| `--cx-muted` | `#85959A` | Captions, labels |
| `--cx-border` | `#E7EBEC` | Cards, inputs |
| `--cx-surface` | `#F7F8F9` | Section backgrounds |
| `--cx-white` | `#FFFFFF` | Page background |
| `--cx-success` | `#2FA98C` | Success states, “paid on time” |
| `--cx-warning` | `#D4A853` | Holds / attention |
| `--cx-error` | `#D14343` | Overdue / disputes |

### Legacy enroll tokens (optional secondary)

| Token | Hex | Note |
| --- | --- | --- |
| `--cx-gold` | `#B7943F` | Used on current `/enroll` accent gradient — **prefer `--cx-blue` on new site** for one brand look |

### Typography

| Role | Font |
| --- | --- |
| Wordmark / headlines | Plus Jakarta Sans (see `credyxWordmark.css`) |
| Body | Inter, system-ui |

### Visual direction

- **Light marketing shell** (reuse `.credyx-page` from enroll) — professional, not dark IG mockups
- Accent headlines with **`--cx-blue`**, not gold gradient
- Product proof: cropped **real portal UI** (dashboard / invoice status), not AI truck heroes
- Truck photography: optional, **muted** in hero only — max one subtle background image

### CSS implementation note

Extend `credyxMarketing.css` with `--cx-blue` / `--cx-blue-soft` and map `.accent` + `.cx-btn-primary` to navy (keep) with blue for links/eyebrows. Or add `credyxMarketingWaitlist.css` scoped to `.credyx-page--waitlist`.

---

## 4. Page structure (sections)

Mirror enroll flow; simplify form at the bottom.

```
MarketingHeader
├── Hero
├── Process (5 steps — correct Credyx workflow)
├── Why Credyx (4 benefit cards)
├── Product proof (UI screenshot / tour teaser)
├── Scope of service (checklist)
├── Waitlist form
└── Footer
```

### 4.1 Hero

| Element | Copy |
| --- | --- |
| Eyebrow | `A/R back office for carriers` |
| Headline | `Your back office,` + accent `in one portal.` |
| Sub | `Submit paperwork, track invoices, and follow broker payments — without hiring a full A/R team. **Paid on time.**` |
| Primary CTA | **Join the waitlist** → scroll to `#waitlist-form` |
| Secondary CTA | See the product → `/tour` |
| Stats (3) | `Real-time` · A/R visibility · `1–50` · Trucks supported · `On time` · Payment tracking |

**Do not use:** “Get paid faster”, “instant cash”, “factoring alternative”.

### 4.2 Process — five steps (accurate)

| # | Title | Description |
| --- | --- | --- |
| 01 | Docs received | Carrier submits paperwork and invoice packet to Credyx. |
| 02 | Paperwork verified | We verify documents so nothing gets missed. |
| 03 | Invoice submitted | We submit your invoice (PPW) to the broker and track acceptance. |
| 04 | Broker follow-up | We follow up, resolve holds and disputes, and keep you informed. |
| 05 | Payment received | We confirm payment when it arrives — **on time**. |

**Do not use:** “Load delivered”, “confirm delivery”, “capture POD” as Credyx steps.

### 4.3 Why Credyx (benefit cards)

| Title | Description |
| --- | --- |
| No in-house A/R team | Back office handled without payroll and turnover. |
| Complete visibility | Dashboard for open A/R, holds, and payment status. |
| Broker follow-up included | We chase paperwork issues and slow pay — you stay on the road. |
| Built for carriers | Invoicing, collections, and reporting in one portal. |

Remove enroll copy: “Lightning fast”, “Works with factoring” (unless you explicitly want factoring-compatible messaging later).

### 4.4 Product proof

- Embed 1–2 **static screenshots** from client portal (dashboard + invoice detail)
- Link: **Take the product tour** → `/tour`
- Optional: animated stepper mock — **Submitted → Verified → Invoiced → Paid**

### 4.5 Scope of service (checklist)

Reuse enroll checklist; trim to accurate items:

- Invoice creation and broker submission (PPW)
- Paperwork verification (BOL, POD, rate con)
- Collections and A/R follow-up
- Payment status tracking and reconciliation
- Held / disputed invoice visibility
- Secure document storage
- A/R aging and reporting

### 4.6 Waitlist form (`#waitlist-form`)

**Single step** — no plan picker.

| Field | Type | Required |
| --- | --- | --- |
| Company name | text | yes |
| Contact name | text | yes |
| Email | email | yes |
| Phone | tel | no |
| Fleet size | select: 1–5, 6–10, 11–25, 26–50, 50+ | yes |
| How did you hear about us? | select optional | no |
| Notes | textarea optional | no |

**Submit button:** `Join the waitlist`  
**Success state:** “You’re on the list. We’ll reach out when onboarding opens.”  
**Privacy line:** “We’ll only use your email to contact you about Credyx. See our Privacy Policy.” (links to `/privacy`)

**Backend (later):**

- New Supabase table `waitlist_signups` or edge function → admin email (mirror `useEnrollForm` + `admin_enrollment_alert`)
- Do **not** call `createClient()` until converting waitlist → enroll

### 4.7 Footer

- Credyx A/R Solutions · © year
- Links: Product tour · Client login · **Privacy** (`/privacy`) · **Terms** (`/terms`)
- Mission line (small): *Empowering truckers. Simplifying payments. Driving success.*
- Waitlist form privacy line links to `/privacy`

---

## 5. Component reuse map

| New / waitlist | Reuse from enroll |
| --- | --- |
| `Waitlist.tsx` page | Structure from `Enroll.tsx` |
| `MarketingHeader` | `EnrollHeader.tsx` (CTA text change) |
| `WaitlistForm` | Fields from `EnrollField.tsx` |
| `useWaitlistForm` | Simpler than `useEnrollForm` (no tier step) |
| Styles | `credyxMarketing.css` + new blue tokens |
| Wordmark | `CredyxWordmark` component |
| Animations | `useRevealOnScroll` |

**New route in `App.tsx`:**

```tsx
<Route path="/waitlist" element={<Waitlist />} />
// Optional: <Route path="/" element={<Waitlist />} /> when replacing root landing
```

---

## 6. Copy guardrails

Align with [marketing rules](../../.cursor/rules/credyx-marketing-prompts.mdc).

| Use | Avoid |
| --- | --- |
| Paid on time | Get paid faster |
| A/R back office | Factoring / cash advance |
| Track · verify · follow up | We confirm delivery / capture POD |
| Join the waitlist | Enroll now (on this page) |
| Visibility · on time | Instant pay · same-day money |

---

## 7. Responsive & accessibility

- Mobile-first: form full-width; nav collapses to menu (enroll nav is desktop-only today — add hamburger for waitlist)
- Focus states on inputs (match enroll)
- Hero stats stack on small screens
- Alt text on product screenshots; decorative truck `alt=""`

---

## 8. Implementation checklist

### Phase 1 — Static page
- [ ] Add `--cx-blue` tokens to marketing CSS
- [ ] Create `Waitlist.tsx` with all sections + static form
- [ ] `MarketingHeader` with waitlist CTA
- [ ] Route `/waitlist`
- [ ] Replace outdated copy vs enroll (workflow, banned phrases)

### Phase 2 — Waitlist backend
- [ ] Migration: `waitlist_signups` table (RLS: insert anon, read admin)
- [ ] `useWaitlistForm` hook + success/error states
- [ ] Admin email template `waitlist_signup_alert`

### Phase 3 — Launch
- [ ] Point Instagram / bio link to `/waitlist`
- [ ] Swap nav “Get Started” → “Join the waitlist” on `/tour`, `/how-it-works`
- [ ] Decide fate of `/enroll` (keep for manual onboarding)

### Phase 4 — Polish
- [ ] Real portal screenshots (blur demo brokers)
- [ ] OG meta + favicon for share cards
- [ ] Analytics event on waitlist submit

---

## 9. Open decisions (fill in when building)

| Question | Options |
| --- | --- |
| Root URL | `/` waitlist vs keep AIDocView landing at `/` |
| Hero image | None · muted truck photo · product UI only |
| Managed vs self-service | Mention both tiers or wait until enroll |
| Instagram CTA | Link in bio → `credyx.com/waitlist` |

---

## Changelog

| Date | Change |
| --- | --- |
| 2026-07-28 | Initial spec — waitlist site, brand tokens, workflow-aligned copy |
