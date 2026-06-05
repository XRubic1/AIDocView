import { useMemo } from 'react'
import { Check, AlertTriangle } from 'lucide-react'
import { DOCSORT_AI_DISCLAIMER_SHORT } from '../../products/docSort/constants/aiDisclaimer'
import type { BatchIntakeDraft, CredyxInvoiceDraft } from '../../types/credyxBatch'
import { formatCurrency } from '../../utils/format'

interface BatchAiConfirmPanelProps {
  draft: BatchIntakeDraft
  onUpdateDraft: (draftId: string, patch: Partial<CredyxInvoiceDraft>) => void
  onConfirmDraft: (draftId: string) => void
  onSubmitBatch: () => void
  submitting: boolean
}

const inputClass =
  'w-full min-w-0 px-1.5 py-0.5 text-xs border rounded h-7 focus:outline-none focus:border-[#0891b2]'

const thClass = 'text-left py-1.5 px-2 text-[11px] font-semibold whitespace-nowrap'
const tdClass = 'py-1 px-2 align-middle'

/** Dense table review — fit many loads on one screen without card stacking. */
export default function BatchAiConfirmPanel({
  draft,
  onUpdateDraft,
  onConfirmDraft,
  onSubmitBatch,
  submitting,
}: BatchAiConfirmPanelProps) {
  const allConfirmed = draft.invoices.length > 0 && draft.invoices.every((i) => i.confirmed)
  const confirmedCount = draft.invoices.filter((i) => i.confirmed).length
  const batchTotal = useMemo(
    () => draft.invoices.reduce((s, i) => s + (i.amount || 0), 0),
    [draft.invoices]
  )

  const hasUnmatched =
    draft.unmatched.rateCons.length > 0 ||
    draft.unmatched.bols.length > 0 ||
    draft.unmatched.other.length > 0

  const unmatchedTotal =
    draft.unmatched.rateCons.length +
    draft.unmatched.bols.length +
    draft.unmatched.other.length

  const handleConfirmAll = () => {
    draft.invoices.forEach((inv) => {
      if (!inv.confirmed && inv.amount > 0) {
        onConfirmDraft(inv.draftId)
      }
    })
  }

  return (
    <div
      className="flex flex-col min-h-0"
      style={{ maxHeight: 'calc(100vh - 11rem)' }}
    >
      {/* Compact toolbar */}
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 px-2 border-b text-xs shrink-0"
        style={{ borderColor: '#e2e8f0', backgroundColor: '#f8f9fa' }}
      >
        <span className="flex items-center gap-1" style={{ color: '#0891b2' }} title={DOCSORT_AI_DISCLAIMER_SHORT}>
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span style={{ color: '#64748b' }}>{DOCSORT_AI_DISCLAIMER_SHORT}</span>
        </span>
        <span className="font-medium" style={{ color: '#113543' }}>
          {draft.invoices.length} load{draft.invoices.length !== 1 ? 's' : ''}
        </span>
        <span style={{ color: '#64748b' }}>
          {confirmedCount}/{draft.invoices.length} confirmed
        </span>
        <span className="font-medium" style={{ color: '#113543' }}>
          Batch total: {formatCurrency(batchTotal)}
        </span>
        {hasUnmatched && (
          <span style={{ color: '#0891b2' }}>
            {unmatchedTotal} unmatched doc{unmatchedTotal !== 1 ? 's' : ''} (excluded)
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          className="px-2 py-1 text-xs font-medium border rounded"
          style={{ borderColor: '#e2e8f0', color: '#113543' }}
          onClick={handleConfirmAll}
          disabled={allConfirmed}
        >
          Confirm all
        </button>
        <button
          type="button"
          className="px-3 py-1 text-xs font-medium rounded"
          style={{
            backgroundColor: allConfirmed ? '#0891b2' : '#64748b',
            color: '#FFFFFF',
            opacity: allConfirmed && !submitting ? 1 : 0.55,
            cursor: allConfirmed && !submitting ? 'pointer' : 'not-allowed',
          }}
          disabled={!allConfirmed || submitting}
          onClick={onSubmitBatch}
        >
          {submitting ? 'Uploading…' : 'Upload batch'}
        </button>
      </div>

      {hasUnmatched && (
        <details className="shrink-0 text-xs border-b" style={{ borderColor: '#e2e8f0' }}>
          <summary
            className="cursor-pointer py-1 px-2 list-none flex items-center gap-1"
            style={{ color: '#0891b2', backgroundColor: 'rgba(194, 165, 88, 0.06)' }}
          >
            <span className="font-medium">Unmatched files ({unmatchedTotal})</span>
            <span style={{ color: '#64748b' }}>— not on invoices</span>
          </summary>
          <ul className="px-3 pb-2 max-h-20 overflow-y-auto" style={{ color: '#113543' }}>
            {[
              ...draft.unmatched.rateCons,
              ...draft.unmatched.bols,
              ...draft.unmatched.other,
            ].map((fp) => (
              <li key={fp.docId} className="truncate">
                {fp.fileName}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Dense invoice table — scroll only inside table if many rows */}
      <div className="flex-1 min-h-0 overflow-auto border-b" style={{ borderColor: '#e2e8f0' }}>
        <table className="w-full text-xs border-collapse" style={{ color: '#113543' }}>
          <thead className="sticky top-0 z-10" style={{ backgroundColor: '#f0f2f2' }}>
            <tr className="border-b" style={{ borderColor: '#e2e8f0' }}>
              <th className={thClass} style={{ width: '4rem' }}>
                Load
              </th>
              <th className={thClass} style={{ width: '5.5rem' }}>
                Docs
              </th>
              <th className={thClass}>Invoice #</th>
              <th className={thClass} style={{ width: '5.5rem' }}>
                Load #
              </th>
              <th className={thClass}>Broker</th>
              <th className={`${thClass} text-right`} style={{ width: '6rem' }}>
                Amount
              </th>
              <th className={`${thClass} text-center`} style={{ width: '4.5rem' }}>
                OK
              </th>
            </tr>
          </thead>
          <tbody>
            {draft.invoices.map((inv, index) => (
              <tr
                key={inv.draftId}
                className="border-b"
                style={{
                  borderColor: '#e8ecec',
                  backgroundColor: inv.confirmed
                    ? 'rgba(61, 219, 122, 0.07)'
                    : index % 2 === 0
                      ? '#fff'
                      : '#fafafa',
                }}
              >
                <td className={`${tdClass} font-semibold whitespace-nowrap`}>{inv.load_number}</td>
                <td className={`${tdClass} whitespace-nowrap`} style={{ color: '#64748b' }}>
                  {inv.fingerprints.rateCons.length} RC · {inv.fingerprints.bols.length} BOL
                  {inv.rate_missing && (
                    <span className="block" style={{ color: '#0891b2' }}>
                      rate?
                    </span>
                  )}
                </td>
                <td className={tdClass}>
                  <input
                    type="text"
                    value={inv.invoice_number}
                    disabled={inv.confirmed}
                    onChange={(e) =>
                      onUpdateDraft(inv.draftId, { invoice_number: e.target.value })
                    }
                    className={inputClass}
                    style={{ borderColor: '#e2e8f0' }}
                  />
                </td>
                <td className={tdClass}>
                  <input
                    type="text"
                    value={inv.load_number}
                    disabled={inv.confirmed}
                    onChange={(e) => onUpdateDraft(inv.draftId, { load_number: e.target.value })}
                    className={inputClass}
                    style={{ borderColor: '#e2e8f0' }}
                  />
                </td>
                <td className={tdClass}>
                  <input
                    type="text"
                    value={inv.broker_name}
                    disabled={inv.confirmed}
                    onChange={(e) => onUpdateDraft(inv.draftId, { broker_name: e.target.value })}
                    className={inputClass}
                    style={{ borderColor: '#e2e8f0' }}
                  />
                </td>
                <td className={tdClass}>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={inv.amount || ''}
                    disabled={inv.confirmed}
                    onChange={(e) =>
                      onUpdateDraft(inv.draftId, {
                        amount: Number.parseFloat(e.target.value) || 0,
                        rate_missing: false,
                      })
                    }
                    className={`${inputClass} text-right`}
                    style={{ borderColor: '#e2e8f0' }}
                  />
                </td>
                <td className={`${tdClass} text-center`}>
                  {inv.confirmed ? (
                    <span title="Confirmed">
                      <Check className="w-4 h-4 inline" style={{ color: '#3ddb7a' }} />
                    </span>
                  ) : (
                    <button
                      type="button"
                      title="Confirm row"
                      className="px-1.5 py-0.5 text-[10px] font-medium rounded border"
                      style={{ borderColor: '#113543', color: '#113543' }}
                      onClick={() => onConfirmDraft(inv.draftId)}
                      disabled={inv.amount <= 0}
                    >
                      Confirm
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
