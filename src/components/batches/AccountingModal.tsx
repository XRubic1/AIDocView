import { useState, useEffect } from 'react'
import { X, Edit2, Save, XCircle } from 'lucide-react'
import { getInvoicesByBatchId } from '../../data/mockInvoices'
import { calculateBatchFeeCalculation } from '../../utils/invoiceFees'
import {
  applyBatchFeeTerms,
  formatFeeTermsLabel,
} from '../../utils/feeTermsLock'
import { PendingBatch } from '../../types/admin'
import { getClientById } from '../../services/clientRegistry'
import { formatCurrency } from '../../utils/format'
import { useToast } from '../ui/ToastProvider'
import type { FeeBillingMode } from '../../types/feeTerms'

interface AccountingModalProps {
  batch: PendingBatch
  onClose: () => void
}

/**
 * Batch accounting — fee terms are locked on the batch (and cascade to invoices).
 * Editing here does not change the client's live Fee Terms.
 */
export default function AccountingModal({ batch, onClose }: AccountingModalProps) {
  const { showToast } = useToast()
  const client = getClientById(batch.client_id)
  const [isEditingTerms, setIsEditingTerms] = useState(false)
  const [editedFeeType, setEditedFeeType] = useState<'percentage' | 'flat'>('percentage')
  const [editedFeePercentage, setEditedFeePercentage] = useState(0)
  const [editedFlatFeeAmount, setEditedFlatFeeAmount] = useState(0)
  const [editedBillingMode, setEditedBillingMode] = useState<FeeBillingMode>('billable')
  const [currentBatch, setCurrentBatch] = useState<PendingBatch>(batch)
  const [feeCalculation, setFeeCalculation] = useState(batch.fee_calculation)
  const [busy, setBusy] = useState(false)

  const locked = currentBatch.fee_terms

  useEffect(() => {
    const invoices = getInvoicesByBatchId(currentBatch.id)
    const calc = calculateBatchFeeCalculation(invoices, currentBatch.fee_terms)
    if (calc) setFeeCalculation(calc)
  }, [currentBatch.id, currentBatch.fee_terms])

  useEffect(() => {
    if (!isEditingTerms) return
    if (locked) {
      setEditedFeeType(locked.fee_type)
      setEditedFeePercentage(locked.fee_percentage || 0)
      setEditedFlatFeeAmount(locked.flat_fee_amount || 0)
      setEditedBillingMode(locked.billing_mode)
    } else if (client?.fee_terms) {
      setEditedFeeType(client.fee_terms.fee_type || 'percentage')
      setEditedFeePercentage(client.fee_terms.fee_percentage || 0)
      setEditedFlatFeeAmount(client.fee_terms.flat_fee_amount || 0)
      setEditedBillingMode(
        client.billing?.subscription_status === 'trial' ? 'trial' : 'billable'
      )
    } else {
      setEditedFeeType('percentage')
      setEditedFeePercentage(0)
      setEditedFlatFeeAmount(0)
      setEditedBillingMode('billable')
    }
  }, [isEditingTerms, locked, client])

  const handleSaveTerms = async () => {
    setBusy(true)
    try {
      const { batch: updated, invoiceCount } = await applyBatchFeeTerms(currentBatch.id, {
        fee_type: editedFeeType,
        fee_percentage: editedFeeType === 'percentage' ? editedFeePercentage : undefined,
        flat_fee_amount: editedFeeType === 'flat' ? editedFlatFeeAmount : undefined,
        billing_mode: editedBillingMode,
      })
      setCurrentBatch(updated)
      setFeeCalculation(updated.fee_calculation)
      setIsEditingTerms(false)
      showToast(
        `Batch terms updated — applied to ${invoiceCount} invoice${invoiceCount === 1 ? '' : 's'}`,
        'success'
      )
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update batch terms', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Accounting</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {currentBatch.batch_number} · {currentBatch.client_name}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <section className="mb-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Batch fee terms
              </h3>
              {!isEditingTerms ? (
                <button
                  type="button"
                  onClick={() => setIsEditingTerms(true)}
                  className="dashboard-btn-secondary dashboard-btn-compact inline-flex items-center gap-1"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  Edit terms
                </button>
              ) : null}
            </div>
            <p className="text-xs text-slate-600 mb-2">
              Locked on this batch and all of its invoices. Does not change the client&apos;s live
              Fee Terms (used only for new batches).
            </p>

            {isEditingTerms ? (
              <div className="space-y-3 rounded-lg border border-slate-200 p-3">
                <label className="block text-xs">
                  <span className="font-medium text-slate-600 uppercase tracking-wide">
                    Billing mode
                  </span>
                  <select
                    value={editedBillingMode}
                    onChange={(e) => setEditedBillingMode(e.target.value as FeeBillingMode)}
                    className="client-input mt-1 w-full text-sm"
                  >
                    <option value="billable">Billable</option>
                    <option value="trial">Trial (waive collection fees)</option>
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="block text-xs">
                    <span className="font-medium text-slate-600 uppercase tracking-wide">
                      Fee type
                    </span>
                    <select
                      value={editedFeeType}
                      onChange={(e) => setEditedFeeType(e.target.value as 'percentage' | 'flat')}
                      className="client-input mt-1 w-full text-sm"
                      disabled={editedBillingMode === 'trial'}
                    >
                      <option value="percentage">Percentage</option>
                      <option value="flat">Flat fee</option>
                    </select>
                  </label>
                  {editedFeeType === 'percentage' ? (
                    <label className="block text-xs">
                      <span className="font-medium text-slate-600 uppercase tracking-wide">
                        Fee %
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={editedFeePercentage}
                        onChange={(e) => setEditedFeePercentage(parseFloat(e.target.value) || 0)}
                        className="client-input mt-1 w-full text-sm tabular-nums"
                        disabled={editedBillingMode === 'trial'}
                      />
                    </label>
                  ) : (
                    <label className="block text-xs">
                      <span className="font-medium text-slate-600 uppercase tracking-wide">
                        Flat fee ($)
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editedFlatFeeAmount}
                        onChange={(e) => setEditedFlatFeeAmount(parseFloat(e.target.value) || 0)}
                        className="client-input mt-1 w-full text-sm tabular-nums"
                        disabled={editedBillingMode === 'trial'}
                      />
                    </label>
                  )}
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsEditingTerms(false)}
                    className="dashboard-btn-secondary dashboard-btn-compact inline-flex items-center gap-1"
                    disabled={busy}
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveTerms()}
                    className="dashboard-btn-primary dashboard-btn-compact inline-flex items-center gap-1"
                    disabled={busy}
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save to batch + invoices
                  </button>
                </div>
              </div>
            ) : locked ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-px rounded-lg border border-slate-200 overflow-hidden bg-slate-200">
                <div className="bg-white px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                    Mode
                  </p>
                  <p className="text-sm font-medium text-slate-900 mt-0.5 capitalize">
                    {locked.billing_mode}
                  </p>
                </div>
                <div className="bg-white px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                    Terms
                  </p>
                  <p className="text-sm font-medium text-slate-900 mt-0.5">
                    {formatFeeTermsLabel(locked)}
                  </p>
                </div>
                <div className="bg-white px-3 py-2 col-span-2 sm:col-span-1">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                    Locked
                  </p>
                  <p className="text-sm font-medium text-slate-900 mt-0.5 tabular-nums">
                    {locked.locked_at.slice(0, 10)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 px-3 py-3">
                <p className="text-sm text-slate-500 mb-2">No fee terms locked on this batch yet.</p>
                <button
                  type="button"
                  onClick={() => setIsEditingTerms(true)}
                  className="dashboard-btn-primary dashboard-btn-compact"
                >
                  Set batch terms
                </button>
              </div>
            )}
          </section>

          {feeCalculation ? (
            <section className="mb-4 space-y-1.5">
              <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Fee calculation
              </h3>
              <div className="flex justify-between text-sm px-3 py-2 rounded border border-slate-200">
                <span className="text-slate-600">Batch total</span>
                <span className="font-medium tabular-nums">
                  {formatCurrency(currentBatch.total_amount)}
                </span>
              </div>
              <div className="flex justify-between text-sm px-3 py-2 rounded border border-slate-200">
                <span className="text-slate-600">
                  {locked?.billing_mode === 'trial'
                    ? 'Fee (trial — waived)'
                    : feeCalculation.fee_type === 'percentage'
                      ? `Fee (${feeCalculation.fee_percentage}%)`
                      : 'Flat fee'}
                </span>
                <span className="font-medium tabular-nums">
                  {formatCurrency(feeCalculation.total_fee || 0)}
                </span>
              </div>
              <div className="flex justify-between text-sm px-3 py-2 rounded border border-slate-900 bg-slate-50">
                <span className="font-semibold text-slate-900">Net after fee</span>
                <span className="font-semibold tabular-nums">
                  {formatCurrency(feeCalculation.net_amount || 0)}
                </span>
              </div>
            </section>
          ) : null}

          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Summary
            </h3>
            <div className="grid grid-cols-2 gap-px rounded-lg border border-slate-200 overflow-hidden bg-slate-200">
              <div className="bg-white px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                  Invoices
                </p>
                <p className="text-sm font-medium tabular-nums mt-0.5">
                  {currentBatch.total_invoices}
                </p>
              </div>
              <div className="bg-white px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                  Submitted
                </p>
                <p className="text-sm font-medium tabular-nums mt-0.5">
                  {new Date(currentBatch.submitted_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          </section>

          <div className="flex justify-end mt-4 pt-3 border-t border-slate-200">
            <button type="button" onClick={onClose} className="dashboard-btn-primary">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
