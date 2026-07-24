# Credyx AI Operations Platform — Planning Brief

> **Purpose of this document**  
> Send this brief to Claude (or another planning agent) to produce a full product + UX + technical plan.  
> Do **not** treat this as an implementation spec yet. The ask is: invent the detailed plan — screens, flows, data model, schedules, notifications, and phased rollout — grounded in what Credyx already has.

---

## 0. What Credyx is (read this first)

### One-liner

**Credyx** is a multi-tenant **accounts receivable (A/R) and back-office platform for trucking carriers**. It helps carriers get paid for loads: collect and verify paperwork, invoice brokers, track open A/R, confirm payments, chase slow payers, and check broker reliability (MC lookup) before hauling.

### Who it serves

| Party | Role in Credyx |
|---|---|
| **Carriers (clients)** | Trucking companies that haul freight for brokers. They use the **client portal** to submit docs, manage invoices/payments, view aging A/R, look up brokers by MC, and see cash forecasts. |
| **Brokers** | Freight brokers who book loads and owe the carrier. Tracked by name, **MC**, **DOT**, payment terms (e.g. Net 30). Not “users” of Credyx in the primary sense — they are the *payors* and risk subjects. |
| **Credyx staff (admins)** | Internal A/R / ops team. Use the **admin portal** to review batches, approve paperwork, post remittances, run collections, manage clients/brokers, and (soon) watch network broker risk. |

### Industry problem Credyx solves

In trucking, getting paid is often harder than hauling the load:

1. Brokers require a packet (rate confirmation, BOL, POD, invoice, lumper, etc.).
2. Missing or mismatched docs → payment delays or disputes.
3. Carriers juggle dozens of open invoices, different broker portals, and “when will we get paid?”
4. Before accepting a load, carriers want to know if a broker’s MC is trustworthy — not just a static credit score, but whether that broker has started paying late or fighting paperwork.

Credyx sits in that **paperwork → invoice → payment → collections** loop.

### Core product today (mental model)

```
Documents in  →  Review / sort  →  Invoice out  →  Track A/R  →  Confirm payment  →  Close
                      ↑                                         ↓
                 AI paperwork tools                    Aging, disputes, collections
                      ↑                                         ↓
                 Batches per client                    Broker directory + MC check
```

**Important domains already in the app:**

- **Batches** — groups of load paperwork moving through review (ready to post → verification → approval).
- **Invoices** — carrier invoices to brokers; statuses like pending, approved, hold, overdue; notes history; disputes.
- **Payments / remittances** — posting and confirming what brokers paid (short pays, overpays, clawbacks in the broader billing story).
- **Brokers** — master list + client broker directory; MC search; green/yellow/red pay rating; notes; placeholder AI summary.
- **Collections / aging A/R** — what’s past due, chase workflows, force-close / write-off policies (tier-dependent).
- **Cash collection forecast** — when open invoices are expected to turn into cash (heuristic today).
- **Documents vault / uploads** — carrier document library and submission flows.
- **Billing Credyx → carrier** — subscription / A/R-based fees for using the platform (separate from broker-facing invoices).

### Two service tiers

Clients enroll as **Managed** or **Self-Service**:

| | **Managed** | **Self-Service** |
|---|---|---|
| Who works paperwork batches | Credyx A/R rep (client does doc handoff) | Client can create/run more of their own batch work |
| Collections emphasis | Credyx helps chase; force-close / fees apply in policy | Client largely owns collections; no Credyx force-close fee path |
| Payment posting | Mostly Credyx (remittances often to Credyx) | Client can post; Credyx confirmation still matters in target design |

Plans for Risk Manager / Invoice Manager should respect that **who owns the chase task** can differ by tier.

### Related products in the same codebase (context only)

This repo also contains document-intelligence products that feed or sit beside Credyx A/R:

| Product | Job |
|---|---|
| **AIDocView** | Per-load paperwork **audit** — classify, extract, cross-check rate con / BOL / invoice / POD → approve / needs review / reject. Strong fit for factoring-style QA and Credyx review. |
| **DocSort** | **Batch** PDF sort/match — many rate cons + BOLs → matched loads, invoices, PDF binders. |

