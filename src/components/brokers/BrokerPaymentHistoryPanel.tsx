import { useMemo } from 'react'
import { computeBrokerPaymentHistory } from '../../utils/brokerPaymentHistory'
import { mockPayments } from '../../data/mockPayments'
import { mockInvoices } from '../../data/mockInvoices'
import { formatCurrency } from '../../utils/format'
import type { Broker } from '../../types/broker'

/** Month / year payment history for a broker (Credyx Brokers tab). */
export default function BrokerPaymentHistoryPanel({ broker }: { broker: Broker }) {
  const history = useMemo(
    () => computeBrokerPaymentHistory(broker.id, mockPayments, mockInvoices),
    [broker.id]
  )

  return (
    <div className="mt-4 border-t border-gray-200 pt-4">
      <h3 className="text-sm font-semibold text-black mb-2">Payment history</h3>
      <p className="text-xs text-gray-500 mb-3">
        Lifetime: {formatCurrency(history.lifetimePaid)} across {history.lifetimeCount} confirmed
        payment(s). Computed from posted payments (manual or future AI remittance).
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="text-xs font-medium text-gray-600 mb-1">By month</div>
          {history.months.length === 0 ? (
            <p className="text-xs text-gray-400">No confirmed payments yet</p>
          ) : (
            <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
              {history.months.slice(0, 12).map((m) => (
                <li key={m.month} className="flex justify-between gap-2">
                  <span>{m.month}</span>
                  <span className="tabular-nums">
                    {formatCurrency(m.paidAmount)} · {m.paidCount}
                    {m.avgDaysToPay != null ? ` · avg ${m.avgDaysToPay}d` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="text-xs font-medium text-gray-600 mb-1">By year</div>
          {history.years.length === 0 ? (
            <p className="text-xs text-gray-400">No confirmed payments yet</p>
          ) : (
            <ul className="text-xs space-y-1">
              {history.years.map((y) => (
                <li key={y.year} className="flex justify-between gap-2">
                  <span>{y.year}</span>
                  <span className="tabular-nums">
                    {formatCurrency(y.paidAmount)} · {y.paidCount}
                    {y.avgDaysToPay != null ? ` · avg ${y.avgDaysToPay}d` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
