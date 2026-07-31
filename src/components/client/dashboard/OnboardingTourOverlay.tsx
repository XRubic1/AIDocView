/**
 * Dimmed overlay + spotlight hole + coachmark for onboarding tours.
 * Shows a wiring error when data-onboard-target is missing or not visible.
 * Coachmark is placed in free space so it never covers the highlight.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export type TourCoachStep = {
  id: string
  target: string | null
  title: string
  body: string
  /** When true, spotlight lets clicks through; clicking the target advances. */
  requireTargetClick?: boolean
}

type Rect = { top: number; left: number; width: number; height: number }
type Point = { top: number; left: number }

type TargetLookup =
  | { status: 'ok'; rect: Rect }
  | { status: 'missing' }
  | { status: 'hidden' }
  | { status: 'none' }

type OnboardingTourOverlayProps = {
  step: TourCoachStep
  stepIndex: number
  stepCount: number
  onNext: () => void
  onBack: () => void
  onSkip: () => void
  /** Optional label overrides */
  nextLabel?: string
  finishLabel?: string
}

const PAD = 8
const GAP = 14
const VIEW_PAD = 16
/** Wait for route/tab paint before declaring a target broken. */
const WIRING_GRACE_MS = 700
/** Fallback coach size before first measure. */
const COACH_FALLBACK = { width: 320, height: 168 }

function lookupTarget(target: string | null): TargetLookup {
  if (!target || typeof document === 'undefined') return { status: 'none' }
  const el = document.querySelector(
    `[data-onboard-target="${target}"]`
  ) as HTMLElement | null
  if (!el) return { status: 'missing' }
  const r = el.getBoundingClientRect()
  if (r.width < 2 && r.height < 2) return { status: 'hidden' }
  return {
    status: 'ok',
    rect: {
      top: r.top - PAD,
      left: r.left - PAD,
      width: r.width + PAD * 2,
      height: r.height + PAD * 2,
    },
  }
}

