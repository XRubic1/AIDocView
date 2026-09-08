/**
 * Timing tab — payment delays + paid-by-month for the selected broker.
 */
import { useClientTheme } from '../../theme/ThemeContext'
import { formatCurrency } from '../../utils/format'
import { BROKER_RISK_POLICY } from '../../utils/brokerRiskPolicy'
import {
  formatBrokerMonthLabel,
  type BrokerMonthHistory,
  type BrokerPaymentHistory,
} from '../../utils/brokerPaymentHistory'
import type { BrokerPaymentTiming } from '../../utils/brokerPaymentTiming'

export default function AdminBrokerRiskTiming({
  paymentTiming,
  paymentHistory,
  historyMonths,
  termsDays,
  paidSampleSize,
}: {
  paymentTiming: BrokerPaymentTiming | null
  paymentHistory: BrokerPaymentHistory | null
  historyMonths: BrokerMonthHistory[]
  termsDays: number
  paidSampleSize: number
}) {
  const c = useClientTheme()

  return (
    <div className="admin-broker-risk__tab-pane">
      {paymentTiming ? (
        <div
          className={`admin-broker-risk__timing admin-broker-risk__timing--${paymentTiming.severity}`}
          role="status"
        >
          <p className="admin-broker-risk__timing-title">{paymentTiming.headline}</p>
          <p className="admin-broker-risk__timing-summary">{paymentTiming.summary}</p>
          <div className="admin-broker-risk__timing-metrics">
            <div>
              <span>Net terms</span>
              <strong>{paymentTiming.termsDays}d</strong>
            </div>
            <div>
              <span>Avg actual pay</span>
              <strong>{paymentTiming.avgPayDays}d</strong>
            </div>
            <div>
              <span>
                {paymentTiming.daysLate > 0
                  ? 'Days late'
                  : paymentTiming.daysLate < 0
                    ? 'Days early'
                    : 'Vs Net'}
              </span>
              <strong>
                {paymentTiming.daysLate === 0
                  ? 'On time'
                  : `${Math.abs(paymentTiming.daysLate)}d`}
              </strong>
            </div>
            {paymentTiming.paidSampleSize > 0 ? (
              <div>
                <span>Paid sample</span>
                <strong>{paymentTiming.paidSampleSize}</strong>
              </div>
            ) : null}
          </div>
          <p className="admin-broker-risk__timing-hint">
            Avg pay excludes invoices on hold or in dispute. Publishing Medium/High
            pushes clean timing to the carrier portal.
          </p>
        </div>
      ) : (
        <div className="admin-broker-risk__timing admin-broker-risk__timing--empty">
          <p className="admin-broker-risk__timing-title">Actual payment timing</p>
          <p className="admin-broker-risk__timing-summary">
            Need at least {BROKER_RISK_POLICY.min_paid_sample_for_payment_timing} confirmed
            payments to average vs Net {termsDays}d terms
            {paidSampleSize ? ` (have ${paidSampleSize}).` : '.'}
          </p>
        </div>
      )}

      {paymentHistory && paymentHistory.lifetimeCount > 0 ? (
        <div className="admin-broker-risk__timing">
          <p className="admin-broker-risk__timing-title">Payment over months</p>
          <p className="admin-broker-risk__timing-summary">
            {formatCurrency(paymentHistory.lifetimePaid)} confirmed ·{' '}
            {paymentHistory.lifetimeCount} payments
            {paymentHistory.onTimeRate != null
              ? ` · ${paymentHistory.onTimeRate}% on time vs Net`
              : ''}
            {paymentHistory.pausedInvoiceCount > 0
              ? ` · ${paymentHistory.pausedInvoiceCount} on hold/dispute (not in avg)`
              : ''}
          </p>
          <div className="admin-broker-risk__month-chart" aria-label="Paid by month">
            {[...historyMonths].reverse().map((m) => {
              const max = Math.max(1, ...historyMonths.map((x) => x.paidAmount))
              const height = Math.round((m.paidAmount / max) * 100)
              return (
                <div
                  key={m.month}
                  className="admin-broker-risk__month-col"
                  title={`${formatBrokerMonthLabel(m.month)}: ${formatCurrency(m.paidAmount)}`}
                >
                  <div
                    className="admin-broker-risk__month-track"
                    style={{ backgroundColor: c.stat.slate }}
                  >
                    <div
                      className="admin-broker-risk__month-bar"
                      style={{
                        height: `${height}%`,
                        backgroundColor: c.info,
                      }}
                    />
                  </div>
                  <span className="admin-broker-risk__month-tick">{m.month.slice(5)}</span>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <p className="admin-broker-risk__muted" style={{ color: c.mutedLight }}>
          No confirmed payments to chart yet.
        </p>
      )}
    </div>
  )
}
