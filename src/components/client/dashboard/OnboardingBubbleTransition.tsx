/**
 * Smooth navy cover transition (welcome → about Credyx).
 * Soft curtain washes top → bottom over 2.5s.
 */
import { useEffect, useRef } from 'react'

type OnboardingBubbleTransitionProps = {
  onComplete: () => void
}

const TRANSITION_MS = 2500

export default function OnboardingBubbleTransition({
  onComplete,
}: OnboardingBubbleTransitionProps) {
  const doneRef = useRef(false)

  useEffect(() => {
    doneRef.current = false
    const t = window.setTimeout(() => {
      if (doneRef.current) return
      doneRef.current = true
      onComplete()
    }, TRANSITION_MS)
    return () => window.clearTimeout(t)
  }, [onComplete])

  return (
    <div className="cd-onboard-wash" aria-hidden>
      <div className="cd-onboard-wash__curtain" />
      <div className="cd-onboard-wash__edge" />
      <div className="cd-onboard-wash__glow" />
    </div>
  )
}
