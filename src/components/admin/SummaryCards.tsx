
import {
  FileText,
  AlertCircle,
  DollarSign,
  Phone,
  TrendingUp,
  Clock,
} from 'lucide-react'
import { useClientTheme } from '../../theme/ThemeContext'
import { formatCurrency } from '../../utils/format'

interface SummaryCardsProps {
  totalBatchesPending: number
  totalInvoicesHLD: number
  totalAR: number
  collectionsAlerts: number
  forceCloseRate: number
  avgReviewTime: number
  onCardClick?: (cardType: string) => void
}

export function SummaryCards({
  totalBatchesPending,
  totalInvoicesHLD,
  totalAR,
  collectionsAlerts,
  forceCloseRate,
  avgReviewTime,
  onCardClick,
}: SummaryCardsProps) {
  const c = useClientTheme()

  const cards = [
    {
      label: 'Batches Pending',
      value: totalBatchesPending,
      icon: FileText,
      tone: totalBatchesPending > 0 ? 'amber' : 'slate',
      valueColor: totalBatchesPending > 0 ? c.warning : c.primary,
      type: 'batches',
    },
    {
      label: 'Invoices on Hold',
      value: totalInvoicesHLD,
      icon: AlertCircle,
      tone: totalInvoicesHLD > 0 ? 'red' : 'slate',
      valueColor: totalInvoicesHLD > 0 ? c.error : c.primary,
      type: 'invoices',
    },
    {
      label: 'Total A/R',
      value: formatCurrency(totalAR),
      icon: DollarSign,
      tone: 'blue',
      valueColor: c.primary,
      type: 'ar',
    },
    {
      label: 'Collections Alerts',
      value: collectionsAlerts,
      icon: Phone,
      tone: collectionsAlerts > 0 ? 'red' : 'slate',
      valueColor: collectionsAlerts > 0 ? c.error : c.primary,
      type: 'collections',
    },
    {
      label: 'Force-Close Rate (30d)',
      value: `${forceCloseRate}%`,
      icon: TrendingUp,
      tone: forceCloseRate < 5 ? 'green' : forceCloseRate < 10 ? 'amber' : 'red',
      valueColor:
        forceCloseRate < 5 ? c.success : forceCloseRate < 10 ? c.warning : c.error,
      type: 'force-close',
    },
    {
      label: 'Avg Review Time',
      value: `${avgReviewTime} hrs`,
      icon: Clock,
      tone: avgReviewTime < 24 ? 'green' : avgReviewTime < 48 ? 'amber' : 'red',
      valueColor:
        avgReviewTime < 24 ? c.success : avgReviewTime < 48 ? c.warning : c.error,
      type: 'review-time',
    },
  ] as const

  const statBg: Record<string, string> = {
    blue: c.stat.blue,
    amber: c.stat.amber,
    green: c.stat.green,
    slate: c.stat.slate,
    red: c.stat.red,
  }

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <button
            key={card.type}
            type="button"
            disabled={!onCardClick}
            onClick={() => onCardClick?.(card.type)}
            className={`dashboard-card p-4 text-left transition-shadow ${
              onCardClick ? 'dashboard-card-interactive cursor-pointer' : 'cursor-default'
            }`}
            style={{ backgroundColor: statBg[card.tone] }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: c.secondary }}>
                {card.label}
              </span>
              <Icon className="w-4 h-4 shrink-0" style={{ color: c.mutedLight }} strokeWidth={1.75} />
            </div>
            <div className="text-xl font-bold tabular-nums" style={{ color: card.valueColor }}>
              {card.value}
            </div>
          </button>
        )
      })}
    </section>
  )
}
