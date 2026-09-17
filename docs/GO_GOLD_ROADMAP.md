# Credyx — Going Gold: Status, Roadmap & First Clients

**As of:** 2026-09-17  
**Audience:** founders / ops  
**Related:** `docs/FIXES_REQUIRED.md`, `docs/APP_STATUS_AUDIT.md`, `docs/legal/FEE_SCHEDULE.md`, `docs/credyx-ai-ops-plan.md`

---

## 1. How far are we from “gold”?

**Short answer:** ~80–85% of the *product* for a first managed carrier is built. We are **not gold yet** because production ops (email, RLS confirmation, cron, secrets, legal pack on a live account) still decide whether a real carrier can run safely.

| Layer | Status | Rough % |
| --- | --- | --- |
| Core A/R workflow (docs → verify → PPW → pay → bill) | Built | ~90% |
| Admin + client portals | Built | ~90% |
| Collections / chase / calendar / inbox | Built (chase cron may be manual) | ~80% |
| Auth + tenant model | Built (confirm RLS live) | ~85% |
| Production email (Resend + domain) | Ops / config | ~40% if unset |
| Scheduled automation (chase, AI drain) | Edge exists; schedule TBD | ~50% |
| AI spend caps / Payoneer | Partial / stub | ~30% |
| Claims / fraud *product* modules | Docs only | Out of gold scope |
| Full AI ops (Risk Manager Phases 1–5) | Roadmap | Out of gold scope |

**Gold =** a real carrier can enroll, submit paperwork, get PPW sent, see status, get payments posted, and receive a correct Credyx bill — with **real email**, **tenant isolation**, and **no stub “delivered” sends**.

**Not required for gold:** full AI assistant, claims productization, BrokerSnapshot weekly recompute polish, self-service tier completeness.

---

## 2. What already works (shipped)

- Multi-tenant admin + client portals (batches, invoices, brokers, payments, billing, calendar, users)
- Batch / packets / AI verification → Process batch
- PPW send with attachments (when Resend is configured)
- Payment posting, write-offs, corrections
- Collections queue (client-grouped), chase timestamps, urgency / broker risk, manual right-click chase
- Inbox (outbound log + resend) + inbound edge function (needs webhook)
- A/R billing math ($99 platform + % of confirmed collections per fee terms)
- Waitlist / marketing surface + legal drafts (MSA, fee schedule, auth to act)
- Supabase persistence, edge functions, CI

---

## 3. Next steps to complete (before / at gold)

### P0 — Block real money / real clients

1. **Confirm production RLS** applied on the live Supabase project (esp. `credyx_rls_production` and later migrations).
2. **Deploy edge functions + secrets:** `send-email`, `openai-proxy`, `provision-client-auth`, `batch-ai-process`, `email-lifecycle-chase`, `email-inbound`.
3. **Resend:** API key, verified sending domain, no stub mode. Prove invite + PPW + chase land in real inboxes.
4. **Smoke path on a seeded/demo client:** enroll → invite → password → batch → verify → Process (PPW) → post payment → monthly bill.
5. **Commercial pack for client #1:** signed MSA + Fee Schedule, fee_terms on the client row, Authorization to Act / broker notice as needed.

### P1 — Needed as soon as volume starts

6. Schedule **email-lifecycle-chase** cron (or keep Inbox “Run chase” as temporary ops process).
7. Wire **inbound** Resend webhook → Inbox review.
8. **OpenAI spend / rate caps** on `openai-proxy`.
9. Decide **Payoneer:** replace stub or request payments manually outside the app for v1.
10. Optional: billing/dunning reminder emails; hide Aging/Accounting stubs that look clickable but no-op.

### P2 — After first clients are stable

11. AI ops Phases 0→1+ (`docs/credyx-ai-ops-plan.md`) — broker risk weekly job, invoice plan sync.
12. Claims / fraud as in-app modules (today: playbooks in `docs/claims`, `docs/fraud`).
13. Assistant live answers (still mock in places).
14. Self-service polish, `ar_rate_override` UI, marketing site iteration.

