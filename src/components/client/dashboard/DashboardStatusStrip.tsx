import { useNavigate } from 'react-router-dom'

export type DashboardStatusChip = {
  key: string
  label: string
  /** Display value — count or compact money. */
  value: string
  tone: 'neutral' | 'warn' | 'danger' | 'success' | 'info'
  navigateTo: string
}

type DashboardStatusStripProps = {
  chips: DashboardStatusChip[]
}

/**
 * Compact number chips — label + value only, no descriptions.
 */
export default function DashboardStatusStrip({ chips }: DashboardStatusStripProps) {
  const navigate = useNavigate()

  if (chips.length === 0) return null

  return (
    <section className="cd-status-strip" aria-label="A/R status">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          className={`cd-status-chip tone-${chip.tone}`}
          onClick={() => navigate(chip.navigateTo)}
        >
          <span className="cd-status-chip__value tabular-nums">{chip.value}</span>
          <span className="cd-status-chip__label">{chip.label}</span>
        </button>
      ))}
    </section>
  )
}
