# Credyx — App Futures & Roadmap

**As of:** 2026-09-20  
**Audience:** founders / product  
**Purpose:** Longer-horizon features beyond “go gold.” Not a commit to build order — a living backlog.

**Related**

- Near-term launch / first clients → [`GO_GOLD_ROADMAP.md`](./GO_GOLD_ROADMAP.md)
- AI Risk / Invoice Manager / Assistant → [`credyx-ai-ops-plan.md`](./credyx-ai-ops-plan.md)
- Tier specs → [`features/README.md`](./features/README.md)
- Gaps / fixes → [`FIXES_REQUIRED.md`](./FIXES_REQUIRED.md)

---

## How to use this doc

| Horizon | Meaning |
| --- | --- |
| **Now / wiring** | Mostly config + deploy; product UI largely exists |
| **Next** | Clear product value; build after gold / early pilots |
| **Later** | Bigger bets; depends on volume, compliance, or other systems |

Add new ideas as rows under the right section. Move items to `GO_GOLD_ROADMAP.md` or a `docs/features/` spec when they become active work.

---

## Now / wiring

### AI email reading + sending in the app

**Status:** Sending mostly shipped; inbound + AI classify mostly built; auto-ingest not wired.  
**Depends on:** Resend (send + optional Receiving), Cloudflare Email Routing (human Gmail inbox — separate path).

| Capability | Today | To finish |
| --- | --- | --- |
| **Send** from app (PPW, chase, invites, billing) | Resend + `send-email` Edge Function | Keep domain verified; secrets on Supabase |
| **Human receive** (`billing@` / `ops@` → Gmail) | Cloudflare Email Routing | Maintain aliases; does **not** feed the app |
| **Read in Admin Inbox** | Paste / drop `.eml`; review queue; keyword + AI reclassify | Optional |
| **Auto-ingest broker replies** | `email-inbound` Edge Function exists | Resend **Enable Receiving** → webhook → deploy `email-inbound` |
| **Staff-confirmed actions** | Proposed actions (hold, note, notify) | Keep human confirm — do not auto-act at first |
| **Hands-off AI reply agent** | Not built | Later (risk + product) |

**DNS note:** Cloudflare Email Routing and Resend Receiving both want MX. Prefer Receiving on specific mailboxes or a subdomain (e.g. `inbound.credyx.net` / `collections@`) so Gmail forwarding can stay for day-to-day ops.

**Effort (estimate)**

| Slice | Difficulty |
| --- | --- |
| Keep sending + Gmail forwards as-is | Done / ops |
| Paste/drop + AI classify in Inbox | Easy — already in app |
| Wire Resend Receiving → Inbox | Medium — ~1–2 focused days (DNS + webhook + deploy) |
| Full auto-read / auto-reply agent | Hard — weeks+; later horizon |

**Why it matters:** Brokers reply to PPW/chase on email. Today staff read Gmail (or paste into Inbox). Auto-ingest closes the loop so Credyx Inbox becomes the review surface without copying mail by hand.

**Out of scope for first cut**

- Auto-sending replies without staff review  
- Replacing Cloudflare → Gmail for human ops  
- SMS parity (separate future; paid per message)

---

## Next

| Idea | Notes |
| --- | --- |
| Scheduled chase cron | `email-lifecycle-chase` exists; schedule or keep manual “Run chase” |
| Billing / dunning reminder emails | After first clients pay reliably |
| OpenAI spend / rate caps | Protect DocSort + any inbox AI spend |
| SMS notify-only (Twilio etc.) | Opt-in alerts only; not free like Resend; compliance (10DLC) |

---

## Later

| Idea | Notes |
| --- | --- |
| AI ops Phases (Risk / Invoice Manager) | See `credyx-ai-ops-plan.md` |
| Claims / fraud as in-app modules | Playbooks exist under `docs/claims`, `docs/fraud` |
| Assistant live answers + email drafts → send | Drafts exist in places; grounded send still careful |
| Two-way SMS / shared number inbox | Much heavier than notify-only |
| Fully autonomous email agent | Only after inbound review is trusted in production |

---

## Changelog

| Date | Change |
| --- | --- |
| 2026-09-20 | Created. Added **AI email reading + sending in the app** under Now / wiring. |
