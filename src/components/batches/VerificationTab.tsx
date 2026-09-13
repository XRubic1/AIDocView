import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { getAdminUserDisplayName } from '../../config/adminNav'
import { formatCurrency } from '../../utils/format'
import { ArrowLeft, Check, AlertCircle, CheckCircle, ExternalLink } from 'lucide-react'
import { getAllBatches } from '../../data/mockBatches'
import { approveAdminInvoice, holdAdminInvoice } from '../../services/adminInvoiceActions'
import { mockInvoices } from '../../data/mockInvoices'
import { Invoice } from '../../types/invoice'
import AdminInvoiceDetailView from './AdminInvoiceDetailView'
import AccountingModal from './AccountingModal'
import AdminBatchesListView, { type AdminBatchListItem } from './AdminBatchesListView'
import { processVerifiedBatch } from '../../services/credyx/processBatch'
import { useToast } from '../ui/ToastProvider'
import Spinner from '../ui/Spinner'

interface VerificationTabProps {
  batchId: string | null
  onBatchSelect: (batchId: string) => void
  onBack: () => void
  onProcessed?: () => void
  onOpenPacketRework?: (batchId: string) => void
}

export default function VerificationTab({
  batchId,
  onBatchSelect,
  onBack,
  onProcessed,
  onOpenPacketRework,
}: VerificationTabProps) {
  const { resolved, session } = useAuth()
  const { showToast } = useToast()
  const authUser = resolved.user ?? session?.user ?? null
  const adminUserId = authUser?.id ?? 'unknown'
  const adminUserName = getAdminUserDisplayName(authUser?.email ?? null)

  const [batches] = useState(() => {
    const allBatches = getAllBatches()
    // Legacy "approval" batches are treated as verification after pipeline reshape.
    return allBatches.filter((b) => b.status === 'verification' || b.status === 'approval')
  })
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set())
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [verificationNotes, setVerificationNotes] = useState('')
  const [showAccountingModal, setShowAccountingModal] = useState(false)
  const [isProcessingBatch, setIsProcessingBatch] = useState(false)

  const allBatches = getAllBatches()
  const batch = batchId ? allBatches.find((b) => b.id === batchId) : null

  if (!batchId || !batch) {
    const listItems: AdminBatchListItem[] = batches.map((b) => ({
      id: b.id,
      batch_number: b.batch_number,
      client_name: b.client_name,
      total_invoices: b.total_invoices,
      total_amount: b.total_amount,
      submitted_at: b.submitted_at,
      status: b.status === 'approval' ? 'verification' : b.status,
    }))

    return (
      <AdminBatchesListView
        batches={listItems}
        variant="verification"
        onSelectBatch={onBatchSelect}
        actionLabel="Verify"
        onAction={(item, e) => {
          e.stopPropagation()
          onBatchSelect(item.id)
        }}
        emptyTitle="No batches in verification"
        emptyHint="Batches move here after ready-to-post is complete"
      />
    )
  }

  const batchInvoices = mockInvoices.filter((inv) => inv.batch_id === batchId)
  const verifiedInvoices = batchInvoices.filter(
    (inv) => inv.status === 'approved' || inv.status === 'hold'
  )
  const allVerified = batchInvoices.length > 0 && verifiedInvoices.length === batchInvoices.length
  const allApproved = batchInvoices.length > 0 && batchInvoices.every((inv) => inv.status === 'approved')
  const verifiedCount = verifiedInvoices.length
  const totalCount = batchInvoices.length
  const holdCount = batchInvoices.filter((inv) => inv.status === 'hold').length

  const handleSelectAll = () => {
    if (selectedInvoices.size === batchInvoices.length) {
      setSelectedInvoices(new Set())
    } else {
      setSelectedInvoices(new Set(batchInvoices.map((inv) => inv.id)))
    }
  }

  const handleSelectInvoice = (invoiceId: string) => {
    const newSelected = new Set(selectedInvoices)
    if (newSelected.has(invoiceId)) {
      newSelected.delete(invoiceId)
    } else {
      newSelected.add(invoiceId)
    }
    setSelectedInvoices(newSelected)
  }

  const handleApproveInvoice = (invoiceId: string) => {
    const updated = approveAdminInvoice(invoiceId)
    if (updated && selectedInvoice?.id === invoiceId) {
      setSelectedInvoice({ ...updated })
    }
  }

  const handleHoldInvoice = (invoiceId: string) => {
    const reason = window
      .prompt('Hold reason (the carrier will see this — e.g. missing POD, load issue)')
      ?.trim()
    if (!reason) return
    const updated = holdAdminInvoice(invoiceId, reason)
    if (updated && selectedInvoice?.id === invoiceId) {
      setSelectedInvoice({ ...updated })
    }
  }

  const handleProcessBatch = async () => {
    if (isProcessingBatch) return
    if (!allVerified) {
      showToast(
        `Cannot process batch. All invoices must be approved or on hold (${verifiedCount}/${totalCount}).`,
        'error'
      )
      return
    }

    setIsProcessingBatch(true)
    try {
      const result = await processVerifiedBatch({
        batchId,
        batchNumber: batch.batch_number,
        clientId: batch.client_id,
        totalAmount: batch.total_amount,
        adminUserId,
        adminUserName,
      })

      if (!result.ok) {
        showToast(result.error ?? 'Batch processing failed', 'error')
        return
      }

      const ppwMsg =
        result.paperwork.success > 0 || result.paperwork.failed > 0
          ? ` Paperwork: ${result.paperwork.success} sent, ${result.paperwork.failed} failed, ${result.paperwork.skipped} already sent.`
          : result.paperwork.skipped > 0
            ? ` Paperwork already sent for ${result.paperwork.skipped} invoice(s).`
            : ''

      const carrierMsg =
        result.carrierEmail && !result.carrierEmail.ok && !result.carrierEmail.skipped
          ? ` Carrier email failed: ${result.carrierEmail.error ?? 'unknown'}.`
          : result.carrierEmail?.skipped
            ? ' Carrier email skipped (no client email on file).'
            : ' Carrier notified.'

      if (holdCount > 0) {
        showToast(`Batch processed with ${holdCount} on hold.${carrierMsg}${ppwMsg}`, 'info')
      } else {
        showToast(`Batch processed — all invoices approved.${carrierMsg}${ppwMsg}`, 'success')
      }

      onProcessed?.()
      onBack()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Batch processing failed', 'error')
    } finally {
      setIsProcessingBatch(false)
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="flex items-center space-x-2 transition-colors"
            style={{ color: '#819291' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#113543'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#819291'
            }}
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <div>
            <h2 className="text-xl font-bold" style={{ color: '#113543' }}>
              {batch.batch_number}
            </h2>
            <p className="text-sm" style={{ color: '#819291' }}>{batch.client_name}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => {
              if (batchId && onOpenPacketRework) onOpenPacketRework(batchId)
            }}
            className="flex items-center space-x-2 px-4 py-2 text-sm font-medium border transition-colors"
            style={{ borderColor: '#819291', color: '#113543' }}
            title="Open Packets rework workspace"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Packets</span>
          </button>
          <button
            onClick={() => setShowAccountingModal(true)}
            className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: '#113543' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#0d2a35'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#113543'
            }}
          >
            <span>Accounting</span>
          </button>
          <div className="flex flex-col items-end">
            <button
              onClick={() => void handleProcessBatch()}
              disabled={!allVerified || isProcessingBatch}
              className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white transition-colors"
              style={{
                backgroundColor: allVerified && !isProcessingBatch ? '#819291' : '#cccccc',
                cursor: allVerified && !isProcessingBatch ? 'pointer' : 'not-allowed',
                opacity: allVerified && !isProcessingBatch ? 1 : 0.6,
              }}
              onMouseEnter={(e) => {
                if (allVerified && !isProcessingBatch) {
                  e.currentTarget.style.backgroundColor = '#6b7a7a'
                }
              }}
              onMouseLeave={(e) => {
                if (allVerified && !isProcessingBatch) {
                  e.currentTarget.style.backgroundColor = '#819291'
                }
              }}
            >
              {isProcessingBatch ? <Spinner className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
              <span>{isProcessingBatch ? 'Processing…' : 'Process batch'}</span>
            </button>
            {!allVerified && (
              <div className="text-xs mt-1 text-right" style={{ color: '#C2A558' }}>
                Verified: {verifiedCount}/{totalCount} — approve or hold all invoices before processing
              </div>
            )}
            {allVerified && holdCount > 0 && (
              <div className="text-xs mt-1 text-right" style={{ color: '#C2A558' }}>
                {holdCount} on hold — carrier will be emailed when you process
              </div>
            )}
            {allVerified && allApproved && (
              <div className="text-xs mt-1 text-right" style={{ color: '#819291' }}>
                All approved — ready to process
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
          <div className="text-sm mb-1" style={{ color: '#819291' }}>Total Invoices</div>
          <div className="text-2xl font-bold" style={{ color: '#113543' }}>
            {batchInvoices.length}
          </div>
        </div>
        <div className="p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
          <div className="text-sm mb-1" style={{ color: '#819291' }}>Approved</div>
          <div className="text-2xl font-bold" style={{ color: '#113543' }}>
            {batchInvoices.filter((inv) => inv.status === 'approved').length}
          </div>
        </div>
        <div className="p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
          <div className="text-sm mb-1" style={{ color: '#819291' }}>On Hold</div>
          <div className="text-2xl font-bold" style={{ color: '#113543' }}>
            {holdCount}
          </div>
        </div>
        <div className="p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
          <div className="text-sm mb-1" style={{ color: '#819291' }}>Verified</div>
          <div className="text-2xl font-bold" style={{ color: allVerified ? '#819291' : '#C2A558' }}>
            {verifiedInvoices.length} / {batchInvoices.length}
          </div>
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
          Verification Notes
        </label>
        <textarea
          value={verificationNotes}
          onChange={(e) => setVerificationNotes(e.target.value)}
          placeholder="Add notes about this verification..."
          className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2"
          style={{
            borderColor: '#819291',
            color: '#113543',
            backgroundColor: '#FFFFFF',
          }}
          rows={3}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b" style={{ borderColor: '#819291' }}>
              <th className="text-left py-3 px-4">
                <input
                  type="checkbox"
                  checked={selectedInvoices.size === batchInvoices.length && batchInvoices.length > 0}
                  onChange={handleSelectAll}
                  className="w-4 h-4 rounded"
                  style={{ borderColor: '#819291' }}
                />
              </th>
              <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                Invoice#
              </th>
              <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                Broker
              </th>
              <th className="text-right py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                Amount
              </th>
              <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                Status
              </th>
              <th className="text-center py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {batchInvoices.map((invoice, index) => (
              <tr
                key={invoice.id}
                className="border-b transition-colors cursor-pointer"
                style={{
                  borderColor: '#819291',
                  backgroundColor: index % 2 === 0 ? '#f8f9fa' : '#FFFFFF',
                }}
                onClick={() => setSelectedInvoice(invoice)}
              >
                <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedInvoices.has(invoice.id)}
                    onChange={() => handleSelectInvoice(invoice.id)}
                    className="w-4 h-4 rounded"
                    style={{ borderColor: '#819291' }}
                  />
                </td>
                <td className="py-3 px-4 text-sm font-medium" style={{ color: '#113543' }}>
                  {invoice.invoice_number}
                </td>
                <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>
                  {invoice.broker_name}
                </td>
                <td className="py-3 px-4 text-sm text-right font-medium" style={{ color: '#113543' }}>
                  {formatCurrency(invoice.amount)}
                </td>
                <td className="py-3 px-4 text-sm">
                  {invoice.status === 'approved' ? (
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: '#819291', color: '#FFFFFF' }}
                    >
                      <Check className="w-3 h-3 mr-1" />
                      Approved
                    </span>
                  ) : invoice.status === 'hold' ? (
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: '#C2A558', color: '#FFFFFF' }}
                    >
                      <AlertCircle className="w-3 h-3 mr-1" />
                      On Hold
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: '#C2A558', color: '#FFFFFF' }}
                    >
                      Pending
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => setSelectedInvoice(invoice)}
                    className="text-sm transition-colors"
                    style={{ color: '#819291' }}
                  >
                    Verify
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedInvoice && (
        <AdminInvoiceDetailView
          invoice={selectedInvoice}
          invoiceList={batchInvoices}
          onInvoiceSelect={(inv) => setSelectedInvoice(inv)}
          onClose={() => setSelectedInvoice(null)}
          onApprove={handleApproveInvoice}
          onHold={handleHoldInvoice}
          onContactBroker={() => undefined}
          stage="verification"
        />
      )}

      {showAccountingModal && batch && (
        <AccountingModal
          batch={batch}
          onClose={() => setShowAccountingModal(false)}
        />
      )}
    </div>
  )
}
