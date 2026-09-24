# Credyx Blueprints — how they work

> Product model for chase automation (A/R follow-up).  
> **UI:** graph editor, Activity tab, per-invoice Blueprints tab.  
> **Live runner:** optional flag — enroll/Wait/When + Then-do via **notes/status only**.  
> **Phase 2:** auto-match on hold / PPW / purchase (no pre-assign required). Old email-lifecycle chase unchanged.  
> Related older spec: [`08-broker-followup-blueprints.md`](./08-broker-followup-blueprints.md)

Credyx is **A/R + back office for carriers**, not factoring. Blueprint language stays: follow up, resolve holds, keep the carrier informed, **paid on time** — never “get paid faster.”

---

## 1. What a blueprint is

A **blueprint** is a shared recipe (graph), not a copy glued onto every invoice.

| Piece | Role |
| --- | --- |
| **Blueprint** | Named graph you edit once (Start → Wait / When → Then do → Done) |
| **Enrollment (run)** | One invoice (or broker) mid-flow: current step, wake time, status |
| **Activity tab** | List of all runs (waiting / active / paused / completed / stopped) |
| **Invoice → Blueprints tab** | This invoice’s assignment, health, current step, what’s next after wake |

An invoice does **not** store the full canvas. It stores (or will store) a **pointer**: which blueprint, which step, when to wake.

---

## 2. Graph building blocks

| Card | Meaning |
| --- | --- |
| **Start with** | Who can enter + how they enter |
| **Wait until** | Clock pause (e.g. wait 5 days, Net + late, after last email) |
| **When** | Check an event; **Match when True/False** switch (e.g. on hold ↔ removed from hold) |
| **Then do** | Work: notify carrier, email broker, note, staff task, … |
| **Done** | End this enrollment |

Connect cards left → right. One clear path (or When branches) is enough.

### Connection rules

The editor only allows links that make sense for the runner:

| From | May connect to |
| --- | --- |
| **Start with** | Wait until, When, Then do, Done |
| **Wait until** | Wait until, When, Then do, Done |
| **When** | Wait until, When, Then do, Done, True, False |
| **Then do** | Wait until, When, Then do, Done |
| **Done** | *(nothing)* |

Also: cards on a **Brokers** Start cannot link to invoice-only Wait / When / Then options (and the reverse). Same for **Batches**. Shared options (e.g. simple pause) are fine either way.

Right-click **Add a step** grays out kinds the **selected** card cannot accept. Deselect (click empty canvas) to place a free-standing card.

### Invoice progress (product) vs chase steps

Credyx invoice lifecycle is **not** “Delivered → Verified → Submitted → Paid.”  
Chase blueprints sit on top of A/R states such as pending / review / approved / **hold** / unpaid, and events like **PPW sent**.

---

## 3. How invoices enter a blueprint (Start with)

There are **two entry modes**. Filters on Start are always a **gate** (who qualifies).

### A. Match filters

> “Find invoices that **already look like this**.”

Use for scheduled / aging chase, e.g.:

- Still unpaid  
- Status: Pending / Approved  
- Days past due ≥ 7  

Then: Wait → Then do → Done.

Credyx (future runner) scans or indexes records that match; it does **not** mean “something just happened.”

### B. When an event happens

> “Wake when Credyx **updates** the invoice (or broker) in a way that matches.”

Use for state changes, e.g.:

- Invoice went on hold  
- Paperwork (PPW) sent to broker  
- Hold cleared / good to go  
- Broker replied  
- Invoice paid  

Filters below Start still narrow who qualifies (e.g. unpaid only).

**This is the main door for “invoice updated → find matching blueprint → enroll.”**

---

## 4. Runtime: invoice updates drive enrollment

Intended loop when an invoice changes (status, PPW sent, hold, paid, …):

```
Invoice updated
    → Stop / pause any active run that no longer fits
    → Find active blueprints whose Start matches this update
         (entry = event + gates, or match-filters on a scheduled tick)
    → Enroll this invoice on the matching blueprint (new run)
    → Advance until Wait, When (blocked), Pause, or Done
```

Rules of thumb:

- **One active chase run per invoice** (or explicit handoff: stop A, start B).
- Do **not** leave a hold reminder waiting after the invoice is good and PPW is out.
- **Match filters** blueprints also enroll from a **clock job** (daily/hourly), not only from events.

### Realtime assignment (Live runner on)

When **Live runner** is enabled:

