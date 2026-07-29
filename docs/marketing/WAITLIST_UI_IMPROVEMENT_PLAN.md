# Waitlist Page — UI Audit & Improvement Plan

> Scope: `/waitlist` marketing page only. Files involved:
> `src/pages/Waitlist.tsx`, `src/components/enroll/MarketingHeader.tsx`,
> `src/components/enroll/WaitlistForm.tsx`, `src/components/enroll/EnrollField.tsx`,
> `src/hooks/useRevealOnScroll.ts`, `src/styles/credyxMarketing.css` (waitlist variant, ~2,700 lines).
>
> This is an analysis document — no code has been changed.

---

## 1. TL;DR — What's causing the "cluttered / all over the place" feeling

1. **Too many same-looking cards stacked back to back.** "How it works" (5 cards) is immediately followed by "Why Credyx" (4 cards) — 9 nearly identical white cards in a row. Nothing tells the eye which one matters.
2. **The same message is repeated 3–4 times.** "Your back office, in one portal" is the hero headline, the features section subtitle, AND echoed in the "Why Credyx" title. The "68 positions left" offer appears twice (pricing founding card + banner above the form).
3. **Every section screams equally.** Almost every section title uses the blue accent + hand-painted underline. When everything is emphasized, nothing is.
4. **Inconsistent vertical rhythm.** Section paddings are overridden per-section with different clamps (`--cx-section-y`, then buddy/features/pricing/join each redefine their own), and there are *conflicting duplicate media queries* (see §6). The page breathes differently every screen-height.
5. **Content is physically cut off in two places** (see §3): the hero on short laptop screens, and the Buddy chat which is locked to a fixed 260px inner scroll area.

The page is not actually static — it has hero stagger, scroll reveals, Ken Burns, mesh drift, buddy float, bubble-in, stepper line-grow. But almost all motion is **one-shot entrance animation**. What's missing is **continuous life and micro-interaction feedback** (see §5).

---

## 2. Information architecture — restructure before polishing pixels

Current order:

```
Hero → How it works (5 cards) → Why Credyx (4 cards) → Product proof
→ Buddy → App features (tabs) → Pricing → Founding offer → Form → Footer
```

Problems:
- Two "explainer" sections (How it works + Why Credyx) before the visitor sees any product. That's ~2 full screens of text cards before proof.
- Buddy (an assistant demo) sits between the product screenshots and the feature tabs, splitting "what the product is" into two disconnected halves.
- The founding offer lives inside Pricing but the spots counter is repeated at the form — the urgency message is diluted by repetition.

### Recommended order

```
1. Hero (headline + CTA + one product visual)
2. Product proof (dashboard + phone — "show, don't tell")
3. How it works (compact 5-step TIMELINE, not 5 cards)
4. App features (tabs) — with Buddy as the featured/last tab OR directly after
5. Trucking Buddy (kept, but slimmed — see §4.4)
6. Pricing + Founding offer (merged into ONE section, single spots counter)
7. Form (keep the spots pill here — it's the only other place the number appears)
8. Footer
```

### Content cuts (biggest de-clutter wins)

| What | Why |
| --- | --- |
| Merge "Why Credyx" into "How it works" | The 4 benefits are outcomes of the 5 steps. Render steps as a horizontal timeline with the benefit line as a caption, or keep benefits as 4 short inline checkmarks under the timeline — not a second card grid. |
| One hand-underline per viewport | Keep it in the hero and ONE other section (suggest Pricing). Plain titles elsewhere. |
| One spots counter narrative | Founding card owns the meter + count; the form keeps only the small pill (or vice-versa). Don't show "68 / positions left / 32 of 100 claimed" twice with different visual treatments. |
| Hero stats row | "Real-time / 1–50 / On time" are not really stats — they're labels. Either turn them into a single reassurance line ("Built for 1–50 truck fleets · Real-time A/R · Paid on time") or into small pill badges. The 3-cell stat grid adds visual weight and pushes the fold. |

---

## 3. Resolution / cut-off issues (the specific bugs you're feeling)

### 3.1 Hero clips on short screens
`.cx-hero--waitlist` uses `min-height: min(78vh, 720px)` + `justify-content: center` + large clamp paddings. On a 1366×768 laptop (real viewport ≈ 620–660px after browser chrome) the badge/headline/buttons/stats stack is taller than the hero box, so the stats row gets pushed below the fold and the section feels "cut". **Fix direction:** drop the vh-based min-height (let content size the hero), or use `min-height: max(560px, 100svh - 72px)` with `svh` units so mobile URL bars are handled, and cap the stats row so it never wraps below the fold at ≥1280×720.

### 3.2 Buddy chat is a scroll trap
`.cx-buddy-chat` is hard-locked to `height/min/max: 260px` (240px on mobile) with `overflow-y: auto`. Every example has 4 bubbles, and the last 1–2 are hidden behind an inner scrollbar — this is exactly "you have to scroll up and down to see all the information". **Fix direction:** remove the fixed height and let the tallest example define the box (`min-height` + `display: grid` so all 5 examples reserve the same space), or animate messages in sequentially (typing indicator) so the visible area is enough. An inner scrollbar inside a marketing demo should never exist.

