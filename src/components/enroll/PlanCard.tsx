import { Check } from 'lucide-react'
import type { ServicePlan } from '../../types/billing'

interface PlanCardProps {
  plan: ServicePlan
  selected: boolean
  onSelect: () => void
}

/** Selectable pricing card used in step 1 of enrollment (clean light theme). */
export function PlanCard({ plan, selected, onSelect }: PlanCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`cx-plan ${selected ? 'selected' : ''}`}
    >
      {plan.tier === 'managed' && <span className="cx-plan-flag">Full service</span>}
      <span className="cx-plan-check">
        <Check size={14} strokeWidth={3} />
      </span>

      <h3 className="cx-plan-name">{plan.name}</h3>
      <p className="cx-plan-tagline">{plan.tagline}</p>

      <div className="cx-plan-price">
        ${plan.app_fee_monthly}
        <small> /mo app</small>
      </div>
      {plan.service_fee_monthly != null && (
        <p className="cx-plan-service-fee">
          + ${plan.service_fee_monthly}/mo managed service
        </p>
      )}

      <ul className="cx-plan-features">
        {plan.features.slice(0, 4).map((feature) => (
          <li key={feature}>
            <Check size={14} />
            {feature}
          </li>
        ))}
      </ul>
    </button>
  )
}
