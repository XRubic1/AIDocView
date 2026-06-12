import { useId, useMemo } from 'react'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import { formatCurrency } from '../../utils/format'
import {
  computeCashCollectionForecast,
  getForecastSparklinePoints,
} from '../../utils/cashCollectionForecast'
import type { Invoice } from '../../types/invoice'
import type { Payment } from '../../types/payment'
import { useClientTheme } from '../../theme/ThemeContext'

interface CollectionForecastKpiCardProps {
  invoices: Invoice[]
  payments: Payment[]
  onOpenReport?: () => void
}

/** Dashboard KPI — expected collections next 30 days with sparkline. */
export default function CollectionForecastKpiCard({
  invoices,
  payments,
  onOpenReport,
}: CollectionForecastKpiCardProps) {
  const c = useClientTheme()
  const gradientId = useId().replace(/:/g, '')

  const forecast = useMemo(
    () => computeCashCollectionForecast(invoices, payments, 30),
    [invoices, payments]
  )

  const sparklineData = useMemo(
    () => getForecastSparklinePoints(forecast),
    [forecast]
  )

  return (
    <div className="payment-kpi-card collection-forecast-kpi-card">
      <button
        type="button"
        className="payment-kpi-card__body"
        onClick={onOpenReport}
        aria-label="View cash collection forecast report"
      >
        <p className="payment-kpi-card__title" style={{ color: c.secondary }}>
          Collection forecast
        </p>
        <p className="payment-kpi-card__value tabular-nums" style={{ color: c.primary }}>
          {formatCurrency(forecast.next_30_days)}
        </p>
        <p className="payment-kpi-card__subtitle" style={{ color: c.mutedLight }}>
          Next 30 days
        </p>
      </button>
      <button
        type="button"
        className="payment-kpi-card__chart-btn"
        onClick={onOpenReport}
        aria-label="View cash flow report"
        title="View cash flow report"
      >
        <div className="payment-kpi-card__sparkline" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparklineData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c.success} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={c.success} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="amount"
                stroke={c.success}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={false}
                isAnimationActive
                animationDuration={600}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </button>
    </div>
  )
}