### 3.3 Anchor links land under the sticky nav on mobile
`scroll-margin-top: 72px` matches the desktop nav height, but at ≤900px the nav becomes `flex-wrap` with `height: auto` — when the menu is open (or on tall wrapped states) it's taller than 72px, so `/#pricing`, `#buddy`, `#features` deep links land with the title hidden. **Fix direction:** single source of truth (`--cx-nav-h`) used by both nav height and `scroll-margin-top`, and close the menu before scrolling.

### 3.4 Feature tabs squeeze awkwardly between 700–980px
6-column tab grid → 3-column at 980px → horizontal scroller at 700px. In the 700–980 band, 6 tabs in 3 columns creates a 2-row block where row 2 looks like content, not navigation. The mobile scroller has no affordance (no edge fade, visible thin scrollbar). **Fix direction:** go straight from 6-up to the horizontal scroller at ~1024px, add edge-fade masks + hide scrollbar + `scroll-snap-type: x mandatory`.

### 3.5 Product proof at 1100px
At ≤1100px `.cx-proof-side` becomes a 2-column grid and `.cx-proof-shot--phone` loses its `max-width: 280px` (`max-width: none`), so the phone mockup renders enormous next to the stepper panel. **Fix direction:** keep a `max-width` clamp on the phone at every breakpoint.

---

## 4. Mobile polish (biggest gap right now)

### 4.1 Navigation
- The hamburger opens an **inline** menu (`flex-wrap` pushes the whole page down). Replace with an overlay/sheet: fixed panel under the nav, backdrop, `body` scroll-lock, staggered link entrance (60ms/item), close on link tap + Escape. This alone makes mobile feel a class more polished.
- Add active-section highlighting (IntersectionObserver you already have can drive it) so Pricing/Buddy/Features show where you are.

### 4.2 Forms — iOS zoom bug
`.cx-form-card--join .cx-input` is `font-size: 0.9rem` (14.4px). **iOS Safari auto-zooms any focused input under 16px** — the page jumps and the user has to pinch back. Set inputs to `font-size: 16px` at ≤700px (visually you can compensate with padding). Same for the two `<select>`s and the textarea.
- Native selects look off-brand next to the styled inputs. Minimum: add `appearance: none` + custom chevron. Better: pill-button group for Fleet size (5 options fits as tappable chips — faster than a dropdown on mobile).
- Add a **sticky mobile CTA bar** ("Join the waitlist · 68 spots") that appears after the hero and hides when the form is in view. On a long single-column page this is the single biggest conversion win.

### 4.3 Touch targets & density
- `.cx-buddy-chip` is `padding: 4px 8px` at `font-size: 0.68rem` — roughly 24px tall. Apple/Google minimum is 44/48px. Same for the tiny `cx-buddy-example-count`. Enlarge chips on mobile or convert the example switcher to swipe (see below).
- Buddy has **three redundant controls** for the same thing (arrows, counter, 5 chips). On mobile keep chips only (scrollable, snap), or arrows only + swipe gesture on the chat card. Remove the rest.

### 4.4 Mobile section length
- 5 process cards + 4 benefit cards stacked = ~9 screens of near-identical cards before the product. On mobile render "How it works" as a **compact vertical timeline** (number-dot + line + one sentence, no card chrome) — cuts scroll length by ~60%.
- Founding card: `backdrop-filter: blur(14px)` over 4 radial gradients + a grid texture is expensive on low-end Android — visible scroll jank. Serve a flat pre-blended background on mobile (`@media (max-width: 700px)` remove backdrop-filter).
- Hero photo: Ken Burns animating a full-bleed JPG on mobile costs paint time and battery. Disable the animation ≤700px (you already do this for reduced-motion) and ship a smaller image via `srcset` / `<picture>`.

### 4.5 Breakpoint consolidation
Current breakpoints in use: **1100, 1024, 980, 900, 720, 700, 640, 420**. Eight breakpoints for one page guarantees "works on my screen" bugs. Consolidate to 4 tokens (e.g. 1080 / 900 / 720 / 480) and move every override onto them.

---

## 5. Animation plan — from "static" to "alive"

What exists is good (entrance reveals, reduced-motion support is already correct — keep that discipline). What's missing is motion that *responds* and motion that *continues*. Priorities:

