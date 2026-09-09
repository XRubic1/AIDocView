/**
 * Network broker payment insight — month/year pay behavior across all carriers.
 */
import { useMemo, useState } from 'react'
import { mockBrokers } from '../../data/mockBrokers'
import { mockInvoices } from '../../data/mockInvoices'
import { mockPayments } from '../../data/mockPayments'
import { useTenantDataRevision } from '../../hooks/useTenantDataRevision'
import { useClientTheme } from '../../theme/ThemeContext'
import { formatCurrency } from '../../utils/format'
import {
  formatBrokerMonthLabel,
} from '../../utils/brokerPaymentHistory'
import {
  computeNetworkBrokerPaymentInsights,
  type BrokerPayTrend,
  type NetworkBrokerPaymentInsight,
} from '../../utils/networkBrokerPaymentInsights'
import { listBrokerRiskForAdmin } from '../../services/brokerRiskService'
import { groupAdminBrokerRiskProfiles } from '../../utils/groupAdminBrokerRisk'
import { findBrokerByName } from '../../utils/brokerResolve'

function trendLabel(trend: BrokerPayTrend): string {
  if (trend === 'faster') return 'Paying faster'
  if (trend === 'slower') return 'Paying slower'
  if (trend === 'steady') return 'Steady'
  return 'Thin history'
}