function wiringMessage(target: string, lookup: TargetLookup): string | null {
  if (lookup.status === 'missing') {
    return `Tour target not wired: no element with data-onboard-target="${target}". Add that attribute to the UI this step should highlight.`
  }
  if (lookup.status === 'hidden') {
    return `Tour target is in the DOM but not visible: data-onboard-target="${target}". It may be on a hidden tab, collapsed, or zero-size.`
  }
  return null
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

/** True if two axis-aligned boxes overlap (inclusive padding). */
function overlaps(a: Rect, b: Rect, pad = 4): boolean {
  return !(
    a.left + a.width <= b.left - pad ||
    b.left + b.width <= a.left - pad ||
    a.top + a.height <= b.top - pad ||
    b.top + b.height <= a.top - pad
  )
}

/**
 * Place coachmark in the largest free region around the spotlight.
 * Prefer below → above → right → left; never sit on top of the hole.
 */
function placeCoach(hole: Rect, coachW: number, coachH: number): Point {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800

  const maxLeft = Math.max(VIEW_PAD, vw - coachW - VIEW_PAD)
  const maxTop = Math.max(VIEW_PAD, vh - coachH - VIEW_PAD)

  const spaceBelow = vh - (hole.top + hole.height) - VIEW_PAD
  const spaceAbove = hole.top - VIEW_PAD
  const spaceRight = vw - (hole.left + hole.width) - VIEW_PAD
  const spaceLeft = hole.left - VIEW_PAD

  type Candidate = { top: number; left: number; score: number; fits: boolean }
  const candidates: Candidate[] = []

  const push = (top: number, left: number, room: number, needed: number) => {
    const t = clamp(top, VIEW_PAD, maxTop)
    const l = clamp(left, VIEW_PAD, maxLeft)
    const box: Rect = { top: t, left: l, width: coachW, height: coachH }
    const fits = room >= needed + GAP && !overlaps(box, hole)
    // Prefer positions that clear the hole; then prefer more leftover room.
    candidates.push({
      top: t,
      left: l,
      score: (fits ? 10_000 : 0) + room,
      fits,
    })
  }

  // Below — align to hole left, clamped into viewport.
  push(hole.top + hole.height + GAP, hole.left, spaceBelow, coachH)
  // Above
  push(hole.top - coachH - GAP, hole.left, spaceAbove, coachH)
  // Right — vertically center on hole
  push(
    hole.top + hole.height / 2 - coachH / 2,
    hole.left + hole.width + GAP,
    spaceRight,
    coachW
  )
  // Left
  push(
    hole.top + hole.height / 2 - coachH / 2,
    hole.left - coachW - GAP,
    spaceLeft,
    coachW
  )

  // Prefer first fitting candidate in preference order (below→above→right→left),
  // else the highest score.
  const fitting = candidates.find((c) => c.fits)
  if (fitting) return { top: fitting.top, left: fitting.left }

  candidates.sort((a, b) => b.score - a.score)
  const best = candidates[0]
  if (best && !overlaps({ top: best.top, left: best.left, width: coachW, height: coachH }, hole)) {
    return { top: best.top, left: best.left }
  }

  // Last resort: park in the corner farthest from the hole center.
  const holeCx = hole.left + hole.width / 2
  const holeCy = hole.top + hole.height / 2
  const corners: Point[] = [
    { top: VIEW_PAD, left: VIEW_PAD },
    { top: VIEW_PAD, left: maxLeft },
    { top: maxTop, left: VIEW_PAD },
    { top: maxTop, left: maxLeft },
  ]
  corners.sort((a, b) => {
    const da = Math.hypot(a.left + coachW / 2 - holeCx, a.top + coachH / 2 - holeCy)
    const db = Math.hypot(b.left + coachW / 2 - holeCx, b.top + coachH / 2 - holeCy)
    return db - da
  })
  for (const c of corners) {
    if (!overlaps({ top: c.top, left: c.left, width: coachW, height: coachH }, hole)) {
      return c
    }
  }
  return corners[0] ?? { top: VIEW_PAD, left: VIEW_PAD }
}

export default function OnboardingTourOverlay({
  step,
  stepIndex,
  stepCount,
  onNext,
  onBack,
  onSkip,
  nextLabel = 'Next',
  finishLabel = 'Finish',
}: OnboardingTourOverlayProps) {
  const [lookup, setLookup] = useState<TargetLookup>(() => lookupTarget(step.target))
  const [graceDone, setGraceDone] = useState(!step.target)
  const [coachPos, setCoachPos] = useState<Point | null>(null)
  const coachRef = useRef<HTMLDivElement>(null)
  const isLast = stepIndex >= stepCount - 1
  const canBack = stepIndex > 0

  const measure = useCallback(() => {
    setLookup(lookupTarget(step.target))
  }, [step.target])

  useLayoutEffect(() => {
    setGraceDone(!step.target)
    measure()
    const t1 = window.setTimeout(measure, 50)
    const t2 = window.setTimeout(measure, 280)
    const t3 = window.setTimeout(measure, 600)
    const grace = window.setTimeout(() => setGraceDone(true), WIRING_GRACE_MS)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.clearTimeout(t3)
      window.clearTimeout(grace)
    }
  }, [measure, step.id, step.target])

  useEffect(() => {
    const onWin = () => measure()
    window.addEventListener('resize', onWin)
    window.addEventListener('scroll', onWin, true)
    return () => {
      window.removeEventListener('resize', onWin)
      window.removeEventListener('scroll', onWin, true)
    }
  }, [measure])

  useEffect(() => {
    if (!step.target) return
    const el = document.querySelector(
      `[data-onboard-target="${step.target}"]`
    ) as HTMLElement | null
    // Center in view so there is room above/below for the coachmark.
    el?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
    // Re-measure after smooth scroll settles.
    const t = window.setTimeout(measure, 350)
    return () => window.clearTimeout(t)
  }, [step.target, step.id, measure])

  const rect = lookup.status === 'ok' ? lookup.rect : null
  const wiringError =
    graceDone && step.target ? wiringMessage(step.target, lookup) : null

  // Reposition coach after hole / content size is known.
  useLayoutEffect(() => {
    if (!rect) {
      setCoachPos(null)
      return
    }
    const node = coachRef.current
    const coachW = node?.offsetWidth || COACH_FALLBACK.width
    const coachH = node?.offsetHeight || COACH_FALLBACK.height
    setCoachPos(placeCoach(rect, coachW, coachH))
  }, [rect, wiringError, step.id])

  // Use measured position when ready; otherwise a provisional spot that clears the hole.
  const resolvedPos =
    rect == null
      ? null
      : coachPos ?? placeCoach(rect, COACH_FALLBACK.width, COACH_FALLBACK.height)

  useEffect(() => {
    if (!wiringError || !step.target) return
    console.warn(`[onboarding tour] ${wiringError}`, { stepId: step.id, target: step.target })
  }, [wiringError, step.id, step.target])

  const requireClick = Boolean(step.requireTargetClick && step.target)

  // Interactive steps: clicking the highlighted target advances the tour.
  useEffect(() => {
    if (!requireClick || !step.target) return
    const el = document.querySelector(
      `[data-onboard-target="${step.target}"]`
    ) as HTMLElement | null
    if (!el) return
    const onTargetClick = () => {
      onNext()
    }
    el.addEventListener('click', onTargetClick, true)
    return () => el.removeEventListener('click', onTargetClick, true)
  }, [requireClick, step.target, step.id, onNext])

  const primaryLabel = isLast
    ? finishLabel
    : requireClick
      ? nextLabel === 'Next'
        ? 'Open for me'
        : nextLabel
      : nextLabel

  return (
    <div
      className={`cd-onboard-tour${requireClick ? ' is-interactive' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cd-onboard-tour-title"
    >
      <div className="cd-onboard-tour__catcher" aria-hidden />
      {rect ? (
        <div
          className="cd-onboard-tour__hole"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }}
          aria-hidden
        />
      ) : (
        <div className="cd-onboard-tour__dim" aria-hidden />
      )}

      <div
        ref={coachRef}
        className={`cd-onboard-tour__coach${rect ? '' : ' is-centered'}${
          wiringError ? ' is-wiring-error' : ''
        }`}
        style={
          rect && resolvedPos
            ? { top: resolvedPos.top, left: resolvedPos.left, transform: 'none' }
            : undefined
        }
      >
        <p className="cd-onboard-tour__progress">
          {stepIndex + 1} / {stepCount}
        </p>
        <h2 id="cd-onboard-tour-title" className="cd-onboard-tour__title">
          {step.title}
        </h2>
        <p className="cd-onboard-tour__body">{step.body}</p>
        {requireClick ? (
          <p className="cd-onboard-tour__hint">Click the highlighted batch to continue</p>
        ) : null}
        {wiringError ? (
          <p className="cd-onboard-tour__wiring-error" role="alert">
            <span className="cd-onboard-tour__wiring-error-label">Wiring error</span>
            {wiringError}
          </p>
        ) : null}
        <div className="cd-onboard-tour__actions">
          <button type="button" className="cd-onboard-tour__skip" onClick={onSkip}>
            Skip
          </button>
          <div className="cd-onboard-tour__nav">
            {canBack ? (
              <button type="button" className="cd-onboard-tour__secondary" onClick={onBack}>
                Back
              </button>
            ) : null}
            <button type="button" className="cd-onboard-tour__primary" onClick={onNext}>
              {primaryLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
