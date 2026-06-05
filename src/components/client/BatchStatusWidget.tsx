import { useMemo } from 'react'
import { getAllBatches } from '../../data/mockBatches'
import { mockInvoices } from '../../data/mockInvoices'
import { Clock, CheckCircle, AlertCircle, Loader } from 'lucide-react'
import { clientTheme as t } from '../../theme/clientTheme'

interface BatchStatusWidgetProps {
  clientId?: string
  compact?: boolean
}

export default function BatchStatusWidget({ clientId, compact = false }: BatchStatusWidgetProps) {
  const stats = useMemo(() => {
    const allBatches = getAllBatches()
    const allInvoices = mockInvoices

    const clientBatches = clientId
      ? allBatches.filter((b) => b.client_id === clientId)
      : allBatches

    const pendingBatches = clientBatches.filter(
      (b) => b.status === 'ready_to_post' || b.status === 'documents_uploaded'
    ).length

    const inProcessBatches = clientBatches.filter(
      (b) => b.status === 'verification' || b.status === 'approval' || b.status === 'processing'
    ).length

    const processedBatches = clientBatches.filter(
      (b) => b.status === 'submitted' || b.status === 'approved'
    ).length

    const clientInvoices = clientId
      ? allInvoices.filter((inv) => inv.client_id === clientId)
      : allInvoices

    const invoicesOnHold = clientInvoices.filter((inv) => inv.status === 'hold').length

    const processedInvoices = clientInvoices.filter(
      (inv) => inv.status === 'paid' || inv.status === 'force_closed'
    ).length

    return {
      pendingBatches,
      inProcessBatches,
      processedBatches,
      invoicesOnHold,
      processedInvoices,
    }
  }, [clientId])

  const batchItems = [
    { icon: Clock, color: t.accent, label: 'Pending', value: stats.pendingBatches },
    { icon: Loader, color: t.mutedLight, label: 'In Process', value: stats.inProcessBatches },
    { icon: CheckCircle, color: t.success, label: 'Processed', value: stats.processedBatches },
  ]

  const invoiceItems = [
    { icon: AlertCircle, color: t.error, label: 'On Hold', value: stats.invoicesOnHold },
    { icon: CheckCircle, color: t.success, label: 'Processed', value: stats.processedInvoices },
  ]

  if (compact) {
    return (
      <div className="bg-white rounded-lg shadow-sm ring-1 ring-slate-200/60 px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wide shrink-0" style={{ color: t.primary }}>
            Status
          </span>
          {batchItems.map(({ icon: Icon, color, label, value }) => (
            <div key={label} className="inline-flex items-center gap-1">
              <Icon className="w-3 h-3" style={{ color }} />
              <span className="text-[10px]" style={{ color: t.muted }}>{label}</span>
              <span className="text-[10px] font-bold" style={{ color: t.primary }}>{value}</span>
            </div>
          ))}
          <span className="w-px h-3 bg-slate-200 hidden sm:inline" />
          {invoiceItems.map(({ icon: Icon, color, label, value }) => (
            <div key={label} className="inline-flex items-center gap-1">
              <Icon className="w-3 h-3" style={{ color }} />
              <span className="text-[10px]" style={{ color: t.muted }}>{label}</span>
              <span className="text-[10px] font-bold" style={{ color: t.primary }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border rounded-lg p-4" style={{ borderColor: t.border }}>
      <h3 className="text-sm font-bold mb-4" style={{ color: t.primary }}>
        Status Overview
      </h3>

      <div className="space-y-4">
        <div>
          <h4 className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: t.muted }}>
            Batches
          </h4>
          <div className="space-y-2">
            {batchItems.map(({ icon: Icon, color, label, value }) => (
              <div key={label} className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Icon className="w-4 h-4" style={{ color }} />
                  <span className="text-xs" style={{ color: t.primary }}>{label}</span>
                </div>
                <span className="text-sm font-bold" style={{ color: t.primary }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t" style={{ borderColor: t.border }} />

        <div>
          <h4 className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: t.muted }}>
            Invoices
          </h4>
          <div className="space-y-2">
            {invoiceItems.map(({ icon: Icon, color, label, value }) => (
              <div key={label} className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Icon className="w-4 h-4" style={{ color }} />
                  <span className="text-xs" style={{ color: t.primary }}>{label}</span>
                </div>
                <span className="text-sm font-bold" style={{ color: t.primary }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
