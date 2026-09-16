import { useEffect, useMemo, useRef, useState } from 'react'
import { submitManualBatch } from '../../services/credyx/submitManualBatch'
import { formatCurrency } from '../../utils/format'
import {
  getNextClientInvoiceNumber,
  isInvoiceNumberTaken,
  loadClientInvoiceNumbers,
} from '../../utils/clientInvoiceNumbers'
import {
  formatLoadNumberWarning,
  formatLoadNumberWarningsSummary,
  getBatchLoadNumberWarnings,
  getLoadNumberWarnings,
  getWithinBatchLoadWarnings,
  validateBatchInvoiceNumbers,
} from '../../utils/invoiceDuplicateChecks'
import { Pencil, Trash2 } from 'lucide-react'
import { useToast } from '../ui/ToastProvider'
import BrokerPicker from '../brokers/BrokerPicker'
import BrokerInternalNotesBanner from '../brokers/BrokerInternalNotesBanner'

interface InvoiceDocument {
  id: string
  name: string
  file: File
  size: number
}

interface ManualInvoiceRow {
  invoice_number: string
  load_number: string
  broker_id: string
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
  broker_id: '',
  broker_name: '',
  broker_address: '',
  amount: '',
  invoice_date: new Date().toISOString().split('T')[0],
  notes: '',
  documents: [],
})

