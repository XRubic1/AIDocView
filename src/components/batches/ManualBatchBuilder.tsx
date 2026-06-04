import { useMemo, useState } from 'react'
import { mockBrokers } from '../../data/mockBrokers'
import { submitManualBatch } from '../../services/credyx/submitManualBatch'
import { formatCurrency } from '../../utils/format'
import { Trash2 } from 'lucide-react'

interface InvoiceDocument {
  id: string
  name: string
  file: File
  size: number
}

interface ManualInvoiceRow {
  invoice_number: string
  load_number: string
  broker_name: string
  broker_address: string
  amount: string
  invoice_date: string
  notes: string
  documents: InvoiceDocument[]
}

const emptyForm = (): ManualInvoiceRow => ({
  invoice_number: '',
  load_number: '',
  broker_name: '',
  broker_address: '',
  amount: '',
  invoice_date: new Date().toISOString().split('T')[0],
  notes: '',
  documents: [],
})

function generateNextInvoiceNumber(existing: ManualInvoiceRow[]): string {
  const year = new Date().getFullYear()
  let max = 0
  existing.forEach((inv) => {
    const m = inv.invoice_number.match(/INV-\d+-(\d+)/i)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  })
  return `INV-${year}-${String(max + 1).padStart(3, '0')}`
}

interface ManualBatchBuilderProps {
  clientId: string
  clientName: string
  onSuccess: (batchId: string) => void
  onBack?: () => void
}