function MonthBars({
  insight,
  barColor,
  trackColor,
}: {
  insight: NetworkBrokerPaymentInsight
  barColor: string
  trackColor: string
}) {
  const chronological = [...insight.monthsFilled].reverse()
  const max = Math.max(1, ...chronological.map((m) => m.paidAmount))

  return (
    <div className="admin-broker-risk__month-chart" aria-label="Paid amount by month">
      {chronological.map((m) => {
        const height = Math.round((m.paidAmount / max) * 100)
        return (
          <div key={m.month} className="admin-broker-risk__month-col" title={`${formatBrokerMonthLabel(m.month)}: ${formatCurrency(m.paidAmount)} · ${m.paidCount} pay · avg ${m.avgDaysToPay ?? '—'}d`}>
            <div className="admin-broker-risk__month-track" style={{ backgroundColor: trackColor }}>
              <div
                className="admin-broker-risk__month-bar"
                style={{ height: `${height}%`, backgroundColor: barColor }}
              />
            </div>
            <span className="admin-broker-risk__month-tick">
              {m.month.slice(5)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** Book-level broker pay insight for Credyx Broker Risk. */
export default function AdminBrokerPaymentInsight() {
  const c = useClientTheme()
  const tenantRevision = useTenantDataRevision()
  const [query, setQuery] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const insights = useMemo(() => {
    void tenantRevision
    const reviewBrokers = groupAdminBrokerRiskProfiles(
      listBrokerRiskForAdmin({ reviewStatus: 'all' })
    ).map((group) => {
      const catalog = mockBrokers.find((b) => b.id === group.brokerId)
      if (catalog) return catalog
      const slugName = group.brokerId.startsWith('broker-name-')
        ? group.brokerId.replace(/^broker-name-/, '').replace(/-/g, ' ')
        : group.brokerId
      const byName = findBrokerByName(slugName)
      return (
        byName ?? {
          id: group.brokerId,
          name: slugName,
        }
      )
    })
    return computeNetworkBrokerPaymentInsights(
      mockInvoices,
      mockPayments,
      mockBrokers,
      reviewBrokers
    )
  }, [tenantRevision])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return insights
    return insights.filter(
      (row) =>
        row.brokerName.toLowerCase().includes(q) ||
        row.brokerId.toLowerCase().includes(q)
    )
  }, [insights, query])

  const selected =
    filtered.find((row) => row.brokerKey === selectedKey) ?? filtered[0] ?? null

  return (
    <div className="admin-broker-risk__workspace">
      <section className="admin-broker-risk__queue" aria-label="Broker payment insight">
        <div className="admin-broker-risk__insight-search">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search brokers…"
            className="admin-broker-risk__note-input"
          />
        </div>
        {filtered.length === 0 ? (
          <p className="admin-broker-risk__empty" style={{ color: c.secondary }}>
            No brokers on the Review queue and no invoice history yet.
          </p>
        ) : (
          <ul className="admin-broker-risk__queue-list">
            {filtered.map((row) => {
              const active = selected?.brokerKey === row.brokerKey
              return (
                <li key={row.brokerKey}>
                  <button
                    type="button"
                    className={`admin-broker-risk__row${active ? ' is-active' : ''}`}
                    onClick={() => setSelectedKey(row.brokerKey)}
                  >
                    <div className="admin-broker-risk__row-main">
                      <span className="admin-broker-risk__row-name" style={{ color: c.primary }}>
                        {row.brokerName}
                      </span>
                      <span
                        className={`admin-broker-risk__chip admin-broker-risk__chip--trend-${row.trend}`}
                      >
                        {trendLabel(row.trend)}
                      </span>
                      {row.outlierCarriers.length > 0 ? (
                        <span className="admin-broker-risk__chip admin-broker-risk__chip--paused">
                          Hold/dispute
                        </span>
                      ) : row.history.pausedInvoiceCount > 0 ? (
                        <span className="admin-broker-risk__chip admin-broker-risk__chip--paused">
                          {row.history.holdCount} hold
                        </span>
                      ) : null}
                    </div>
                    <div className="admin-broker-risk__row-meta" style={{ color: c.secondary }}>
                      {row.carrierCount} carrier{row.carrierCount === 1 ? '' : 's'}
                      {row.history.lifetimeCount > 0
                        ? ` · ${formatCurrency(row.history.lifetimePaid)} paid`
                        : ' · no payments yet'}
                      {row.history.avgDaysToPay != null ? ` · avg ${row.history.avgDaysToPay}d` : ''}
                      {row.history.pausedInvoiceCount > 0
                        ? ` · ${Math.round(row.history.pausedInvoiceShare * 100)}% hold/dispute`
                        : ''}
                      {row.history.openAr > 0 ? ` · ${formatCurrency(row.history.openAr)} open` : ''}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <aside className="admin-broker-risk__panel" aria-label="Broker month history">
        {!selected ? (
          <div className="admin-broker-risk__panel-empty" style={{ color: c.secondary }}>
            Select a broker to see payment history.
          </div>
        ) : (
          <>
            <div className="admin-broker-risk__panel-head">
              <div className="admin-broker-risk__panel-title">
                <h2 style={{ color: c.primary }}>{selected.brokerName}</h2>
                <p style={{ color: c.secondary }}>
                  Across {selected.carrierCount} carrier
                  {selected.carrierCount === 1 ? '' : 's'}
                  {selected.paymentTermsDays != null ? ` · Net ${selected.paymentTermsDays}` : ''}
                  {selected.history.onTimeRate != null
                    ? ` · ${selected.history.onTimeRate}% on time`
                    : ''}
                  {' · avg pay excludes holds & disputes'}
                </p>
              </div>
            </div>

            <div className="admin-broker-risk__facts">
              <div>
                <span>Lifetime paid</span>
                <strong>{formatCurrency(selected.history.lifetimePaid)}</strong>
              </div>
              <div>
                <span>Payments</span>
                <strong>{selected.history.lifetimeCount}</strong>
              </div>
              <div>
                <span>Avg days to pay</span>
                <strong>
                  {selected.history.avgDaysToPay != null
                    ? `${selected.history.avgDaysToPay}d`
                    : '—'}
                </strong>
              </div>
              <div>
                <span>Open A/R</span>
                <strong>{formatCurrency(selected.history.openAr)}</strong>
              </div>
            </div>
            <div className="admin-broker-risk__facts">
              <div>
                <span>On hold</span>
                <strong>{selected.history.holdCount}</strong>
              </div>
              <div>
                <span>Open disputes</span>
                <strong>{selected.history.disputeCount}</strong>
              </div>
              <div>
                <span>Paused share</span>
                <strong>{Math.round(selected.history.pausedInvoiceShare * 100)}%</strong>
              </div>
              <div>
                <span>Paused open $</span>
                <strong>{formatCurrency(selected.history.pausedOpenAr)}</strong>
              </div>
            </div>

            {selected.outlierCarriers.length > 0 ? (
              <p className="admin-broker-risk__insight-trend" style={{ color: c.warning }}>
                {selected.outlierCarriers.map((c) => c.clientName).join(', ')}
                {selected.outlierCarriers.length === 1 ? ' has' : ' have'} 50%+ of loads on
                hold or in dispute — not treated as this broker paying slow.
              </p>
            ) : null}

            {selected.last3AvgDays != null || selected.prior3AvgDays != null ? (
              <p className="admin-broker-risk__insight-trend" style={{ color: c.secondary }}>
                Last 3 months avg {selected.last3AvgDays ?? '—'}d
                {selected.prior3AvgDays != null
                  ? ` · prior 3 months ${selected.prior3AvgDays}d`
                  : ''}
                {' · '}
                {trendLabel(selected.trend)}
              </p>
            ) : null}

            <p className="admin-broker-risk__section-label">Paid by month</p>
            <MonthBars insight={selected} barColor={c.info} trackColor={c.stat.slate} />

            <div className="admin-broker-risk__panel-body admin-broker-risk__insight-tables">
              <div className="admin-broker-risk__col">
                <p className="admin-broker-risk__section-label">Month detail</p>
                <ul className="admin-broker-risk__snippet-list">
                  {selected.monthsFilled
                    .filter((m) => m.paidCount > 0)
                    .slice(0, 18)
                    .map((m) => (
                      <li key={m.month}>
                        <span>
                          {formatBrokerMonthLabel(m.month)} · {formatCurrency(m.paidAmount)} ·{' '}
                          {m.paidCount} pay
                          {m.avgDaysToPay != null ? ` · avg ${m.avgDaysToPay}d` : ''}
                          {m.onTimeRate != null ? ` · ${m.onTimeRate}% on time` : ''}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
              <div className="admin-broker-risk__col">
                <p className="admin-broker-risk__section-label">By carrier</p>
                {selected.carriers.length === 0 ? (
                  <p className="admin-broker-risk__muted" style={{ color: c.mutedLight }}>
                    No carrier history.
                  </p>
                ) : (
                  <ul className="admin-broker-risk__snippet-list">
                    {selected.carriers.slice(0, 20).map((row) => (
                      <li key={row.clientId}>
                        <span>
                          {row.clientName}
                          {row.isBlockedOutlier ? ' · outlier' : ''}
                          {row.holdCount > 0 || row.disputeCount > 0
                            ? ` · ${row.holdCount} hold / ${row.disputeCount} dispute (${Math.round(row.pausedShare * 100)}%)`
                            : ''}
                          {' · '}
                          {formatCurrency(row.paidAmount)}
                          {row.avgDaysToPay != null ? ` · avg ${row.avgDaysToPay}d` : ''}
                          {row.openAr > 0 ? ` · ${formatCurrency(row.openAr)} open` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
