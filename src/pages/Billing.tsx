import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, FileText, RefreshCw, Search } from 'lucide-react'
import { getAllClients, getClientById } from '../services/clientRegistry'
import {
  computeMonthlyBill,
  formatBillingPeriod,
  getBillForPeriod,
  getPeriodBilledInvoices,
  hydrateClientBillsFromSupabase,
  parseBillingPeriod,
  previousBillingPeriod,
  refreshOverdueBillStatuses,
  getClientCollectedVolume,
} from '../services/arBillingService'
import { hydrateReimbursementLedgerFromSupabase } from '../services/reimbursementAccountService'
import CarrierMonthlyBillPanel from '../components/admin/CarrierMonthlyBillPanel'
import EmptyState from '../components/ui/EmptyState'
import { useToast } from '../components/ui/ToastProvider'
import { SkeletonRows } from '../components/ui/Skeleton'
import { formatCurrency } from '../utils/format'
import type { BillingPeriod } from '../types/billing'
import type { Client } from '../types/client'
import '../styles/clientPortal.css'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function statusLabel(client: Client, period: BillingPeriod): string {
  const bill = getBillForPeriod(client.id, period)
  if (!bill) return 'Draft'
  if (bill.status === 'paid') return 'Paid'
  if (bill.emailed_at) return 'Sent'
  return 'Issued'
}

export default function Billing() {
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const clients = getAllClients()
  const [period, setPeriod] = useState<BillingPeriod>(() => {
    const p = searchParams.get('period')
    if (p && /^\d{4}-\d{2}$/.test(p)) return parseBillingPeriod(p)
    return previousBillingPeriod()
  })
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const periodKey = formatBillingPeriod(period)
  const periodLabel = `${MONTH_NAMES[period.month - 1]} ${period.year}`
  const selectedId = searchParams.get('client')

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

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return clients
      .filter((c) => c.status !== 'pending' && c.status !== 'inactive')
      .filter((c) => !q || c.name.toLowerCase().includes(q) || (c.email ?? '').toLowerCase().includes(q))
      .map((client) => {
        let due = NaN
        try {
          due = computeMonthlyBill(client.id, period).total
        } catch {
          due = NaN
        }
        const bill = getBillForPeriod(client.id, period)
        return {
          client,
          collected: getClientCollectedVolume(client.id, period),
          loads: getPeriodBilledInvoices(client.id, period).length,
          due: bill?.amount ?? due,
          status: statusLabel(client, period),
        }
      })
  }, [clients, period, query, refreshKey])

  const selectedClient = useMemo(() => {
    if (selectedId) return getClientById(selectedId) ?? null
    return null
  }, [selectedId, clients, refreshKey])

  const shiftPeriod = (delta: number) => {
    const d = new Date(period.year, period.month - 1 + delta, 1)
    const next = { year: d.getFullYear(), month: d.getMonth() + 1 }
    setPeriod(next)
    const params = new URLSearchParams(searchParams)
    params.set('period', formatBillingPeriod(next))
    if (selectedId) params.set('client', selectedId)
    setSearchParams(params, { replace: true })
  }

  const selectClient = (id: string) => {
    setSearchParams({ client: id, period: periodKey }, { replace: true })
  }

  return (
    <div className="flex min-h-0 h-full overflow-hidden bg-slate-50">
      <aside className="w-[min(100%,360px)] shrink-0 flex flex-col border-r border-slate-200 bg-white min-h-0">
        <div className="shrink-0 px-3 py-2.5 border-b border-slate-200 space-y-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => shiftPeriod(-1)}
              className="p-1.5 rounded-md border border-slate-200 hover:bg-slate-50"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="flex-1 text-sm font-semibold text-slate-900 text-center truncate">
              {periodLabel}
            </span>
            <button
              type="button"
              onClick={() => shiftPeriod(1)}
              className="p-1.5 rounded-md border border-slate-200 hover:bg-slate-50"
              aria-label="Next month"
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
          <label className="relative block">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search carriers"
              className="client-input w-full text-sm pl-8"
            />
          </label>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto relative">
          {loading && (
            <div className="absolute inset-0 z-10 bg-white/80 p-4">
              <SkeletonRows rows={8} rowClassName="h-14" />
            </div>
          )}
          {rows.length === 0 && !loading ? (
            <p className="px-4 py-8 text-sm text-slate-500 text-center">No carriers for this month.</p>
          ) : (
            <ul>
              {rows.map((row) => {
                const active = row.client.id === selectedId
                return (
                  <li key={row.client.id}>
                    <button
                      type="button"
                      onClick={() => selectClient(row.client.id)}
                      className={`w-full text-left px-3 py-2.5 border-b border-slate-100 transition-colors ${
                        active ? 'bg-sky-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-slate-900 truncate">{row.client.name}</p>
                        <span
                          className={`text-[10px] font-semibold uppercase tracking-wide shrink-0 ${
                            row.status === 'Paid'
                              ? 'text-emerald-700'
                              : row.status === 'Sent'
                                ? 'text-sky-700'
                                : 'text-slate-500'
                          }`}
                        >
                          {row.status}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-slate-500">
                        <span>
                          {row.loads} load{row.loads === 1 ? '' : 's'} · {formatCurrency(row.collected)}
                        </span>
                        <span className="tabular-nums font-medium text-slate-800">
                          {Number.isFinite(row.due) ? formatCurrency(row.due) : '—'}
                        </span>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>

      <main className="flex-1 min-w-0 min-h-0">
        {selectedClient ? (
          <CarrierMonthlyBillPanel
            key={`${selectedClient.id}-${periodKey}-${refreshKey}`}
            client={selectedClient}
            period={period}
            onChanged={() => setRefreshKey((k) => k + 1)}
          />
        ) : (
          <div className="h-full flex items-center justify-center p-8">
            <EmptyState
              icon={FileText}
              title="Select a carrier"
              hint="Pick a carrier on the left to see paid loads, issue the Credyx invoice, and email a payment link."
            />
          </div>
        )}
      </main>
    </div>
  )
}