/** Manual invoice entry + submit to mock store (client or admin). */
export default function ManualBatchBuilder({
  clientId,
  clientName,
  onSuccess,
  onBack,
}: ManualBatchBuilderProps) {
  const [invoices, setInvoices] = useState<ManualInvoiceRow[]>([])
  const [form, setForm] = useState<ManualInvoiceRow>(() => ({
    ...emptyForm(),
    invoice_number: generateNextInvoiceNumber([]),
  }))
  const [brokerSuggestions, setBrokerSuggestions] = useState<typeof mockBrokers>([])
  const [showBrokerSuggestions, setShowBrokerSuggestions] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const totalAmount = useMemo(
    () => invoices.reduce((s, inv) => s + parseFloat(inv.amount || '0'), 0),
    [invoices]
  )

  const handleField = (field: keyof ManualInvoiceRow, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      if (field === 'broker_name') {
        const filtered = value.trim()
          ? mockBrokers.filter((b) => b.name.toLowerCase().includes(value.toLowerCase()))
          : []
        setBrokerSuggestions(filtered)
        setShowBrokerSuggestions(filtered.length > 0)
      }
      return next
    })
  }

  const handleBrokerSelect = (broker: (typeof mockBrokers)[0]) => {
    const address = broker.address
      ? `${broker.address}${broker.city ? `, ${broker.city}` : ''}${broker.state ? `, ${broker.state}` : ''}${broker.zip ? ` ${broker.zip}` : ''}`.trim()
      : ''
    setForm((prev) => ({
      ...prev,
      broker_name: broker.name,
      broker_address: address,
    }))
    setShowBrokerSuggestions(false)
  }

  const handleDocSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files
    if (!list) return
    const added: InvoiceDocument[] = Array.from(list).map((file) => ({
      id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: file.name,
      file,
      size: file.size,
    }))
    setForm((prev) => ({ ...prev, documents: [...prev.documents, ...added] }))
    e.target.value = ''
  }

  const handleAddInvoice = () => {
    if (!form.broker_name || !form.broker_address || !form.amount) {
      alert('Broker name, broker address, and amount are required.')
      return
    }
    const invoiceNumber = form.invoice_number || generateNextInvoiceNumber(invoices)
    setInvoices((prev) => [...prev, { ...form, invoice_number: invoiceNumber }])
    setForm({
      ...emptyForm(),
      invoice_number: generateNextInvoiceNumber([...invoices, { ...form, invoice_number: invoiceNumber }]),
    })
    setShowBrokerSuggestions(false)
  }

  const handleSubmit = () => {
    if (invoices.length === 0) {
      alert('Add at least one invoice before creating the batch.')
      return
    }
    setSubmitting(true)
    try {
      const { batch } = submitManualBatch({
        clientId,
        clientName,
        invoices: invoices.map((inv) => ({
          invoice_number: inv.invoice_number,
          load_number: inv.load_number,
          broker_name: inv.broker_name,
          amount: inv.amount,
          invoice_date: inv.invoice_date,
          notes: inv.notes,
          documents: inv.documents.map((d) => ({ id: d.id, file: d.file })),
        })),
      })
      onSuccess(batch.id)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not create batch')
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle = {
    borderColor: '#819291',
    color: '#113543',
    backgroundColor: '#FFFFFF',
  }

  return (
    <div className="space-y-6">
      {onBack && (
        <button type="button" className="text-sm underline" style={{ color: '#819291' }} onClick={onBack}>
          Back to upload options
        </button>
      )}

      <div>
        <h3 className="text-lg font-bold mb-1" style={{ color: '#113543' }}>
          Manual batch — {clientName}
        </h3>
        <p className="text-sm" style={{ color: '#819291' }}>
          Batch number is auto-generated on submit
        </p>
      </div>

      <div className="border rounded p-6" style={{ borderColor: '#819291' }}>
        <h4 className="text-md font-semibold mb-4" style={{ color: '#113543' }}>
          Add invoice
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: '#113543' }}>
              Invoice number
            </label>
            <input
              type="text"
              value={form.invoice_number}
              onChange={(e) => handleField('invoice_number', e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: '#113543' }}>
              Load number
            </label>
            <input
              type="text"
              value={form.load_number}
              onChange={(e) => handleField('load_number', e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded"
              style={inputStyle}
            />
          </div>
          <div className="relative">
            <label className="block text-sm font-medium mb-1" style={{ color: '#113543' }}>
              Broker <span style={{ color: '#C2A558' }}>*</span>
            </label>
            <input
              type="text"
              value={form.broker_name}
              onChange={(e) => handleField('broker_name', e.target.value)}
              onFocus={() => brokerSuggestions.length > 0 && setShowBrokerSuggestions(true)}
              onBlur={() => setTimeout(() => setShowBrokerSuggestions(false), 200)}
              className="w-full px-3 py-2 text-sm border rounded"
              style={inputStyle}
            />
            {showBrokerSuggestions && brokerSuggestions.length > 0 && (
              <div
                className="absolute z-10 w-full mt-1 bg-white border rounded shadow-lg max-h-48 overflow-y-auto"
                style={{ borderColor: '#819291' }}
              >
                {brokerSuggestions.map((broker) => (
                  <button
                    key={broker.id}
                    type="button"
                    onClick={() => handleBrokerSelect(broker)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    style={{ color: '#113543' }}
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
              step="0.01"
              min="0.01"
              value={form.amount}
              onChange={(e) => handleField('amount', e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: '#113543' }}>
              Invoice date
            </label>
            <input
              type="date"
              value={form.invoice_date}
              onChange={(e) => handleField('invoice_date', e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded"
              style={inputStyle}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1" style={{ color: '#113543' }}>
              Broker address <span style={{ color: '#C2A558' }}>*</span>
            </label>
            <input
              type="text"
              value={form.broker_address}
              onChange={(e) => handleField('broker_address', e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded"
              style={inputStyle}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1" style={{ color: '#113543' }}>
              Supporting documents (optional)
            </label>
            <input type="file" accept=".pdf,application/pdf" multiple onChange={handleDocSelect} className="text-sm" />
            {form.documents.length > 0 && (
              <ul className="mt-2 text-xs" style={{ color: '#819291' }}>
                {form.documents.map((d) => (
                  <li key={d.id}>{d.name}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <button
          type="button"
          className="mt-4 px-4 py-2 text-sm font-medium rounded"
          style={{ backgroundColor: '#819291', color: '#FFFFFF' }}
          onClick={handleAddInvoice}
        >
          Add invoice to batch
        </button>
      </div>

      {invoices.length > 0 && (
        <div className="border rounded overflow-hidden" style={{ borderColor: '#819291' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: '#819291', backgroundColor: '#f8f9fa' }}>
                <th className="text-left py-2 px-3" style={{ color: '#113543' }}>
                  Invoice#
                </th>
                <th className="text-left py-2 px-3" style={{ color: '#113543' }}>
                  Load#
                </th>
                <th className="text-left py-2 px-3" style={{ color: '#113543' }}>
                  Broker
                </th>
                <th className="text-right py-2 px-3" style={{ color: '#113543' }}>
                  Amount
                </th>
                <th className="text-center py-2 px-3" style={{ color: '#113543' }}>
                  Docs
                </th>
                <th className="text-center py-2 px-3" />
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv, index) => (
                <tr key={`${inv.invoice_number}-${index}`} className="border-b" style={{ borderColor: '#eee' }}>
                  <td className="py-2 px-3" style={{ color: '#113543' }}>
                    {inv.invoice_number}
                  </td>
                  <td className="py-2 px-3" style={{ color: '#819291' }}>
                    {inv.load_number || '—'}
                  </td>
                  <td className="py-2 px-3" style={{ color: '#819291' }}>
                    {inv.broker_name}
                  </td>
                  <td className="py-2 px-3 text-right" style={{ color: '#113543' }}>
                    {formatCurrency(parseFloat(inv.amount || '0'))}
                  </td>
                  <td className="py-2 px-3 text-center" style={{ color: '#819291' }}>
                    {inv.documents.length}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <button
                      type="button"
                      onClick={() => setInvoices((prev) => prev.filter((_, i) => i !== index))}
                      aria-label="Remove invoice"
                    >
                      <Trash2 className="w-4 h-4" style={{ color: '#819291' }} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-3 flex justify-between items-center" style={{ backgroundColor: '#f8f9fa' }}>
            <span className="text-sm font-medium" style={{ color: '#113543' }}>
              {invoices.length} invoice{invoices.length !== 1 ? 's' : ''} · {formatCurrency(totalAmount)}
            </span>
            <button
              type="button"
              disabled={submitting}
              className="px-6 py-2 text-sm font-medium rounded"
              style={{
                backgroundColor: submitting ? '#cccccc' : '#C2A558',
                color: '#FFFFFF',
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
              onClick={handleSubmit}
            >
              {submitting ? 'Creating…' : 'Create batch'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
