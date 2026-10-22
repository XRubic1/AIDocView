# Credyx — Product, Marketing & Daily Auto-Poster Brief

> Purpose: one document that explains **what Credyx is**, **how we market it**, and **what the daily social-posting app must do**. Hand it to a developer or planning agent as the starting spec for the marketing app.
>
> Sources: `README.md`, `docs/AI_OPERATIONS_PLATFORM_BRIEF.md`, `docs/marketing/*`, `docs/sales/CREDYX_SALES_PLAYBOOK.md`, `docs/legal/FEE_SCHEDULE.md`, `.cursor/rules/credyx-marketing-prompts.mdc`, `.cursor/rules/credyx-image-generator.mdc`.

---

## 1. What Credyx is

**Credyx A/R Solutions** is a multi-tenant **accounts receivable and back-office platform for small trucking carriers** (built for fleets under ~20 trucks, strongest for owner-operators who do their own billing).

> *Your back office, in one portal.*
> Mission: *Empowering truckers. Simplifying payments. Driving success.*

**It is not:** factoring, a cash advance, a load board, or a TMS. Credyx never buys invoices and never touches the freight payment — brokers pay the carrier directly.

### The problem

Getting paid is often harder than hauling the load:

- Brokers demand a clean packet (rate confirmation, BOL, POD, invoice, lumper receipts). One missing BOL can delay payment for weeks.
- Carriers juggle dozens of open invoices across different broker portals and rarely know *why* something is unpaid.
- Small carriers can't justify hiring an A/R team, so billing happens at 10pm after a long drive.
- Before accepting a load, carriers want to know whether a broker (MC number) pays reliably.

### The five-step workflow (the only workflow we describe)

| Step | Label | What Credyx does |
| --- | --- | --- |
| 01 | Docs received | Carrier submits the paperwork packet |
| 02 | Paperwork verified | We check signatures, load numbers, rates, missing pages so nothing bounces |
| 03 | Invoice submitted | We invoice the broker with a clean packet and track acceptance |
| 04 | Broker follow-up | We chase due dates, holds, disputes and keep the carrier informed |
| 05 | Payment received | We confirm when payment lands — **paid on time** |

Invoice progress stepper shown in UI/creatives: **Submitted → Verified → Invoiced → Paid.**
Credyx does **not** confirm delivery or capture POD — never imply it does.

### Product features

**Client (carrier) portal**
- Dashboard with open A/R, aging, holds, overdue
- Invoices with status, notes history, dispute tracking, side detail panels
- Payments / remittances and confirmation
- Batches of load paperwork moving through review
- Document vault and uploads
- Broker directory with **MC lookup** and green / yellow / red pay rating, plus per-broker notes
- Cash collection forecast (when open invoices are expected to turn into cash)
- Mobile invoice-status view ("why hasn't this been paid?")
- **Buddy** — the AI trucking assistant (mascot: bearded character in a Credyx cap). Answers "what's on hold today?", drafts follow-up emails, adds notes/disputes, looks up MC numbers, flags broker risk. *Buddy writes it, you send it.*

**Admin (Credyx staff) portal**
- Batch review and approval, payment posting, collections, force-close / write-off (tier-dependent)
- Client and broker management, billing, users, reports
- Email templates; packets emailed to brokers with real attachments

**AI layer** (used for specific back-office jobs, not "ChatGPT for trucking")
- Paperwork sorting and AI review of packets (classification, extraction, cross-checking rate con / BOL / invoice / POD)
- Roadmap: weekly **Broker Risk Manager** and **Invoice Manager** (calendar of follow-ups + chat) — "AI operations for the trucking back office"

**Tech:** Vite + React + TypeScript, Supabase (auth, Postgres, edge functions), OpenAI via server-side proxy, Resend for email.

### Service tiers

| | **Managed** | **Self-Service** |
| --- | --- | --- |
| Who does the work | Credyx A/R team processes packets, invoices, follows up | Carrier uses the portal; Credyx provides platform and support |
| Best for | Owner-operators / small fleets with no office person | Fleets with a bookkeeper who wants tooling and visibility |
| Lead with | **Managed** — "we do it for you" is understood in one sentence | |

### Pricing (from the signed Fee Schedule — the truth source)

