import { useMemo, useState } from 'react'
import { GitMerge, Search, X } from 'lucide-react'
import type { Broker } from '../../types/broker'

type MergeBrokersModalProps = {
  source: Broker
  brokers: Broker[]
  invoiceCount: number
  isMerging: boolean
  onClose: () => void
  onConfirm: (keepId: string) => void
}

/**
 * Pick the keeper catalog row; invoices on `source` will move there.
 */
export default function MergeBrokersModal({
  source,
  brokers,
  invoiceCount,
  isMerging,
  onClose,
  onConfirm,
}: MergeBrokersModalProps) {
  const [search, setSearch] = useState('')
  const [keepId, setKeepId] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase()
    return brokers
      .filter((broker) => broker.id !== source.id)
      .filter((broker) => {
        if (!q) return true
        const hay = [broker.name, broker.mc_number, broker.dot_number, broker.city, broker.state]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [brokers, search, source.id])

  const keep = candidates.find((broker) => broker.id === keepId)

  return (
    <div className="fixed inset-0 z-[80] bg-slate-900/50 flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="bg-white w-full max-w-lg max-h-[calc(100vh-1.5rem)] rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col">
        <div className="shrink-0 px-4 py-3 border-b border-slate-200 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Merge broker
            </p>
            <h2 className="text-sm font-semibold text-slate-900 mt-0.5">
              Move loads from {source.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isMerging}
            className="p-1.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
          <p className="text-sm text-slate-700 leading-relaxed">
            {invoiceCount === 0
              ? `${source.name} has no loads. Merging will remove this duplicate from the catalog.`
              : `${invoiceCount} load${invoiceCount === 1 ? '' : 's'} on ${source.name} will move to the broker you pick. Then this duplicate is removed.`}
          </p>

          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Merge into
            </span>
            <div className="relative mt-1.5">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search keeper broker…"
                className="client-input w-full pl-8 pr-3 py-2 text-sm"
              />
            </div>
          </label>

          <ul className="rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-56 overflow-y-auto">
            {candidates.length === 0 ? (
              <li className="px-3 py-6 text-sm text-slate-500 text-center">No matching brokers</li>
            ) : (
              candidates.map((broker) => {
                const selected = broker.id === keepId
                return (
                  <li key={broker.id}>
                    <button
                      type="button"
                      onClick={() => setKeepId(broker.id)}
                      className={`w-full text-left px-3 py-2.5 transition-colors ${
                        selected ? 'bg-blue-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <p className="text-sm font-medium text-slate-900 truncate">{broker.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">
                        {[broker.mc_number, [broker.city, broker.state].filter(Boolean).join(', ')]
                          .filter(Boolean)
                          .join(' · ') || 'No MC / location'}
                      </p>
                    </button>
                  </li>
                )
              })
            )}
          </ul>

          <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>
              I understand this cannot be undone
              {keep ? ` — ${source.name} will be merged into ${keep.name}` : ''}.
            </span>
          </label>
        </div>

        <div className="shrink-0 px-4 py-3 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isMerging}
            className="dashboard-btn-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!keepId || !confirmed || isMerging}
            onClick={() => onConfirm(keepId)}
            className="dashboard-btn-primary inline-flex items-center gap-1.5"
          >
            <GitMerge className="w-3.5 h-3.5" />
            {isMerging ? 'Merging…' : 'Merge brokers'}
          </button>
        </div>
      </div>
    </div>
  )
}
