# Feature 8 — Broker follow-up blueprints (if / else)

> Applies to: **Admin Collections**, **broker directory**, **email lifecycle**, later **self-service collections**
> Priority: High (product differentiator)
> Status: **spec only** — not implemented
> Replaces (over time): hardcoded chase in `src/utils/collectionsChase.ts`, clocks in `src/config/emailLifecycle.ts`, and global days in `src/utils/collectionsPolicy.ts`

## 1. Why this exists

Today every broker is chased with the **same ladder**:

```
PPW sent → wait confirm window → paperwork inquiry → paperwork follow-up → needs attention
         → paperwork good → wait Net terms → payment inquiry → payment follow-up → needs attention
```

Overrides are thin: broker paperwork-confirm days, Net terms, global `followupAfterDays` / `needsAttentionAfterDays`, and on/off email rules. Holds, Will Pay, claims, portal-only brokers, and “do not email this payor” are handled by people, not by a graph.

A **blueprint** is a named if/else workflow: *when this is true, do that; otherwise do the other thing.* Credyx staff (Managed) or the carrier (Self-Service, later) attach a blueprint to a **broker**, with optional invoice-level override.

This is **not** a promise of faster pay. Language stays: follow up, resolve holds, keep the carrier informed, **paid on time**.

### Product rule (do not blur)

| Mode | Who designs the graph | Who executes the next step |
|---|---|---|
| **Managed** | Credyx ops (platform + client-scoped blueprints) | Credyx A/R — auto-draft, staff send or approved auto-send |
| **Self-Service** | Carrier (later) using Credyx templates | Carrier — same engine, their mailbox / their send |

Monk-style “set rules and walk away” is the **Self-Service** shape. Credyx’s wedge is the same engine **plus** a desk that runs it when the carrier is on the road.

---

## 2. What a blueprint is

A blueprint is a **directed graph** evaluated against one **invoice × broker × client** at a time.

```
Trigger → Conditions (if / else if / else) → Action → Wait / pause → next node
```

- **Deterministic.** Same inputs → same next node. No hidden LLM choice of branch.
- **Previewable.** Staff can dry-run “what would fire today?” with no send and no status write.
- **Auditable.** Every evaluation logs: node id, condition results, action taken or skipped, actor (engine / staff / carrier).
- **Safe by default.** First ship: **draft + queue**. Auto-send is an explicit flag per action node, off until the client/broker is trusted.

### Resolution order (first match wins)

1. Invoice `blueprint_id` (rare — special load / claim)
2. Broker `blueprint_id` (the normal case)
3. Client default blueprint
4. Platform default: **Credyx Standard Chase** (encodes today’s tracks)

---

## 3. How to execute the if/else model

### 3.1 Evaluation loop

Run the engine on:

| Signal | Examples |
|---|---|
| **Clock** | Daily job (and optional hourly for due-today Will Pay / callback) |
| **Event** | PPW sent, paperwork confirmed, hold opened, claim logged, Will Pay set, payment posted, broker reply classified, dispute opened, invoice paid / force-closed / written off |

**Algorithm (one invoice):**

1. Load invoice, broker, client, assigned blueprint, last **run pointer** (`current_node_id`, `entered_at`, `wait_until`).
2. If invoice is terminal (`paid`, `force_closed`, `written_off`) → jump to **Stop** (optional “paid” thank-you node is v2).
3. If a **hard pause** is active (claim on account, “stop chase” flag, missing packet) → stay paused; do not send.
4. If `wait_until` is in the future → skip.
5. Evaluate the **current node**:
   - **Wait** — if clock elapsed, advance to `next`.
   - **Condition (if)** — evaluate predicates in order; take first true branch; if none, `else`.
   - **Action** — enqueue work (email draft, call task, portal check, notify carrier, escalate to staff). Advance only after the action is **completed or skipped with reason**.
6. Write `blueprint_runs` row. Move pointer. Repeat until you hit Wait, Pause, or Stop (do not loop more than N nodes per tick — prevent cycles).

**Never** evaluate two blueprints on the same invoice in one tick.

### 3.2 Node types

| Type | Purpose |
|---|---|
| `trigger` | Entry: `on_ppw_sent`, `on_open_approved`, `on_clock`, `on_will_pay_set`, `on_hold`, `on_claim`, `on_broker_reply` |
| `if` | Ordered branches: `if` / `else if` / `else`. Each branch has predicates (AND within a branch; branches are XOR). |
| `wait` | Sleep until date or duration (`wait 3 days`, `wait until due_date`, `wait until paperwork_confirm_at`). |
| `action` | See §3.4. |
| `pause` | Stop outbound chase until a **resume event** (docs uploaded, hold cleared, claim amount received). |
| `goto` | Jump to another node (named label). Cycle detection required. |
| `stop` | End this run. Invoice can start a **new** run if a later trigger fires (e.g. payment track after paperwork good). |

