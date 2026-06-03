import { useState, useEffect } from 'react'
import { X, Edit2, Save, XCircle } from 'lucide-react'
import { formatCurrency } from '../../utils/format'
import { PendingBatch } from '../../types/admin'
import { mockClients } from '../../data/mockClients'
import { Client } from '../../types/client'

interface AccountingModalProps {
  batch: PendingBatch
  onClose: () => void
}

export default function AccountingModal({ batch, onClose }: AccountingModalProps) {
  const [client, setClient] = useState<Client | undefined>(
    mockClients.find((c) => c.id === batch.client_id)
  )
  const [isEditingTerms, setIsEditingTerms] = useState(false)
  const [editedFeeType, setEditedFeeType] = useState<'percentage' | 'flat'>('percentage')
  const [editedFeePercentage, setEditedFeePercentage] = useState<number>(0)
  const [editedFlatFeeAmount, setEditedFlatFeeAmount] = useState<number>(0)
  const [currentBatch, setCurrentBatch] = useState<PendingBatch>(batch)
  const [feeCalculation, setFeeCalculation] = useState(batch.fee_calculation)

  // Initialize edit form when entering edit mode
  useEffect(() => {
    if (isEditingTerms) {
      if (client?.fee_terms) {
        setEditedFeeType(client.fee_terms.fee_type || 'percentage')
        setEditedFeePercentage(client.fee_terms.fee_percentage || 0)
        setEditedFlatFeeAmount(client.fee_terms.flat_fee_amount || 0)
      } else {
        // Initialize with default values if no fee terms exist
        setEditedFeeType('percentage')
        setEditedFeePercentage(0)
        setEditedFlatFeeAmount(0)
      }
    }
  }, [isEditingTerms, client])

  const handleSaveTerms = () => {
    if (!client) return

    // Update client fee terms
    const updatedFeeTerms = {
      fee_type: editedFeeType,
      fee_percentage: editedFeeType === 'percentage' ? editedFeePercentage : undefined,
      flat_fee_amount: editedFeeType === 'flat' ? editedFlatFeeAmount : undefined,
    }

    const updatedClient: Client = {
      ...client,
      fee_terms: updatedFeeTerms,
    }

    // Update in mockClients array
    const clientIndex = mockClients.findIndex((c) => c.id === client.id)
    if (clientIndex !== -1) {
      mockClients[clientIndex] = updatedClient
      setClient(updatedClient)
    }

    // Recalculate batch fee calculation
    let totalFee = 0
    if (editedFeeType === 'percentage' && editedFeePercentage) {
      totalFee = (currentBatch.total_amount * editedFeePercentage) / 100
    } else if (editedFeeType === 'flat' && editedFlatFeeAmount) {
      totalFee = editedFlatFeeAmount
    }

    const newFeeCalculation = {
      fee_type: editedFeeType,
      fee_percentage: editedFeeType === 'percentage' ? editedFeePercentage : undefined,
      flat_fee_amount: editedFeeType === 'flat' ? editedFlatFeeAmount : undefined,
      total_fee: totalFee,
      net_amount: currentBatch.total_amount - totalFee,
    }

    // Update batch with new fee calculation
    const updatedBatch: PendingBatch = {
      ...currentBatch,
      fee_calculation: newFeeCalculation,
    }

    setCurrentBatch(updatedBatch)
    setFeeCalculation(newFeeCalculation)

    // Note: In a real app, you would update the batch in the backend/store
    // For now, the local state update will show the recalculated fees immediately

    setIsEditingTerms(false)
  }

  const handleCancelEdit = () => {
    setIsEditingTerms(false)
    // Reset to original values
    if (client?.fee_terms) {
      setEditedFeeType(client.fee_terms.fee_type || 'percentage')
      setEditedFeePercentage(client.fee_terms.fee_percentage || 0)
      setEditedFlatFeeAmount(client.fee_terms.flat_fee_amount || 0)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold" style={{ color: '#113543' }}>
                Accounting Details
              </h2>
              <p className="text-sm mt-1" style={{ color: '#819291' }}>
                {currentBatch.batch_number} - {currentBatch.client_name}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-black transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Fee Terms Section */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold" style={{ color: '#113543' }}>
                Client Fee Terms
              </h3>
              {!isEditingTerms && (
                <button
                  onClick={() => setIsEditingTerms(true)}
                  className="flex items-center space-x-2 px-3 py-1.5 text-sm font-medium text-white transition-colors"
                  style={{ backgroundColor: '#113543' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#0d2a35'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#113543'
                  }}
                >
                  <Edit2 className="w-4 h-4" />
                  <span>Edit Terms</span>
                </button>
              )}
            </div>
            {isEditingTerms ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
                      Fee Type
                    </label>
                    <select
                      value={editedFeeType}
                      onChange={(e) => setEditedFeeType(e.target.value as 'percentage' | 'flat')}
                      className="w-full px-3 py-2 text-sm border rounded"
                      style={{
                        borderColor: '#819291',
                        color: '#113543',
                        backgroundColor: '#FFFFFF',
                      }}
                    >
                      <option value="percentage">Percentage</option>
                      <option value="flat">Flat Fee</option>
                    </select>
                  </div>
                  {editedFeeType === 'percentage' ? (
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
                        Fee Percentage (%)
                      </label>
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={editedFeePercentage}
                          onChange={(e) => setEditedFeePercentage(parseFloat(e.target.value) || 0)}
                          className="flex-1 px-3 py-2 text-sm border rounded"
                          style={{
                            borderColor: '#819291',
                            color: '#113543',
                            backgroundColor: '#FFFFFF',
                          }}
                          placeholder="e.g., 2.5 for 2.5%"
                        />
                        <span className="text-sm" style={{ color: '#819291' }}>%</span>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
                        Flat Fee Amount ($)
                      </label>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm" style={{ color: '#819291' }}>$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editedFlatFeeAmount}
                          onChange={(e) => setEditedFlatFeeAmount(parseFloat(e.target.value) || 0)}
                          className="flex-1 px-3 py-2 text-sm border rounded"
                          style={{
                            borderColor: '#819291',
                            color: '#113543',
                            backgroundColor: '#FFFFFF',
                          }}
                          placeholder="e.g., 50.00"
                        />
                      </div>
                    </div>
                  )}
                </div>
                {editedFeeType === 'percentage' && editedFeePercentage > 0 && (
                  <div className="p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
                    <p className="text-sm" style={{ color: '#819291' }}>
                      Example: For a batch with $10,000 total amount, the fee would be{' '}
                      <span className="font-medium" style={{ color: '#113543' }}>
                        {formatCurrency((10000 * editedFeePercentage) / 100)}
                      </span>
                    </p>
                  </div>
                )}
                <div className="flex items-center justify-end space-x-2 pt-2">
                  <button
                    onClick={handleCancelEdit}
                    className="flex items-center space-x-2 px-4 py-2 text-sm font-medium transition-colors border rounded"
                    style={{
                      color: '#113543',
                      backgroundColor: '#FFFFFF',
                      borderColor: '#819291',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f8f9fa'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#FFFFFF'
                    }}
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Cancel</span>
                  </button>
                  <button
                    onClick={handleSaveTerms}
                    className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white transition-colors"
                    style={{ backgroundColor: '#113543' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#0d2a35'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#113543'
                    }}
                  >
                    <Save className="w-4 h-4" />
                    <span>Save</span>
                  </button>
                </div>
              </div>
            ) : client?.fee_terms ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
                    <label className="text-sm mb-1 block" style={{ color: '#819291' }}>
                      Fee Type
                    </label>
                    <p className="text-sm font-medium" style={{ color: '#113543' }}>
                      {client.fee_terms.fee_type === 'percentage' ? 'Percentage' : 'Flat Fee'}
                    </p>
                  </div>
                  {client.fee_terms.fee_type === 'percentage' ? (
                    <div className="p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
                      <label className="text-sm mb-1 block" style={{ color: '#819291' }}>
                        Fee Percentage
                      </label>
                      <p className="text-sm font-medium" style={{ color: '#113543' }}>
                        {client.fee_terms.fee_percentage || 0}%
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
                      <label className="text-sm mb-1 block" style={{ color: '#819291' }}>
                        Flat Fee Amount
                      </label>
                      <p className="text-sm font-medium" style={{ color: '#113543' }}>
                        {formatCurrency(client.fee_terms.flat_fee_amount || 0)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
                <p className="text-sm mb-3" style={{ color: '#819291' }}>
                  No fee terms set for this client.
                </p>
                <button
                  onClick={() => setIsEditingTerms(true)}
                  className="px-3 py-1.5 text-sm font-medium text-white transition-colors"
                  style={{ backgroundColor: '#113543' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#0d2a35'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#113543'
                  }}
                >
                  Set Fee Terms
                </button>
              </div>
            )}
          </div>

          {/* Fee Calculation Section */}
          {feeCalculation ? (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-4" style={{ color: '#113543' }}>
                Fee Calculation
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
                  <span className="text-sm font-medium" style={{ color: '#113543' }}>
                    Total Batch Amount
                  </span>
                  <span className="text-sm font-bold" style={{ color: '#113543' }}>
                    {formatCurrency(currentBatch.total_amount)}
                  </span>
                </div>
                <div className="flex items-center justify-between p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
                  <span className="text-sm font-medium" style={{ color: '#113543' }}>
                    {feeCalculation.fee_type === 'percentage'
                      ? `Fee (${feeCalculation.fee_percentage}%)`
                      : 'Flat Fee'}
                  </span>
                  <span className="text-sm font-bold" style={{ color: '#113543' }}>
                    {formatCurrency(feeCalculation.total_fee || 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between p-4 border rounded" style={{ backgroundColor: '#FFF8E1', borderColor: '#C2A558' }}>
                  <span className="text-sm font-bold" style={{ color: '#113543' }}>
                    Net Amount (After Fee)
                  </span>
                  <span className="text-lg font-bold" style={{ color: '#113543' }}>
                    {formatCurrency(feeCalculation.net_amount || 0)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-4" style={{ color: '#113543' }}>
                Fee Calculation
              </h3>
              <div className="p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
                <p className="text-sm" style={{ color: '#819291' }}>
                  No fee calculation available. This batch may have been created before fee terms were set.
                </p>
              </div>
            </div>
          )}

          {/* Batch Summary */}
          <div>
            <h3 className="text-lg font-semibold mb-4" style={{ color: '#113543' }}>
              Batch Summary
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
                <label className="text-sm mb-1 block" style={{ color: '#819291' }}>
                  Total Invoices
                </label>
                <p className="text-sm font-medium" style={{ color: '#113543' }}>
                  {currentBatch.total_invoices}
                </p>
              </div>
              <div className="p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
                <label className="text-sm mb-1 block" style={{ color: '#819291' }}>
                  Submitted At
                </label>
                <p className="text-sm font-medium" style={{ color: '#113543' }}>
                  {new Date(currentBatch.submitted_at).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Close Button */}
          <div className="flex items-center justify-end mt-6 pt-4 border-t" style={{ borderColor: '#819291' }}>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: '#113543' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#0d2a35'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#113543'
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