Credyx is the **A/R operations system of record** for the carrier. AIDocView/DocSort are the **document intelligence** engines that make paperwork usable. The new AI Risk Manager and Invoice Manager live primarily in **Credyx**, consuming invoice/broker/payment/note data (and document status), not replacing the sorter/reviewer.

### Portals & tech (for planning realism)

- **Client portal** — `/client/*` (dashboard, invoices, payments, batches, brokers, collections, documents, settings). Light-mode, finance-grade UI: dense tables, stat strips, detail side panels.
- **Admin portal** — internal Credyx routes (batches, clients, brokers, collections, billing, users, reports).
- **Stack** — Vite + React + TypeScript; Supabase Auth/DB; OpenAI via edge proxy for AI features; local/mock data still used heavily in places alongside Supabase persistence.
- **Identifiers that matter** — client id, invoice number, load number, broker **MC** / **DOT**, batch id.

### What Credyx is *not*

- Not a load board (no posting loads for booking as the core product).
- Not a TMS for dispatch/routing (though load numbers appear on docs/invoices).
- Not only a PDF storage drive — the point is **getting invoices paid and brokers understood**.
- Not “ChatGPT wrapped around trucking” — AI should reduce specific back-office work and token cost.

### Why this brief exists

Paperwork sorter + reviewer already work. Next differentiation:

1. **Broker Risk Manager** — cached weekly intelligence carriers see on MC check; admin can push alerts.
2. **Invoice Manager / Assistant** — calendar of follow-ups + chat shell so no invoice is mentally tracked on sticky notes.

Together, that pushes Credyx from “document + invoice manager” toward **AI operations for the trucking back office**.

---

## How to use this brief (instructions for Claude)

You are planning features for **Credyx** as defined in §0. Stay grounded in that product: carriers, brokers (MC), invoices, A/R, admin ops — not a generic chatbot SaaS.

Please produce a structured planning response covering:

1. **Product architecture** — how AI Risk Manager and AI Invoice Manager fit together as one “operations layer,” not two disconnected tools.
2. **UI/UX design** — wireframe-level descriptions (layout, hierarchy, empty states, mobile). Especially the **chat + calendar** assistant experience described below.
3. **Information architecture** — nav placement for carrier portal vs Credyx admin.
4. **Data model** — entities, fields, freshness, confidence, audit trail.
5. **Job / schedule design** — weekly Sunday run + event-triggered re-analysis.
6. **Token / cost strategy** — cache-first; when to spend AI credits.
7. **Notification system** — who gets notified, when, and how admins push alerts to carriers.
8. **Phased roadmap** — MVP → v1 → “AI employee per invoice.”
9. **Open questions & decisions** — trade-offs with recommended defaults.
10. **Outcome-based marketing copy** — not “AI-powered”; promises carriers care about.

Match the existing client portal design language: calm, finance-grade, light mode, scannable tables, detail side panels — not a flashy consumer chatbot aesthetic.

---

## 1. Product context (what already exists)

Credyx already has working pieces of the operations stack:

| Capability | Status | Notes |
|---|---|---|
| Paperwork sorter | Working | Doc Sort product / batch document classification |
| Paperwork / invoice AI reviewer | Working | Batch AI review, confidence, rules, hold reasons |
| Client invoices & payments | Working | Open A/R, aging, payment confirmation, disputes |
| Broker directory + MC lookup | Working | Client Brokers page; search by MC; green/yellow/red pay rating |
| Broker notes | Working | Per-client notes on brokers |
| Mock AI broker summary | Placeholder | Rule-based `ai_summary` today — not real weekly LLM analysis |
| Cash collection forecast | Working | Horizon buckets + expected payment dates (heuristic) |
| Collections chase | Working | Admin collections tooling |
| Admin brokers / clients | Working | MC/DOT, payment terms (e.g. Net 30) |

**Implication:** Do not redesign the whole product. Extend what exists — especially Brokers (MC check), invoice detail panels, forecasts, and admin dashboards — with a real cached intelligence layer and an assistant that *acts on a calendar*.

---

## 2. North star

Credyx should evolve from a **document + invoice manager** into an **AI operations platform for trucking back offices**.

Not “AI for everything.”  
AI for specific expensive problems:

