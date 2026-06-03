
import {
  FileText,
  AlertCircle,
  DollarSign,
  Phone,
  TrendingUp,
  Clock,
} from 'lucide-react'
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
  const cards = [
    {
      label: 'Batches Pending',
      value: totalBatchesPending,
      icon: <FileText className="w-5 h-5 text-gray-400" />,
      color: totalBatchesPending > 0 ? ('warning' as const) : ('default' as const),
      type: 'batches',
    },
    {
      label: 'Invoices on Hold',
      value: totalInvoicesHLD,
      icon: <AlertCircle className="w-5 h-5 text-gray-400" />,
      color: totalInvoicesHLD > 0 ? ('danger' as const) : ('default' as const),
      type: 'invoices',
    },
    {
      label: 'Total A/R',
      value: formatCurrency(totalAR),
      icon: <DollarSign className="w-5 h-5 text-gray-400" />,
      color: 'default' as const,
      type: 'ar',
    },
    {
      label: 'Collections Alerts',
      value: collectionsAlerts,
      icon: <Phone className="w-5 h-5 text-gray-400" />,
      color: collectionsAlerts > 0 ? ('danger' as const) : ('default' as const),
      type: 'collections',
    },
    {
      label: 'Force-Close Rate (30d)',
      value: `${forceCloseRate}%`,
      icon: <TrendingUp className="w-5 h-5 text-gray-400" />,
      color:
        forceCloseRate < 5
          ? ('success' as const)
          : forceCloseRate < 10
            ? ('warning' as const)
            : ('danger' as const),
      type: 'force-close',
    },
    {
      label: 'Avg Review Time',
      value: `${avgReviewTime} hrs`,
      icon: <Clock className="w-5 h-5 text-gray-400" />,
      color:
        avgReviewTime < 24
          ? ('success' as const)
          : avgReviewTime < 48
            ? ('warning' as const)
            : ('danger' as const),
      type: 'review-time',
    },
  ]

  const getColorStyle = (color: string) => {
    switch (color) {
      case 'success':
        return { color: '#819291' }
      case 'warning':
        return { color: '#C2A558' }
      case 'danger':
        return { color: '#C2A558' }
      default:
        return { color: '#113543' }
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-5">
      {cards.map((card) => (
        <div
          key={card.type}
          className={`p-6 border ${
            onCardClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''
          }`}
          style={{
            backgroundColor: '#FFFFFF',
            borderColor: '#819291',
          }}
          onClick={() => onCardClick?.(card.type)}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium" style={{ color: '#819291' }}>{card.label}</span>
            <div style={{ color: '#819291' }}>{card.icon}</div>
          </div>
          <div className="text-2xl font-bold" style={getColorStyle(card.color)}>
            {card.value}
          </div>
        </div>
      ))}
    </div>
  )
}