A blueprint may have **two tracks** as subgraphs (same as today): `paperwork` and `payment`. Payment subgraph must not start unless paperwork status is logged **good** (existing rule).

### 3.3 Condition predicates (if)

All predicates read live Credyx state. Keep the catalog small and named so ops can build graphs without SQL.

**Invoice / packet**

| Id | True when |
|---|---|
| `no_ppw` | Open A/R, packet never sent |
| `ppw_waiting` | PPW sent; still inside broker confirm window |
| `ppw_check_due` | Confirm window elapsed; paperwork not logged good |
| `paperwork_good` | Paperwork status confirmed |
| `payment_waiting` | Paperwork good; before Net / due |
| `payment_verify_due` | Due date reached; unpaid |
| `past_due_urgent` | Past due beyond policy / broker terms |
| `on_hold` | Invoice `status === hold` |
| `disputed` | Open invoice or payment dispute |
| `will_pay_set` | `collection_status === W/P` with date |
| `will_pay_missed` | Will Pay date + `willPayMissedDays` passed, unpaid |
| `callback_due` | `C/B` date reached |
| `days_since_last_inquiry >= n` | Follow-up clock |
| `amount_gte` / `amount_lt` | Invoice total thresholds |
| `aging_bucket` | Current / 1–30 / 31–60 / 61–90 / 90+ |

**Broker**

| Id | True when |
|---|---|
| `preferred_contact` | `email` / `phone` / `portal` / `factor` |
| `accepts_packet_email` | Broker allows PPW by email |
| `pay_rating` | green / yellow / red (and optional AI risk medium/high) |
| `slow_confirm` | Broker `paperwork_status_check_days` ≥ 10 (example) |
| `factoring_on_file` | Client/broker NOA path |
| `do_not_email` | Suppression list / broker note flag |

**Reply / ops (after Inbox classification)**

| Id | True when |
|---|---|
| `no_reply` | Inquiry sent, no classified reply |
| `reply_missing_docs` | Broker asked for docs |
| `reply_claim` | Claim / cargo / OS&D language |
| `reply_will_pay` | Promise date extracted |
| `reply_short_pay` | Short-pay / deduction |
| `reply_already_paid` | Broker says paid — route to remittance match, **do not** keep dunning |

**Else** is mandatory on every `if` node so the graph cannot silently drop an invoice.

### 3.4 Action catalog (then)

| Id | What Credyx does | Auto-send allowed? |
|---|---|---|
| `send_email` | Queue template (`broker_paperwork_status_inquiry`, `_followup`, payment twins, custom) | Flag on node; default **off** |
| `draft_email` | Same templates; staff must Send | Always queued |
| `create_call_task` | Collections needs-attention / call broker | n/a |
| `portal_check_task` | “Check broker portal” (human until portal automation exists) | n/a |
| `notify_carrier` | Carrier hold / claim / missing-doc notice | Usually on (carrier is our client) |
| `set_hold` | Staff-confirm path only — never auto from a guess | **Never** auto |
| `set_will_pay` | Only after classified promise | Staff confirm in v1 |
| `escalate_staff` | `collections_needs_attention = true` | n/a |
| `pause_chase` | Hard pause + reason | n/a |
| `log_note` | Invoice note, no outbound | on |

Reuse existing templates in `src/config/emailTemplateDefaults.ts` and `src/config/emailLifecycle.ts`. New copy is new template ids, not hardcoded strings in the graph.

### 3.5 Example graphs (how if/else actually reads)

**A. Portal-only broker (else email)**

```
IF preferred_contact = portal
  THEN portal_check_task
  WAIT 3 days
  IF no_reply THEN portal_check_task ELSE stop_this_step
ELSE
  IF accepts_packet_email
    THEN draft_email paperwork_inquiry
  ELSE
    create_call_task
```

**B. After first inquiry (today’s follow-up clock)**

```
WAIT followupAfterDays
IF reply_missing_docs THEN notify_carrier + pause_chase (resume: docs uploaded)
ELSE IF reply_claim THEN notify_carrier + pause_chase + escalate_staff
ELSE IF reply_will_pay THEN set_will_pay (staff confirm) + WAIT until that date
ELSE IF no_reply THEN draft_email paperwork_followup
ELSE log_note (unclassified reply) + escalate_staff
```

**C. Will Pay miss**

```
IF will_pay_missed
  THEN create_call_task + escalate_staff
  ELSE IF will_pay_set AND today < will_pay_date
    THEN wait until will_pay_date (no extra dunning)
```

**D. Do not chase while on hold**

