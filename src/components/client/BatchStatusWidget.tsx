import { useMemo } from 'react'
import { getAllBatches } from '../../data/mockBatches'
import { mockInvoices } from '../../data/mockInvoices'
import { FileText, Clock, CheckCircle, AlertCircle, Loader } from 'lucide-react'

interface BatchStatusWidgetProps {
  clientId?: string
}

export default function BatchStatusWidget({ clientId }: BatchStatusWidgetProps) {
  const stats = useMemo(() => {
    const allBatches = getAllBatches()
    const allInvoices = mockInvoices

    // Filter batches by client if clientId provided
    const clientBatches = clientId
      ? allBatches.filter((b) => b.client_id === clientId)
      : allBatches

    // Calculate batch stats
    const pendingBatches = clientBatches.filter(
      (b) => b.status === 'ready_to_post' || b.status === 'documents_uploaded'
    ).length

    const inProcessBatches = clientBatches.filter(
      (b) => b.status === 'verification' || b.status === 'approval' || b.status === 'processing'
    ).length

    const processedBatches = clientBatches.filter(
      (b) => b.status === 'submitted' || b.status === 'approved'
    ).length

    // Filter invoices by client if clientId provided
    const clientInvoices = clientId
      ? allInvoices.filter((inv) => inv.client_id === clientId)
      : allInvoices

    // Calculate invoice stats
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

  return (
    <div
      className="bg-white border rounded-lg p-4"
      style={{ borderColor: '#819291' }}
    >
      <h3 className="text-sm font-bold mb-4" style={{ color: '#113543' }}>
        Status Overview
      </h3>

      <div className="space-y-4">
        {/* Batches Section */}
        <div>
          <h4 className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: '#819291' }}>
            Batches
          </h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4" style={{ color: '#C2A558' }} />
                <span className="text-xs" style={{ color: '#113543' }}>Pending</span>
              </div>
              <span className="text-sm font-bold" style={{ color: '#113543' }}>
                {stats.pendingBatches}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Loader className="w-4 h-4" style={{ color: '#819291' }} />
                <span className="text-xs" style={{ color: '#113543' }}>In Process</span>
              </div>
              <span className="text-sm font-bold" style={{ color: '#113543' }}>
                {stats.inProcessBatches}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4" style={{ color: '#10b981' }} />
                <span className="text-xs" style={{ color: '#113543' }}>Processed</span>
              </div>
              <span className="text-sm font-bold" style={{ color: '#113543' }}>
                {stats.processedBatches}
              </span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t" style={{ borderColor: '#819291' }}></div>

        {/* Invoices Section */}
        <div>
          <h4 className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: '#819291' }}>
            Invoices
          </h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4" style={{ color: '#ef4444' }} />
                <span className="text-xs" style={{ color: '#113543' }}>On Hold</span>
              </div>
              <span className="text-sm font-bold" style={{ color: '#113543' }}>
                {stats.invoicesOnHold}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4" style={{ color: '#10b981' }} />
                <span className="text-xs" style={{ color: '#113543' }}>Processed</span>
              </div>
              <span className="text-sm font-bold" style={{ color: '#113543' }}>
                {stats.processedInvoices}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

