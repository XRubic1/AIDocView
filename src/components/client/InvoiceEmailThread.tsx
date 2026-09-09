/**
 * Carrier-visible load thread: emails + next action.
 */
import { listEmailMessagesForInvoice } from '../../data/emailInboxStore'
import { nextActionLabel } from '../../types/emailLifecycle'
import type { Invoice } from '../../types/invoice'
import { formatDate } from '../../utils/format'

export default function InvoiceEmailThread({ invoice }: { invoice: Invoice }) {
  const messages = listEmailMessagesForInvoice(invoice.id)
  const next = nextActionLabel(invoice.email_lifecycle)

  return (
    <section className="rounded-lg border border-slate-200 p-3 space-y-2" aria-label="Load thread">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">Load thread</h3>
        <span className="text-xs font-medium rounded-full bg-sky-50 text-sky-800 px-2 py-0.5">
          {next}
        </span>
      </div>
      {invoice.email_lifecycle?.paperwork_status === 'good' ? (
        <p className="text-xs text-emerald-700">Paperwork status: good</p>
      ) : invoice.email_lifecycle?.paperwork_status === 'issue' ? (
        <p className="text-xs text-amber-700">Paperwork status: issue</p>
      ) : (
        <p className="text-xs text-slate-500">Paperwork status: waiting</p>
      )}
      {messages.length === 0 ? (
        <p className="text-xs text-slate-500">No emails on this load yet.</p>
      ) : (
        <ul className="space-y-2 max-h-56 overflow-auto">
          {messages.map((m) => (
            <li key={m.id} className="text-xs border-t border-slate-100 pt-2">
              <p className="font-medium text-slate-700">
                {m.direction === 'outbound' ? 'Credyx →' : 'Broker →'} {m.subject}
              </p>
              <p className="text-slate-400">{formatDate(m.sent_at)}</p>
              <p className="text-slate-600 whitespace-pre-wrap line-clamp-4">{m.body_text}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
