import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'

type Phase = 'inhouse' | 'credyx'

/** In-house “expensive” demo values (illustrative). */
const INHOUSE = {
  start: 2800,
  monthly: 5100,
  total: 7900,
} as const

const INHOUSE_HASSLES = [
  {
    title: 'Hire and train',
    detail: 'Weeks before anyone is productive',
  },
  {
    title: 'Salary and benefits',
    detail: 'Fixed cost every payday, rain or shine',
  },
  {
    title: 'Coverage gaps',
    detail: 'PTO, sick days, turnover, work still waits',
  },
] as const

const CREDYX_STEPS = [
  {
    title: 'You send paperwork',
    detail: 'Drop the packet in the portal',
  },
  {
    title: 'You get paid',
    detail: 'Broker pays you first',
  },
  {
    title: 'Then a small %',
    detail: 'Only after the invoice is paid',
  },
] as const

/** Each phase fills the bar 0→100, then advances. */
const PHASE_MS = 10000
const COUNT_UP_MS = 2200
const COUNT_DOWN_MS = 2400

/**
 * Pricing zeros card: in-house hire cost → count down to Credyx.
 * Progress bar fills per phase; at 100% the other scene plays.
 */
export function WaitlistPricingCompare() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)
  const [phase, setPhase] = useState<Phase>('inhouse')
  const [startAmt, setStartAmt] = useState(0)
  const [monthlyAmt, setMonthlyAmt] = useState(0)
  const [totalAmt, setTotalAmt] = useState(0)
  const [showInhouseFoot, setShowInhouseFoot] = useState(true)
  const [showCredyxFoot, setShowCredyxFoot] = useState(false)
  const [noteVisible, setNoteVisible] = useState(true)
  const [progress, setProgress] = useState(0)

  const runIdRef = useRef(0)
  const phaseStartedAtRef = useRef(0)
  const timeoutIdsRef = useRef<number[]>([])
  const rafIdsRef = useRef<number[]>([])
  const progressRafRef = useRef(0)
  const cancelledRef = useRef(false)
  const phaseRef = useRef<Phase>('inhouse')

  const clearTimers = useCallback(() => {
    timeoutIdsRef.current.forEach((id) => window.clearTimeout(id))
    rafIdsRef.current.forEach((id) => window.cancelAnimationFrame(id))
    if (progressRafRef.current) window.cancelAnimationFrame(progressRafRef.current)
    timeoutIdsRef.current = []
    rafIdsRef.current = []
    progressRafRef.current = 0
  }, [])

  const at = useCallback((ms: number, fn: () => void) => {
    timeoutIdsRef.current.push(
      window.setTimeout(() => {
        if (!cancelledRef.current) fn()
      }, ms)
    )
  }, [])

  const countFromTo = useCallback(
    (from: number, to: number, durationMs: number, onTick: (value: number) => void) => {
      const start = performance.now()
      const tick = (now: number) => {
        if (cancelledRef.current) return
        const t = Math.min(1, (now - start) / durationMs)
        // Smooth ease-out cubic
        const eased = 1 - (1 - t) ** 3
        onTick(Math.round(from + (to - from) * eased))
        if (t < 1) rafIdsRef.current.push(window.requestAnimationFrame(tick))
        else onTick(to)
      }
      rafIdsRef.current.push(window.requestAnimationFrame(tick))
    },
    []
  )

  const startPhase = useCallback(
    (next: Phase) => {
      clearTimers()
      const runId = ++runIdRef.current
      cancelledRef.current = false
      phaseRef.current = next
      phaseStartedAtRef.current = performance.now()
      setProgress(0)
      setPhase(next)

      // Smooth progress 0→100 for this phase; at end, play the other animation
      const tickProgress = (now: number) => {
        if (cancelledRef.current || runId !== runIdRef.current) return
        const elapsed = now - phaseStartedAtRef.current
        const pct = Math.min(100, (elapsed / PHASE_MS) * 100)
        setProgress(pct)
        if (pct >= 100) {
          // Bar finished — advance to the other scene
          startPhase(next === 'inhouse' ? 'credyx' : 'inhouse')
          return
        }
        progressRafRef.current = window.requestAnimationFrame(tickProgress)
      }
      progressRafRef.current = window.requestAnimationFrame(tickProgress)

      if (next === 'inhouse') {
        // Restart from $0 and count up
        setStartAmt(0)
        setMonthlyAmt(0)
        setTotalAmt(0)
        setShowCredyxFoot(false)
        setShowInhouseFoot(false)
        setNoteVisible(false)

        at(120, () => {
          if (runId !== runIdRef.current) return
          setNoteVisible(true)
          setShowInhouseFoot(true)
        })
        at(200, () => {
          if (runId !== runIdRef.current) return
          countFromTo(0, INHOUSE.start, COUNT_UP_MS, setStartAmt)
          countFromTo(0, INHOUSE.monthly, COUNT_UP_MS, setMonthlyAmt)
          countFromTo(0, INHOUSE.total, COUNT_UP_MS, setTotalAmt)
        })
      } else {
        // Switch to Credyx — show copy immediately; numbers count down in parallel
        setShowInhouseFoot(false)
        setShowCredyxFoot(true)
        setNoteVisible(false)
        setStartAmt(INHOUSE.start)
        setMonthlyAmt(INHOUSE.monthly)
        setTotalAmt(INHOUSE.total)

        at(120, () => {
          if (runId !== runIdRef.current) return
          setNoteVisible(true)
          countFromTo(INHOUSE.start, 0, COUNT_DOWN_MS, setStartAmt)
          countFromTo(INHOUSE.monthly, 0, COUNT_DOWN_MS, setMonthlyAmt)
          countFromTo(INHOUSE.total, 0, COUNT_DOWN_MS, setTotalAmt)
        })
      }
    },
    [at, clearTimers, countFromTo]
  )

  useEffect(() => {
    const node = rootRef.current
    if (!node) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setInView(true)
      },
      { threshold: 0.3 }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!inView) return

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) {
      setPhase('credyx')
      setStartAmt(0)
      setMonthlyAmt(0)
      setTotalAmt(0)
      setShowInhouseFoot(false)
      setShowCredyxFoot(true)
      setNoteVisible(true)
      setProgress(100)
      return
    }

    cancelledRef.current = false
    startPhase('inhouse')

    return () => {
      cancelledRef.current = true
      clearTimers()
    }
  }, [inView, startPhase, clearTimers])

  const goNext = () => {
    startPhase(phaseRef.current === 'inhouse' ? 'credyx' : 'inhouse')
  }

  const goPrev = () => {
    startPhase('inhouse')
  }

  const formatMoney = (n: number) => `$${n.toLocaleString('en-US')}`
  const showPerMonth = phase === 'inhouse' || monthlyAmt > 0
  const showTotalAsPercent = phase === 'credyx' && totalAmt === 0

  return (
    <div
      ref={rootRef}
      className={`cx-pricing-hero cx-pricing-hero--animate${
        phase === 'credyx' ? ' is-credyx' : ' is-inhouse'
      }`}
      aria-label="In-house back office cost versus Credyx"
    >
      <div className="cx-pricing-note-slot" aria-live="polite">
        <p
          className={`cx-pricing-note is-warn${
            phase === 'inhouse' && noteVisible ? ' is-shown' : ''
          }`}
        >
          Hiring in-house for back office is expensive
        </p>
        <p
          className={`cx-pricing-note is-good${
            phase === 'credyx' && noteVisible ? ' is-shown' : ''
          }`}
        >
          But with Credyx, this is how it looks
        </p>
      </div>

      <div className="cx-pricing-zeros">
        <div className={phase === 'inhouse' ? 'is-expensive' : 'is-zero'}>
          <span className="cx-pricing-amt">{formatMoney(startAmt)}</span>
          <small>To start</small>
        </div>
        <div className={phase === 'inhouse' ? 'is-expensive' : 'is-zero'}>
          <span className="cx-pricing-amt">
            {formatMoney(monthlyAmt)}
            {showPerMonth ? <em className="cx-pricing-per">/mo</em> : null}
          </span>
          <small className="cx-pricing-card-label">
            <span className={phase === 'inhouse' ? 'is-shown' : ''}>Monthly cost, on average</span>
            <span className={phase === 'credyx' ? 'is-shown' : ''}>No monthly fee</span>
          </small>
        </div>
        <div className={phase === 'inhouse' ? 'is-expensive' : 'is-zero'}>
          <span className="cx-pricing-amt">
            {showTotalAsPercent ? '%' : formatMoney(totalAmt)}
            {phase === 'inhouse' || (totalAmt > 0 && !showTotalAsPercent) ? (
              <em className="cx-pricing-per">/mo</em>
            ) : null}
          </span>
          <small className="cx-pricing-card-label">
            <span className={phase === 'inhouse' ? 'is-shown' : ''}>Est. monthly total</span>
            <span className={phase === 'credyx' ? 'is-shown' : ''}>Only after you&apos;re paid</span>
          </small>
        </div>
      </div>

      <div className="cx-pricing-foot">
        <div
          className={`cx-pricing-foot-panel${showInhouseFoot ? ' is-visible' : ''}`}
          aria-hidden={!showInhouseFoot}
        >
          <p className="cx-pricing-charge-note cx-pricing-charge-note--warn is-visible">
            You pay every month, whether invoices clear or not.
          </p>
          <ol
            className="cx-pricing-steps cx-pricing-steps--cards"
            aria-label="What an in-house hire still requires"
          >
            {INHOUSE_HASSLES.map((item, index) => (
              <li key={item.title}>
                <span className="cx-pricing-step-num">{index + 1}</span>
                <strong>{item.title}</strong>
                <em>{item.detail}</em>
              </li>
            ))}
          </ol>
          <p className="cx-pricing-example is-visible">
            You belong on the road, <strong>not buried in back office work.</strong>
          </p>
        </div>

        <div
          className={`cx-pricing-foot-panel${showCredyxFoot ? ' is-visible' : ''}`}
          aria-hidden={!showCredyxFoot}
        >
          <p className="cx-pricing-charge-note is-visible">
            We only charge a small % when the invoice is paid — not before.
          </p>
          <ol
            className="cx-pricing-steps cx-pricing-steps--cards"
            aria-label="How Credyx pricing works"
          >
            {CREDYX_STEPS.map((item, index) => (
              <li key={item.title}>
                <span className="cx-pricing-step-num">{index + 1}</span>
                <strong>{item.title}</strong>
                <em>{item.detail}</em>
              </li>
            ))}
          </ol>
          <p className="cx-pricing-example is-visible">
            Focus on the road. <strong>We&apos;ll handle the rest</strong> — paperwork to paid on
            time.
          </p>
        </div>
      </div>

      <div className="cx-pricing-controls">
        <div
          className="cx-pricing-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          aria-label="Pricing comparison progress"
        >
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="cx-pricing-nav">
          <button
            type="button"
            className="cx-pricing-nav-btn"
            onClick={goPrev}
            aria-label="Restart in-house comparison"
          >
            <ArrowLeft size={16} strokeWidth={2.5} />
            Restart
          </button>
          <span className="cx-pricing-nav-phase">
            {phase === 'inhouse' ? '1 / 2 · In-house' : '2 / 2 · Credyx'}
          </span>
          <button
            type="button"
            className="cx-pricing-nav-btn"
            onClick={goNext}
            aria-label={phase === 'inhouse' ? 'Show Credyx' : 'Replay from start'}
          >
            {phase === 'inhouse' ? 'Next' : 'Replay'}
            <ArrowRight size={16} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  )
}
