import type { BrokerRiskLevel } from '../../types/brokerRisk'

type BrokerRiskLevelChipProps = {
  level: BrokerRiskLevel
  /** Compact for table rows. */
  size?: 'sm' | 'md'
  className?: string
}

function labelFor(level: BrokerRiskLevel): string {
  if (level === 'low') return 'Low risk'
  if (level === 'high') return 'High risk'
  if (level === 'unrated') return 'Unrated'
  return 'Medium risk'
}

/**
 * Carrier-facing Credyx Broker Risk chip (Medium / High after publish).
 */
export default function BrokerRiskLevelChip({
  level,
  size = 'sm',
  className,
}: BrokerRiskLevelChipProps) {
  return (
    <span
      className={`assistant-risk-chip assistant-risk-chip--${level} broker-risk-level-chip broker-risk-level-chip--${size}${
        className ? ` ${className}` : ''
      }`}
      title={`Credyx Broker Risk: ${labelFor(level)}`}
    >
      {labelFor(level)}
    </span>
  )
}
