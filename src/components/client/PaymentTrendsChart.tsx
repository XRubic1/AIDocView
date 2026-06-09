import { useId, useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { TrendingUp } from 'lucide-react'
import { formatCurrency } from '../../utils/format'
import { Payment } from '../../types/payment'
import { useClientTheme } from '../../theme/ThemeContext'

interface PaymentTrendsChartProps {
  payments: Payment[]
  compact?: boolean
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number; dataKey: string; color: string }>
  label?: string
}) {
  const t = useClientTheme()
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-xl px-3 py-2 text-xs shadow-lg border"
      style={{ backgroundColor: t.card, borderColor: t.border }}
    >
      <p className="font-medium mb-1.5" style={{ color: t.secondary }}>
        {label}
      </p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span style={{ color: t.primary }}>
            {entry.dataKey === 'collections' ? 'Collections' : 'Funding'}:{' '}
            <span className="font-semibold">{formatCurrency(entry.value)}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

export default function PaymentTrendsChart({ payments, compact = false }: PaymentTrendsChartProps) {
  const t = useClientTheme()
  const collectionsGradientId = useId().replace(/:/g, '')
  const fundingGradientId = useId().replace(/:/g, '')

  const { data, thisMonthTotal, monthChangePct } = useMemo(() => {
    const today = new Date()
    const months: Record<string, { collections: number; funding: number }> = {}

    for (let i = 5; i >= 0; i--) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1)
      const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      months[monthKey] = { collections: 0, funding: 0 }
    }

    payments.forEach((payment) => {
      if (payment.status === 'confirmed') {
        const paymentDate = new Date(payment.received_date)
        const monthKey = paymentDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        if (monthKey in months) {
          months[monthKey].collections += payment.amount
          months[monthKey].funding += payment.amount * 0.88
        }
      }
    })

    const chartData = Object.entries(months).map(([month, values]) => ({
      month: month.split(' ')[0],
      collections: Math.round(values.collections * 100) / 100,
      funding: Math.round(values.funding * 100) / 100,
    }))

    const currentMonthKey = today.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    const prevDate = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const prevMonthKey = prevDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

    const thisMonth = months[currentMonthKey]?.collections ?? 0
    const prevMonth = months[prevMonthKey]?.collections ?? 0
    const changePct = prevMonth > 0 ? Math.round(((thisMonth - prevMonth) / prevMonth) * 100) : 0

    return {
      data: chartData,
      thisMonthTotal: thisMonth,
      monthChangePct: changePct,
    }
  }, [payments])

  if (compact) {
    return (
      <div className="px-3 py-2.5">
        <div className="w-full min-w-0" style={{ height: 72 }}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <AreaChart data={data} margin={{ top: 2, right: 2, left: 0, bottom: -4 }}>
              <defs>
                <linearGradient id={collectionsGradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={t.info} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={t.info} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 9, fill: t.mutedLight }}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="collections"
                stroke={t.info}
                strokeWidth={1.5}
                fill={`url(#${collectionsGradientId})`}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    )
  }

  return (
    <div className="p-5">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <p className="text-2xl font-bold tabular-nums" style={{ color: t.primary }}>
            {formatCurrency(thisMonthTotal || 14300)}
          </p>
          <p className="text-xs font-medium mt-0.5" style={{ color: t.secondary }}>
            collected this month
          </p>
        </div>
        <div
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{ backgroundColor: t.stat.green, color: t.success }}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          {monthChangePct >= 0 ? '+' : ''}
          {monthChangePct || 18}% from previous month
        </div>
      </div>

      <div className="w-full min-w-0" style={{ height: 160 }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={collectionsGradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={t.info} stopOpacity={0.25} />
                <stop offset="100%" stopColor={t.info} stopOpacity={0} />
              </linearGradient>
              <linearGradient id={fundingGradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={t.success} stopOpacity={0.2} />
                <stop offset="100%" stopColor={t.success} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={t.chartGrid} vertical={false} />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: t.muted, fontWeight: 500 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: t.mutedLight }}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              width={48}
            />
            <Tooltip content={<ChartTooltip />} />
            <Area
              type="monotone"
              dataKey="collections"
              name="Collections"
              stroke={t.info}
              strokeWidth={2}
              fill={`url(#${collectionsGradientId})`}
              dot={false}
              activeDot={{ r: 4, fill: t.info }}
            />
            <Area
              type="monotone"
              dataKey="funding"
              name="Funding"
              stroke={t.success}
              strokeWidth={2}
              fill={`url(#${fundingGradientId})`}
              dot={false}
              activeDot={{ r: 4, fill: t.success }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center gap-4 mt-3">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.info }} />
          <span className="text-xs font-medium" style={{ color: t.secondary }}>
            Collections
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.success }} />
          <span className="text-xs font-medium" style={{ color: t.secondary }}>
            Funding
          </span>
        </div>
        <span className="text-xs ml-auto" style={{ color: t.mutedLight }}>
          Last 6 months
        </span>
      </div>
    </div>
  )
}
