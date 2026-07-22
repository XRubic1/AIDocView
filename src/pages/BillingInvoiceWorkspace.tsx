import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ExternalLink, FileText, X } from 'lucide-react'
import BillingBillDetailPanel from '../components/admin/BillingBillDetailPanel'
import EmptyState from '../components/ui/EmptyState'
import { useToast } from '../components/ui/ToastProvider'
import { getClientById, getAllClients } from '../services/clientRegistry'
import {
  formatBillingPeriod,
  hydrateClientBillsFromSupabase,
  parseBillingPeriod,
  previousBillingPeriod,
  refreshOverdueBillStatuses,
} from '../services/arBillingService'
import { hydrateReimbursementLedgerFromSupabase } from '../services/reimbursementAccountService'
import { useClientTheme, useTheme } from '../theme/ThemeContext'
import { useTenantDataRevision } from '../hooks/useTenantDataRevision'
import '../styles/clientPortal.css'

/**
 * Standalone popup: full client billing invoice with line items, history, and discounts.
 * Opened via `openBillingInvoiceWorkspace` from Monthly Billing.
 */
export default function BillingInvoiceWorkspace() {
  const c = useClientTheme()
  const { resolvedTheme } = useTheme()
  const { showToast } = useToast()
  const tenantRevision = useTenantDataRevision()
  const [searchParams, setSearchParams] = useSearchParams()
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)

  const clientParam = searchParams.get('client')
  const periodParam = searchParams.get('period')

  const period = useMemo(() => {
    if (periodParam && /^\d{4}-\d{2}$/.test(periodParam)) {
      return parseBillingPeriod(periodParam)
    }
    return previousBillingPeriod()
  }, [periodParam])

  const periodKey = formatBillingPeriod(period)
  const periodLabel = new Date(period.year, period.month - 1, 1).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  const clients = getAllClients()
  const selectedClient = useMemo(() => {
    if (clientParam) return getClientById(clientParam) ?? null
    return clients[0] ?? null
  }, [clientParam, clients, refreshKey, tenantRevision])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      await Promise.all([
        hydrateClientBillsFromSupabase(),
        hydrateReimbursementLedgerFromSupabase().catch(() => undefined),
      ])
      refreshOverdueBillStatuses()
    } catch (err) {
      console.error(err)
      showToast('Failed to load billing data', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load, refreshKey, tenantRevision])

  useEffect(() => {
    if (!selectedClient) return
    const next = new URLSearchParams()
    next.set('client', selectedClient.id)
    next.set('period', periodKey)
    if (searchParams.get('client') === selectedClient.id && searchParams.get('period') === periodKey) {
      return
    }
    setSearchParams(next, { replace: true })
  }, [selectedClient, periodKey, searchParams, setSearchParams])

  useEffect(() => {
    const label = selectedClient
      ? `${selectedClient.name} · ${periodLabel}`
      : 'Billing invoice'
    document.title = `${label} · Credyx`
  }, [selectedClient, periodLabel])

  const handleCloseWindow = () => {
    window.close()
  }

  const statusLine = selectedClient
    ? selectedClient.billing?.subscription_status === 'trial'
      ? 'Trial · fees waived until active'
      : `Standing · ${selectedClient.status ?? 'active'}`
    : ''

  return (
    <div
      style={{ backgroundColor: c.surface }}
      className={`client-portal flex flex-col h-screen overflow-hidden ${
        resolvedTheme === 'dark' ? 'client-portal--dark' : ''
      }`}
    >
      <header
        className="shrink-0 flex items-center justify-between gap-3 px-4 py-2 border-b"
        style={{ borderColor: c.border, backgroundColor: c.card }}
      >
        <div className="min-w-0 flex items-center gap-2">
          <FileText className="w-4 h-4 shrink-0" style={{ color: c.secondary }} />
          <div className="min-w-0 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p className="text-sm font-semibold truncate" style={{ color: c.primary }}>
              {selectedClient ? `${selectedClient.name} · ${periodLabel}` : 'Billing workspace'}
            </p>
            {statusLine ? (
              <p className="text-xs truncate" style={{ color: c.secondary }}>
                {statusLine}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Link
            to={
              selectedClient
                ? `/billing?client=${encodeURIComponent(selectedClient.id)}&period=${periodKey}`
                : '/billing'
            }
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded border transition-colors"
            style={{ borderColor: c.border, color: c.primary }}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Main app
          </Link>
          <button
            type="button"
            onClick={handleCloseWindow}
            className="p-1 rounded border transition-colors"
            style={{ borderColor: c.border, color: c.secondary }}
            aria-label="Close window"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {loading && !selectedClient ? (
        <div className="flex-1 flex items-center justify-center text-sm" style={{ color: c.secondary }}>
          Loading…
        </div>
      ) : !selectedClient ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <EmptyState
            icon={FileText}
            title="No client selected"
            hint="Open an invoice from Monthly Billing with Open."
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-hidden" style={{ backgroundColor: c.card }}>
          <BillingBillDetailPanel
            key={`${selectedClient.id}-${periodKey}-${refreshKey}`}
            client={selectedClient}
            period={period}
            onChanged={() => setRefreshKey((k) => k + 1)}
          />
        </div>
      )}
    </div>
  )
}
