import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ExternalLink, X } from 'lucide-react'
import ClientListTd from '../components/client/ClientListTd'
import EmptyState from '../components/ui/EmptyState'
import { mockInvoices } from '../data/mockInvoices'
import { useTenantDataRevision } from '../hooks/useTenantDataRevision'
import { useClientTheme, useTheme } from '../theme/ThemeContext'
import { formatCurrency } from '../utils/format'
import {
  BROKER_AGING_BUCKETS,
  buildBrokerAgingRows,
} from '../utils/brokerAgingSummary'
import { isOpenArInvoice } from '../utils/invoiceAging'
import { openBrokerAgingWindow } from '../utils/openBrokerAgingWindow'
import '../styles/clientPortal.css'
import '../styles/clientPortalDark.css'

function moneyCell(amount: number): string {
  if (amount === 0) return '—'
  return formatCurrency(amount)
}

/**
 * Pop-out: broker concentration and aging for one carrier.
 */
export default function CarrierAgingBrokersPopup() {
  const [searchParams] = useSearchParams()
  const { resolvedTheme } = useTheme()
  const c = useClientTheme()
  const tenantRevision = useTenantDataRevision()
  const clientId = searchParams.get('client') || ''
  const carrierNameParam = searchParams.get('carrier') || ''

  const invoices = useMemo(() => {
    void tenantRevision
    return mockInvoices.filter(
      (invoice) =>
        isOpenArInvoice(invoice) &&
        (invoice.client_id === clientId || invoice.client_name === carrierNameParam)
    )
  }, [clientId, carrierNameParam, tenantRevision])

  const carrierName = carrierNameParam || invoices[0]?.client_name || 'Carrier'
  const brokers = useMemo(() => buildBrokerAgingRows(invoices), [invoices])
  const total = brokers.reduce((sum, row) => sum + row.total, 0)

  return (
    <div
      className="client-portal flex flex-col h-screen overflow-hidden"
      data-theme={resolvedTheme}
      style={{ backgroundColor: c.surface }}
    >
      <header
        className="shrink-0 px-4 py-3 border-b flex items-start justify-between gap-3"
        style={{ borderColor: c.border, backgroundColor: c.card }}
      >
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: c.secondary }}>
            Broker concentration
          </p>
          <h1 className="text-lg font-semibold truncate" style={{ color: c.primary }}>
            {carrierName}
          </h1>
          <p className="text-xs mt-0.5" style={{ color: c.secondary }}>
            {brokers.length} broker{brokers.length === 1 ? '' : 's'} · {formatCurrency(total)} open A/R
          </p>
        </div>
        <button
          type="button"
          className="p-1.5 rounded-lg client-header-icon-btn"
          style={{ color: c.muted }}
          onClick={() => window.close()}
          aria-label="Close window"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      {brokers.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState title="No brokers" hint="This carrier has no open A/R." />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <table className="dashboard-table dashboard-table--compact">
            <thead>
              <tr>
                <th>Broker</th>
                {BROKER_AGING_BUCKETS.map((bucket) => (
                  <th key={bucket.key} className="text-right">
                    {bucket.label}
                  </th>
                ))}
                <th className="text-right">Total</th>
                <th className="text-right">% of carrier</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {brokers.map((row) => (
                <tr key={row.brokerId}>
                  <ClientListTd variant="primary">{row.brokerName}</ClientListTd>
                  {BROKER_AGING_BUCKETS.map((bucket) => (
                    <ClientListTd key={bucket.key} variant="amount" className="tabular-nums">
                      {moneyCell(row.amounts[bucket.key])}
                    </ClientListTd>
                  ))}
                  <ClientListTd variant="amount" className="tabular-nums font-semibold">
                    {formatCurrency(row.total)}
                  </ClientListTd>
                  <ClientListTd variant="amount" className="tabular-nums">
                    {row.percentOfTotal.toFixed(1)}%
                  </ClientListTd>
                  <ClientListTd variant="actions">
                    <button
                      type="button"
                      className="dashboard-btn-secondary dashboard-btn-compact inline-flex items-center gap-1"
                      onClick={() =>
                        openBrokerAgingWindow(row.brokerId, row.brokerName, clientId, carrierName)
                      }
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Invoices
                    </button>
                  </ClientListTd>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
