import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Clock, Lock } from 'lucide-react'

type StatusStatChip = {
  key: string
  label: string
  value: string
  count: number
  tone: 'neutral' | 'warn' | 'danger' | 'success' | 'info'
  navigateTo: string
}

type StatusStatChipsProps = {
  chips: StatusStatChip[]
  loading?: boolean
}

const CHIP_ICONS = {
  held: Lock,
  overdue: AlertTriangle,
  awaiting: Clock,
  paid30d: CheckCircle2,
}

/**
 * Compact status chips — icon beside label + value (Held, Overdue, Awaiting, Paid 30d).
 */
export default function StatusStatChips({ chips, loading = false }: StatusStatChipsProps) {
  const navigate = useNavigate()

  if (loading) {
    return (
      <div className="cd-status-chips is-loading" aria-label="Loading status chips">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="cd-status-chip">
            <span className="cd-status-chip__icon" aria-hidden />
            <span className="cd-status-chip__text">
              <span className="cd-status-chip__label">—</span>
              <span className="cd-status-chip__value">—</span>
            </span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="cd-status-chips" aria-label="A/R status breakdown">
      {chips.map((chip) => {
        const Icon = CHIP_ICONS[chip.key as keyof typeof CHIP_ICONS] || CheckCircle2
        return (
          <button
            key={chip.key}
            type="button"
            className={`cd-status-chip tone-${chip.tone}`}
            onClick={() => navigate(chip.navigateTo)}
            title={`${chip.count} ${chip.label}`}
          >
            <span className="cd-status-chip__icon" aria-hidden>
              <Icon size={12} strokeWidth={2.25} />
            </span>
            <span className="cd-status-chip__text">
              <span className="cd-status-chip__label">{chip.label}</span>
              <span className="cd-status-chip__value tabular-nums">{chip.value}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
