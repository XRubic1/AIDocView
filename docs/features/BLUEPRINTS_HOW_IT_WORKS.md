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

### Example handoff

| What happened | Hold reminder run | Paperwork status run |
| --- | --- | --- |
| Placed on hold | Start / continue | — |
| Hold cleared, good to go, **PPW sent** | **Stop** | **Start** (new enrollment) |
| Still waiting on hold clock when PPW sends | **Stop** | **Start** |

---

## 5. Wait clocks and “what happens next”

### Wait

When a run hits **Wait until**:

1. Runner stores **wake at** (e.g. today + 5 days).  
2. Status = **Waiting**.  
3. Cron / scheduler wakes runs whose time has passed.  
4. Run advances to the next card.

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
| Graph editor, filters, Wait / When / Then do | Supabase tables for blueprints & runs |
| Dry-run log | Then-do broker/carrier **emails** (still old chase) |
| Activity list + enrollments (localStorage) | Server cron for Wait clocks |
| Per-invoice Blueprints tab (assign + preview) | Disabling email-lifecycle when a blueprint is assigned |
| **Live runner (flag off by default)** — notes & status only | Auto-match on *every* UI action (expand events over time) |
| Hold / release / PPW / purchase hooks | |
| **Phase 2 auto-match** — event picks best blueprint + assigns | |
| **Run blueprints** (Inbox + Activity) — separate from **Run chase** | |

### Phase 1–2 live runner

- Toggle **Live runner** on Admin → Blueprints (default **off**).
- Then-do → `addAdminInvoiceNote` / `postInvoiceStatusNote` + `(Blueprint: …)`. Chase emails stay on **Run chase**.
- **Phase 2:** place on hold / send PPW / invoice purchased / hold cleared → find matching Start (or keep staff assignment if it still matches) → assign + enroll. **Priority** (editor toolbar) decides the winner when several match — higher number wins.
- Prefer more specific matches (e.g. hold-only / When · On hold over a broad chase).
- Storage remains **browser localStorage** until Supabase tables land.

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