1. **All open invoices** are assigned to the best-matching blueprint on admin hydrate and when you turn Live runner on.
2. **Status changes** (and realtime merges) re-sync assignment and wake any parked **When**.
3. Event hooks still apply: hold / hold cleared / PPW / purchase.
4. **`broker.created`** — adding a broker enrolls matching **broker** blueprints (e.g. New broker onboarding → urgent review + note).
5. **Broker Then-do risk marks** — `mark_good` / `mark_review` / `mark_bad` clear, flag, or publish real risk profiles (+ Risk Audit).
6. **`payment.posted`** — confirmed payments wake parked Payment Whens / enroll payment blueprints.
7. Unmatched **When** cards always **park** until the condition is true (every blueprint — not hold-only).
8. Enrollment always starts at **Start** and advances into Wait / When / Then-do (never jumps over a When to a Wait).

Then-do still writes **notes/status** (invoices) or **broker notes + risk decisions + admin alerts** (brokers); chase emails stay on the old path.

Domain events go through `emitCredyxEvent` (`src/services/credyxEvents.ts`).

### Example handoff

| What happened | Hold reminder run | Paperwork status run |
| --- | --- | --- |
| Placed on hold | Start / continue | — |
| Hold cleared, good to go, **PPW sent** | **Stop** | **Start** (new enrollment) |
| Still waiting on hold clock when PPW sends | **Stop** | **Start** |

---

## 5. Wait clocks and “what happens next”

### Wait

When a run hits **Wait until**, the runner resolves an **absolute wake time** from the card’s catalog option (`waitUntilId`) and day count `D` — not always “today + D.”

| Catalog id | Subject | Wake formula |
| --- | --- | --- |
| `pause_days` | Invoice / Broker / Batch | Now + `D` @ 09:00 local (step pause) |
| `net_plus_late` | Invoice | `invoice_date` + broker Net terms + `D` |
| `due_plus_late` | Invoice | Effective due date + `D` |
| `after_last_email` | Invoice | Last chase email + `D`; if no chase yet → same as `pause_days` from this step |
| `no_payments_for` | Broker | Last confirmed payment + `D` (or broker created / step pause if never paid) |
| `avg_pay_late` | Broker | **Gate**, not a calendar clock: if avg days late ≥ `D` → wake now; else soft-poll tomorrow @ 09:00 |

Then:

1. Runner stores **wake at** (`waitUntil` ISO) and a short detail line in the run log.  
2. Status = **Waiting**.  
3. Cron / scheduler (`blueprint-wake-cron`) or **Run blueprints** wakes runs whose time has passed (or the gate re-checks on soft poll).  
4. Run advances to the next card.

If the computed wake is already past, `waitUntil` is clamped to now so the next advance can continue.

The Wait itself does **not** re-check “still on hold.” That check belongs on a **When** (or Start gate) after the Wait.

### After wake + When

Example **Invoice hold** reminder:

```
Start (event)
  → When: On hold · Match when · Removed from hold
  → Then do: note
  → Done
```

On the When card, use **Match when · True / False** (for On hold: **Went on hold** ↔ **Removed from hold**). Clearing hold auto-enrolls blueprints with “Removed from hold.” Separate True/False cards are legacy — prefer the switch.

After a Wait, **When “on hold”** (True) still means **current status is hold**. **Removed from hold** (False) means status is no longer hold.

### What’s next in the UI

On the invoice **Blueprints** tab, **After wake — what happens next** lists the cards that follow the current Wait (Then do, When branches, Done), read from the assigned graph.

---

## 6. Two example blueprints

### Hold reminder (carrier)

| Step | Setup |
| --- | --- |
| Start | Match filters **or** event; status **On hold**; still unpaid |
| Wait | Just wait **X** days |
| When | Still on hold |
| Then do | Notify the carrier (+ optional note) |
| Done | — |

### Paperwork status (broker)

| Step | Setup |
| --- | --- |
| Start | **When an event happens**: PPW / paperwork sent; still unpaid |
| Wait | Just wait **X** days (confirm window) |
| When (optional) | Still unpaid / paperwork not confirmed |
| Then do | Email broker paperwork status |
| Done | — |

Same shape; different Start event and Then-do target (carrier vs broker).

---

## 7. Run statuses

| Status | Meaning |
| --- | --- |
| **Waiting** | Paused on a Wait clock; wake time set |
| **Active** | On a Then-do (or advancing) |
| **Paused** | Hard stop (claim, stop-chase, missing packet) until resume |
| **Completed** | Reached Done successfully |
| **Stopped** | Ended early (paid, force-closed, superseded by another track) |

**Health** on the invoice tab (simplified):

