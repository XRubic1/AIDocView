import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  PauseCircle,
  type LucideIcon,
} from 'lucide-react'

export type DashboardStatusTile = {
  key: string
  label: string
  /** Display value — count or compact money. */
  value: string
  tone: 'neutral' | 'warn' | 'danger' | 'success' | 'info'
  navigateTo: string
  /** Highlight tile when it has attention-worthy activity. */
  active?: boolean
}

type DashboardStatusTilesProps = {
  tiles: DashboardStatusTile[]
}

const TILE_ICONS: Record<string, LucideIcon> = {
  held: PauseCircle,
  overdue: AlertTriangle,
  awaiting: Clock,
  paid30d: CheckCircle2,
}

/**
 * Large status tiles (reference device-card density) — label, icon, value.
 */
export default function DashboardStatusTiles({ tiles }: DashboardStatusTilesProps) {
  const navigate = useNavigate()

  if (tiles.length === 0) return null

  return (
    <section className="cd-status-tiles" aria-label="A/R status">
      {tiles.map((tile) => {
        const Icon = TILE_ICONS[tile.key] ?? CheckCircle2
        return (
          <button
            key={tile.key}
            type="button"
            className={`cd-status-tile tone-${tile.tone}${tile.active ? ' is-active' : ''}`}
            onClick={() => navigate(tile.navigateTo)}
          >
            <span className="cd-status-tile__icon" aria-hidden>
              <Icon size={20} strokeWidth={1.75} />
            </span>
            <span className="cd-status-tile__label">{tile.label}</span>
            <span className="cd-status-tile__value tabular-nums">{tile.value}</span>
          </button>
        )
      })}
    </section>
  )
}
