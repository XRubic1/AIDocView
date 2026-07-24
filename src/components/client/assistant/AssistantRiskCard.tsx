import type { AssistantRiskPayload } from '../../../types/assistant'

interface AssistantRiskCardProps {
  risk: AssistantRiskPayload
}

function riskLabel(level: AssistantRiskPayload['riskLevel']): string {
  if (level === 'low') return 'Low'
  if (level === 'high') return 'High'
  if (level === 'unrated') return 'Unrated'
  return 'Medium'
}

/** Broker risk summary card — freshness line is mandatory. */
export default function AssistantRiskCard({ risk }: AssistantRiskCardProps) {
  return (
    <div className="assistant-risk-card">
      <div className="assistant-risk-card__head">
        <span className={`assistant-risk-chip assistant-risk-chip--${risk.riskLevel}`}>
          Risk: {riskLabel(risk.riskLevel)}
        </span>
        <span className="assistant-risk-card__confidence">
          Confidence: {risk.confidence.charAt(0).toUpperCase() + risk.confidence.slice(1)}
        </span>
      </div>
      <p className="assistant-risk-card__freshness">
        Analyzed {risk.analyzedAtLabel} · {risk.invoiceCount} invoices · notes as recent as{' '}
        {risk.notesRecencyLabel}
      </p>
      <p className="assistant-risk-card__identity">
        {risk.brokerName} · {risk.mcNumber}
      </p>
      <ul className="assistant-risk-card__bullets">
        {risk.bullets.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
      <p className="assistant-risk-card__rec">{risk.recommendation}</p>
      {risk.ageCaveat && <p className="assistant-risk-card__caveat">{risk.ageCaveat}</p>}
    </div>
  )
}