- On track — waiting or in progress as designed  
- Needs attention — paused  
- Assigned · not running — blueprint chosen, no enrollment yet  
- Not assigned — no blueprint / no run  

---

## 8. Where staff see it

| Place | What you see |
| --- | --- |
| **Admin → Blueprints → Editor** | Build / save graphs |
| **Admin → Blueprints → Activity** | All enrollments (demo list today) |
| **Admin → Invoice → Blueprints** | Assignment, status, wake time, steps after wake |
| **Dry Run** (Editor) | Simulate a path; does not enroll real invoices |

---

## 9. What is built vs not

| Built | Not built yet |
| --- | --- |
| Graph editor, filters, Wait / When / Then do | Expanding more domain events over time |
| Dry-run log | Live broker replied / no reply When (inbound capture ships first) |
| Activity list + enrollments (**Supabase** + local write-through cache) | |
| Per-invoice Blueprints tab (assign + preview) | |
| **Live runner (flag off by default)** — notes/status + Then-do emails | |
| Hold / release / PPW / purchase hooks | |
| **Phase 2 auto-match** — event picks best blueprint + assigns | |
| **`broker.created` + broker runner** — new broker onboarding | |
| **`batch.processed` + batch runner** — admin alerts + carrier Process email Then-do | |
| **Run blueprints** (Inbox + Activity) — uses server wake when Supabase is configured | |
| **Skip old payment chase** when Live + assigned blueprint has payment/follow-up Then-do | |
| **Supabase tables** — `blueprints`, `blueprint_runs`, subject assignments (admin RLS) | |
| **Server Wake cron** — `blueprint-wake-cron` advances due Waits (schedule + manual Run blueprints) | |
| **Inbound email** — Resend Receiving → `email-inbound` → Inbox Received / Needs review | |

### Phase 1–2 live runner

- Toggle **Live runner** on Admin → Blueprints (default **off**).
- Then-do → notes/status **and** broker payment / carrier notify emails when Live runner is on (Settings lifecycle toggles still apply).
- **Double-chase guard:** if Live runner is on and the invoice’s assigned blueprint includes Then-do `email_payment_status` or `email_followup`, **Run chase** / email-lifecycle cron **skip the payment track** for that invoice (paperwork track still runs). Hold/note-only blueprints do not skip. Assign stamps `email_lifecycle.blueprint_owns_chase` for the server cron.
- **Phase 2:** place on hold / send PPW / invoice purchased / hold cleared → find matching Start (or keep staff assignment if it still matches) → assign + enroll. **Priority** (editor toolbar) decides the winner when several match — higher number wins.
- Prefer more specific matches (e.g. hold-only / When · On hold over a broad chase).
- **Batches:** Process (`verification` → `submitted`) emits `batch.processed` → **Batch processed notice** seed (carrier email Then-do + admin alerts). When Live runner is on and that graph includes `email_carrier_batch_processed`, Settings · Email sends (`batch_processed_carrier`) is skipped so Process does not double-email. Live off → Settings send as before.
- **Storage:** graphs, runs, and assignments upsert to Supabase on write; admin session hydrate loads them into the local cache. Empty `blueprints` table seeds demo graphs once.
- **Wait wake:** schedule Edge Function `blueprint-wake-cron` (every 15–60 min, `OPS_CRON_SECRET`) so due Waits advance without a tab open. Inbox / Activity **Run blueprints** calls the same function when Supabase is configured (admin JWT); otherwise ticks locally (invoice + broker + batch).
- **Inbound broker mail:** Test with `system@credyx.net` (Cloudflare Email Routing → Resend Receiving → `email-inbound`) so `billing@` Gmail stays untouched. Later same pattern for `billing@`. Admin Inbox **Received** lists inbound mail; **Needs review** confirms/classifies. Blueprint When · broker replied still next.

---

## 10. Design checklist (authoring)

1. One job per blueprint (hold reminder **or** paperwork status — not both).  
2. Prefer **When an event happens** for status / PPW changes; **Match filters** for aging chase.  
3. After Wait, use **When** if the next action only makes sense if the state is still true.  
4. On conflicting updates (hold → good + PPW sent), plan **stop old run → start new blueprint**.  
5. Then-do tasks must be set up (template / channel) or the card fails dry-run.  
6. Copy: **paid on time**, never paid faster / factoring.

---

## 11. Mental model (one line)

**Invoice updates → Credyx finds a blueprint whose Start matches → enrolls the invoice → Wait clocks and When gates advance the run → Then-do does the work → Done (or Stop if the world moved on).**
