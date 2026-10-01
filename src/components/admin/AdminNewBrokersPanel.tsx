import { useMemo, useState } from 'react'
import { Link2, Plus } from 'lucide-react'
import type { Broker } from '../../types/broker'
import type { PendingNewBroker } from '../../utils/pendingNewBrokers'
import { STANDARD_NEW_BROKER_PAY_TERMS_DAYS } from '../../utils/pendingNewBrokers'
import { formatCurrency, formatDate } from '../../utils/format'

interface AdminNewBrokersPanelProps {
  items: PendingNewBroker[]
  brokers: Broker[]
  linkingKey: string | null
  /** Shown when the list is empty because of search, not because the queue is clear. */
  emptyBecauseSearch?: boolean
  onReview: (requestedName: string) => void
  onLinkExisting: (requestedName: string, brokerId: string) => void
}

export default function AdminNewBrokersPanel({
  items,
  brokers,
  linkingKey,
  emptyBecauseSearch = false,
  onReview,
  onLinkExisting,
}: AdminNewBrokersPanelProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center text-slate-500">
        <p className="text-sm font-medium text-slate-700">
          {emptyBecauseSearch ? 'No brokers match that search' : 'No new brokers waiting'}
        </p>
        {emptyBecauseSearch ? null : (
          <p className="text-xs mt-1 max-w-md leading-relaxed">
            When a carrier runs a load with a broker that is not in the Credyx directory, it shows
            up here to review and add. New brokers start at Net {STANDARD_NEW_BROKER_PAY_TERMS_DAYS}.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="px-3 py-3 space-y-3">
      <p className="text-xs text-slate-500 leading-relaxed max-w-3xl">
        These names are on carrier loads and are not linked to a directory broker yet. Review an
        unknown name and add it, or attach the loads to a broker already on file. New brokers use
        standard Net {STANDARD_NEW_BROKER_PAY_TERMS_DAYS} pay terms.
      </p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.key}
            className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 truncate">{item.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {item.clientNames.join(', ') || 'Unknown carrier'}
                  {' · '}
                  {item.loadCount} load{item.loadCount === 1 ? '' : 's'}
                  {' · '}
                  {formatCurrency(item.totalAmount)}
                  {' · '}
                  {item.catalogMatch
                    ? `Matches ${item.catalogMatch.name}`
                    : `Net ${STANDARD_NEW_BROKER_PAY_TERMS_DAYS} when added`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {item.catalogMatch ? (
                  <button
                    type="button"
                    className="dashboard-btn-primary dashboard-btn-compact inline-flex items-center gap-1.5"
                    disabled={linkingKey === item.key}
                    onClick={() => onLinkExisting(item.name, item.catalogMatch!.id)}
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    Attach loads
                  </button>
                ) : (
                  <button
                    type="button"
                    className="dashboard-btn-primary dashboard-btn-compact inline-flex items-center gap-1.5"
                    disabled={linkingKey === item.key}
                    onClick={() => onReview(item.name)}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Review & add
                  </button>
                )}
                <AttachExistingBroker
                  brokers={brokers}
                  disabled={linkingKey === item.key}
                  onPick={(brokerId) => onLinkExisting(item.name, brokerId)}
                />
              </div>
            </div>
            <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
              {item.invoices.map((inv) => (
                <li
                  key={inv.id}
                  className="flex flex-wrap gap-x-4 gap-y-0.5 py-1.5 text-xs text-slate-600"
                >
                  <span className="font-medium text-slate-800">{inv.invoice_number}</span>
                  <span>{inv.client_name}</span>
                  {inv.load_number ? <span>Load {inv.load_number}</span> : null}
                  <span className="tabular-nums">{formatCurrency(inv.amount)}</span>
                  <span>{formatDate(inv.invoice_date)}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}

function AttachExistingBroker({
  brokers,
  disabled,
  onPick,
}: {
  brokers: Broker[]
  disabled: boolean
  onPick: (brokerId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? brokers.filter(
          (b) =>
            b.name.toLowerCase().includes(q) ||
            (b.mc_number ?? '').toLowerCase().includes(q)
        )
      : brokers
    return list.slice(0, 8)
  }, [brokers, query])

  if (!open) {
    return (
      <button
        type="button"
        className="dashboard-btn-secondary dashboard-btn-compact inline-flex items-center gap-1.5"
        disabled={disabled || brokers.length === 0}
        onClick={() => setOpen(true)}
      >
        <Link2 className="w-3.5 h-3.5" />
        Attach to existing
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-1.5 min-w-[220px]">
      <input
        type="text"
        value={query}
        autoFocus
        placeholder="Search directory…"
        className="client-input text-sm py-1.5"
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white">
        {matches.length === 0 ? (
          <li className="px-2 py-1.5 text-xs text-slate-500">No matching brokers</li>
        ) : (
          matches.map((broker) => (
            <li key={broker.id}>
              <button
                type="button"
                className="w-full text-left px-2 py-1.5 text-xs hover:bg-slate-50"
                onClick={() => onPick(broker.id)}
              >
                <span className="font-medium text-slate-800">{broker.name}</span>
                {broker.mc_number ? (
                  <span className="text-slate-400"> · MC {broker.mc_number}</span>
                ) : null}
              </button>
            </li>
          ))
        )}
      </ul>
      <button
        type="button"
        className="text-xs text-slate-500 hover:text-slate-800 text-left"
        onClick={() => {
          setOpen(false)
          setQuery('')
        }}
      >
        Cancel
      </button>
    </div>
  )
}
