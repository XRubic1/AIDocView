import { useEffect, useId, useMemo } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { X, TrendingUp } from 'lucide-react'
import { formatCurrency, formatDate } from '../../utils/format'
import { computeKpiDetail, type KpiDetailType } from '../../utils/paymentTrends'
import type { Payment } from '../../types/payment'
import { useClientTheme } from '../../theme/ThemeContext'

const RECENT_ROW_LIMIT = 4

interface PaymentKpiDetailModalProps {
  type: KpiDetailType
  payments: Payment[]
  closing?: boolean
  onClose: () => void
}

function DetailTooltip({
  active,
  payload,
  label,
  chartMode,
}: {
  active?: boolean
  payload?: Array<{ value: number; color: string }>
  label?: string
  chartMode: 'amount' | 'count'
}) {
  const c = useClientTheme()
  if (!active || !payload?.length) return null
  const value = payload[0].value

  return (
    <div
      className="rounded-xl px-3 py-2 text-xs shadow-lg border"
      style={{ backgroundColor: c.card, borderColor: c.border }}
    >
      <p className="font-medium mb-1" style={{ color: c.secondary }}>
        {label}
      </p>
      <p className="font-semibold tabular-nums" style={{ color: c.primary }}>
        {chartMode === 'amount' ? formatCurrency(value) : `${value} payment${value === 1 ? '' : 's'}`}
      </p>
    </div>
  )
}

/** Drill-down modal — received-date trend chart + recent payment list (no scroll). */
export default function PaymentKpiDetailModal({
  type,
  payments,
  closing = false,
  onClose,
}: PaymentKpiDetailModalProps) {
  const c = useClientTheme()
  const gradientId = useId().replace(/:/g, '')

  const detail = useMemo(() => computeKpiDetail(payments, type, 6), [payments, type])

  const chartColor =
    type === 'pending' ? c.warning : type === 'received' ? c.info : c.success

  const chartData = useMemo(
    () =>
      detail.months.map((row) => ({
        month: row.month.split(' ')[0],
        fullMonth: row.month,
        value: detail.chartMode === 'amount' ? row.amount : row.count,
      })),
    [detail]
  )

  const displayTotal =
    detail.chartMode === 'amount'
      ? formatCurrency(Number(detail.totalValue))
      : detail.totalValue

  const recentPayments = detail.payments.slice(0, RECENT_ROW_LIMIT)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className={`payment-kpi-modal-overlay ${closing ? 'payment-kpi-modal-overlay--closing' : ''}`}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`payment-kpi-modal ${closing ? 'payment-kpi-modal--closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-kpi-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="payment-kpi-modal__header">
          <div className="payment-kpi-modal__header-main min-w-0">
            <div className="payment-kpi-modal__header-row">
              <div className="flex items-center gap-2 min-w-0">
                <TrendingUp className="w-4 h-4 shrink-0" style={{ color: chartColor }} aria-hidden />
                <h2 id="payment-kpi-modal-title" className="payment-kpi-modal__title">
                  {detail.title}
                </h2>
              </div>
              <span className="payment-kpi-modal__header-total tabular-nums" style={{ color: c.primary }}>
                {displayTotal}
              </span>
            </div>
            <p className="payment-kpi-modal__subtitle" style={{ color: c.secondary }}>
              {detail.subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="payment-kpi-modal__close"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="payment-kpi-modal__body">
          <div className="payment-kpi-modal__grid">
            <section className="payment-kpi-modal__chart-panel">
              <p className="payment-kpi-modal__section-label" style={{ color: c.secondary }}>
                {detail.chartSeriesLabel} — 6 mo
              </p>
              <div className="payment-kpi-modal__chart">
                <ResponsiveContainer width="100%" height="100%">
                  {detail.chartMode === 'count' ? (
                    <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={c.chartGrid} vertical={false} />
                      <XAxis
                        dataKey="month"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: c.muted }}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                        tick={{ fontSize: 9, fill: c.mutedLight }}
                        width={22}
                      />
                      <Tooltip content={<DetailTooltip chartMode={detail.chartMode} />} />
                      <Bar
                        dataKey="value"
                        fill={chartColor}
                        radius={[3, 3, 0, 0]}
                        maxBarSize={24}
                        isAnimationActive
                        animationDuration={700}
                        animationEasing="ease-out"
                      />
                    </BarChart>
                  ) : (
                    <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={chartColor} stopOpacity={0.28} />
                          <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={c.chartGrid} vertical={false} />
                      <XAxis
                        dataKey="month"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: c.muted }}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 9, fill: c.mutedLight }}
                        tickFormatter={(v) =>
                          v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
                        }
                        width={36}
                      />
                      <Tooltip content={<DetailTooltip chartMode={detail.chartMode} />} />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke={chartColor}
                        strokeWidth={2}
                        fill={`url(#${gradientId})`}
                        dot={false}
                        activeDot={{ r: 3, fill: chartColor }}
                        isAnimationActive
                        animationDuration={700}
                        animationEasing="ease-out"
                      />
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              </div>
            </section>

            <section className="payment-kpi-modal__list-panel">
              <p className="payment-kpi-modal__section-label" style={{ color: c.secondary }}>
                Recent received
              </p>
              {recentPayments.length > 0 ? (
                <div className="payment-kpi-modal__table-wrap">
                  <table className="payment-kpi-modal__table">
                    <thead>
                      <tr>
                        <th>Invoice</th>
                        <th className="text-right">Amount</th>
                        <th>Received</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentPayments.map((payment) => (
                        <tr key={payment.id}>
                          <td>
                            <span className="payment-kpi-modal__invoice">{payment.invoice_number}</span>
                            <span className="payment-kpi-modal__broker" style={{ color: c.mutedLight }}>
                              {payment.broker_name}
                            </span>
                          </td>
                          <td className="text-right tabular-nums font-medium">
                            {formatCurrency(payment.amount)}
                          </td>
                          <td className="tabular-nums" style={{ color: c.secondary }}>
                            {formatDate(payment.received_date)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="payment-kpi-modal__empty" style={{ color: c.secondary }}>
                  No payments in this category
                </p>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
