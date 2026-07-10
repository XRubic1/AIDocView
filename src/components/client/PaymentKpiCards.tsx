import { useCallback, useId, useMemo, useState } from 'react'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import { formatCurrency } from '../../utils/format'
import { computePaymentTrendSummary, type KpiDetailType } from '../../utils/paymentTrends'
import type { Payment } from '../../types/payment'
import { getAwaitingReceiptPayments } from '../../utils/paymentStatus'
import { useClientTheme } from '../../theme/ThemeContext'
import { useIsMobileViewport } from '../../hooks/useIsMobileViewport'
import PaymentKpiDetailModal from './PaymentKpiDetailModal'

type PaymentStatusFilter = 'all' | 'pending' | 'confirmed' | 'awaiting_receipt'

const CLOSE_ANIMATION_MS = 280

interface PaymentKpiCardsProps {
  payments: Payment[]
  statusFilter: PaymentStatusFilter
  onStatusFilter: (status: 'confirmed' | 'pending' | 'awaiting_receipt') => void
  showAwaitingConfirmation?: boolean
}

interface KpiCardProps {
  title: string
  value: string
  subtitle?: string
  dataKey: 'paid' | 'pending' | 'count'
  data: Array<{ paid: number; pending: number; count: number }>
  showArea?: boolean
  isActive?: boolean
  onFilter?: () => void
  onChartClick?: () => void
  /** Stronger styling when payments await client confirmation. */
  attention?: boolean
  /** Compact mobile layout — no sparkline. */
  compact?: boolean
}

function Sparkline({
  data,
  dataKey,
  color,
  showArea = false,
}: {
  data: Array<{ paid: number; pending: number; count: number }>
  dataKey: 'paid' | 'pending' | 'count'
  color: string
  showArea?: boolean
}) {
  const gradientId = useId().replace(/:/g, '')

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        {showArea && (
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
        )}
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          fill={showArea ? `url(#${gradientId})` : 'transparent'}
          dot={false}
          isAnimationActive
          animationDuration={600}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function KpiCard({
  title,
  value,
  subtitle,
  dataKey,
  data,
  showArea,
  isActive,
  onFilter,
  onChartClick,
  attention = false,
  compact = false,
}: KpiCardProps) {
  const c = useClientTheme()
  const color =
    dataKey === 'pending' ? c.warning : dataKey === 'count' ? c.info : c.success
  const activeBg =
    dataKey === 'pending' ? c.stat.amber : dataKey === 'count' ? c.stat.blue : c.stat.green

  return (
    <div
      className={[
        'payment-kpi-card',
        compact ? 'payment-kpi-card--compact' : '',
        isActive ? 'payment-kpi-card--active' : '',
        attention ? 'payment-kpi-card--confirm-attention' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={isActive && !attention ? { backgroundColor: activeBg } : undefined}
    >
      <button
        type="button"
        className="payment-kpi-card__body"
        onClick={onFilter}
        aria-pressed={isActive}
      >
        <p className="payment-kpi-card__title" style={{ color: attention ? undefined : c.secondary }}>
          {title}
        </p>
        <p
          className="payment-kpi-card__value tabular-nums"
          style={{ color: attention ? undefined : c.primary }}
        >
          {value}
        </p>
        {subtitle && !compact && (
          <p
            className="payment-kpi-card__subtitle"
            style={{ color: attention ? undefined : c.mutedLight }}
          >
            {subtitle}
          </p>
        )}
      </button>
      {!compact && (
        <button
          type="button"
          className="payment-kpi-card__chart-btn"
          onClick={onChartClick}
          aria-label={`View ${title} details`}
          title="View payment details"
        >
          <div className="payment-kpi-card__sparkline" aria-hidden>
            <Sparkline data={data} dataKey={dataKey} color={color} showArea={showArea} />
          </div>
        </button>
      )}
    </div>
  )
}

/** KPI row with sparklines — click label to filter, click chart for details. */
export default function PaymentKpiCards({
  payments,
  statusFilter,
  onStatusFilter,
  showAwaitingConfirmation = false,
}: PaymentKpiCardsProps) {
  const isMobile = useIsMobileViewport()
  const summary = useMemo(() => computePaymentTrendSummary(payments, 6), [payments])
  const awaitingReceipt = useMemo(() => getAwaitingReceiptPayments(payments), [payments])
  const awaitingReceiptAmount = useMemo(
    () => awaitingReceipt.reduce((sum, p) => sum + p.amount, 0),
    [awaitingReceipt]
  )
  const [detailType, setDetailType] = useState<KpiDetailType | null>(null)
  const [detailClosing, setDetailClosing] = useState(false)

  const openDetail = useCallback((type: KpiDetailType) => {
    setDetailClosing(false)
    setDetailType(type)
  }, [])

  const closeDetail = useCallback(() => {
    setDetailClosing(true)
    window.setTimeout(() => {
      setDetailType(null)
      setDetailClosing(false)
    }, CLOSE_ANIMATION_MS)
  }, [])

  return (
    <>
      <section
        className={[
          'payment-kpi-strip',
          'shrink-0',
          showAwaitingConfirmation && !isMobile ? 'payment-kpi-strip--4' : '',
          isMobile ? 'payment-kpi-strip--mobile-compact' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label="Payment trends"
      >
        <KpiCard
          title="Total Paid"
          value={formatCurrency(summary.totalPaid)}
          dataKey="paid"
          data={summary.months}
          isActive={statusFilter === 'confirmed'}
          compact={isMobile}
          onFilter={() => onStatusFilter('confirmed')}
          onChartClick={() => openDetail('paid')}
        />
        {!isMobile && (
          <>
            <KpiCard
              title="Pending"
              value={formatCurrency(summary.totalPending)}
              subtitle="Awaiting Credyx confirmation"
              dataKey="pending"
              data={summary.months}
              isActive={statusFilter === 'pending'}
              onFilter={() => onStatusFilter('pending')}
              onChartClick={() => openDetail('pending')}
            />
            {showAwaitingConfirmation && (
              <KpiCard
                title="Confirm payment"
                value={String(awaitingReceipt.length)}
                subtitle={
                  awaitingReceipt.length > 0
                    ? `${formatCurrency(awaitingReceiptAmount)} to confirm`
                    : 'None awaiting'
                }
                dataKey="pending"
                data={summary.months}
                isActive={statusFilter === 'awaiting_receipt'}
                attention={awaitingReceipt.length > 0}
                onFilter={() => onStatusFilter('awaiting_receipt')}
                onChartClick={() => openDetail('pending')}
              />
            )}
            <KpiCard
              title="Payments Received"
              value={String(summary.confirmedCount)}
              dataKey="count"
              data={summary.months}
              showArea
              isActive={statusFilter === 'confirmed'}
              onFilter={() => onStatusFilter('confirmed')}
              onChartClick={() => openDetail('received')}
            />
          </>
        )}
      </section>

      {detailType && (
        <PaymentKpiDetailModal
          type={detailType}
          payments={payments}
          closing={detailClosing}
          onClose={closeDetail}
        />
      )}
    </>
  )
}