1. **Broker risk signal** carriers actually trust when booking / MC-checking.
2. **Invoice follow-up calendar** so dispatchers never miss paperwork checks, portal checks, or payment reminders.
3. Eventually: **one lightweight agent per open invoice** that wakes up daily and only acts when needed.

### Marketing framing (critical)

Avoid selling “AI-powered.” Sell outcomes:

- “Never miss a payment follow-up.”
- “Know when a broker starts becoming risky.”
- “Your back office works 24/7.”
- “Credyx monitors every invoice automatically.”
- “See when money should hit — before you have to chase.”

---

## 3. Feature A — AI Risk Manager (for brokers)

### Problem

Load boards show credit score, days-to-pay, factoring status.  
They rarely show *behavioral change*:

> “Over the last 90 days we’ve seen a 27% increase in payment delays. The broker still pays, but documentation disputes have doubled. Most recent issue was 8 days ago.”

That is what carriers pay attention to during MC check.

### Who sees it

| Audience | Where | Why |
|---|---|---|
| Carrier (client portal) | Brokers / MC check results | Decide whether to haul / how much exposure |
| Credyx admin | Broker risk dashboard | Network-wide risk, push alerts to carriers |

### What the AI reads (inputs)

For each broker (keyed by MC / broker id), analyze:

- Invoices on file (open + closed), amounts, ages, statuses
- Actual days-to-pay vs stated terms (`payment_terms_days`)
- Payment history and late patterns
- Documentation disputes / holds / missing POD patterns
- Notes from carriers and Credyx staff (with **timestamps** — age matters)
- Non-payment / write-off / force-close signals if present
- Trend windows: last 30 / 60 / 90 days vs prior period

### Desired output shape (example)

```
Broker Risk: Medium
Confidence: High
Data freshness: Analyzed Sunday Mar 15, 2026 · based on 60 invoices · notes as recent as 8 days ago

Summary
• Average payment: 31 days (was 24 days two months ago)
• Last 60 invoices reviewed
• Payment time increased from 24 → 31 days
• 5 invoices required follow-up
• 2 documentation disputes
• No reports of non-payment

Evidence / why
• Note from carrier (Jan 12): “TQL delayed 2 weeks citing missing POD — POD was already sent”
• Invoice #482 paid day 38 vs Net 30
• Dispute rate 3% → 7% MoM

AI Recommendation
Broker appears stable but payment performance has declined over the last two months.
Older notes (3+ months) should be weighted less — broker may be improving if recent invoices are clean.
```

### Freshness & confidence rules (must plan explicitly)

- Always show **when** the analysis ran and **how old** the underlying notes/invoices are.
- If the riskiest signal is 90 days old and recent invoices look fine → say so (“information is ~3 months old; broker may be improving”).
- Confidence should reflect sample size + recency + data completeness (new broker with 2 invoices ≠ High confidence).
- Carriers should never wonder if they’re looking at live LLM spend vs cached weekly intel.

### Cost model (non-negotiable)

**Do not** run a full diagnose on every MC check.

Default:

1. **Weekly batch job** — every Sunday **12:00 PM America/Chicago (CST/CDT)** analyze each broker that has new/relevant activity (or all brokers in network — decide in plan).
2. **Store** structured risk profile + narrative summary + evidence pointers.
3. **MC check** only **reads the cache**.

Also re-run (event-triggered) when:

- A payment is received / confirmed
- A dispute is opened or resolved
- A broker is reported / note added with risk keywords
- New paperwork arrives that changes hold/dispute state
- Admin manually “Refresh risk”

Goal: save tokens, keep maintenance simple, still stay current when something material changes.

### Admin capabilities

Credyx admin should have a **Broker Risk Dashboard**:

- List / filter: High / Medium / Low / Improving / Deteriorating
- Sort by risk, trend, open A/R exposure across carriers, last incident age
- Drill into broker: evidence, invoice sample, notes timeline
- **Push notifications to carriers** about specific brokers (e.g. “Credyx network alert: Broker X payment delays rising”)
- Ability to override / annotate risk (human-in-the-loop) without deleting AI evidence
- Audit log of pushes and overrides

---

## 4. Feature B — AI Invoice Manager (operations coordinator)

### Problem

Dispatchers hold mental load per invoice:

- Need to call Tuesday  
- Need to email Friday  
- Need to check portal  
- Need POD  
- Expected pay date unclear  

