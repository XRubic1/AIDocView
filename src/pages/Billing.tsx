import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RefreshCw,
} from 'lucide-react'
import AdminLayout from '../components/AdminLayout'
import { getAllClients } from '../services/clientRegistry'
import {
  computeMonthlyBill,
  formatBillingPeriod,
  getBillForPeriod,
  getBillingStanding,
  hydrateClientBillsFromSupabase,
  previousBillingPeriod,
  refreshOverdueBillStatuses,
  getClientCollectedVolume,
} from '../services/arBillingService'
import {
  getReimbursementReportForPeriod,
  hydrateReimbursementLedgerFromSupabase,
} from '../services/reimbursementAccountService'
import { openBillingInvoiceWorkspace } from '../utils/openBillingInvoiceWorkspace'
import { formatCurrency } from '../utils/format'
import { useToast } from '../components/ui/ToastProvider'
import { SkeletonRows } from '../components/ui/Skeleton'
import type { BillingPeriod } from '../types/billing'
import type { Client } from '../types/client'
import '../styles/clientPortal.css'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface ClientBillRow {
  client: Client
  collectedVolume: number
  feeDisplay: string
  computedTotal: number
  grossSubtotal: number
  isTrial: boolean
  reimbursementBalance: number
  standing: ReturnType<typeof getBillingStanding>
  billStatus: string
  payoneerRef?: string
}

