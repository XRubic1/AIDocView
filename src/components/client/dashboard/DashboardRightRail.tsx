import { useMemo } from 'react'
import type { Invoice } from '../../../types/invoice'
import type { Payment } from '../../../types/payment'
import type { AgingAR } from '../../../types/admin'
import AgingARChart from '../AgingARChart'
import PaymentTrendsChart from '../PaymentTrendsChart'
import { computeCashFlowTrend } from '../../../utils/clientReports'
import { formatCurrency } from '../../../utils/format'

type DashboardRightRailProps = {
  invoices: Invoice[]
  payments: Payment[]
  aging: AgingAR
}

/**
 * Right analytics rail — payment trends + aging (reference side panel).
 */
export default function DashboardRightRail({
  invoices,
  payments,
  aging,
}: DashboardRightRailProps) {
  const { prevMonth, thisMonth } = useMemo(() => {
    const flow = computeCashFlowTrend(invoices, payments, 6)
    return {
      prevMonth: flow[flow.length - 2]?.collected ?? 0,
      thisMonth: flow[flow.length - 1]?.collected ?? 0,
    }
  }, [invoices, payments])

  const currentBucket = aging['1_15'] + aging['16_30']
  const agedBucket = aging['31_45'] + aging['46_60'] + aging['61_90'] + aging.over_91

  return (
    <aside className="cd-rail" aria-label="A/R analytics">
      <section className="cd-rail-panel">
        <header className="cd-rail-panel__head">
          <h2>Payment trends</h2>
          <span className="cd-rail-panel__meta">6 months</span>
        </header>

        <div className="cd-rail-compare">
          <div>
            <p className="cd-rail-compare__label">Before</p>
            <p className="cd-rail-compare__value tabular-nums">
              {formatCurrency(prevMonth)}
            </p>
          </div>
          <div>
            <p className="cd-rail-compare__label">This month</p>
            <p className="cd-rail-compare__value tabular-nums is-accent">
              {formatCurrency(thisMonth)}
            </p>
          </div>
        </div>

        <PaymentTrendsChart payments={payments} invoices={invoices} />
      </section>

      <section className="cd-rail-panel">
        <header className="cd-rail-panel__head">
          <h2>Aging A/R</h2>
          <span className="cd-rail-panel__meta">Open</span>
        </header>

        <div className="cd-rail-compare">
          <div>
            <p className="cd-rail-compare__label">Current (0–30)</p>
            <p className="cd-rail-compare__value tabular-nums is-accent">
              {formatCurrency(currentBucket)}
            </p>
          </div>
          <div>
            <p className="cd-rail-compare__label">Aged (31+)</p>
            <p className="cd-rail-compare__value tabular-nums">
              {formatCurrency(agedBucket)}
            </p>
          </div>
        </div>

        <AgingARChart aging={aging} />
      </section>
    </aside>
  )
}