---

## 4. Roadmap (high level)

```
NOW ──► GOLD (first clients) ──► STABLE OPS ──► SCALE
 │              │                     │            │
 │              │                     │            └─ AI Risk / Invoice Manager
 │              │                     │               Claims product, Assistant
 │              │                     └─ Cron chase, inbound mail,
 │              │                        spend caps, Payoneer or process
 │              └─ Resend + RLS + smoke + MSA/fees
 └─ Product largely ready (portals, PPW, AR, collections)
```

| Phase | When (estimate) | Goal |
| --- | --- | --- |
| **Gold gate** | 1–3 weeks of focused ops | First real client can run the full A/R loop safely |
| **Pilot** | Month 1–2 after gold | 1–3 carriers; manual chase OK; learn cycle times |
| **Stable ops** | Month 2–4 | Cron chase + inbound; billing reminders; tighten AI cost |
| **Scale features** | Month 4+ | AI risk weekly, richer calendar automation, claims tooling |

Estimates assume founder bandwidth on ops/config, not net-new product builds.

---

## 5. When can we start onboarding the first clients?

| Scenario | Earliest | Condition |
| --- | --- | --- |
| **Soft pilot (friendly carrier)** | **As soon as P0 #1–5 are done** — realistically **1–3 weeks** from a dedicated ops push | Resend works; RLS confirmed; MSA signed; fees set; smoke path green |
| **“Gold” public onboarding** | Soft pilot + **2–4 weeks** of live feedback | Chase process reliable (cron or daily Run chase); no stub emails; billing issues once |
| **Broader waitlist conversion** | After 1–2 pilots pay a first bill without drama | Marketing + capacity to process PPW |

**Recommendation:** Do **not** wait for full AI ops or claims product. Start **one friendly managed carrier** the week P0 is green. Use trial (`fee_terms` / trial status) if needed, then convert to agreed rates.

**Ops capacity check:** each managed client needs Credyx time for verify/PPW/chase. First clients should be small fleets until chase automation is scheduled.

---

## 6. Projections — clients, income, costs (worst case)

> **Assumptions, not forecasts.** Figures are USD, monthly, illustrative.  
> Revenue model from `docs/legal/FEE_SCHEDULE.md`: optional **$99** platform fee + **% of confirmed collections** (e.g. **1.25%** under $100k collected / month).  
> Credyx does **not** take broker freight — only fees the carrier pays Credyx.

### 6.1 Client acquisition (conservative)

| Month after gold | Paying clients (worst) | Notes |
| --- | --- | --- |
| 0–1 | 0–1 | Soft pilot; may still be on trial ($0 fee) |
| 2–3 | 1–2 | One conversion; slow referrals |
| 4–6 | 2–4 | Still founder-led sales; capacity-limited |

Worst case is **slow sales + one stuck pilot**, not zero product value.

### 6.2 Monthly income — worst case

Assume **agreed** $99 + **1.25%** of confirmed collections (small carrier tier).

| Scenario | Clients | Collections / client / mo | Credyx revenue / mo |
| --- | --- | --- | --- |
| **W0 — Trial only** | 1 | any | **$0** (fees waived) |
| **W1 — Tiny paying** | 1 | $15,000 | $99 + $187.50 ≈ **$287** |
| **W2 — Small paying** | 1 | $40,000 | $99 + $500 ≈ **$599** |
| **W3 — Two small** | 2 | $25,000 each | 2×($99 + $312.50) ≈ **$823** |

**Worst realistic paying month after conversion:** roughly **$250–$600 / month** with a single small carrier.  
**Worst with only trials:** **$0 revenue** until conversion — plan cash for that.

Upside (not worst case): one mid carrier collecting **$100k+/mo** at ~1.0–1.25% → **~$1k–$1.3k** + $99, before multiple accounts.

