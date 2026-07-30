import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, X } from 'lucide-react'

type StepVisual = 'upcoming' | 'active' | 'done' | 'held' | 'paid'

type StatusNoteId = 'submitted' | 'held' | 'verified' | 'invoiced' | 'paid'

type DemoFrame = {
  steps: StepVisual[]
  note: StatusNoteId | null
  allPaid: boolean
}

const STEP_LABELS = ['Submitted', 'Verified', 'Invoiced', 'Paid'] as const

/** Hold each major status long enough to read (~4s between states). */
const STATE_MS = 4000
const INTRO_MS = 700
const SETTLE_MS = 550
const END_HOLD_MS = 4200

/** Status notes — same reserved slot as Held; fade between steps (no layout jump). */
const STATUS_NOTES: Record<
  StatusNoteId,
  { badge: string; text: string; tone: 'info' | 'warn' | 'success' }
> = {
  submitted: {
    badge: 'Submitted',
    text: 'Packet received — paperwork is in for review.',
    tone: 'info',
  },
  held: {
    badge: 'Held',
    text: 'Missing PPW — paperwork incomplete. Hold reason visible right away.',
    tone: 'warn',
  },
  verified: {
    badge: 'Verified',
    text: 'Paperwork verified — nothing missing, good to go.',
    tone: 'info',
  },
  invoiced: {
    badge: 'Invoiced',
    text: 'Invoice (PPW) submitted to the broker and tracked.',
    tone: 'info',
  },
  paid: {
    badge: 'Paid',
    text: 'Payment confirmed — on time.',
    tone: 'success',
  },
}

/**
 * Demo path: Submitted → Hold → Verified → Invoiced → Paid
 * Major states are spaced STATE_MS apart; micro settle happens inside each beat.
 */
const t0 = INTRO_MS
const tSubmitted = t0
const tHeld = tSubmitted + STATE_MS
const tVerified = tHeld + STATE_MS
const tInvoiced = tVerified + STATE_MS
const tPaid = tInvoiced + STATE_MS
const tEnd = tPaid + END_HOLD_MS

const DEMO_FRAMES: { at: number; frame: DemoFrame }[] = [
  {
    at: 0,
    frame: {
      steps: ['upcoming', 'upcoming', 'upcoming', 'upcoming'],
      note: null,
      allPaid: false,
    },
  },
  {
    at: tSubmitted,
    frame: {
      steps: ['active', 'upcoming', 'upcoming', 'upcoming'],
      note: 'submitted',
      allPaid: false,
    },
  },
  {
    at: tSubmitted + SETTLE_MS,
    frame: {
      steps: ['done', 'upcoming', 'upcoming', 'upcoming'],
      note: 'submitted',
      allPaid: false,
    },
  },
  // Hold before Verified — never check Verified first
  {
    at: tHeld,
    frame: {
      steps: ['done', 'held', 'upcoming', 'upcoming'],
      note: 'held',
      allPaid: false,
    },
  },
  // Resolved → Verified
  {
    at: tVerified,
    frame: {
      steps: ['done', 'done', 'upcoming', 'upcoming'],
      note: 'verified',
      allPaid: false,
    },
  },
  {
    at: tInvoiced,
    frame: {
      steps: ['done', 'done', 'active', 'upcoming'],
      note: 'invoiced',
      allPaid: false,
    },
  },
  {
    at: tInvoiced + SETTLE_MS,
    frame: {
      steps: ['done', 'done', 'done', 'upcoming'],
      note: 'invoiced',
      allPaid: false,
    },
  },
  {
    at: tPaid,
    frame: {
      steps: ['done', 'done', 'done', 'active'],
      note: 'paid',
      allPaid: false,
    },
  },
  {
    at: tPaid + SETTLE_MS,
    frame: {
      steps: ['done', 'done', 'done', 'paid'],
      note: 'paid',
      allPaid: true,
    },
  },
]

const LOOP_MS = tEnd

const INITIAL_FRAME: DemoFrame = DEMO_FRAMES[0].frame

const NOTE_ORDER = Object.keys(STATUS_NOTES) as StatusNoteId[]

/**
 * Marketing demo: Submitted → Hold → Verified → Invoiced → Paid.
 * Status note slot is always reserved so the card does not jump.
 */
