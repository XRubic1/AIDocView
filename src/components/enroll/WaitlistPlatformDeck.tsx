import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { ArrowLeft, ArrowRight, type LucideIcon } from 'lucide-react'

export type PlatformFeature = {
  icon: LucideIcon
  title: string
  description: string
  points: readonly string[]
}

type Slot = 'far-left' | 'left' | 'center' | 'right' | 'far-right'

const AUTOPLAY_MS = 4500
const SWIPE_THRESHOLD = 40
const RESUME_IDLE_MS = 5000
const DRAG_MAX = 120

type WaitlistPlatformDeckProps = {
  features: readonly PlatformFeature[]
}

/** Circular index helper for looping the deck. */
function wrapIndex(index: number, length: number) {
  if (length <= 0) return 0
  return ((index % length) + length) % length
}

/** Relative slot for a card vs the active index (−2 … +2). */
function slotForOffset(offset: number): Slot | null {
  if (offset === 0) return 'center'
  if (offset === -1) return 'left'
  if (offset === 1) return 'right'
  if (offset === -2) return 'far-left'
  if (offset === 2) return 'far-right'
  return null
}

/** Card body shared by coverflow + reduced-motion layouts. */
function PlatformCardBody({ feature }: { feature: PlatformFeature }) {
  return (
    <>
      <div className="cx-platform-card-icon" aria-hidden>
        <feature.icon size={22} strokeWidth={2} />
      </div>
      <h3 className="cx-platform-card-title">{feature.title}</h3>
      <p className="cx-platform-card-desc">{feature.description}</p>
      <ul className="cx-platform-card-points">
        {feature.points.map((point) => (
          <li key={point}>
            <span className="cx-platform-card-point-dot" aria-hidden />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

/**
 * Coverflow platform deck: sharp center card, blurred side cards,
 * auto-cycle + swipe / arrows / dots.
 */
export function WaitlistPlatformDeck({ features }: WaitlistPlatformDeckProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const resumeTimerRef = useRef<number | null>(null)
  const dragStartX = useRef<number | null>(null)
  const dragActive = useRef(false)
  const didSwipe = useRef(false)

  const [inView, setInView] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [dragOffset, setDragOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(false)

  const count = features.length

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduceMotion(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    const node = rootRef.current
    if (!node) return

    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.35 }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const goTo = useCallback(
    (index: number) => {
      setActiveIndex(wrapIndex(index, count))
      setDragOffset(0)
    },
    [count]
  )

  const goNext = useCallback(() => goTo(activeIndex + 1), [activeIndex, goTo])
  const goPrev = useCallback(() => goTo(activeIndex - 1), [activeIndex, goTo])

  /** Pause autoplay; resume after idle unless still hovering/focusing. */
  const bumpInteraction = useCallback(() => {
    setPaused(true)
    if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current)
    resumeTimerRef.current = window.setTimeout(() => {
      setPaused(false)
    }, RESUME_IDLE_MS)
  }, [])

  useEffect(() => {
    return () => {
      if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current)
    }
  }, [])

  // Auto-cycle when visible and not paused / reduced-motion
  useEffect(() => {
    if (!inView || paused || reduceMotion || count < 2) return

    const id = window.setInterval(() => {
      setActiveIndex((prev) => wrapIndex(prev + 1, count))
    }, AUTOPLAY_MS)

    return () => window.clearInterval(id)
  }, [inView, paused, reduceMotion, count])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    dragActive.current = true
    didSwipe.current = false
    dragStartX.current = event.clientX
    setDragging(true)
    bumpInteraction()
    stageRef.current?.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragActive.current || dragStartX.current == null) return
    const delta = event.clientX - dragStartX.current
    const clamped = Math.max(-DRAG_MAX, Math.min(DRAG_MAX, delta))
    setDragOffset(reduceMotion ? 0 : clamped)
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragActive.current) return
    dragActive.current = false
    setDragging(false)

    const start = dragStartX.current
    dragStartX.current = null
    const delta = start == null ? 0 : event.clientX - start

    if (delta <= -SWIPE_THRESHOLD) {
      didSwipe.current = true
      goNext()
    } else if (delta >= SWIPE_THRESHOLD) {
      didSwipe.current = true
      goPrev()
    } else {
      setDragOffset(0)
    }

    try {
      stageRef.current?.releasePointerCapture(event.pointerId)
    } catch {
      /* already released */
    }
  }

  const onCardActivate = (slot: Slot) => {
    if (didSwipe.current) {
      didSwipe.current = false
      return
    }
    if (slot === 'left' || slot === 'far-left') {
      bumpInteraction()
      goPrev()
    } else if (slot === 'right' || slot === 'far-right') {
      bumpInteraction()
      goNext()
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      bumpInteraction()
      goPrev()
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      bumpInteraction()
      goNext()
    }
  }

  if (count === 0) return null

  const active = features[activeIndex]

  // Reduced motion: single card + pager only
  if (reduceMotion) {
    return (
      <div
        ref={rootRef}
        className="cx-platform-deck reduce-motion reveal reveal-grow"
        role="region"
        aria-roledescription="carousel"
        aria-label="Platform features"
      >
        <div className="cx-platform-pager">
          <div className="cx-platform-dots" role="tablist" aria-label="Feature slides">
            {features.map((feature, index) => (
              <button
                key={feature.title}
                type="button"
                role="tab"
                aria-selected={index === activeIndex}
                aria-label={`Show ${feature.title}`}
                className={`cx-platform-dot${index === activeIndex ? ' is-active' : ''}`}
                onClick={() => {
                  bumpInteraction()
                  goTo(index)
                }}
              />
            ))}
          </div>
        </div>

        <article className="cx-platform-card is-center is-static" aria-live="polite">
          <PlatformCardBody feature={active} />
        </article>

        <div className="cx-platform-nav">
          <button
            type="button"
            className="cx-platform-nav-btn"
            aria-label="Previous feature"
            onClick={() => {
              bumpInteraction()
              goPrev()
            }}
          >
            <ArrowLeft size={16} strokeWidth={2.25} />
          </button>
          <button
            type="button"
            className="cx-platform-nav-btn"
            aria-label="Next feature"
            onClick={() => {
              bumpInteraction()
              goNext()
            }}
          >
            <ArrowRight size={16} strokeWidth={2.25} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={rootRef}
      className="cx-platform-deck reveal reveal-grow"
      role="region"
      aria-roledescription="carousel"
      aria-label="Platform features"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node)) {
          setPaused(false)
        }
      }}
    >
      <div className="cx-platform-pager">
        <div className="cx-platform-dots" role="tablist" aria-label="Feature slides">
          {features.map((feature, index) => (
            <button
              key={feature.title}
              type="button"
              role="tab"
              aria-selected={index === activeIndex}
              aria-label={`Show ${feature.title}`}
              className={`cx-platform-dot${index === activeIndex ? ' is-active' : ''}`}
              onClick={() => {
                bumpInteraction()
                goTo(index)
              }}
            />
          ))}
        </div>
      </div>

      <div
        ref={stageRef}
        className={`cx-platform-stage${dragging ? ' is-dragging' : ''}`}
        style={{ ['--cx-deck-drag' as string]: `${dragOffset}px` }}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {features.map((feature, index) => {
          let offset = index - activeIndex
          if (offset > count / 2) offset -= count
          if (offset < -count / 2) offset += count

          const slot = slotForOffset(offset)
          if (!slot) return null

          const isCenter = slot === 'center'

          return (
            <article
              key={feature.title}
              className={`cx-platform-card is-${slot}`}
              aria-hidden={!isCenter}
              aria-live={isCenter ? 'polite' : undefined}
              onClick={() => onCardActivate(slot)}
            >
              <PlatformCardBody feature={feature} />
            </article>
          )
        })}
      </div>

      <div className="cx-platform-nav">
        <button
          type="button"
          className="cx-platform-nav-btn"
          aria-label="Previous feature"
          onClick={() => {
            bumpInteraction()
            goPrev()
          }}
        >
          <ArrowLeft size={16} strokeWidth={2.25} />
        </button>
        <button
          type="button"
          className="cx-platform-nav-btn"
          aria-label="Next feature"
          onClick={() => {
            bumpInteraction()
            goNext()
          }}
        >
          <ArrowRight size={16} strokeWidth={2.25} />
        </button>
      </div>
    </div>
  )
}
