import { Check, User, X } from 'lucide-react'

const CREDYX_POINTS = [
  {
    title: '$0 monthly fees',
    detail: 'No fixed costs, no overhead.',
  },
  {
    title: '$0 startup fees',
    detail: 'Get started without the setup hassle.',
  },
  {
    title: 'Expert team',
    detail: 'Experienced, dedicated A/R specialists.',
  },
  {
    title: 'More time & focus',
    detail: 'You run your business. We handle the rest.',
  },
] as const

const INHOUSE_POINTS = [
  {
    title: '$3,000 – $4,500+ / month',
    detail: 'Salary, benefits, taxes, equipment.',
  },
  {
    title: '$3,000 – $5,000+',
    detail: 'Hiring, training, setup time.',
  },
  {
    title: '1 person',
    detail: 'Limited bandwidth, higher risk.',
  },
  {
    title: 'Less flexibility',
    detail: 'Time off, turnover, management.',
  },
] as const

/**
 * Credyx vs in-house A/R pricing compare — matches the IG creative.
 * Always side-by-side so the contrast stays visible on mobile.
 */
export function WaitlistPricingCompare() {
  return (
    <div
      className="cx-pricing-compare"
      aria-label="Credyx versus hiring an in-house A/R person"
    >
      <div className="cx-pricing-grid">
        <div className="cx-pricing-col cx-pricing-col--credyx">
          <div className="cx-pricing-col-head">
            <span className="cx-pricing-col-icon" aria-hidden>
              <Check size={16} strokeWidth={3} />
            </span>
            <div>
              <p className="cx-pricing-col-title">Credyx</p>
              <p className="cx-pricing-col-sub">On-demand A/R solutions</p>
            </div>
          </div>
          <ul className="cx-pricing-list">
            {CREDYX_POINTS.map((point) => (
              <li key={point.title}>
                <span className="cx-pricing-mark cx-pricing-mark--check" aria-hidden>
                  <Check size={14} strokeWidth={3} />
                </span>
                <div>
                  <strong>{point.title}</strong>
                  <span>{point.detail}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="cx-pricing-col cx-pricing-col--inhouse">
          <div className="cx-pricing-col-head">
            <span className="cx-pricing-col-icon cx-pricing-col-icon--neutral" aria-hidden>
              <User size={16} strokeWidth={2.25} />
            </span>
            <div>
              <p className="cx-pricing-col-title">In-house A/R</p>
              <p className="cx-pricing-col-sub">Full-time employee</p>
            </div>
          </div>
          <ul className="cx-pricing-list">
            {INHOUSE_POINTS.map((point) => (
              <li key={point.title}>
                <span className="cx-pricing-mark cx-pricing-mark--x" aria-hidden>
                  <X size={13} strokeWidth={3} />
                </span>
                <div>
                  <strong>{point.title}</strong>
                  <span>{point.detail}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="cx-pricing-closing">
        Same results. <span>Way less headaches.</span>
      </p>
    </div>
  )
}