```
IF on_hold OR disputed OR reply_claim
  THEN pause_chase
ELSE
  continue payment track
```

These four replace most “tribal knowledge” that currently lives in Settings numbers and staff memory.

### 3.6 Preview (required before auto-send)

Staff opens invoice or broker → **Preview blueprint**. Read-only:

- Current node and wait
- Each `if` predicate: true/false + the field values used
- Next action that *would* enqueue
- Why other branches were not taken

No drafts, no emails, no status changes. Same idea as a dry-run of collections policy, but per graph.

---

## 4. Default blueprints to ship (so day one is not a blank canvas)

| Key | Name | Encodes |
|---|---|---|
| `credyx_standard` | Credyx Standard Chase | Current paperwork then payment tracks + 3 / 5 day clocks |
| `credyx_portal_first` | Portal first | Portal task before email |
| `credyx_call_only` | Phone / high-touch | No auto email; call tasks only (red / do-not-email brokers) |
| `credyx_hold_claim` | Hold & claim | Pause outbound; carrier notify; staff intake questions from `docs/claims/07-ops-playbook.md` |

Platform defaults are **read-only**. Ops clones to a client- or broker-specific blueprint to edit.

Map today’s fields into Standard Chase so behavior does not change on rollout:

- `broker.paperwork_status_check_days` / `COLLECTIONS_POLICY.defaultPaperworkCheckDays`
- Net terms / `defaultInquiryDays`
- `followupAfterDays`, `needsAttentionAfterDays`
- Email rule enable flags (`isEmailLifecycleRuleEnabled`)
- Urgent flags (Will Pay miss, callback, no PPW, risky broker)

After rollout, those Settings become **defaults inside the Standard graph**, not a second competing engine.

---

## 5. Data model (target)

TypeScript + Supabase. Mock store first if needed; same shapes.

```ts
/** One reusable graph. */
export interface FollowupBlueprint {
  id: string
  client_id: string | null // null = platform
  name: string
  description: string
  is_platform_default: boolean
  track: 'paperwork' | 'payment' | 'both'
  graph: BlueprintGraph // JSON: nodes + edges
  created_by: string
  updated_at: string
}

export interface BlueprintGraph {
  start_node_id: string
  nodes: BlueprintNode[]
}

export type BlueprintNode =
  | { id: string; type: 'trigger'; trigger: string; next: string }
  | { id: string; type: 'if'; branches: { when: Predicate[]; next: string }[]; else: string }
  | { id: string; type: 'wait'; until: WaitSpec; next: string }
  | { id: string; type: 'action'; action: ActionSpec; next: string }
  | { id: string; type: 'pause'; resume_on: string[]; next: string }
  | { id: string; type: 'goto'; target: string }
  | { id: string; type: 'stop' }

export interface Predicate {
  id: string // catalog id
  op?: 'eq' | 'neq' | 'gte' | 'lt' | 'in'
  value?: string | number | boolean
}

export interface BlueprintRun {
  id: string
  invoice_id: string
  blueprint_id: string
  current_node_id: string
  entered_at: string
  wait_until: string | null
  paused: boolean
  pause_reason: string | null
  last_evaluation_at: string
}
```

**Pointers on existing rows**

- `brokers.blueprint_id`
- `invoices.blueprint_id` (nullable override)
- `clients.default_blueprint_id`
- Keep `collections_last_inquiry_at`, `collections_followup_at`, `collections_needs_attention` — actions still write them so Collections UI and calendar keep working.

**Tables (Supabase)**

- `followup_blueprints`
- `followup_blueprint_runs`
- `followup_blueprint_events` (audit: evaluation + action outcomes)

RLS: admin full; carrier read own client blueprints + runs for their invoices; carrier write only if Self-Service capability `canEditBlueprints`.

---

## 6. UI (admin first)

### 6.1 Blueprint builder — Admin → Settings or Collections → Blueprints

Left: node list / simple canvas (keep v1 as **structured rows**, not a fancy infinite canvas).

Each `if` row:

```
IF   [predicate ▾] [op] [value]     →  [action or wait ▾]
ELSE IF ...
ELSE → ...
```

Validation before save:

- Every `if` has `else`
- No unreachable nodes
- No cycles unless `goto` to a wait (engine max-steps still applies)
- Payment actions cannot sit on the paperwork subgraph without `paperwork_good`
- `set_hold` / claim actions cannot be `auto_send`

### 6.2 Broker panel

Existing broker detail: **Follow-up blueprint** select (Standard / Portal first / Call only / custom). Show a one-line summary of the current node for open invoices with that broker.

### 6.3 Collections workspace

On an invoice row: current node, next wait, **Preview**, **Run next step** (Managed staff). “Run next step” executes one action node only (no full graph sprint).

