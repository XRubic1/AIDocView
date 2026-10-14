import { useEffect, useState } from 'react'

const STEPS = ['Submitted', 'On hold', 'Invoiced', 'Paid'] as const

type StepTone = 'done' | 'hold' | 'idle' | 'current'

const STATUS_COPY: Record<number, { text: string; tone: 'hold' | 'paid' | 'default' }> = {
  0: { text: 'Invoice submitted.', tone: 'default' },
  1: { text: 'On hold — missing info.', tone: 'hold' },
  2: { text: 'Invoice sent to broker.', tone: 'default' },
  3: { text: 'Paid on time.', tone: 'paid' },
}

/**
 * Hero invoice status panel with cycling Submitted → On hold → Invoiced → Paid.
 * Visual demo only — no app data.
 */
export function WaitlistHeroInvoice() {
  const [active, setActive] = useState(0)

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) {
      setActive(3)
      return
    }

    const id = window.setInterval(() => {
      setActive((prev) => (prev + 1) % STEPS.length)
    }, 2200)
    return () => window.clearInterval(id)
  }, [])

  const status = STATUS_COPY[active]

  const toneFor = (index: number): StepTone => {
    if (index < active) return 'done'
    if (index === active && active === 1) return 'hold'
    if (index === active) return 'current'
    return 'idle'
  }

  return (
    <aside className="cx-sales-pnl" aria-hidden="true">
      <div className="cx-sales-pt2">
        <span>
          INV-4821 <small>$2,840.00</small>
        </span>
        <span className="cx-sales-ex">Example</span>
      </div>

      <div className="cx-sales-stp" role="presentation">
        {STEPS.map((label, index) => {
          const tone = toneFor(index)
          return (
            <div
              key={label}
              className={`cx-sales-s${tone === 'done' || tone === 'current' ? ' on' : ''}${
                tone === 'hold' ? ' hold' : ''
              }`}
            >
              <i aria-hidden />
              {label}
            </div>
          )
        })}
      </div>

      <p className={`cx-sales-pst${status.tone === 'hold' ? ' hold' : ''}${status.tone === 'paid' ? ' paid' : ''} on`}>
        {status.text}
      </p>
    </aside>
  )
}