function nextFormInvoiceNumber(
  clientId: string,
  existing: ManualInvoiceRow[],
  knownNumbers: string[] = []
): string {
  return getNextClientInvoiceNumber(clientId, [
    ...knownNumbers,
    ...existing.map((inv) => inv.invoice_number),
  ])
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
  const { showToast } = useToast()
  const [invoices, setInvoices] = useState<ManualInvoiceRow[]>([])
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  /** Live invoice numbers from DB — checked before suggesting the next #. */
  const [knownInvoiceNumbers, setKnownInvoiceNumbers] = useState<string[]>([])
  const [form, setForm] = useState<ManualInvoiceRow>(() => ({
    ...emptyForm(),
    invoice_number: nextFormInvoiceNumber(clientId, []),
  }))
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)

  // Pull existing carrier invoice numbers from Supabase before auto-assigning.
  useEffect(() => {
    let cancelled = false
    void loadClientInvoiceNumbers(clientId).then((nums) => {
      if (cancelled) return
      setKnownInvoiceNumbers(nums)
      setForm((prev) => {
        // Only rewrite the suggestion when the field still looks auto-filled / empty.
        if (prev.invoice_number && invoices.length > 0) return prev
        return {
          ...prev,
          invoice_number: nextFormInvoiceNumber(clientId, invoices, nums),
        }
      })
    })
    return () => {
      cancelled = true
    }
  }, [clientId])

  const totalAmount = useMemo(
    () => invoices.reduce((s, inv) => s + parseFloat(inv.amount || '0'), 0),
    [invoices]
  )

  const invoiceNumberError = useMemo(() => {
    const num = form.invoice_number.trim()
    if (!num) return null
    const reserved = [
      ...knownInvoiceNumbers,
      ...invoices.filter((_, i) => i !== editingIndex).map((inv) => inv.invoice_number),
    ]
    if (isInvoiceNumberTaken(clientId, num, reserved)) {
      return `Invoice number ${num} is already used for this carrier`
    }
    return null
  }, [clientId, form.invoice_number, invoices, editingIndex, knownInvoiceNumbers])

  const loadNumberWarning = useMemo(() => {
    const warnings = getLoadNumberWarnings(form.load_number, {
      forClientId: clientId,
      crossCarrier: true,
    })
    if (warnings.length === 0) return null
    return formatLoadNumberWarning(warnings[0], 'admin')
  }, [clientId, form.load_number])

  const handleField = (field: keyof ManualInvoiceRow, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleBrokerChange = (next: {
    broker_id: string
    broker_name: string
    broker_address?: string
  }) => {
    setForm((prev) => ({
      ...prev,
      broker_id: next.broker_id,
      broker_name: next.broker_name,
      broker_address: next.broker_address ?? prev.broker_address,
    }))
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
    if (!form.broker_id || !form.broker_name || !form.broker_address || !form.amount) {
      showToast('Select a broker (with address) and enter an amount.', 'error')
      return
    }
    const reserved = [
      ...knownInvoiceNumbers,
      ...invoices.filter((_, i) => i !== editingIndex).map((inv) => inv.invoice_number),
    ]
    const invoiceNumber =
      form.invoice_number.trim() || nextFormInvoiceNumber(clientId, invoices, knownInvoiceNumbers)

    // Keep the user's exact custom number — do not rewrite to the next system #.
    if (isInvoiceNumberTaken(clientId, invoiceNumber, reserved)) {
      showToast(
        `Invoice number ${invoiceNumber} is already used for this carrier. Enter a different number.`,
        'error'
      )
      return
    }

    const added = { ...form, invoice_number: invoiceNumber }
    const nextInvoices =
      editingIndex != null
        ? invoices.map((inv, i) => (i === editingIndex ? added : inv))
        : [...invoices, added]

    setInvoices(nextInvoices)
    setEditingIndex(null)
    setForm({
      ...emptyForm(),
      invoice_number: nextFormInvoiceNumber(clientId, nextInvoices, knownInvoiceNumbers),
    })
  }

  const startEditInvoice = (index: number) => {
    const inv = invoices[index]
    if (!inv) return
    setEditingIndex(index)
    setForm({ ...inv })
  }

  const cancelEdit = () => {
    setEditingIndex(null)
    setForm({
      ...emptyForm(),
      invoice_number: nextFormInvoiceNumber(clientId, invoices, knownInvoiceNumbers),
    })
  }

  const handleSubmit = async () => {
    if (submittingRef.current || submitting) return
    if (invoices.length === 0) {
      showToast('Add at least one invoice before creating the batch.', 'error')
      return
    }

    const numberIssues = validateBatchInvoiceNumbers(
      clientId,
      invoices.map((inv) => inv.invoice_number),
      { knownNumbers: knownInvoiceNumbers }
    )
    if (numberIssues.length > 0) {
      showToast(numberIssues[0].message, 'error')
      return
    }

    const loadWarnings = getBatchLoadNumberWarnings(
      clientId,
      invoices.map((inv) => inv.load_number),
      { crossCarrier: true }
    )
    const withinBatchLoad = getWithinBatchLoadWarnings(invoices.map((inv) => inv.load_number))
    if (loadWarnings.length > 0 || withinBatchLoad.length > 0) {
      const summary =
        loadWarnings.length > 0
          ? formatLoadNumberWarningsSummary(loadWarnings, 'admin')
          : `${withinBatchLoad.join('\n')}\n\nSubmit anyway?`
      if (!window.confirm(summary)) return
    }

    submittingRef.current = true
    setSubmitting(true)
    try {
      const { batch } = await submitManualBatch({
        clientId,
        clientName,
        skipSetupGate: true,
        invoices: invoices.map((inv) => ({
          invoice_number: inv.invoice_number,
          load_number: inv.load_number,
          broker_id: inv.broker_id,
          broker_name: inv.broker_name,
          amount: inv.amount,
          invoice_date: inv.invoice_date,
          notes: inv.notes,
          documents: inv.documents.map((d) => ({ id: d.id, file: d.file })),
        })),
      })
      onSuccess(batch.id)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not create batch', 'error')
    } finally {
      submittingRef.current = false
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
          {editingIndex != null ? `Edit invoice ${form.invoice_number}` : 'Add invoice'}
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
              style={{
                ...inputStyle,
                ...(invoiceNumberError ? { borderColor: '#f87171' } : {}),
              }}
            />
            {invoiceNumberError ? (
              <p className="text-xs mt-1" style={{ color: '#b91c1c' }}>
                {invoiceNumberError}
              </p>
            ) : (
              <p className="text-xs mt-1" style={{ color: '#819291' }}>
                Must be unique for this carrier
              </p>
            )}
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
              style={{
                ...inputStyle,
                ...(loadNumberWarning ? { borderColor: '#fbbf24' } : {}),
              }}
            />
            {loadNumberWarning && (
              <p className="text-xs mt-1" style={{ color: '#b45309' }}>
                {loadNumberWarning}
              </p>
            )}
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1" style={{ color: '#113543' }}>
              Broker <span style={{ color: '#C2A558' }}>*</span>
            </label>
            <BrokerPicker
              mode="admin"
              value={{
                broker_id: form.broker_id,
                broker_name: form.broker_name,
                broker_address: form.broker_address,
              }}
              onChange={handleBrokerChange}
              inputClassName="w-full px-3 py-2 text-sm border rounded"
              placeholder="Select or create a broker…"
            />
            <BrokerInternalNotesBanner
              brokerId={form.broker_id}
              brokerName={form.broker_name}
            />
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
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            className="px-4 py-2 text-sm font-medium rounded"
            style={{ backgroundColor: '#819291', color: '#FFFFFF' }}
            onClick={handleAddInvoice}
          >
            {editingIndex != null ? 'Update invoice' : 'Add invoice to batch'}
          </button>
          {editingIndex != null && (
            <button
              type="button"
              className="px-4 py-2 text-sm font-medium rounded border"
              style={{ borderColor: '#819291', color: '#819291' }}
              onClick={cancelEdit}
            >
              Cancel
            </button>
          )}
        </div>
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
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startEditInvoice(index)}
                        aria-label="Edit invoice"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" style={{ color: '#819291' }} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setInvoices((prev) => prev.filter((_, i) => i !== index))
                          if (editingIndex === index) cancelEdit()
                          else if (editingIndex != null && editingIndex > index) {
                            setEditingIndex(editingIndex - 1)
                          }
                        }}
                        aria-label="Remove invoice"
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" style={{ color: '#819291' }} />
                      </button>
                    </div>
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
