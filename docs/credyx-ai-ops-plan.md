# Credyx AI Operations Platform — Plan
### Broker Risk Manager · Invoice Manager · Assistant (Chat + Calendar)

---

## 0. Framing: one ops layer, not two tools

Risk Manager and Invoice Manager are two faces of the same brain: **broker payment truth**. A broker's historical days-to-pay, dispute rate, and note history feed *both* the risk score a carrier sees on MC check *and* the calendar Invoice Manager builds for an open invoice with that broker (expected pay date, escalation timing). They must read from one shared source — `broker_payment_profile` — not diverge into two separately-tuned models that could tell a carrier contradictory stories ("Broker is Low risk" next to a calendar predicting a 45-day chase).

Architecturally, three layers:

1. **Signal layer** (batch + event jobs) — computes and caches broker risk and invoice action plans. This is the only place tokens get spent on real LLM analysis.
2. **Read layer** (APIs) — MC check, broker panel, invoice detail, dashboard all *read* cached structured data. Zero live AI calls.
3. **Interaction layer** (Assistant: chat + calendar) — a thin conversational/visual shell over the read layer, plus task completion writes (user marks something done).

This mirrors how AIDocView/DocSort already relate to Credyx: document intelligence engines feed structured state; Credyx is system of record. Risk Manager and Invoice Manager are just two more engines feeding the same record, both native to Credyx this time rather than a separate product.

---

## A. Product plan

### A.1 Feature definitions (refined)

**AI Risk Manager** — a cached, weekly-refreshed behavioral risk profile per broker (keyed by MC), shown to carriers at MC-check / broker-detail time and to admins as a network dashboard. Not a credit score replacement — a *trend* signal: is this broker's payment behavior getting better or worse, and how confident are we.

**AI Invoice Manager** — an auto-maintained action calendar per open invoice: paperwork checks, portal checks, reminders, expected payment date, escalation. Reschedules itself as reality changes (payment confirmed, doc uploaded, dispute opened).

**Assistant (Chat + Calendar)** — the human interface to both. Read-mostly, action-card-driven, calm. Not a general chatbot; grounded entirely in Credyx's own invoice/broker/calendar data.

### A.2 MVP boundaries (non-goals for v1)

In scope for MVP:
- Weekly broker risk batch job + cache + carrier-facing display on existing Brokers page
- Invoice calendar generation (rules + LLM-assisted) on invoice creation, synced nightly
- Read-only-ish Assistant: chat that answers from cached data + a calendar view; task completion is a status flip, not an automation
- Admin risk dashboard (list/filter/drill), no push yet (push is Phase 2)