### 6.3 Monthly costs — worst case (lean stack)

| Cost | Low | Worst lean | Notes |
| --- | --- | --- | --- |
| Supabase | $25 | $75–$150 | Pro + usage / storage |
| Resend / email | $0–20 | $40–$80 | Volume + domain |
| OpenAI (DocSort / AI verify) | $50 | **$200–$500** | Spikes with batch volume; **cap ASAP** |
| Hosting / domain / misc | $10 | $30 | Vite/static + DNS |
| BrokerSnapshot / data | $0 | $50–$100 | If paid tier used |
| Banking / tools / misc | $20 | $50 | Accounting, etc. |
| **Total software (no salaries)** | ~$100 | **~$450–$900** | |
| Founder / ops time | — | High | Biggest real cost early |

**Worst case cash burn (software only):** about **$500–$900 / month** if AI is uncapped and usage is messy.  
**With spend caps + light volume:** aim for **~$150–$350 / month**.

### 6.4 Worst-case monthly P&L sketch

| | Trial month | First paying (tiny) | Two small clients |
| --- | --- | --- | --- |
| Revenue | $0 | ~$287 | ~$823 |
| Software costs | $300–$600 | $300–$700 | $400–$900 |
| **Contribution (ex-salary)** | **−$300 to −$600** | **−$400 to −$50** | **≈ −$80 to +$400** |

**Takeaway:** Early months can be **break-even or slightly negative on software alone** until **2+ paying clients** or **higher collected volume**. Gold is about **proof and process**, not immediate profit. Profitability improves when (a) pilots convert off trial, (b) AI spend is capped, (c) chase is semi-automated so you can take more carriers without linear headcount.

---

## 7. Definition of done — “we are gold”

- [ ] Live RLS verified (no anon bypass on tenant data)
- [ ] Resend production; invite + PPW + chase are real emails
- [ ] Edge functions deployed with secrets; openai via proxy only
- [ ] End-to-end smoke path documented and re-runnable
- [ ] Client #1 MSA + fee_terms stored; first bill computable
- [ ] Written ops play: who runs chase daily until cron is on
- [ ] OpenAI spend cap in place (or hard monthly budget monitored)

When those boxes are checked, **start onboarding**. Everything else is roadmap, not a gate.

---

## 8. Suggested next 14-day checklist

### Week 1 — plain English

| Checklist item | What it means |
| --- | --- |
| **RLS audit** | Row Level Security: Supabase rules that stop Client A from reading Client B's data (and stop the public anon key from reading everything). "Audit" = open the live project, confirm the production RLS migrations are applied, and spot-check that a non-admin JWT cannot select another tenant's invoices. |
| **Deploy functions/secrets** | Push Edge Functions (`send-email`, `openai-proxy`, `provision-client-auth`, `batch-ai-process`, `email-lifecycle-chase`, `email-inbound`, …) to Supabase and set secrets there: `RESEND_API_KEY`, `RESEND_FROM_BROKER` / `_CARRIER` / `_EMAIL`, `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPS_CRON_SECRET`, etc. Without this, email stubs and AI proxy won't work in production. |
| **Resend domain** | In Resend → Domains, verify **credyx.net** (DNS DKIM/SPF). Only then can you send as `billing@credyx.net` / `ops@credyx.net`. Until verified, Resend rejects those From addresses. |
| **Invite smoke** | End-to-end test: approve/enroll a test carrier → they get a real invite email → set password → log into the client portal. If that fails, onboarding is blocked. |

**Week 1 flow:** RLS audit → deploy functions/secrets → Resend domain → invite smoke  
**Week 2:** Full A/R smoke → MSA/fees for pilot carrier → schedule chase cron or daily Run chase ritual → turn on spend monitoring → invite first friendly client

See also **Settings → Addresses** for which mailbox should send which email.

---

*This doc should be updated when P0 items close or fee assumptions change. Prefer* `docs/FIXES_REQUIRED.md` *for engineering checkbox detail.*
