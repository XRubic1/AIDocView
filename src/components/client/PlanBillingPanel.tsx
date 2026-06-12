import { useMemo } from 'react'
import { formatCurrency } from '../../utils/format'
import { formatStorage } from '../../config/servicePlans'
import { getClientBillingSummary } from '../../services/billingService'
import { getTierLabel } from '../../utils/clientCapabilities'
import { useClientTheme } from '../../theme/ThemeContext'
import type { ServiceTier } from '../../types/client'

interface PlanBillingPanelProps {
  clientId: string
  tier: ServiceTier
}

/** Read-only plan, usage, and mock invoice history for Settings. */
export default function PlanBillingPanel({ clientId, tier }: PlanBillingPanelProps) {
  const c = useClientTheme()
  const summary = useMemo(() => getClientBillingSummary(clientId), [clientId])

  if (!summary) {
    return (
      <p className="text-sm text-center py-8" style={{ color: c.secondary }}>
        Billing information unavailable
      </p>
    )
  }

  const statusColors: Record<string, string> = {
    active: c.success,
    trial: c.info,
    past_due: c.error,
    cancelled: c.muted,
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border" style={{ borderColor: c.border, backgroundColor: c.stat.slate }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: c.mutedLight }}>
            Plan
          </p>
          <p className="text-lg font-bold" style={{ color: c.primary }}>
            {summary.plan.name}
          </p>
          <p className="text-xs mt-1" style={{ color: c.secondary }}>
            {getTierLabel(tier)}
          </p>
        </div>
        <div className="p-4 rounded-xl border" style={{ borderColor: c.border, backgroundColor: c.stat.blue }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: c.mutedLight }}>
            Monthly total
          </p>
          <p className="text-lg font-bold tabular-nums" style={{ color: c.primary }}>
            {formatCurrency(summary.total_monthly)}
          </p>
          <p className="text-xs mt-1" style={{ color: c.secondary }}>
            App {formatCurrency(summary.app_fee_monthly)}
            {summary.service_fee_monthly > 0 &&
              ` + Service ${formatCurrency(summary.service_fee_monthly)}`}
          </p>
        </div>
        <div className="p-4 rounded-xl border" style={{ borderColor: c.border, backgroundColor: c.stat.green }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: c.mutedLight }}>
            Status
          </p>
          <p
            className="text-lg font-bold capitalize"
            style={{ color: statusColors[summary.subscription_status] ?? c.primary }}
          >
            {summary.subscription_status.replace('_', ' ')}
          </p>
        </div>
      </div>

      <div className="p-4 rounded-xl border" style={{ borderColor: c.border }}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold" style={{ color: c.primary }}>
            Storage
          </p>
          <p className="text-xs tabular-nums" style={{ color: c.secondary }}>
            {formatStorage(summary.usage.storage_used_bytes)} /{' '}
            {formatStorage(summary.usage.storage_quota_bytes)}
          </p>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: c.chartGrid }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${summary.usage.storage_pct}%`,
              backgroundColor: summary.usage.storage_pct > 90 ? c.error : c.info,
            }}
          />
        </div>
        <p className="text-xs mt-2" style={{ color: c.mutedLight }}>
          ~{summary.usage.document_count} documents stored
        </p>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3" style={{ color: c.primary }}>
          Recent invoices
        </h3>
        <div className="border rounded-xl overflow-hidden" style={{ borderColor: c.border }}>
          <table className="dashboard-table w-full">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {summary.line_items.map((item) => (
                <tr key={item.id}>
                  <td style={{ color: c.secondary }}>{item.date}</td>
                  <td>{item.description}</td>
                  <td className="tabular-nums">{formatCurrency(item.amount)}</td>
                  <td>
                    <span
                      className="text-xs font-medium capitalize"
                      style={{
                        color:
                          item.status === 'paid'
                            ? c.success
                            : item.status === 'overdue'
                              ? c.error
                              : c.warning,
                      }}
                    >
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs" style={{ color: c.mutedLight }}>
        To change your plan or update payment details, contact{' '}
        <a href="mailto:support@credyx.com" className="underline" style={{ color: c.info }}>
          support@credyx.com
        </a>
        .
      </p>
    </div>
  )
}