export default function Billing() {
  const { showToast } = useToast()
  const clients = getAllClients()
  const [period, setPeriod] = useState<BillingPeriod>(previousBillingPeriod())
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const loadBills = useCallback(async () => {
    setLoading(true)
    try {
      await Promise.all([
        hydrateClientBillsFromSupabase(),
        hydrateReimbursementLedgerFromSupabase().catch(() => undefined),
      ])
      refreshOverdueBillStatuses()
    } catch (err) {
      console.error(err)
      showToast('Failed to load bills', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void loadBills()
  }, [loadBills, refreshKey])

  // Refresh list when a popup workspace may have changed data.
  useEffect(() => {
    const onFocus = () => setRefreshKey((k) => k + 1)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const rows: ClientBillRow[] = useMemo(() => {
    return clients
      .filter((c) => c.status !== 'pending' && c.status !== 'inactive')
      .map((client) => {
        let computed
        try {
          computed = computeMonthlyBill(client.id, period)
        } catch {
          computed = {
            total: NaN,
            collectedVolume: 0,
            ratePct: 0,
            isTrial: client.billing?.subscription_status === 'trial',
            grossSubtotal: NaN,
            feeDisplay: client.fee_terms
              ? client.fee_terms.fee_type === 'flat'
                ? `$${client.fee_terms.flat_fee_amount ?? 0} flat`
                : `${client.fee_terms.fee_percentage ?? 0}%`
              : 'No fee terms',
          }
        }

        const bill = getBillForPeriod(client.id, period)
        const collectedVolume = getClientCollectedVolume(client.id, period)
        const reimbReport = getReimbursementReportForPeriod(client.id, period)

        return {
          client,
          collectedVolume,
          feeDisplay: computed.feeDisplay ?? '—',
          computedTotal: computed.total,
          grossSubtotal: computed.grossSubtotal ?? NaN,
          isTrial: Boolean(computed.isTrial),
          reimbursementBalance: reimbReport.pendingOnAccount,
          standing: getBillingStanding(client),
          billStatus: bill?.status ?? '—',
          payoneerRef: bill?.payoneer_reference,
        }
      })
  }, [clients, period, refreshKey])

  const periodLabel = `${MONTH_NAMES[period.month - 1]} ${period.year}`
  const periodKey = formatBillingPeriod(period)

  const shiftPeriod = (delta: number) => {
    const d = new Date(period.year, period.month - 1 + delta, 1)
    setPeriod({ year: d.getFullYear(), month: d.getMonth() + 1 })
  }

  const openInvoice = (clientId: string) => {
    const win = openBillingInvoiceWorkspace(clientId, periodKey)
    if (!win) {
      showToast('Popup blocked. Allow popups to open the invoice window.', 'error')
    }
  }

  const standingBadge = (standing: ClientBillRow['standing']) => {
    const styles: Record<string, string> = {
      ok: 'status-pill status-pill--paid',
      overdue: 'status-pill status-pill--pending',
      warning: 'status-pill status-pill--hold',
      locked: 'status-pill status-pill--overdue',
    }
    return (
      <span className={`${styles[standing] ?? 'status-pill'} capitalize`}>{standing}</span>
    )
  }

  return (
    <AdminLayout flushMain>
      <div className="flex flex-col min-h-0 h-full overflow-hidden">
        <div className="client-page-toolbar shrink-0 flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => shiftPeriod(-1)}
              className="p-1.5 rounded-md border border-slate-200 hover:bg-slate-50"
              aria-label="Previous period"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-slate-800 min-w-[120px] text-center">
              {periodLabel}
            </span>
            <button
              type="button"
              onClick={() => shiftPeriod(1)}
              className="p-1.5 rounded-md border border-slate-200 hover:bg-slate-50"
              aria-label="Next period"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="p-1.5 rounded-md border border-slate-200 hover:bg-slate-50"
              aria-label="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <p className="text-xs text-slate-500">$99 + fee terms × collected · {periodKey}</p>
        </div>

        <div className="client-table-scroll flex-1 min-h-0 overflow-auto relative">
          {loading && (
            <div className="absolute inset-0 z-10 bg-white/80 p-6">
              <SkeletonRows rows={8} rowClassName="h-12" />
            </div>
          )}
          <table className="dashboard-table dashboard-table--compact w-full min-w-[860px]">
            <thead>
              <tr>
                <th>Client</th>
                <th className="text-right">Collected</th>
                <th className="text-right">Fee terms</th>
                <th className="text-right">On account</th>
                <th className="text-right">Amount due</th>
                <th>Status</th>
                <th>Standing</th>
                <th>Payoneer</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const id = row.client.id
                return (
                  <tr
                    key={id}
                    className="dashboard-table-row--clickable"
                    onClick={() => openInvoice(id)}
                  >
                    <td>
                      <p className="font-medium text-slate-900">{row.client.name}</p>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {row.client.factoring && (
                          <span className="text-[10px] text-blue-600 font-medium">Factoring</span>
                        )}
                        {row.isTrial && (
                          <span className="text-[10px] text-indigo-600 font-medium">Trial</span>
                        )}
                      </div>
                    </td>
                    <td className="text-right tabular-nums">
                      {formatCurrency(row.collectedVolume)}
                    </td>
                    <td className="text-right tabular-nums">{row.feeDisplay}</td>
                    <td className="text-right tabular-nums text-slate-600">
                      {row.reimbursementBalance > 0
                        ? formatCurrency(row.reimbursementBalance)
                        : '—'}
                    </td>
                    <td className="text-right tabular-nums font-medium">
                      {Number.isFinite(row.computedTotal) ? (
                        <span className="inline-flex flex-col items-end">
                          <span>{formatCurrency(row.computedTotal)}</span>
                          {row.isTrial &&
                            Number.isFinite(row.grossSubtotal) &&
                            row.grossSubtotal > 0 && (
                              <span className="text-[10px] font-normal text-slate-500">
                                waived {formatCurrency(row.grossSubtotal)}
                              </span>
                            )}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="capitalize text-sm">{row.billStatus}</td>
                    <td>{standingBadge(row.standing)}</td>
                    <td className="text-xs font-mono text-slate-500">
                      {row.payoneerRef ?? '—'}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          openInvoice(id)
                        }}
                        className="dashboard-btn-secondary dashboard-btn-compact inline-flex items-center gap-1"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Open
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  )
}
