import { Children, useRef, useState, type ReactNode } from 'react'

type DashboardListSwipeProps = {
  children: ReactNode
}

/**
 * Phone carousel for Broker Risk + Needs attention.
 * Same side-to-side snap pattern as the urgent header.
 */
export default function DashboardListSwipe({ children }: DashboardListSwipeProps) {
  const slides = Children.toArray(children)
  const total = slides.length
  const trackRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)

  /** Keep the dots in sync with whichever slide is snapped into view. */
  const handleTrackScroll = () => {
    const track = trackRef.current
    if (!track || track.clientWidth === 0) return
    const next = Math.round(track.scrollLeft / track.clientWidth)
    setIndex(Math.max(0, Math.min(total - 1, next)))
  }

  return (
    <section
      className="cdv2-list-swipe"
      aria-label="Broker risk and needs attention"
      aria-roledescription="carousel"
    >
      <div
        ref={trackRef}
        className="cdv2-list-swipe__track"
        onScroll={handleTrackScroll}
      >
        {slides.map((slide, i) => (
          <div
            key={i}
            className="cdv2-list-swipe__slide"
            aria-current={i === index ? 'true' : undefined}
          >
            {slide}
          </div>
        ))}
      </div>
      {total > 1 ? (
        <div className="cdv2-list-swipe__dots" aria-hidden>
          {slides.map((_, i) => (
            <span
              key={i}
              className={`cdv2-list-swipe__dot${i === index ? ' is-active' : ''}`}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}
