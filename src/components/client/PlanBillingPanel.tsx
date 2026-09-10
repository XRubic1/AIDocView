import { useMemo } from 'react'
import { AlertTriangle, Info } from 'lucide-react'
import { formatCurrency } from '../../utils/format'
import { formatStorage } from '../../config/servicePlans'
import { getClientBillingSummary } from '../../services/billingService'
import { getTierLabel } from '../../utils/clientCapabilities'
import { useClientTheme } from '../../theme/ThemeContext'
import type { ServiceTier } from '../../types/client'

interface PlanBillingPanelProps {
  clientId: string
  tier: ServiceTier
  fillHeight?: boolean
}

/** Plan, fee terms, period volume, and bill history for Settings. */
export default function PlanBillingPanel({ clientId, tier, fillHeight = false }: PlanBillingPanelProps) {
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

  const standing = summary.billing_standing ?? 'ok'

  const rootClass = fillHeight
    ? 'client-settings-billing flex flex-col flex-1 min-h-0 h-full gap-3 overflow-hidden'
    : 'space-y-6'

  return (
    <div className={rootClass}>
      {standing === 'overdue' && (
        <div
          className="flex items-start gap-2 p-3 rounded-xl border shrink-0 animate-in fade-in duration-300"
          style={{ borderColor: c.warning, backgroundColor: `${c.warning}15` }}
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: c.warning }} />
          <p className="text-xs" style={{ color: c.primary }}>
            You have an overdue bill. Please settle payment to avoid account restrictions.
          </p>
        </div>
      )}

      {standing === 'warning' && (
        <div
          className="flex items-start gap-2 p-3 rounded-xl border shrink-0 animate-in fade-in duration-300"
          style={{ borderColor: c.error, backgroundColor: `${c.error}12` }}
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: c.error }} />
          <p className="text-xs" style={{ color: c.primary }}>
            Your account will be locked if payment is not received within 30 days.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
        <div className="p-3 rounded-xl border" style={{ borderColor: c.border, backgroundColor: c.stat.slate }}>
          <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: c.mutedLight }}>
            Plan
          </p>
          <p className="text-base font-bold" style={{ color: c.primary }}>
            {summary.plan.name}
          </p>
          <p className="text-xs mt-0.5" style={{ color: c.secondary }}>
            {getTierLabel(tier)}
          </p>
        </div>

        <div className="p-3 rounded-xl border" style={{ borderColor: c.border, backgroundColor: c.stat.blue }}>
          <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: c.mutedLight }}>
            Fee terms
          </p>
          <p className="text-base font-bold tabular-nums" style={{ color: c.primary }}>
            {summary.fee_display ?? (summary.rate_pct != null ? `${summary.rate_pct}%` : '—')}
          </p>
          <p className="text-xs mt-0.5" style={{ color: c.secondary }}>
            From client terms
            {summary.factoring ? ' · Factoring' : ''}
          </p>
        </div>

        <div className="p-3 rounded-xl border" style={{ borderColor: c.border, backgroundColor: c.stat.green }}>
          <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: c.mutedLight }}>
            Collected this month
          </p>
          <p className="text-base font-bold tabular-nums" style={{ color: c.primary }}>
            {formatCurrency(summary.collected_volume ?? 0)}
          </p>
          <p className="text-xs mt-0.5" style={{ color: c.secondary }}>
            Confirmed payments only
          </p>
        </div>

        <div className="p-3 rounded-xl border" style={{ borderColor: c.border, backgroundColor: c.stat.slate }}>
          <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: c.mutedLight }}>
            Est. monthly bill
          </p>
          <p className="text-base font-bold tabular-nums" style={{ color: c.primary }}>
            {formatCurrency(summary.total_monthly)}
          </p>
          <p className="text-xs mt-0.5" style={{ color: c.secondary }}>
            App {formatCurrency(summary.app_fee_monthly)}
            {summary.service_fee_monthly > 0 && ` + fee ${formatCurrency(summary.service_fee_monthly)}`}
          </p>
        </div>
      </div>

      <div className="p-3 rounded-xl border shrink-0 flex items-start gap-2" style={{ borderColor: c.border }}>
        <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: c.info }} />
        <p className="text-xs leading-relaxed" style={{ color: c.secondary }}>
          Monthly bill = your fee terms on confirmed collections
          {summary.app_fee_monthly > 0
            ? `, plus ${formatCurrency(summary.app_fee_monthly)} platform fee`
            : ' (no $99 platform fee on this account)'}
          . Pending and reversed payments are excluded.
        </p>
      </div>

      <div className="p-3 rounded-xl border shrink-0" style={{ borderColor: c.border }}>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-sm font-semibold" style={{ color: c.primary }}>
            Storage
          </p>
          <p className="text-xs tabular-nums" style={{ color: c.secondary }}>
            {formatStorage(summary.usage.storage_used_bytes)} /{' '}
            {formatStorage(summary.usage.storage_quota_bytes)}
          </p>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: c.chartGrid }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${summary.usage.storage_pct}%`,
              backgroundColor: summary.usage.storage_pct > 90 ? c.error : c.info,
            }}
          />
        </div>
        <p className="text-[11px] mt-1" style={{ color: c.mutedLight }}>
          ~{summary.usage.document_count} documents stored · Status:{' '}
          <span style={{ color: statusColors[summary.subscription_status] ?? c.primary }}>
            {summary.subscription_status.replace('_', ' ')}
          </span>
        </p>
      </div>

      <div className={fillHeight ? 'flex-1 min-h-0 flex flex-col overflow-hidden' : ''}>
        <h3 className="text-sm font-semibold mb-2 shrink-0" style={{ color: c.primary }}>
          Bill history
        </h3>
        <div
          className={`border rounded-xl overflow-hidden ${fillHeight ? 'flex-1 min-h-0 flex flex-col' : ''}`}
          style={{ borderColor: c.border }}
        >
          {summary.line_items.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: c.secondary }}>
              No bills issued yet
            </p>
          ) : (
            <table className="dashboard-table dashboard-table--compact w-full">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Description</th>
                  <th className="text-right">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {summary.line_items.map((item) => (
                  <tr key={item.id}>
                    <td style={{ color: c.secondary }}>{item.date}</td>
                    <td className="truncate max-w-[200px]">{item.description}</td>
                    <td className="tabular-nums text-right">{formatCurrency(item.amount)}</td>
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
          )}
        </div>
      </div>

      <p className="text-[11px] shrink-0" style={{ color: c.mutedLight }}>
        Payoneer payment requests are sent to your billing email. Questions?{' '}
        <a href="mailto:billing@credyx.com" className="underline" style={{ color: c.info }}>
          billing@credyx.com
        </a>
      </p>
    </div>
  )
}