Explicitly **out of scope** for MVP (call this out to stakeholders so expectations are set):
- Auto-sending emails to brokers
- Auto-logging into broker portals
- Admin push-alert delivery (dashboard exists, sending doesn't, until Phase 2)
- Persisted multi-turn chat memory across sessions (Phase 1 chat can be short-lived/tool-grounded — see A.3)
- Cross-carrier "network" risk blending (ship carrier-only risk first — see open question #1)

### A.3 Chat persistence — recommendation

Ship **tool-driven, ephemeral** chat for MVP: each message re-grounds itself against live reads of `broker_risk_profiles` / `invoice_action_plans` / `invoice_calendar_events` rather than maintaining a stored conversation thread. Reasons: (1) nothing here needs memory *across sessions* — the calendar and risk cache already are the persistent state; the chat is a lens; (2) it avoids a whole new privacy/retention surface (chat transcripts referencing broker notes) before the core signal layer is trustworthy; (3) it's cheaper to ship and reason about failure modes for. Revisit persisted threads in Phase 4 once the calendar/risk data model has proven itself and there's a clear case for "continue where we left off" (e.g., a multi-step escalation the user is drafting).

---

## B. UX plan

### B.1 Carrier: MC check / Broker risk view

Extend the existing `BrokerDetailPanel` (do not build a parallel screen). Add a **Risk** section above or beside the existing green/yellow/red pay rating — the cached AI profile supplements, not replaces, that rating.

```
┌─ Broker Detail: TQL (MC-123456) ─────────────────────────┐
│ Pay Rating: 🟡 Medium         [existing]                 │
│                                                            │
│ ── AI Risk Profile ──────────────────────────────────────│
│ Risk: Medium · Confidence: High                          │
│ Analyzed Sun, Mar 15 2026 · 60 invoices · notes as        │
│ recent as 8 days ago                                      │
│                                                            │
│ • Avg payment: 31 days (was 24 days two months ago)       │
│ • 5 invoices required follow-up · 2 documentation         │
│   disputes · 0 non-payment reports                        │
│                                                            │
│ ▸ Evidence (expandable)                                   │
│   - Note (Jan 12): delay citing missing POD, already sent │
│   - Invoice #482 paid day 38 vs Net 30                    │
│   - Dispute rate 3% → 7% MoM                              │
│                                                            │
│ Note: 3+ month-old signals are weighted less — recent     │
│ invoices may already reflect improvement.                 │
└────────────────────────────────────────────────────────────┘
```

Design notes, matching your calm/finance-grade language:
- No score-as-hero-number treatment (no giant "72/100"). Lead with the words: risk level + confidence, then evidence.
- Color only on the risk-level chip itself — reuse the existing green/yellow/red vocabulary from pay rating so users don't learn a second color system. Consistent with the "conditional color only when a metric is non-zero or actionable" principle already established across the Credyx dashboard and payments work.
- Freshness line is never omitted, never buried — same visual weight as the risk chip itself, because the whole point is a carrier should never wonder if this is live spend or cached intel.
- Empty state (new broker, <3 invoices): "Not enough history yet — 2 invoices on file. Check back after more loads." No fake confidence.
- Stale state (job missed, or broker's newest activity postdates last analysis): a small amber note, not a red error — "Refreshing — last analyzed 9 days ago."

### B.2 Carrier: Invoice detail — next-action strip

Add a compact horizontal strip to the existing invoice detail panel, above or below the existing status/notes history:

```
┌─ Invoice #321 — TQL — $2,400 ──────────────────────────┐
│ Status: Approved · Sent Jul 12                          │
│                                                          │
│ Next: Check TQL portal for payment status — due today  │
│ [Mark done]  [Snooze]  [Open full calendar →]           │
│                                                          │
│ Expected payment: Aug 10 (forecast)                     │
└──────────────────────────────────────────────────────────┘
```

Only ever shows the *single next* action, not the whole plan — the full plan lives in the calendar. This keeps the invoice detail page dense-but-scannable, consistent with existing table/panel patterns.

### B.3 Carrier dashboard — cash forecast integration

The existing cash forecast horizon buckets gain a per-invoice expected-payment source: instead of (or alongside) the current heuristic, buckets can cite "3 invoices with AI-confirmed expected dates, 4 on heuristic." Recommend a small provenance label per bucket or per line so carriers understand which numbers are grounded in confirmed schedules vs. estimates — don't silently blend confidence levels.

### B.4 Assistant — Chat + Calendar shell

**Desktop** (two-pane, matches the brief's suggested layout, refined):

```
┌──────────────────────────────────────────────────────────────┐
│ Assistant                                    [Today][Week]   │
├────────────────────────┬─────────────────────────────────────┤
│ Chat thread             │ Calendar (week/agenda default,     │
│  "You're clear today.   │ month optional)                    │
│  3 expected payments    │  Jul 24  ● Payment check — #321    │
│  this week · 1 broker   │  Jul 25  ○ Expected pay — #298     │
│  on watch, no action    │  Jul 26  ● Escalate — #276          │
│  needed."               │                                     │
│  [action cards inline]  │  dot color = event type             │
│                         │  (paperwork / check / expected $ /  │
│ Composer                │   escalate)                         │
│ [Ask Credyx…]           │  Filters: My tasks | Expected $ |   │
│                         │  Broker | Needs me                  │
└────────────────────────┴─────────────────────────────────────┘
```

- Agenda/week is the default view, not month — trucking A/R work is near-term ("what's due this week"), a dense month grid buries that.
- Clicking a calendar event opens the same side-panel pattern already used elsewhere in the client portal (BrokerDetailPanel precedent) rather than a modal — one interaction pattern across the app.
- Chat and calendar are always visible together on desktop — this is deliberate per the brief; don't let chat collapse the calendar away, since the calendar is the actual source of truth and chat is a lens onto it.

**Mobile:**
- Chat is the default/home surface; calendar is a full-screen sheet reached via a tab or a "View calendar" affordance in chat.
- Agenda view only on mobile — no month grid.
- Action cards need large tap targets for Complete/Snooze given a dispatcher may be checking this from a truck stop, not a desk.

### B.5 Chat message types

| Type | Purpose | Key UI rule |
|---|---|---|
| Plain answer | Direct factual response ("TQL pays on average in 31 days") | Short, no filler |
| Action card | A due/overdue task | Complete / Snooze / Open invoice — always three actions, never just text |
| Risk card | Cached broker risk summary | Freshness line mandatory, same as B.1 |
| Expected payment card | Date + confidence | Distinguish "confirmed" vs "forecast" language explicitly |
| Quiet state | Nothing due | Treat as a positive, designed state — not a blank screen. Brief's example line ("You're clear today...") is the right tone: still informative, still shows count of upcoming payments/watched brokers, so quiet doesn't mean uninformative |

### B.6 Admin: Broker Risk Dashboard

Extend the existing admin Brokers area rather than a new top-level nav item.

```
Broker Risk Dashboard
Filter: [All ▾] [Risk: High/Med/Low ▾] [Trend: Improving/Deteriorating/Stable ▾]
Sort: Risk · Trend · Open A/R exposure · Last incident age

MC-123456  TQL           🟡 Medium   ↑ worsening   $18,400 open   last incident 8d
MC-778344  Landstar      🟢 Low      → stable      $4,200 open    last incident 61d
MC-991002  Small Broker  ⚪ Unrated  —              $900 open      2 invoices on file
```

- Drill-in reuses the same evidence/timeline layout as the carrier-facing view (B.1), plus admin-only controls: override risk level with a mandatory reason (human-in-the-loop, never silently overwrites AI output — store both), and a "Push alert" button (Phase 2).
- Audit log as its own tab on the broker record: every push and every override, timestamped, with who/why.

### B.7 Information architecture — nav placement

- **Carrier portal:** New top-level **Assistant** nav item (not nested under Invoices) — it spans invoices *and* brokers, and treating it as a sub-page of Invoices undersells the risk-manager half. Existing Brokers and Invoices pages get the extensions described above (risk section, next-action strip) rather than duplicating that content inside Assistant — Assistant surfaces a *feed and calendar*, detail still lives on the record.
- **Admin portal:** Broker Risk Dashboard as a new tab within the existing Brokers admin area (not top-level) — it's a lens on brokers admins already manage, not a separate domain.

---

## C. Data model

```
broker_risk_profiles
  id, broker_id (MC), risk_level (low/med/high/unrated),
  confidence (low/med/high), summary_text, recommendation_text,
  metrics jsonb (avg_days_to_pay, trend_delta, dispute_rate, follow_up_count, ...),
  analyzed_at, trigger (weekly|payment|dispute|manual),
  model_version, scope (carrier|network) -- see open question #1

broker_risk_evidence
  id, profile_id fk, source_type (invoice|note|payment),
  source_id, weight, source_dated_at  -- age drives the weighting, not fetch time

broker_risk_alerts
  id, broker_id, created_by (admin_id), message, sent_at,
  target (carrier_ids[] | all_subscribers | all_network),
  acknowledgments jsonb  -- carrier_id -> ack_at

invoice_action_plans
  id, invoice_id fk, strategy_version, expected_payment_date,
  expected_payment_confidence, status (active|closed|superseded)

invoice_calendar_events
  id, plan_id fk, invoice_id fk, type (paperwork_check|payment_status_check|
  reminder|expected_payment|escalate|call),
  due_at, owner (system|user|credyx_staff), status (pending|done|snoozed|
  obsolete), completed_at, completion_note

invoice_action_notifications
  id, event_id fk, user_id, delivered_at, read_at, channel (in_app|email)
```

Notes:
- `broker_risk_evidence.source_dated_at` is the field that makes age-aware weighting auditable — the narrative in B.1 ("3+ month-old signals weighted less") should be traceable back to this column, not just asserted in prose.
- `invoice_calendar_events.status = 'obsolete'` (rather than deleting) preserves the audit trail when downstream reschedule logic kills a stale "call Tuesday" after payment already posted — matches the brief's principle 2 ("show your work").
- Tenancy: every table above carries an implicit carrier/client boundary through `invoice_id` → client, and `broker_risk_profiles.scope` determines whether a row is visible only to the owning carrier or (if network-scoped) to any carrier with an open invoice against that broker. RLS should key off client_id joins, never off broker_id alone, to prevent a carrier from seeing another carrier's private notes bundled into what looks like "the" risk profile.
- Assistant: no `assistant_threads` table for MVP per A.3 — chat reads directly from the tables above at request time.

---

## D. Job / schedule design

| Job | Schedule | Behavior |
|---|---|---|
| Broker risk weekly | Sunday 12:00 PM America/Chicago | Recompute for brokers with activity in the trailing window (see open question #2); write new `broker_risk_profiles` row, don't mutate in place — keep history |
| Invoice plan sync | Nightly, ~2 AM local | Ensure every open invoice has a current, non-obsolete plan; create/repair as needed |
| Due-action notifier | 3x/day (morning, midday, EOD) | Push in-app notification for events due today/overdue that haven't been delivered |
| Event-triggered re-analysis | Realtime, queued | Payment confirmed / dispute opened-or-closed / risk-keyword note added / doc status change → dirty-flag the broker or invoice for targeted (not full-network) re-analysis |

Operational specifics:
- **Idempotency:** each job run is keyed by `(broker_id, trigger, window_end)` or `(invoice_id, plan_version)` so a retry after partial failure doesn't double-write or double-notify.
- **Partial failure:** batch job processes broker-by-broker; a failure on one broker logs and continues rather than aborting the whole Sunday run. Admin job-health view shows success/fail count per run, not just "ran" or "didn't."
- **Backfill:** on first deploy, run the weekly job once, immediately, network-wide (not waiting for the first Sunday) so the Brokers page isn't empty on launch.
- **Event triggers vs weekly:** event-triggered runs should be scoped to *only* the affected broker/invoice, never a full re-scan, to keep cost predictable — this is the main lever in section E.

---

## E. Token / cost strategy

Non-negotiable per the brief: MC check is a **read of cache**, always, zero live LLM calls at read time.

Spend tokens only on:
1. Sunday batch (brokers with activity in the trailing window — recommend last-90-days-active, not full network, to start; see open question #2)
2. Event triggers, scoped to the single affected broker or invoice
3. Manual admin "Refresh risk" click

Cost controls:
- Track and surface **token cost per broker per week** and **cache hit rate on MC check** as first-class admin metrics (brief already lists these in success metrics — wire them from day one, not as a later add-on, since this is the credibility check that the architecture is actually cache-first).
- Cap event-triggered re-analysis frequency per broker (e.g., no more than once per 24h even if multiple triggers fire) to prevent a chatty broker (frequent notes/payments) from silently becoming a per-event LLM cost center.
- Invoice calendar generation: rules-based scheduling (broker terms + historical days-to-pay) can produce the *skeleton* calendar without any LLM call; reserve LLM use for the narrative/recommendation text and for judgment calls (e.g., deciding whether incomplete paperwork should delay the first payment-check event). This keeps the nightly invoice-plan-sync job cheap even at high invoice volume.

---

## F. Notification system

| Trigger | Recipient | Channel | Content |
|---|---|---|---|
| Task due today/overdue | Carrier user (task owner) | In-app (+ optional email digest) | Action card content, per B.5 |
| Broker risk deteriorating (event-triggered) | Carrier(s) with open invoices for that broker | In-app | Risk card, freshness included |
| Admin manual push | Targeted carrier(s) per B.6 targeting options | In-app (+ email if configured) | Admin-authored message + linked risk profile |
| Expected payment date confirmed/changed | Carrier | In-app, surfaces on dashboard forecast | Updated date + confidence |
| Job failure / stale data | Admin only | Admin dashboard, not carrier-facing | Job health, never shown to carriers as an error |

Design rule carried from B.1/B.5: every carrier-facing risk or forecast notification must carry its freshness/confidence, not just admin-facing dashboards — the trust problem the brief is solving lives at the point of carrier consumption.

---

## G. Roles, permissions, tenancy

Reuses the brief's table (§10) with one addition: **Managed vs Self-Service** changes task *ownership*, not visibility.

- **Managed tier:** `invoice_calendar_events.owner` defaults to `credyx_staff` for chase-type events (portal check, reminder, escalate, call) — the carrier still *sees* the calendar (transparency), but completion is expected from Credyx staff, and the carrier's action cards for those events should read as informational rather than "yours to do." Paperwork-submission events remain carrier-owned regardless of tier, since only the carrier has the documents.
- **Self-Service tier:** default owner is `user` (the carrier) for chase-type events; Credyx confirmation still writes to the same event (e.g., a Credyx-side payment confirmation can close out a `payment_status_check` event even if the carrier didn't self-report it).
- Recommend this ownership default live on the client/tenant record (one flag, tier-driven) rather than being decided per-invoice, so behavior is predictable and matches what carriers already understand about their plan.

---

## H. Success metrics (targets, first cut)

- MC check cache hit rate: ≥99% (near-100% is the whole point; anything below flags an architecture leak)
- Open invoices with a current, non-obsolete action plan: ≥95% within 24h of invoice creation
- Due tasks completed on time (same-day or next business day): baseline first, then target improvement quarter over quarter
- Token cost per broker per week: track from week 1; set a $ ceiling per broker per week as a config, alert admin if exceeded
- Admin push → carrier acknowledgment rate: track from Phase 2 launch

---

## I. Phased roadmap

**Phase 0 — Foundations**
Schema for risk profiles + evidence + calendar events. Job runner (Sunday batch skeleton + trigger queue). Replace the current mock `ai_summary` generator with a (initially simple) stored weekly result — even before evidence/confidence polish, this retires the placeholder.

**Phase 1 — Risk Manager MVP**
Weekly analysis + cache live. Carrier MC check and BrokerDetailPanel read cache (B.1). Admin risk list, no push. Evidence + staleness language shipped from day one, not deferred — this is core to the trust story, not a nice-to-have polish pass.

**Phase 2 — Admin push + event refresh**
Dashboard polish, override flow with audit log. Push notifications to carriers. Event-triggered re-analysis wired to payment/dispute/note changes.

**Phase 3 — Invoice Manager MVP**
Auto calendar per open invoice. Assistant chat+calendar shell (ephemeral/tool-grounded per A.3). User task notifications + completion. Expected payment date flows into cash forecast (B.3).

**Phase 4 — Assistant depth**
Richer tool-grounded chat (query invoice/broker/calendar directly). Smarter snooze/reschedule. Quiet-morning state polish. Revisit persisted chat threads here if usage shows a real need.

**Phase 5 — AI employee**
Per-invoice daily wake-up. Approved automations where credentials exist (portal checks, drafted emails needing user send-approval before full autonomy). Escalation drafts.

Dependencies: Phase 3 (Invoice Manager) doesn't require Phase 2 (push) to ship, but both depend on Phase 0's job runner and event queue existing — build that infrastructure once, shared.

**Sales demo script sketch:** open on a "quiet morning" Assistant screen (nothing due) to establish tone, then trigger the two headline moments the brief names — "never miss a follow-up" (show an action card firing right as a portal check comes due) and "see a broker getting riskier before it costs you" (open a Medium-risk broker with a visible trend and evidence).

---

## J. Open questions — recommended defaults

1. **Network vs carrier-specific risk:** Default to **carrier-specific only** for MVP (Phase 1–2). A given carrier's risk view is built from their own invoices/notes/payments with that broker. Network-aggregate risk is a real future feature but mixing it in early creates the privacy/labeling problem the brief flags (§8) before the single-carrier case has even proven out. Add a `scope` field now (per the data model) so network-aggregate can be added later without a schema change — just don't populate it yet.
2. **Which brokers get weekly analysis:** Recommend **active in trailing 90 days** (has an open invoice, or a closed invoice/payment/note in that window) rather than the full network — keeps the Sunday job cost bounded and skips analyzing brokers no current carrier is haul-planning against.
3. **Chat persistence:** Ephemeral/tool-grounded for MVP — see A.3.
4. **Assistant nav placement:** Top-level "Assistant," not nested — see B.7.
5. **Admin push targeting:** Start with **carriers who have an open invoice with that broker** as the default/recommended target, with "all subscribers to broker alerts" as an opt-in expansion — avoid "all network" blasts until the alert-quality bar is proven (false positives on a network-wide push are much more costly to trust than a scoped one).
6. **Auto-reminder emails in MVP:** Off, per the brief's own instruction (Phase 5). Worth restating as a hard MVP boundary since it's the single feature most likely to get scope-crept in early.
7. **Minimum evidence for "High" confidence:** Recommend a floor of **≥10 invoices** with at least one data point (note, payment, or dispute) **within the trailing 60 days** — sample size alone isn't enough if all of it is old; recency and volume should both gate confidence, matching the age-aware principle already established.
8. **Timezone:** Confirmed — store UTC, display carrier-local, batch job runs in America/Chicago. No change recommended.
9. **Prompt-injection from broker notes:** Treat broker/carrier note text as untrusted input to the risk-summary prompt — quote or reference note content as data, never let note text alter system instructions, and strip/escape any text that resembles instruction-like phrasing before it reaches the model. Evidence display (B.1) should show notes as quoted, attributed data, not paraphrase them in a way that could smuggle in note-authored instructions.
10. **Managed tier task ownership:** See G — default chase-type events to `credyx_staff` ownership under Managed, carrier retains visibility.

---

## K. Copy deck

### In-product labels (avoid "AI" overload)
- Feature name (carrier-facing): **"Broker Risk"** (not "AI Risk Manager") on the Brokers page section header
- Feature name (carrier-facing): **"Assistant"** (not "AI Assistant") in nav
- Freshness line: *"Analyzed [date] · [n] invoices · notes as recent as [n] days ago"*
- Quiet state: *"Nothing needs you today."*
- Confidence labels: **High / Medium / Low** — never a numeric percentage (keeps it in plain finance-ops language, not pseudo-precision)

### Marketing outcome lines
- "Never miss a payment follow-up."
- "Know when a broker starts becoming risky — before you book the load."
- "See when money should hit, before you have to chase it."
- "Your back office, watching every invoice, every day."

### Example risk summary (template)
> Risk: [level] · Confidence: [level]
> Analyzed [date] · based on [n] invoices · notes as recent as [n] days ago
>
> - Average payment: [n] days (was [n] days [timeframe] ago)
> - [n] invoices required follow-up · [n] documentation disputes · [n] non-payment reports
> - [Age-aware caveat if applicable: "Older notes (3+ months) weighted less — recent invoices are clean."]

### Example chat utterances
- User: *"What's due today?"* → Assistant: *"2 things need you: check TQL's portal for invoice #321, and upload POD for #408 before we can chase it."*
- User: *"Why is MC-123456 medium risk?"* → Assistant: *"Their average payment time rose from 24 to 31 days over the last two months, with 2 documentation disputes. No reports of non-payment. [View full profile]"*
- User: *"When will TQL pay invoice 123?"* → Assistant: *"Expected Aug 10, based on their typical ~30-day pattern. I'll update this if anything changes."*
- Quiet morning: *"You're clear today. 3 expected payments this week · 1 broker on watch, no action needed."*
