import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { getAllClients } from '../services/clientRegistry'
import { mockBrokers } from '../data/mockBrokers'
import { formatCurrency } from '../utils/format'
import { Plus, Trash2, X } from 'lucide-react'
import { addBatch, generateBatchNumber } from '../data/mockBatches'
import { Client } from '../types/client'
import { Broker } from '../types/broker'

interface InvoiceDocument {
  id: string
  name: string
  file: File
  size: number
}

interface InvoiceFormData {
  invoice_number: string
  load_number: string
  broker_name: string
  broker_address: string
  amount: string
  invoice_date: string
  notes: string
  documents?: InvoiceDocument[]
}

export default function CreateBatch() {
  const navigate = useNavigate()
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [currentBatchInvoices, setCurrentBatchInvoices] = useState<InvoiceFormData[]>([])
  const [invoiceFormData, setInvoiceFormData] = useState<InvoiceFormData>({
    invoice_number: '',
    load_number: '',
    broker_name: '',
    broker_address: '',
    amount: '',
    invoice_date: new Date().toISOString().split('T')[0],
    notes: '',
  })

  const [brokerSuggestions, setBrokerSuggestions] = useState<Broker[]>([])
  const [showBrokerSuggestions, setShowBrokerSuggestions] = useState(false)

  // Auto-generate invoice number when form is ready
  useEffect(() => {
    if (!invoiceFormData.invoice_number && currentBatchInvoices.length === 0) {
      const year = new Date().getFullYear()
      const invoiceCount = currentBatchInvoices.length + 1
      setInvoiceFormData((prev) => ({
        ...prev,
        invoice_number: `INV-${year}-${String(invoiceCount).padStart(3, '0')}`,
      }))
    }
  }, [currentBatchInvoices.length])

  // Update invoice number when adding new invoices
  useEffect(() => {
    if (currentBatchInvoices.length > 0) {
      const year = new Date().getFullYear()
      const nextNumber = currentBatchInvoices.length + 1
      setInvoiceFormData((prev) => ({
        ...prev,
        invoice_number: `INV-${year}-${String(nextNumber).padStart(3, '0')}`,
      }))
    }
  }, [currentBatchInvoices.length])

  const previewBatchNumber = selectedClient
    ? generateBatchNumber(selectedClient.id)
    : 'BATCH-2026-001-XXXX'

  const handleClientSelect = (client: Client) => {
    setSelectedClient(client)
  }

  const handleInvoiceInputChange = (field: keyof InvoiceFormData, value: string) => {
    setInvoiceFormData((prev) => ({
      ...prev,
      [field]: value,
    }))

    // Broker suggestions
    if (field === 'broker_name' && value.length > 0) {
      const filtered = mockBrokers.filter((broker) =>
        broker.name.toLowerCase().includes(value.toLowerCase())
      )
      setBrokerSuggestions(filtered)
      setShowBrokerSuggestions(filtered.length > 0)
    } else if (field === 'broker_name' && value.length === 0) {
      setShowBrokerSuggestions(false)
    }
  }

  const handleBrokerSelect = (broker: Broker) => {
    setInvoiceFormData((prev) => ({
      ...prev,
      broker_name: broker.name,
      broker_address: broker.address || '',
    }))
    setShowBrokerSuggestions(false)
  }

  const handleAddInvoice = () => {
    if (!invoiceFormData.broker_name || !invoiceFormData.amount || !invoiceFormData.broker_address) {
      alert('Please fill in all required fields (Broker, Amount, Broker Address)')
      return
    }

    const newInvoice: InvoiceFormData = {
      ...invoiceFormData,
      invoice_number: invoiceFormData.invoice_number || `INV-${new Date().getFullYear()}-${String(currentBatchInvoices.length + 1).padStart(3, '0')}`,
    }

    setCurrentBatchInvoices((prev) => [...prev, newInvoice])
    setInvoiceFormData({
      invoice_number: '',
      load_number: '',
      broker_name: '',
      broker_address: '',
      amount: '',
      invoice_date: new Date().toISOString().split('T')[0],
      notes: '',
    })

    // Auto-generate next invoice number
    const year = new Date().getFullYear()
    const nextNumber = currentBatchInvoices.length + 2
    setInvoiceFormData((prev) => ({
      ...prev,
      invoice_number: `INV-${year}-${String(nextNumber).padStart(3, '0')}`,
    }))
  }

  const handleRemoveInvoice = (index: number) => {
    setCurrentBatchInvoices((prev) => prev.filter((_, i) => i !== index))
  }

  const handleCreateBatch = () => {
    if (!selectedClient) {
      alert('Please select a client first')
      return
    }

    if (currentBatchInvoices.length === 0) {
      alert('Please add at least one invoice to the batch')
      return
    }

    const totalAmount = currentBatchInvoices.reduce(
      (sum, inv) => sum + parseFloat(inv.amount || '0'),
      0
    )

    let feeCalculation: {
      fee_type?: 'percentage' | 'flat'
      fee_percentage?: number
      flat_fee_amount?: number
      total_fee?: number
      net_amount?: number
    } | undefined

    if (selectedClient?.fee_terms) {
      const { fee_type, fee_percentage, flat_fee_amount } = selectedClient.fee_terms
      let totalFee = 0

      if (fee_type === 'percentage' && fee_percentage) {
        totalFee = (totalAmount * fee_percentage) / 100
      } else if (fee_type === 'flat' && flat_fee_amount) {
        totalFee = flat_fee_amount
      }

      feeCalculation = {
        fee_type,
        fee_percentage,
        flat_fee_amount,
        total_fee: totalFee,
        net_amount: totalAmount - totalFee,
      }
    }

    const batchNumber = generateBatchNumber(selectedClient.id)

    // Add batch to mock data
    addBatch({
      batch_number: batchNumber,
      client_name: selectedClient.name,
      client_id: selectedClient.id,
      total_invoices: currentBatchInvoices.length,
      total_amount: totalAmount,
      submitted_at: new Date().toISOString(),
      status: 'ready_to_post',
      fee_calculation: feeCalculation,
    })

    // Navigate back to batches page
    navigate('/batches')
  }

  const totalAmount = currentBatchInvoices.reduce(
    (sum, inv) => sum + parseFloat(inv.amount || '0'),
    0
  )

  return (
    <AdminLayout userName="Admin User" userRole="Administrator">
      <div className="max-w-[1400px] mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-2" style={{ color: '#113543' }}>
              Create New Batch
            </h1>
            <p style={{ color: '#819291' }}>Select a client and add invoices to create a batch</p>
          </div>
          <button
            onClick={() => navigate('/batches')}
            className="flex items-center space-x-2 px-4 py-2 text-sm font-medium transition-colors rounded"
            style={{ color: '#113543', border: '1px solid #819291' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f8f9fa'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#FFFFFF'
            }}
          >
            <X className="w-4 h-4" />
            <span>Cancel</span>
          </button>
        </div>

        {/* Client Selection */}
        {!selectedClient ? (
          <div className="border rounded" style={{ borderColor: '#819291', backgroundColor: '#FFFFFF' }}>
            <div className="p-6">
              <h2 className="text-lg font-bold mb-4" style={{ color: '#113543' }}>
                Select Client
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {getAllClients().map((client) => (
                  <button
                    key={client.id}
                    onClick={() => handleClientSelect(client)}
                    className="p-4 border rounded text-left transition-colors"
                    style={{
                      borderColor: '#819291',
                      backgroundColor: '#FFFFFF',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#C2A558'
                      e.currentTarget.style.backgroundColor = '#f8f9fa'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#819291'
                      e.currentTarget.style.backgroundColor = '#FFFFFF'
                    }}
                  >
                    <div className="font-semibold mb-1" style={{ color: '#113543' }}>
                      {client.name}
                    </div>
                    <div className="text-sm" style={{ color: '#819291' }}>
                      {client.contact_person}
                    </div>
                    <div className="text-sm" style={{ color: '#819291' }}>
                      {client.email}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Selected Client Info */}
            <div className="border rounded" style={{ borderColor: '#819291', backgroundColor: '#FFFFFF' }}>
              <div className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-semibold" style={{ color: '#113543' }}>
                    Client: {selectedClient.name}
                  </div>
                  <div className="text-sm" style={{ color: '#819291' }}>
                    {selectedClient.contact_person} • {selectedClient.email}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedClient(null)}
                  className="text-sm px-3 py-1 transition-colors rounded"
                  style={{ color: '#819291', border: '1px solid #819291' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f8f9fa'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#FFFFFF'
                  }}
                >
                  Change Client
                </button>
              </div>
            </div>

            {/* Add Invoice Form */}
            <div className="border rounded" style={{ borderColor: '#819291', backgroundColor: '#FFFFFF' }}>
              <div className="p-6">
                <div className="mb-6">
                  <h3 className="text-lg font-bold mb-2" style={{ color: '#113543' }}>
                    New Batch: {previewBatchNumber}
                  </h3>
                  <p className="text-sm" style={{ color: '#819291' }}>
                    Batch number will be auto-generated when you submit
                  </p>
                </div>

                {/* Add Invoice Form */}
                <div className="border-b pb-6 mb-6" style={{ borderColor: '#819291' }}>
                  <h4 className="text-md font-semibold mb-4" style={{ color: '#113543' }}>
                    Add Invoice
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: '#113543' }}>
                        Invoice Number
                      </label>
                      <input
                        type="text"
                        value={invoiceFormData.invoice_number}
                        onChange={(e) => handleInvoiceInputChange('invoice_number', e.target.value)}
                        placeholder="INV-2025-001"
                        className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                        style={{
                          borderColor: '#819291',
                          color: '#113543',
                          backgroundColor: '#FFFFFF',
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = '#C2A558'
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = '#819291'
                        }}
                      />
                      <p className="text-xs mt-1" style={{ color: '#819291' }}>
                        Auto-generated, can be edited
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: '#113543' }}>
                        Load Number
                      </label>
                      <input
                        type="text"
                        value={invoiceFormData.load_number}
                        onChange={(e) => handleInvoiceInputChange('load_number', e.target.value)}
                        placeholder="LD12345"
                        className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                        style={{
                          borderColor: '#819291',
                          color: '#113543',
                          backgroundColor: '#FFFFFF',
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = '#C2A558'
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = '#819291'
                        }}
                      />
                    </div>
                    <div className="relative">
                      <label className="block text-sm font-medium mb-1" style={{ color: '#113543' }}>
                        Broker <span style={{ color: '#C2A558' }}>*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={invoiceFormData.broker_name}
                        onChange={(e) => handleInvoiceInputChange('broker_name', e.target.value)}
                        placeholder="Type broker name..."
                        className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                        style={{
                          borderColor: '#819291',
                          color: '#113543',
                          backgroundColor: '#FFFFFF',
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = '#C2A558'
                          if (brokerSuggestions.length > 0) {
                            setShowBrokerSuggestions(true)
                          }
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = '#819291'
                          setTimeout(() => setShowBrokerSuggestions(false), 200)
                        }}
                      />
                      {showBrokerSuggestions && brokerSuggestions.length > 0 && (
                        <div
                          className="absolute z-10 w-full mt-1 bg-white border rounded shadow-lg max-h-60 overflow-y-auto"
                          style={{ borderColor: '#819291' }}
                        >
                          {brokerSuggestions.map((broker) => (
                            <button
                              key={broker.id}
                              type="button"
                              onClick={() => handleBrokerSelect(broker)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                              style={{ color: '#113543' }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#f8f9fa'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = '#FFFFFF'
                              }}
                            >
                              {broker.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: '#113543' }}>
                        Amount <span style={{ color: '#C2A558' }}>*</span>
                      </label>
                      <input
                        type="number"
                        required
                        step="0.01"
                        min="0.01"
                        value={invoiceFormData.amount}
                        onChange={(e) => handleInvoiceInputChange('amount', e.target.value)}
                        placeholder="5000.00"
                        className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                        style={{
                          borderColor: '#819291',
                          color: '#113543',
                          backgroundColor: '#FFFFFF',
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = '#C2A558'
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = '#819291'
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: '#113543' }}>
                        Invoice Date
                      </label>
                      <input
                        type="date"
                        value={invoiceFormData.invoice_date}
                        onChange={(e) => handleInvoiceInputChange('invoice_date', e.target.value)}
                        className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                        style={{
                          borderColor: '#819291',
                          color: '#113543',
                          backgroundColor: '#FFFFFF',
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = '#C2A558'
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = '#819291'
                        }}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-1" style={{ color: '#113543' }}>
                        Broker Address <span style={{ color: '#C2A558' }}>*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={invoiceFormData.broker_address}
                        onChange={(e) => handleInvoiceInputChange('broker_address', e.target.value)}
                        placeholder="Broker address"
                        className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                        style={{
                          borderColor: '#819291',
                          color: '#113543',
                          backgroundColor: '#FFFFFF',
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = '#C2A558'
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = '#819291'
                        }}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-1" style={{ color: '#113543' }}>
                        Notes
                      </label>
                      <textarea
                        value={invoiceFormData.notes}
                        onChange={(e) => handleInvoiceInputChange('notes', e.target.value)}
                        placeholder="Additional notes..."
                        rows={3}
                        className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                        style={{
                          borderColor: '#819291',
                          color: '#113543',
                          backgroundColor: '#FFFFFF',
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = '#C2A558'
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = '#819291'
                        }}
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <button
                      onClick={handleAddInvoice}
                      className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white transition-colors rounded"
                      style={{ backgroundColor: '#C2A558' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#b89547'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#C2A558'
                      }}
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Invoice</span>
                    </button>
                  </div>
                </div>

                {/* Invoice List */}
                {currentBatchInvoices.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-md font-semibold mb-4" style={{ color: '#113543' }}>
                      Batch Invoices ({currentBatchInvoices.length})
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b" style={{ borderColor: '#819291' }}>
                            <th className="text-left py-2 px-3 text-sm font-semibold" style={{ color: '#113543' }}>
                              Invoice #
                            </th>
                            <th className="text-left py-2 px-3 text-sm font-semibold" style={{ color: '#113543' }}>
                              Load #
                            </th>
                            <th className="text-left py-2 px-3 text-sm font-semibold" style={{ color: '#113543' }}>
                              Broker
                            </th>
                            <th className="text-right py-2 px-3 text-sm font-semibold" style={{ color: '#113543' }}>
                              Amount
                            </th>
                            <th className="text-left py-2 px-3 text-sm font-semibold" style={{ color: '#113543' }}>
                              Date
                            </th>
                            <th className="text-center py-2 px-3 text-sm font-semibold" style={{ color: '#113543' }}>
                              Action
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentBatchInvoices.map((invoice, index) => (
                            <tr
                              key={index}
                              className="border-b"
                              style={{
                                borderColor: '#819291',
                                backgroundColor: index % 2 === 0 ? '#f8f9fa' : '#FFFFFF',
                              }}
                            >
                              <td className="py-2 px-3 text-sm" style={{ color: '#113543' }}>
                                {invoice.invoice_number}
                              </td>
                              <td className="py-2 px-3 text-sm" style={{ color: '#819291' }}>
                                {invoice.load_number || '-'}
                              </td>
                              <td className="py-2 px-3 text-sm" style={{ color: '#819291' }}>
                                {invoice.broker_name}
                              </td>
                              <td className="py-2 px-3 text-sm text-right font-medium" style={{ color: '#113543' }}>
                                {formatCurrency(parseFloat(invoice.amount || '0'))}
                              </td>
                              <td className="py-2 px-3 text-sm" style={{ color: '#819291' }}>
                                {invoice.invoice_date}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <button
                                  onClick={() => handleRemoveInvoice(index)}
                                  className="p-1 text-red-600 hover:text-red-800 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 font-semibold" style={{ borderColor: '#819291' }}>
                            <td colSpan={3} className="py-2 px-3 text-sm text-right" style={{ color: '#113543' }}>
                              Total:
                            </td>
                            <td className="py-2 px-3 text-sm text-right" style={{ color: '#113543' }}>
                              {formatCurrency(totalAmount)}
                            </td>
                            <td colSpan={2}></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                {/* Create Batch Button */}
                {currentBatchInvoices.length > 0 && (
                  <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: '#819291' }}>
                    <div>
                      <div className="text-sm font-semibold" style={{ color: '#113543' }}>
                        Total Amount: {formatCurrency(totalAmount)}
                      </div>
                      {selectedClient?.fee_terms && (
                        <div className="text-xs mt-1" style={{ color: '#819291' }}>
                          Fee: {selectedClient.fee_terms.fee_type === 'percentage'
                            ? `${selectedClient.fee_terms.fee_percentage}%`
                            : `$${selectedClient.fee_terms.flat_fee_amount}`}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={handleCreateBatch}
                      className="px-6 py-2 text-sm font-medium text-white transition-colors rounded"
                      style={{ backgroundColor: '#113543' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#0a2529'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#113543'
                      }}
                    >
                      Create Batch
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}

