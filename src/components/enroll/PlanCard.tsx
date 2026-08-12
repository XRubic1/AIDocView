import { Check } from 'lucide-react'
import type { ServicePlan } from '../../types/billing'

interface PlanCardProps {
  plan: ServicePlan
  selected?: boolean
  onSelect?: () => void
  /** Single offered plan — display only, not a toggle. */
  solo?: boolean
}

/** Pricing card for enrollment (Full Service showcase or selectable plans). */
export function PlanCard({ plan, selected = true, onSelect, solo = false }: PlanCardProps) {
  const isInteractive = Boolean(onSelect) && !solo
  const className = `cx-plan ${selected || solo ? 'selected' : ''} ${solo ? 'cx-plan--solo' : ''}`

  const body = (
    <>
      <span className="cx-plan-flag">Full service</span>

      {!solo && (
        <span className="cx-plan-check" aria-hidden="true">
          <Check size={14} strokeWidth={3} />
        </span>
      )}

      <h3 className="cx-plan-name">{plan.name}</h3>
      <p className="cx-plan-tagline">{plan.tagline}</p>

      <div className="cx-plan-price">
        ${plan.app_fee_monthly}
        <small> /mo</small>
      </div>
      <p className="cx-plan-service-fee">Platform fee waived — A/R fee only on collected volume</p>

      <ul className="cx-plan-features">
        {plan.features.map((feature) => (
          <li key={feature}>
            <Check size={14} />
            {feature}
          </li>
        ))}
      </ul>
    </>
  )

  if (solo || !isInteractive) {
    return (
      <div className={className} aria-label={`${plan.name} plan`}>
        {body}
      </div>
    )
  }

  return (
    <button type="button" onClick={onSelect} aria-pressed={selected} className={className}>
      {body}
    </button>
  )
}