### Tier 1 — highest perceived-quality per effort
1. **Buddy chat plays like a real conversation.** On tab/example change: show typing indicator (3 bouncing dots) → user bubble slides in → 600ms pause → bot bubble. Auto-advance to the next example every ~8s (pause on hover/touch). This turns the centerpiece demo from a screenshot into a movie.
2. **Count-up numbers.** The `68` spots (both places), and the founding meter filling from 0 → 32% when scrolled into view. Numbers that move read as "live product".
3. **CTA micro-interactions.** Arrow icon nudges right 3–4px on hover (translate on the svg, 150ms), light press-down scale (0.98) on `:active`, and a slow gradient shimmer sweep across the primary CTA every ~6s to draw the eye without being neon.
4. **Invoice stepper loop.** The proof-panel stepper already animates once on reveal; make it *cycle*: after 3s the "Invoiced" step completes and "Paid" activates, then reset. A looping 4-step progress is the single best visual for "we track it to paid".

### Tier 2 — texture
5. **Card hover depth**: you have translateY; add a subtle border-glow (`box-shadow: 0 0 0 1px rgba(22,132,254,.25)`) and icon tilt/scale (1.06) on the card's icon chip.
6. **Tab panel directional slide**: when switching feature tabs, slide the panel from the direction of travel (left/right based on tab index delta) instead of the current fade-up.
7. **Hand underline draw-on**: the SVG underline is a static background. Convert to an inline SVG path with `stroke-dashoffset` animation so it *draws itself* when the heading reveals (~500ms). This is very on-brand with the "hand-painted" rule.
8. **Hero parallax**: truck photo translates at ~0.3× scroll speed (transform only, `will-change: transform`, disabled on mobile + reduced-motion).

### Tier 3 — nice to have
9. Scroll-driven animations (`animation-timeline: view()`) as progressive enhancement for reveals — removes the JS observer on modern browsers.
10. Nav background: fully transparent at top → blurred white after 40px scroll (small `scrolled` class).
11. Success state: confetti-free — instead animate the check drawing (`stroke-dashoffset`) inside the existing `success-pop`.

**Guardrails:** every new animation must respect `prefers-reduced-motion` (pattern already established in the CSS — extend it), use only `transform`/`opacity`, and nothing should loop faster than ~3s or move more than ~8px at rest.

---

## 6. Code health issues found during the audit (worth fixing while polishing)

These directly cause the inconsistency you're feeling:

1. **Dead component + ~400 lines of dead CSS.** `WaitlistInvoicePhone.tsx` is imported nowhere. All of `cx-hero-visual`, `cx-hero-dash`, `cx-hero-phone-wrap`, `cx-hero-float-chip`, and the entire `cx-phone-*` mockup block (topbar, steps, metrics, feed, footer, chip — roughly lines 1226–1718 of the waitlist variant) style markup that isn't rendered. Also unused: `cx-pricing-flow`, `cx-pricing-connector*`, `cx-pricing-points`, `cx-pricing-step`.
2. **Conflicting duplicate media queries.** `@media (max-width: 700px)` sets `.cx-section--buddy` padding to `28px … 36px` and *later in the same file* another 700px block sets it to `18px … 22px` (the later wins; the first is dead). `@media (max-width: 900px) { .cx-buddy-layout … }` appears twice. This is why spacing feels random per section.
3. **Hardcoded spots count.** `WAITLIST_SPOTS_LEFT = 68` is a constant in the page component. Fine for Phase 1, but the moment it's stale it undermines the urgency claim — flag it clearly or wire it to Supabase when the form gets a backend.
4. **Global `width: 100%` on all buttons ≤900px.** `.cx-btn-primary, .cx-btn-secondary { width: 100% }` applies to *every* button on the page including ones inside cards — intent should be scoped to `.cx-hero-buttons` and the form.
5. **Inline styles in JSX** (`style={{ justifyContent: 'center', width: '100%' }}` on eyebrows, `style={{ marginTop: 18 }}`, `style={{ display: 'contents' }}`) — move to classes so the CSS file is the single source of truth.
6. **Section head sizes drift.** `cx-section-title` has one clamp, but buddy/features/pricing/join each re-clamp their own smaller title. Pick two sizes (hero, section) and apply consistently.

---

## 7. Suggested execution order

| Phase | Work | Impact |
| --- | --- | --- |
| **1. Fix the cut-offs** | Hero min-height (§3.1), Buddy chat height (§3.2), anchor offsets (§3.3), proof phone clamp (§3.5) | Removes every "content is hidden" complaint |
| **2. De-clutter IA** | Reorder sections (§2), merge Why Credyx into a timeline, single spots counter, one underline per viewport, cut hero stats to a reassurance line | Page reads calm and directed |
| **3. Mobile pass** | Overlay nav, 16px inputs, sticky CTA bar, chip tap targets, timeline on mobile, breakpoint consolidation (§4) | Mobile goes from functional to polished |
| **4. Animation pass** | Tier 1 items (§5): chat playback, count-ups, CTA micro-interactions, looping stepper | Page feels alive |
| **5. Cleanup** | Delete dead CSS/component, dedupe media queries, scope button widths (§6) | Prevents regressions, ~15% smaller CSS |

Phases 1 and 5 are low-risk and mechanical; phase 2 needs a quick copy decision from you (what to cut); phases 3–4 are where the visible quality jump happens.