export function WaitlistInvoiceProgress() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)
  const [frame, setFrame] = useState<DemoFrame>(INITIAL_FRAME)
  const [playId, setPlayId] = useState(0)

  useEffect(() => {
    const node = rootRef.current
    if (!node) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setInView(true)
      },
      { threshold: 0.35 }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!inView) return

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) {
      setFrame({
        steps: ['done', 'done', 'done', 'paid'],
        note: 'paid',
        allPaid: true,
      })
      return
    }

    let cancelled = false
    const timeoutIds: number[] = []

    const clearTimers = () => {
      timeoutIds.forEach((id) => window.clearTimeout(id))
      timeoutIds.length = 0
    }

    const play = () => {
      clearTimers()
      setFrame(INITIAL_FRAME)
      // Bump playId so line-draw CSS can restart without remounting the whole stepper
      setPlayId((id) => id + 1)
      for (const { at, frame: next } of DEMO_FRAMES) {
        if (at === 0) continue
        timeoutIds.push(
          window.setTimeout(() => {
            if (!cancelled) setFrame(next)
          }, at)
        )
      }
      timeoutIds.push(
        window.setTimeout(() => {
          if (!cancelled) play()
        }, LOOP_MS)
      )
    }

    play()
    return () => {
      cancelled = true
      clearTimers()
    }
  }, [inView])

  const isHeldPhase = frame.steps[1] === 'held'
  const activeNote = frame.note

  return (
    <div
      ref={rootRef}
      className={`cx-proof-panel cx-proof-panel--progress cx-card--grow${
        frame.allPaid ? ' is-paid-complete' : ''
      }${isHeldPhase ? ' is-held' : ''}`}
      aria-label="Demo invoice progress"
    >
      <div className="cx-proof-panel-head">
        <div>
          <p className="cx-proof-panel-title">Invoice progress</p>
          <p className="cx-proof-panel-meta">
            <span>INV-4821</span>
            <span aria-hidden>·</span>
            <span>$2,840.00</span>
          </p>
        </div>
        <span
          className={`cx-proof-live-pill${
            isHeldPhase ? ' is-warn' : frame.allPaid ? ' is-good' : ''
          }`}
        >
          {isHeldPhase ? 'On hold' : frame.allPaid ? 'Paid' : 'Live status'}
        </span>
      </div>

      <div className="cx-invoice-stepper" data-play={playId}>
        {STEP_LABELS.map((baseLabel, index) => {
          const state = frame.steps[index]
          const prev = index > 0 ? frame.steps[index - 1] : null
          const onHoldPath = isHeldPhase && index === 0
          // Submitted → Hold is red; nothing after Hold fills while held
          const lineIntoHeld = index === 1 && isHeldPhase
          const lineAfterHeld = prev === 'held'
          const lineDone =
            !lineIntoHeld &&
            !lineAfterHeld &&
            (prev === 'done' || prev === 'paid' || frame.allPaid)
          // Keep fill once drawn — held→done only swaps color (no remount / re-grow)
          const lineFilled = lineDone || lineIntoHeld
          const lineHeld = lineIntoHeld
          const linePaid = lineFilled && (frame.allPaid || prev === 'paid')
          const label = state === 'held' && index === 1 ? 'Held' : baseLabel

          return (
            <div key={baseLabel} className="cx-invoice-step-wrap">
              {index > 0 ? (
                <div
                  key={`${playId}-line-${index}`}
                  className={`cx-invoice-step-line${lineFilled ? ' filled' : ''}${
                    lineHeld ? ' held' : ''
                  }${linePaid ? ' paid' : ''}`}
                  aria-hidden
                />
              ) : null}
              <div
                className={`cx-invoice-step ${state}${
                  onHoldPath ? ' hold-path' : ''
                }${frame.allPaid ? ' paid-complete' : ''}`}
              >
                <span className="cx-invoice-step-dot">
                  {state === 'held' ? (
                    <X size={13} strokeWidth={2.75} />
                  ) : state === 'done' || state === 'paid' ? (
                    <CheckCircle2 size={13} strokeWidth={2.5} />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="cx-invoice-step-label">{label}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Always reserved height — opacity only, so the card never jumps */}
      <div className="cx-invoice-status-slot" aria-live="polite">
        {NOTE_ORDER.map((id) => {
          const note = STATUS_NOTES[id]
          const isVisible = activeNote === id
          return (
            <div
              key={id}
              className={`cx-invoice-status-note tone-${note.tone}${
                isVisible ? ' is-visible' : ''
              }`}
              role="status"
              aria-hidden={!isVisible}
            >
              <span className="cx-invoice-status-badge">{note.badge}</span>
              <p>{note.text}</p>
            </div>
          )
        })}
      </div>

      <p className="cx-card-desc cx-proof-panel-desc">
        You always know where each invoice stands — from paperwork to paid on time.
      </p>
    </div>
  )
}
