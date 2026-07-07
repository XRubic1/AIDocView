import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileText,
  RefreshCw,
  Send,
} from 'lucide-react'
import AdminLayout from '../components/AdminLayout'
import { getAllClients } from '../services/clientRegistry'
import {
  computeMonthlyBill,
  formatBillingPeriod,
  getBillForPeriod,
  getBillingStanding,
  hydrateClientBillsFromSupabase,
  issueClientBill,
  markBillPaid,
  previousBillingPeriod,
  refreshOverdueBillStatuses,
  resolveArRate,
  getClientCollectedVolume,
  sendPayoneerRequest,
} from '../services/arBillingService'
import { formatCurrency } from '../utils/format'
import { useToast } from '../components/ui/ToastProvider'
import { SkeletonRows } from '../components/ui/Skeleton'
import type { BillingPeriod } from '../types/billing'
import type { Client } from '../types/client'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface ClientBillRow {
  client: Client
  collectedVolume: number
  ratePct: number
  computedTotal: number
  standing: ReturnType<typeof getBillingStanding>
  billStatus: string
  billId?: string
  payoneerRef?: string
}

export default function Billing() {
  const { showToast } = useToast()
  const clients = getAllClients()
  const [period, setPeriod] = useState<BillingPeriod>(previousBillingPeriod())
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const loadBills = useCallback(async () => {
    setLoading(true)
    try {
      await hydrateClientBillsFromSupabase()
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

  const rows: ClientBillRow[] = useMemo(() => {
    return clients
      .filter((c) => c.status !== 'pending' && c.status !== 'inactive')
      .map((client) => {
        let computed
        try {
          computed = computeMonthlyBill(client.id, period)
        } catch {
          computed = { total: NaN, collectedVolume: 0, ratePct: 0 }
        }

        const bill = getBillForPeriod(client.id, period)
        const collectedVolume = getClientCollectedVolume(client.id, period)
        let ratePct = 0
        try {
          ratePct = resolveArRate(client, collectedVolume)
        } catch {
          ratePct = NaN
        }

        return {
          client,
          collectedVolume,
          ratePct,
          computedTotal: computed.total,
          standing: getBillingStanding(client),
          billStatus: bill?.status ?? '—',
          billId: bill?.id,
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

  const handleIssue = async (clientId: string) => {
    setBusyId(clientId)
    try {
      const bill = await issueClientBill(clientId, period)
      showToast(`Issued bill for ${periodKey} — ${formatCurrency(bill.amount)}`, 'success')
      setRefreshKey((k) => k + 1)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Issue failed', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const handlePayoneer = async (billId: string) => {
    setBusyId(billId)
    try {
      const result = await sendPayoneerRequest(billId)
      if (result.ok) {
        showToast(`Payoneer request sent — ${result.reference}`, 'success')
        setRefreshKey((k) => k + 1)
      } else {
        showToast(result.error ?? 'Payoneer request failed', 'error')
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Payoneer request failed', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const handleMarkPaid = async (billId: string) => {
    setBusyId(billId)
    try {
      await markBillPaid(billId)
      showToast('Bill marked paid', 'success')
      setRefreshKey((k) => k + 1)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const handleIssueAll = async () => {
    const eligible = rows.filter((r) => r.billStatus === '—' && Number.isFinite(r.computedTotal))
    if (eligible.length === 0) {
      showToast('No clients to issue', 'info')
      return
    }
    for (const row of eligible) {
      await handleIssue(row.client.id)
    }
  }

  const standingBadge = (standing: ClientBillRow['standing']) => {
    const styles: Record<string, string> = {
      ok: 'bg-emerald-100 text-emerald-800',
      overdue: 'bg-amber-100 text-amber-800',
      warning: 'bg-orange-100 text-orange-800',
      locked: 'bg-red-100 text-red-800',
    }
    return (
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${styles[standing]}`}>
        {standing}
      </span>
    )
  }

  return (
    <AdminLayout flushMain>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-slate-600" />
            <h1 className="text-lg font-semibold text-slate-900">Monthly Billing</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => shiftPeriod(-1)}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
              aria-label="Previous period"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-slate-700 min-w-[140px] text-center">
              {periodLabel}
            </span>
            <button
              type="button"
              onClick={() => shiftPeriod(1)}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
              aria-label="Next period"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
              aria-label="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleIssueAll()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors"
          >
            <CreditCard className="w-4 h-4" />
            Issue all computed bills
          </button>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white relative">
          {loading && (
            <div className="absolute inset-0 z-10 bg-white/80 p-6">
              <SkeletonRows rows={8} rowClassName="h-12" />
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="dashboard-table dashboard-table--compact w-full min-w-[900px]">
              <thead>
                <tr>
                  <th>Client</th>
                  <th className="text-right">Collected</th>
                  <th className="text-right">Rate</th>
                  <th className="text-right">Bill</th>
                  <th>Status</th>
                  <th>Standing</th>
                  <th>Payoneer</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const id = row.client.id
                  const isBusy = busyId === id || busyId === row.billId
                  const hasBill = row.billStatus !== '—'
                  const canIssue = !hasBill && Number.isFinite(row.computedTotal)

                  return (
                    <tr key={id}>
                      <td>
                        <p className="font-medium text-slate-900">{row.client.name}</p>
                        {row.client.factoring && (
                          <span className="text-[10px] text-blue-600 font-medium">Factoring</span>
                        )}
                      </td>
                      <td className="text-right tabular-nums">
                        {formatCurrency(row.collectedVolume)}
                      </td>
                      <td className="text-right tabular-nums">
                        {Number.isFinite(row.ratePct) ? `${row.ratePct}%` : 'Override needed'}
                      </td>
                      <td className="text-right tabular-nums font-medium">
                        {Number.isFinite(row.computedTotal)
                          ? formatCurrency(row.computedTotal)
                          : '—'}
                      </td>
                      <td className="capitalize text-sm">{row.billStatus}</td>
                      <td>{standingBadge(row.standing)}</td>
                      <td className="text-xs font-mono text-slate-500">
                        {row.payoneerRef ?? '—'}
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {canIssue && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleIssue(id)}
                              className="text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                            >
                              Issue
                            </button>
                          )}
                          {hasBill && row.billStatus !== 'paid' && row.billId && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handlePayoneer(row.billId!)}
                              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                            >
                              <Send className="w-3 h-3" />
                              Payoneer
                            </button>
                          )}
                          {hasBill && row.billStatus !== 'paid' && row.billId && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleMarkPaid(row.billId!)}
                              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              Paid
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Bill = $99 platform fee + A/R rate × confirmed collections for {periodKey}. Issue bills
          at period close, send Payoneer requests, and mark paid when received. Accounts lock after
          90 days unpaid.
        </p>
      </div>
    </AdminLayout>
  )
}