### 6.4 Carrier portal (later)

Self-Service: read-only timeline first (“Credyx next step: paperwork follow-up on Wed”). Edit builder only behind `canEditBlueprints`. Managed: no editor; banner that Credyx runs follow-up.

---

## 7. Who may do what

| Capability | Managed | Self-Service |
|---|---|---|
| Use platform templates | yes (Credyx) | yes (read) |
| Edit client/broker graphs | Credyx admin | later, `canEditBlueprints` |
| Auto-send broker email | Credyx policy per client | carrier opt-in |
| Pause / resume | Credyx | carrier + Credyx |
| Preview | both | both |

Engine must call `assertCapability` for carrier-initiated sends. Managed clients must not get a DIY chase UI that contradicts “Credyx handles follow-up.”

---

## 8. Implementation phases

### Phase 0 — Spec freeze (this doc)

Agree predicate + action catalogs. No new UI.

### Phase 1 — Engine behind the current ladder

- Persist `FollowupBlueprint` JSON for **Credyx Standard Chase** only.
- `evaluateBlueprint(invoice)` returns the **same** `ChaseQueueStatus` as `getChaseStatus` today.
- Dual-run in tests: chase util vs blueprint engine, assert equal on fixtures in `collectionsTrack.test.ts` / chase tests.
- **Do not** switch production sends until parity is green.

### Phase 2 — Assign + preview

- `brokers.blueprint_id`
- Admin preview panel
- Clone Standard → Portal first / Call only
- Collections shows current node

### Phase 3 — Execute actions from the graph

- Queue `draft_email` / call tasks from nodes
- Deprecate parallel “send follow-up” special cases once every template is an action id
- Audit log in invoice notes

### Phase 4 — Auto-send (opt-in)

- Per-node `auto_send` + client allowlist
- Still skip `do_not_email`, holds, claims, `reply_already_paid`
- Preview required in UI before enabling auto-send on a broker

### Phase 5 — Carrier editor (Self-Service only)

- Simplified if/else (no raw JSON)
- Managed stays Credyx-operated

Out of scope until later: logging into broker portals, voice agent, LLM choosing branches (LLM may **classify replies** into predicate ids — it must not pick the `else` path by vibes).

---

## 9. Files to touch (when building)

| Area | Path |
|---|---|
| Chase today | `src/utils/collectionsChase.ts`, `collectionsTrack.ts`, `collectionsPolicy.ts`, `nextBrokerFollowup.ts` |
| Email clocks | `src/config/emailLifecycle.ts`, `emailTemplateDefaults.ts` |
| UI chase | `src/pages/Collections.tsx`, `src/components/collections/*` |
| Broker | `src/types/broker.ts`, broker detail panel |
| Settings | `src/pages/Settings.tsx`, `EmailWorkflowSettingsPanel.tsx` |
| Calendar | `src/utils/deriveAdminCalendarEvents.ts` |
| New | `src/utils/followupBlueprints/` (catalog, evaluate, preview, parity tests) |
| New | `src/pages/AdminFollowupBlueprints.tsx` (builder) |

---

## 10. Tests (required)

1. **Parity:** Standard Chase ≡ current `getChaseStatus` + follow-up clock on fixture invoices (no PPW, ppw_waiting, ppw_check, payment_waiting, payment_verify, past_due, will_pay, hold).
2. **If/else:** portal vs email branch; missing-docs pause; claim pause; already-paid does not send follow-up.
3. **Wait:** do not fire action before `wait_until`.
4. **Terminal:** paid / written off / force_closed → stop.
5. **Preview:** evaluate with `dryRun: true` writes zero invoices and zero emails.
6. **Cycles:** `goto` loop hits max-steps and escalates staff instead of hanging the job.
7. **Capability:** Self-Service send vs Managed blocked from carrier DIY send.

---

## 11. Success

- Ops can attach **Portal first** vs **Call only** on a broker without a code change.
- A new hire can read the graph and know why an invoice was not emailed.
- Managed carriers still do not configure chase; they see status.
- Self-Service can later own the same graphs.
- Collections Settings numbers become labels on Standard Chase, not a second brain.

---

## 12. Related

- Invoice tracks: [`docs/INVOICE_LIFECYCLE.md`](../INVOICE_LIFECYCLE.md) §7
- Claim intake language: [`docs/claims/07-ops-playbook.md`](../claims/07-ops-playbook.md)
- Invoice Manager calendar (consumes next-node dates): [`docs/credyx-ai-ops-plan.md`](../credyx-ai-ops-plan.md)
- Authorization to contact brokers: [`docs/legal/AUTHORIZATION_TO_ACT.md`](../legal/AUTHORIZATION_TO_ACT.md)
- Email rules: `src/config/emailLifecycle.ts`
