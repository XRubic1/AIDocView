import { useId, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Invoice } from '../../../types/invoice'
import type { Payment } from '../../../types/payment'
import { computeCashFlowTrend } from '../../../utils/clientReports'
import { formatCurrency } from '../../../utils/format'

type DashboardCollectionsChartProps = {
  invoices: Invoice[]
  payments: Payment[]
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
  if (!active || !payload?.length) return null

  return (
    <div className="cd-chart-tooltip">
      <p className="cd-chart-tooltip__label">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="cd-chart-tooltip__row">
          <span
            className="cd-chart-tooltip__dot"
            style={{ background: entry.color }}
            aria-hidden
          />
          {entry.dataKey === 'collected' ? 'Collected' : 'Invoiced'}:{' '}
          <strong className="tabular-nums">{formatCurrency(entry.value)}</strong>
        </p>
      ))}
    </div>
  )
}

/**
 * Wide collections statistic panel — hero total + monthly bar chart.
 */
export default function DashboardCollectionsChart({
  invoices,
  payments,
}: DashboardCollectionsChartProps) {
  const navigate = useNavigate()
  const tipId = useId().replace(/:/g, '')

  const { data, totalCollected, prevCollected } = useMemo(() => {
    const cashFlow = computeCashFlowTrend(invoices, payments, 6)
    const chartData = cashFlow.map((row) => ({
      month: row.month,
      collected: Math.round(row.collected * 100) / 100,
      invoiced: Math.round(row.invoiced * 100) / 100,
    }))
    const last = cashFlow[cashFlow.length - 1]?.collected ?? 0
    const prev = cashFlow[cashFlow.length - 2]?.collected ?? 0
    return {
      data: chartData,
      totalCollected: last,
      prevCollected: prev,
    }
  }, [invoices, payments])

  return (
    <section className="cd-collections" aria-label="Collections statistic">
      <header className="cd-collections__head">
        <div>
          <p className="cd-collections__eyebrow">Statistic</p>
          <h2 className="cd-collections__title">Collections</h2>
        </div>
        <button
          type="button"
          className="cd-collections__action"
          onClick={() => navigate('/client/payments')}
        >
          Full history
        </button>
      </header>

      <div className="cd-collections__hero">
        <p className="cd-collections__amount tabular-nums">
          {formatCurrency(totalCollected)}
        </p>
        <p className="cd-collections__hint">
          Collected this month
          {prevCollected > 0 ? (
            <span className="cd-collections__vs">
              {' '}
              · prev {formatCurrency(prevCollected)}
            </span>
          ) : null}
        </p>
      </div>

      <div className="cd-collections__chart" aria-hidden={data.every((d) => d.collected === 0 && d.invoiced === 0)}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: '#64748b' }}
              tickFormatter={(v) => (v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`)}
              width={44}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(22,132,254,0.08)' }} />
            <Bar
              dataKey="invoiced"
              name="Invoiced"
              fill="#334155"
              radius={[6, 6, 0, 0]}
              maxBarSize={22}
            />
            <Bar
              dataKey="collected"
              name="Collected"
              fill="#1684FE"
              radius={[6, 6, 0, 0]}
              maxBarSize={22}
              id={tipId}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="cd-collections__legend">
        <span>
          <i style={{ background: '#1684FE' }} aria-hidden /> Collected
        </span>
        <span>
          <i style={{ background: '#334155' }} aria-hidden /> Invoiced
        </span>
        <span className="cd-collections__legend-note">Last 6 months</span>
      </div>
    </section>
  )
}