### Solution

For **every open invoice**, the AI builds and maintains a **calendar of actions**:

Example — Invoice #321 (broker pays ~30 days, docs good):

| When | Action | Owner |
|---|---|---|
| Today | Documents verified ✓ | System |
| Day ~20 (Jul 31) | Check broker portal / payment status | User if portal requires human; system if automatable |
| Day ~25 (Aug 6) | Send payment reminder | System / user approve |
| Day ~30 (Aug 10) | Expected payment | Forecast |
| Day ~32 (Aug 12) | Escalate if unpaid | User / Credyx |
| Day ~35 (Aug 15) | Call accounting | User |

### Behavior rules

- Calendar is generated from: broker terms, historical days-to-pay for that broker, document readiness, notes, prior disputes.
- If paperwork is incomplete → schedule paperwork check **before** payment chasing.
- If payment status requires checking a broker web portal and Credyx cannot automate login → **notify the user** to do that action; mark task complete when user confirms.
- When payment status is confirmed (example: expected **3/15/2026**), update the calendar + cash forecast so the **carrier can see when to expect money**.
- Completing or missing a task should reschedule downstream tasks intelligently (don’t leave stale “call Tuesday” after payment already hit).

### Scope of AI for MVP vs later

**MVP (recommended to plan):**

- Generate + display calendar
- Notify user of due actions
- Track completion
- Update expected payment date when confirmed
- Surface expected payments on carrier dashboard / invoice detail

**Later (“AI employee”):**

- Auto-send emails
- Auto-check portals (where credentials exist)
- Escalate with drafted messages
- Morning wake-up: “Do I need to do anything today?” → act or stay quiet

---

## 5. Feature C — AI Assistant UX: Chat + Calendar (primary interaction idea)

This is the preferred shell for the Invoice Manager (and later a unified assistant).

### Concept

A dedicated **Assistant** experience with two tightly linked surfaces:

1. **Chat** — conversational operations partner  
2. **Calendar** — the source of truth for scheduled invoice actions and expected payments  

Users should be able to:

- Open the calendar from chat (and vice versa)
- Click a calendar event → see invoice context + suggested next step
- Ask in chat: “What’s due today?” / “When is TQL expected to pay invoice 123?” / “Why is broker MC-123456 medium risk?”
- Confirm tasks from chat (“Marked portal check done”)
- See expected payment dates as calendar events carriers care about (cash timing), not only chase tasks

### Suggested layout (please refine in your plan)

**Desktop**

```
┌──────────────────────────────────────────────────────────────┐
│ Assistant                                    [Today] [Week]  │
├────────────────────────┬─────────────────────────────────────┤
│                        │  Calendar (month/week/agenda)       │
│  Chat thread           │  • color by type: paperwork /       │
│  - system messages     │    payment check / expected pay /   │
│  - action cards        │    escalate                         │
│  - “Open calendar”     │  • click event → side detail        │
│                        │                                     │
│  Composer              │  Filters: My tasks | Expected $ |   │
│  [Ask Credyx…]         │  Broker | Needs me                  │
└────────────────────────┴─────────────────────────────────────┘
```

**Mobile**

- Default: chat  
- Calendar as full-screen sheet / tab  
- Agenda view preferred over dense month grid  

### Chat message types (design these carefully)

- Plain answer
- **Action card** (due task with Complete / Snooze / Open invoice)
- **Risk card** (cached broker risk summary + freshness)
- **Expected payment card** (date + confidence)
- System quiet state: “Nothing needs you today” (this is a feature, not an empty failure)

### Design constraints

- Must feel like Credyx (finance ops), not a generic ChatGPT clone
- No purple glow / gimmick AI chrome
- Prefer action cards and calendar over long prose
- Always show data freshness on risk answers
- Human actions that require the user must be unmistakable vs automated steps

---

## 6. How the pieces connect (system story)

Long-term happy path:

```
Carrier uploads Rate Confirmation
        ↓
AI creates / attaches Load
        ↓
Documents collected / sorted / reviewed
        ↓
Invoice generated & sent
        ↓
AI Invoice Manager builds calendar
        ↓
Payment monitored (tasks + expected date)
        ↓
Broker analyzed weekly (+ event triggers)
        ↓
Risk profile updated (cached)
        ↓
Carrier sees risk on MC check (no new tokens)
        ↓
Payment predicted → cash forecast updated
        ↓
Carrier notified when action or risk matters
        ↓
Invoice closed
```

