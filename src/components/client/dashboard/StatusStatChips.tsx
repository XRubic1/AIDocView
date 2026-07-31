import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Clock, Lock } from 'lucide-react'
import { formatCurrency } from '../../../utils/format'

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
 * Compact status stat chips - Held, Overdue, Awaiting, Paid 30d.
 * Fits inside the Open Balance card in a 2x2 or 4-column grid.
 */
export default function StatusStatChips({ chips, loading = false }: StatusStatChipsProps) {
  const navigate = useNavigate()

  if (loading) {
    return (
      <div className="cd-status-chips is-loading" aria-label="Loading status chips">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="cd-status-chip">
            <span className="cd-status-chip__label">—</span>
            <span className="cd-status-chip__value">—</span>
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
              <Icon size={14} strokeWidth={2} />
            </span>
            <span className="cd-status-chip__label">{chip.label}</span>
            <span className="cd-status-chip__value tabular-nums">{chip.value}</span>
          </button>
        )
      })}
    </div>
  )
}
