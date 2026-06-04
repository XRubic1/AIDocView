import { useState } from 'react'
import { X } from 'lucide-react'
import type { InvoicePDFInput } from '../../../utils/generateInvoicePDF'
import { generateAndDownloadInvoice } from '../services/docSortInvoice'
import DocSortAiDisclaimer from './DocSortAiDisclaimer'
import { formatExtractedRate } from '../utils/formatRate'
import type { DocSortLoadGroup } from '../types'

interface DocSortInvoiceModalProps {
  loadLabel: string
  group: DocSortLoadGroup
  draft: InvoicePDFInput
  onClose: () => void
  onGenerated?: (file: File, invoiceNumber: string) => void
}

/** Edit invoice fields then generate PDF for a sorted load. */
export default function DocSortInvoiceModal({
  loadLabel,
  group,
  draft,
  onClose,
  onGenerated,
}: DocSortInvoiceModalProps) {
  const aiRate = formatExtractedRate(group.rateCons.find((r) => r.rateAmount) ?? group.rateCons[0])
  const [form, setForm] = useState<InvoicePDFInput>(draft)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const update = (key: keyof InvoicePDFInput, value: string | number) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleGenerate = async () => {
    if (!form.invoiceAmount || form.invoiceAmount <= 0) {
      setError('Enter an invoice amount greater than zero.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const file = await generateAndDownloadInvoice(form)
      onGenerated?.(file, form.invoiceNumber.trim())
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invoice generation failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="doc-sort-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="invoice-modal-title">
      <div className="doc-sort-modal">
        <div className="doc-sort-modal-head">
          <div>
            <div className="doc-sort-modal-tag">Generate invoice</div>
            <h2 id="invoice-modal-title" className="doc-sort-modal-title">
              Load {loadLabel}
            </h2>
          </div>
          <button type="button" className="doc-sort-icon-btn" onClick={onClose} aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="doc-sort-modal-body">
          <DocSortAiDisclaimer variant="inline" />
          {aiRate && (
            <p className="doc-sort-ai-rate-hint">
              AI-extracted rate: <strong>{aiRate}</strong> — confirm amount before generating.
            </p>
          )}
          <div className="doc-sort-form-grid">
            <label>
              Invoice #
              <input
                value={form.invoiceNumber}
                onChange={(e) => update('invoiceNumber', e.target.value)}
              />
            </label>
            <label>
              Date
              <input value={form.invoiceDate} onChange={(e) => update('invoiceDate', e.target.value)} />
            </label>
            <label>
              Amount ($) — verify against rate con
              <input
                type="number"
                min={0}
                step={0.01}
                value={form.invoiceAmount || ''}
                onChange={(e) => update('invoiceAmount', Number.parseFloat(e.target.value) || 0)}
              />
            </label>
            <label>
              Load #
              <input value={form.loadNumber ?? ''} onChange={(e) => update('loadNumber', e.target.value)} />
            </label>
            <label>
              Broker
              <input value={form.brokerName} onChange={(e) => update('brokerName', e.target.value)} />
            </label>
            <label>
              Carrier
              <input value={form.carrierName} onChange={(e) => update('carrierName', e.target.value)} />
            </label>
            <label className="doc-sort-form-span2">
              Client name
              <input value={form.clientName ?? ''} onChange={(e) => update('clientName', e.target.value)} />
            </label>
          </div>
          {error && <p className="doc-sort-error-inline">{error}</p>}
        </div>

        <div className="doc-sort-modal-foot">
          <button type="button" className="doc-sort-btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="doc-sort-btn-primary" onClick={handleGenerate} disabled={busy}>
            {busy ? 'Generating…' : 'Generate & download'}
          </button>
        </div>
      </div>
    </div>
  )
}