Sunday job + invoice agents are the backbone; chat/calendar is the human interface; MC check is a **read path**.

---

## 7. Existing surfaces to extend (do not ignore)

When planning UI placement, prefer extending these rather than inventing parallel worlds:

| Existing | Extend with |
|---|---|
| `/client/brokers` + MC lookup + `BrokerDetailPanel` | Cached Risk Manager profile (rating, confidence, evidence, freshness) |
| Client invoice detail / collections | Invoice calendar strip + next action |
| Client dashboard cash forecast | Expected payments from Invoice Manager |
| Admin Brokers / Collections | Network risk dashboard + push-to-carriers |
| Notifications system | Task due, risk alert, admin push, expected payment updates |
| `ai_summary` on broker profile | Replace mock generator with stored weekly analysis |

---

## 8. Data & storage (what to invent in the plan)

Please propose concrete entities, for example (refine/rename as needed):

### Broker risk

- `broker_risk_profiles` — broker_id/MC, risk_level, confidence, summary, recommendation, metrics JSON, analyzed_at, trigger (`weekly` \| `payment` \| `dispute` \| `manual`), model/version
- `broker_risk_evidence` — pointers to invoices, notes, payments with weights and ages
- `broker_risk_alerts` — admin pushes to carriers, acknowledgment

### Invoice operations

- `invoice_action_plans` — invoice_id, strategy version, expected_payment_date, status
- `invoice_calendar_events` — type (`paperwork_check` \| `payment_status_check` \| `reminder` \| `expected_payment` \| `escalate` \| `call`), due_at, owner (`system` \| `user` \| `credyx`), status, completion notes
- `invoice_action_notifications` — delivery + read state

### Assistant

- Optional `assistant_threads` / messages if chat is persisted  
- Or ephemeral chat over structured calendar + risk APIs (decide which is better for MVP)

Include: RLS / tenant boundaries (carrier only sees their data; admin sees network; careful with cross-carrier note leakage in network risk).

**Privacy decision needed:** Is broker risk based only on *this carrier’s* history, Credyx network aggregate, or both (with labels)? Recommend a default.

---

## 9. Scheduling & jobs

| Job | When | Does |
|---|---|---|
| Broker risk weekly | Sunday 12:00 America/Chicago | Recompute profiles for brokers with activity / all active brokers |
| Invoice plan sync | Nightly or on invoice create/update | Ensure every open invoice has a current calendar |
| Due-action notifier | Multiple times daily | Notify users of tasks due today / overdue |
| Event triggers | Realtime on payment/dispute/note/docs | Dirty flag → targeted re-analysis |

Please specify: queueing, idempotency, partial failure, backfill, and how admins monitor job health.

---

## 10. Roles & permissions

| Role | Risk Manager | Invoice Manager | Push alerts |
|---|---|---|---|
| Carrier user | Read cached risk on MC/brokers; own notes | Own invoice calendars; complete user tasks | Receive admin/network alerts |
| Carrier admin | Same + maybe org-wide task view | Org calendar | Manage notification prefs |
| Credyx admin | Full network dashboard; overrides | May see managed-tier invoices | Create/push broker alerts |
| System/AI | Write profiles & calendars | Create/update events | Emit notifications |

Call out Managed vs Self-Service tier differences if relevant (who owns chase actions).

---

## 11. Success metrics

Propose targets for:

- % of open invoices with an up-to-date action plan
- % of due tasks completed on time
- Reduction in missed follow-ups / days-sales-outstanding movement
- MC check: cache hit rate vs live AI calls (should be ~100% cache)
- Token cost per broker per week
- Carrier engagement with risk profile (views, “useful” feedback)
- Admin alert push → carrier acknowledgment rate

---

## 12. Phased roadmap (starting point — refine)

### Phase 0 — Foundations
- Persist broker risk profile schema + freshness fields
- Persist invoice calendar events
- Job runner (Sunday + triggers)
- Replace mock `generateBrokerAiSummary` with stored results

### Phase 1 — AI Risk Manager MVP
- Weekly analysis + cache
- Carrier MC check / broker panel reads cache
- Admin risk list (no push yet)
- Evidence + “data may be stale / improving” language