- Optional platform fee: **$99/month** if agreed.
- Collection fee, **charged only on confirmed collections** (pay after you're paid):

| Monthly collected volume | Standard | With a factor (NOA on file) |
| --- | --- | --- |
| Under $100k | 1.25% | 0.70% |
| $100k–$250k | 1.00% | 0.60% |
| $250k–$500k | 0.90% | 0.50% |
| Over $500k | Negotiated | Negotiated |

- Uncollected / written-off balances generate **no** percentage fee.
- Trial: fees waived for the trial window (first month free on fees).
- Credyx bills the carrier separately; it never deducts from broker remittances.

> Marketing note: don't quote exact percentages in public posts unless the fee schedule is linked. Say "a small % of what's collected — nothing upfront."

---

## 2. Audience

| Segment | Priority | Notes |
| --- | --- | --- |
| Owner-operators / 1–5 trucks doing their own billing | **Primary** | Pain is time and late invoices |
| Small fleets (5–20 trucks) with a spouse/dispatcher doing billing badly | **Primary** | Wants visibility, less chasing |
| Fleets with a bookkeeper | Secondary | Self-Service tier |
| Carriers who already factor | Narrow / smaller ticket | Pitch visibility + reduced rate, "use both" |

Where they are: Facebook trucking groups, Instagram, TikTok/YouTube Shorts (driver content), Reddit (r/Truckers, r/Trucking), X, LinkedIn (fleet owners, dispatch/ops people). Drivers consume content in short bursts, often on phones — mobile-readable, one idea per post.

---

## 3. Marketing approach

### Positioning

> **Factoring is cash. Credyx is your back office. Use one — or both.**

- A factor collects your invoice because **they own it**; you pay financing prices for back-office work bundled in.
- Credyx works your A/R **alongside you**; **your invoices stay yours**, brokers pay you directly.
- Honest premise, never skipped: good factors also verify paperwork and chase docs. We win on **what you're paying for** and **who the work serves**, not by claiming factors don't work.
- Soft contrast only — education, not an attack on factoring.

### Voice

Calm, direct, finance-grade, trucker-respectful. Plain words. No hype. Proof over promises.

**Preferred lines**
- *Paid on time.* · *Focus on the road. We'll handle the rest.* · *We keep you updated.* · *See your A/R clearly.* · *Your back office, in one portal.*
- Footer/CTA on every creative: **Credyx · Paid on time**

**Banned (hard rules for the generator)**
- "get paid faster", "paid faster", "faster payments", "instant cash", "same-day pay", "advance", "factoring" *as what we are*, "buy your invoices"
- Claiming we confirm delivery / capture POD, or "Load Delivered" as a Credyx step
- "Our pricing is the best on the market", "unbelievable offer" (unverifiable / scammy)
- Saying factors don't check paperwork (false)
- Promising "no fee ever" on uncollectable invoices (Managed force-close fee may apply — see Fee Schedule §5)
- Glossy hyper-real AI trucks, neon trails, giant glowing arrows

### Content pillars (one pillar per post)

| Pillar | Example hooks | Share of calendar |
| --- | --- | --- |
| **Pain** | Still chasing invoices on the road? Missing one BOL can delay payment for weeks | ~25% |
| **Proof** | Real dashboard / mobile invoice status / "held = 3" card (demo data, blurred names) | ~20% |
| **Process** | Docs → verified → invoiced → follow-up → paid on time | ~15% |
| **Offer** | You don't need to hire a whole team · Pay only after you're paid · First month free on fees | ~15% |
| **Education** | Why broker payments get delayed · Submit once, get it right · Factoring vs back office | ~15% |
| **Product / Buddy** | Meet Buddy · Ask Buddy anything · Buddy writes it, you send it | ~10% |

### Existing creative assets (don't duplicate)

`docs/marketing/CREATIVE_INVENTORY.md` tracks IG-01 → IG-21 with status (`posted`, `draft`, `needs_fix`, `retired`). Several are flagged `needs_fix` (wrong CTA "Get paid faster", wrong stepper "Delivered →"). The app must read this inventory (or a DB equivalent) and never regenerate a retired/duplicate concept.
Assets available in `public/` and `docs/marketing/creatives/`: logo lockups, Buddy poses (idle, waving, thinking, done), hero dashboard + mobile screenshots, truck photo.

### Visual system

- Palette: navy `#0F172A`, blue `#1684FE`, white; soft surfaces `#F7F8F9`; success `#2FA98C`, warning `#D4A853`, error `#D14343`
- Fonts: Plus Jakarta Sans (wordmark/headlines), Inter (body)
- **Credyx image formula (every IG image):**
  1. Logo top-left — "Cred" white + "yx" blue with arrow in the x, tagline **A/R SOLUTIONS**
  2. Clean, realistic dusk semi-truck, secondary and muted (layout ~55% navy text/UI left, ~45% truck right, curved blue divider)
  3. Clean flat UI cards/steppers, lots of space, demo data only
  4. One key headline phrase: **bold + #1684FE + hand-painted wavy underline**
  5. Footer: `Credyx · Paid on time`
- Square 1080×1080 default; also need 1080×1920 (Reels/Shorts/TikTok/Stories) and 1200×627 (LinkedIn/X/Facebook link posts)

### Funnel

Awareness posts → **Join the waitlist** (public marketing site, spec in `WAITLIST_MARKETING_SITE.md`) → sales call/demo (15-min screen-share) → trial (first month fees waived) → Managed or Self-Service enrollment.
Primary CTA on social: **DM us** or **Join the waitlist** (link in bio). Always track with UTM params per platform.

---

## 4. The marketing app — requirements

### Goal

A small internal app that **generates, schedules and publishes one (or more) on-brand post per day to every connected social network**, with the founder only needing to approve — or fully hands-off once trust is built.

### Core flow

```
Content calendar  →  AI draft (caption + image brief + hashtags)  →  Brand/compliance check
        →  Image/video render (templates)  →  Approval queue (optional)  →  Scheduler  →  Publish per platform
        →  Collect analytics  →  Feed results back into next week's calendar
```

### Features

1. **Brand brain** — loads this doc, the banned-phrase list, the pillar mix, palette, fonts, and `CREATIVE_INVENTORY`. Every generation prompt is prefixed with the brand rules and the image formula block.
2. **Content calendar** — 30-day rolling plan balancing pillars; no repeated concept within N days; seasonal/trucking-industry hooks (tax season, produce season, holidays, rate trends, FMCSA news).
3. **Copy generator** — platform-specific captions from one core idea (IG: short + hashtags; LinkedIn: professional/insight; X: ≤280 chars/threads; Facebook groups: conversational; TikTok/Shorts: hook-first script). Uses Claude via API (`claude-sonnet-5-5` is a good default; cheap model for variants).
4. **Creative generator** — preferred: **HTML/SVG templates rendered to PNG** (Satori / Puppeteer / Playwright) using real logo and Buddy assets for 100% on-brand, deterministic output; optional AI image model only for backgrounds. Avoid free-form AI images of trucks/logos (they drift off-brand — the exact problem the image-generator rule exists to prevent).
5. **Guardrail checker** — automatic reject/rewrite if copy contains a banned phrase, implies factoring, claims delivery/POD confirmation, quotes unverifiable pricing, or duplicates a recent post. Flags `needs_review` instead of auto-posting when unsure.
6. **Approval queue** — mobile-friendly: approve / edit / reject / regenerate per platform. Modes: *manual approve*, *auto-post after X hours unless rejected*, *full auto*.
7. **Scheduler** — per-platform best-time slots (time zone aware; drivers are most active early morning and evenings), retries, and a kill switch to pause everything.
8. **Publisher** — one adapter per network (see below), with token refresh and error alerts (email/Slack/SMS).
9. **Analytics loop** — pull impressions, clicks, saves, DMs/leads per post; weekly report; double down on winning pillars and hooks.
10. **Lead capture hooks** — UTM links, waitlist form submissions attributed to post/platform; optional comment/DM auto-reply drafts (human-approved).
11. **Asset library & inventory** — every published creative logged (ID, hook, pillar, platform, status) replacing the manual `CREATIVE_INVENTORY.md`.

### Platform notes (verify current API rules at build time — they change)

| Network | Posting route | Gotchas |
| --- | --- | --- |
| **Instagram** (feed, Reels, Stories) | Meta Graph API — Instagram Content Publishing | Requires Business/Creator account linked to a Facebook Page; image must be a public URL; app review for `instagram_content_publish`; rate-limited per day |
| **Facebook Page** | Meta Graph API (Pages) | Same Meta app/review; posting into **Facebook Groups** via API is no longer supported — do group posts manually or via drafts |
| **LinkedIn** (company page + personal) | LinkedIn Posts API / Community Management API | Needs approved partner access for org posting; personal profile posting via `w_member_social` |
| **X (Twitter)** | X API v2 | Paid tiers for write volume; check current limits/pricing |
| **TikTok** | Content Posting API | Unaudited apps can only post as private/draft until TikTok audits the app; video required |
| **YouTube Shorts** | YouTube Data API v3 `videos.insert` | Vertical ≤60s video; daily upload quota; OAuth consent verification |
| **Threads** | Threads API | Part of Meta platform; text/image posts |
| **Pinterest / Reddit** | Pinterest API; Reddit API | Reddit self-promotion rules are strict — treat as **drafts only** / value-first, never auto-spam subreddits |
| **Google Business Profile** | Business Profile API | Good for local credibility; optional |

**Build vs. buy shortcut:** unified posting APIs (Ayrshare, Buffer API, Publer, Postiz — open-source/self-hostable, or n8n/Make workflows) already handle OAuth, app review and per-network quirks. Recommended path: **start with a unified API for speed (one integration, all networks), own the content brain + creative renderer yourself**, and only build direct adapters for networks where the aggregator is lacking or expensive.

### Suggested architecture

- **Stack:** same as Credyx — TypeScript, Supabase (Postgres, storage for assets, auth, Edge Functions + `pg_cron` for scheduling) so it can live alongside the existing project; small React admin UI for the calendar and approval queue.
- **Tables:** `ideas`, `posts` (core idea, pillar, status), `post_variants` (per platform: copy, media, scheduled_at, published_id, status), `assets`, `platform_accounts` (encrypted tokens), `analytics`, `brand_rules`.
- **Jobs:** nightly "plan + draft tomorrow's posts"; hourly "publish what's due"; daily "pull analytics"; weekly "report + adjust calendar".
- **Secrets:** tokens in Supabase secrets / encrypted columns — never in client code or git (note: a `.env` exists in the repo; keep it out of version control).
- **Safety:** dry-run mode, per-platform pause, daily post cap, full audit log of what was generated, approved and sent.

### Phases

| Phase | Scope |
| --- | --- |
| **MVP (week 1–2)** | Brand-rules prompt, 30-day calendar generator, 3 PNG templates, approval queue, publish to Instagram + Facebook + LinkedIn via unified API |
| **v1** | Add X, Threads, TikTok/Shorts (video templates from screenshots + captions), analytics dashboard, guardrail checker |
| **v2** | Closed-loop optimization, comment/DM reply drafts, lead attribution to waitlist, A/B hooks, auto-pull real product screenshots (blurred demo data) |

### Success metrics

Posts published/week (target: 7/week/platform), approval time, guardrail rejection rate, engagement rate by pillar, link clicks → waitlist signups, demo calls booked, cost per lead.

---

## 5. Sample 2-week content calendar (starter)

| Day | Pillar | Idea |
| --- | --- | --- |
| Mon | Pain | Still chasing invoices while you're on the road? |
| Tue | Education | Why broker payments get delayed (PPW, errors, no follow-up) |
| Wed | Proof | Dashboard crop: "3 invoices on hold — here's why" |
| Thu | Offer | You don't need to hire a whole team |
| Fri | Product | Meet Buddy — "What's on hold today?" |
| Sat | Process | Docs → verified → invoiced → follow-up → paid on time |
| Sun | Offer | Pay only after you're paid — no upfront % |
| Mon | Pain/Tip | Missing one BOL can delay payment for weeks |
| Tue | Education | Submit once. Get it right. (rate con, BOL/POD, invoice match) |
| Wed | Education | Factoring is cash. Credyx is your back office. Use one — or both. |
| Thu | Product | Buddy writes it. You send it. (follow-up email draft) |
| Fri | Proof | Mobile invoice status: Submitted → Verified → Invoiced → Paid |
| Sat | Offer | Back office without the overhead |
| Sun | Pain | Still doing your own back office? |

---

## 6. Open decisions

1. Fully automatic vs. approve-first (recommend approve-first for the first 30 days).
2. Unified posting API vs. direct integrations (recommend unified API first).
3. Video: static + slideshow Reels first, or invest early in short screen-recording clips (best for TikTok/Shorts).
4. Which brand handle(s) already exist and are connected to a Facebook Page / Business accounts.
5. Whether to publish exact fee percentages publicly or keep them for the sales call.
6. Resolve outstanding sales-playbook items (e.g. Managed force-close fee disclosure) before pricing-related posts go live.