### Phase 2 — Admin push + event refresh
- Admin dashboard polish
- Push notifications to carriers
- Re-analyze on payment/dispute/note

### Phase 3 — AI Invoice Manager MVP
- Auto calendar per open invoice
- Chat + calendar UI shell
- User task notifications + completion
- Expected payment date on calendar + forecast

### Phase 4 — Assistant depth
- Richer chat grounded in tools (invoice, broker, calendar)
- Snooze / reschedule intelligence
- Quiet mornings when nothing is due

### Phase 5 — AI employee
- Per-invoice daily wake-up
- Approved automations (email, portal check where possible)
- Escalation drafts

---

## 13. Explicit product principles

1. **Cache-first intelligence** — humans read stored results; AI writes on schedule/events.
2. **Show your work** — risk and calendars must show evidence and freshness.
3. **Age-aware notes** — old complaints don’t permanently brand a broker; call out improvement.
4. **User actions are first-class** — if a human must check a portal, the system assigns and tracks it; it doesn’t pretend it did it.
5. **Quiet is good** — “No action required” is a successful assistant outcome.
6. **Outcome marketing** — name features by jobs-to-be-done, not by the model.
7. **One ops brain** — Risk Manager and Invoice Manager share broker payment truth; don’t diverge metrics.

---

## 14. Open questions for Claude to decide (with recommendations)

1. Network vs carrier-specific risk — blended with clear labeling?
2. Which brokers get weekly AI (all network vs active in last N days vs open A/R only)?
3. Chat persistence vs tool-driven ephemeral assistant for MVP?
4. Where does Assistant live in nav — top-level “Assistant” vs inside Invoices?
5. Can admin pushes target all carriers who worked that broker, subscribers, or everyone?
6. How aggressive is auto-reminder email in MVP (off until Phase 5)?
7. What is the minimum evidence set before showing High confidence?
8. Timezone: store UTC, display carrier local, jobs in America/Chicago — confirm.
9. How do we prevent prompt-injection from broker notes into risk narratives?
10. Managed tier: does Credyx staff complete tasks instead of the carrier?

---

## 15. Deliverables requested from Claude

Please return:

### A. Product plan
- Refined feature definitions, MVP boundaries, non-goals

### B. UX plan
- Carrier: MC check risk view, Assistant chat+calendar, invoice “next action”
- Admin: broker risk dashboard, push-alert flow
- Wireframe-level layouts + interaction notes + empty/error/stale states
- Visual language notes consistent with Credyx client portal (light, dense, finance-grade)

### C. Technical plan
- Data model
- Jobs & triggers
- API/read paths for MC check (cache only)
- Notification matrix
- Security / tenancy / note privacy
- Cost controls

### D. Roadmap
- Phased milestones with dependencies
- Suggested demo script for sales (“never miss a follow-up” / “broker getting riskier”)

### E. Copy deck
- In-product labels (avoid “AI” overload)
- Marketing outcome lines
- Example risk summary templates
- Example chat utterances + system replies

---

## 16. Seed examples (use in UX mocks)

### Risk — TQL-style broker
- Risk: Medium · Confidence: High  
- Avg pay 31d (was 24d)  
- 60 invoices · 5 follow-ups · 2 doc disputes · 0 non-payment  
- Note from 3 months ago about delays — flag as possibly outdated if last 8 invoices clean  

### Invoice — #123 for TQL
- Docs good · broker historically ~30 days  
- Day 20: payment status check (user may need portal)  
- Confirm expected pay **2026-03-15** → appears on carrier calendar + forecast  

### Assistant quiet day
> “You’re clear today. 3 expected payments this week · 1 broker on watch (no action needed).”

### Assistant action day
> “2 things need you:  
> 1) Invoice #321 — check TQL portal for payment status (due today)  
> 2) Invoice #408 — upload POD before we can chase”

---

## 17. One-sentence brief

**Build a cache-first Broker Risk Manager carriers see on MC check, a calendar-driven Invoice Operations Assistant (chat + calendar) that never drops follow-ups, and an admin dashboard that can push broker risk alerts — turning Credyx into the back office that watches every invoice and every broker without burning tokens on every lookup.**
