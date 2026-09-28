import { useEffect, useState } from 'react'
import type { Invoice } from '../../types/invoice'
import { useToast } from '../ui/ToastProvider'
import { executeBlueprintThenDo } from './blueprintRunnerActions'
import {
  BLUEPRINT_RUNS_CHANGED_EVENT,
  appendInvoiceActionHistory,
  listInvoiceBlueprintHistory,
} from './blueprintRuns'
import {
  listInvoiceBlueprintActions,
  type InvoiceBlueprintAction,
} from './invoiceBlueprintActions'
import '../../styles/invoiceBlueprintTab.css'

type ActionsPane = 'actions' | 'history'

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

interface InvoiceActionsPanelProps {
  invoice: Invoice
  authorName: string
  onInvoiceUpdated?: () => void
}

export default function InvoiceActionsPanel({
  invoice,
  authorName,
  onInvoiceUpdated,
}: InvoiceActionsPanelProps) {
  const { showToast } = useToast()
  const [pane, setPane] = useState<ActionsPane>('actions')
  const [actions, setActions] = useState(() => listInvoiceBlueprintActions())
  const [history, setHistory] = useState(() =>
    listInvoiceBlueprintHistory(invoice).filter((ev) => ev.kind === 'action')
  )
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const refreshHistory = () => {
    setHistory(
      listInvoiceBlueprintHistory(invoice)
        .filter((ev) => ev.kind === 'action')
        .slice()
        .reverse()
    )
  }

  useEffect(() => {
    setActions(listInvoiceBlueprintActions())
    refreshHistory()
    const onRuns = () => refreshHistory()
    window.addEventListener(BLUEPRINT_RUNS_CHANGED_EVENT, onRuns)
    return () => window.removeEventListener(BLUEPRINT_RUNS_CHANGED_EVENT, onRuns)
    // Refresh when the open invoice changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice.id, invoice.invoice_number])

  const runAction = async (action: InvoiceBlueprintAction) => {
    if (busyKey) return
    setBusyKey(action.key)
    try {
      const result = await executeBlueprintThenDo({
        invoiceId: invoice.id,
        actionId: action.actionId,
        blueprintName: action.blueprintName,
        config: action.config,
        authorName,
        skipIfAlreadySent: false,
      })
      appendInvoiceActionHistory({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        clientLabel: invoice.client_name,
        blueprintId: action.blueprintId,
        blueprintName: action.blueprintName,
        title: action.label,
        detail: result.detail,
      })
      refreshHistory()
      onInvoiceUpdated?.()
      showToast(result.detail, result.ok && !result.skipped ? 'success' : 'error')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Action failed'
      showToast(message, 'error')
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div className="inv-bp">
      <div className="inv-actions__switch" role="tablist" aria-label="Invoice actions">
        <button
          type="button"
          role="tab"
          aria-selected={pane === 'actions'}
          className={`inv-actions__switch-btn${
            pane === 'actions' ? ' inv-actions__switch-btn--active' : ''
          }`}
          onClick={() => setPane('actions')}
        >
          Actions
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pane === 'history'}
          className={`inv-actions__switch-btn${
            pane === 'history' ? ' inv-actions__switch-btn--active' : ''
          }`}
          onClick={() => setPane('history')}
        >
          History
          {history.length > 0 ? (
            <span className="inv-actions__count">{history.length}</span>
          ) : null}
        </button>
      </div>

      {pane === 'actions' ? (
        <section className="inv-bp__card" aria-label="Available actions">
          <p className="inv-bp__meta" style={{ marginTop: 0 }}>
            Pulled from invoice blueprints. Running one sends it for this invoice now.
          </p>
          {actions.length === 0 ? (
            <p className="inv-bp__meta">No invoice actions on your blueprints yet.</p>
          ) : (
            <div className="inv-actions__list">
              {actions.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  className="inv-actions__item"
                  disabled={busyKey !== null}
                  onClick={() => void runAction(action)}
                >
                  <span className="inv-actions__item-title">
                    {busyKey === action.key ? 'Running…' : action.label}
                  </span>
                  {action.detail ? (
                    <span className="inv-actions__item-detail">{action.detail}</span>
                  ) : null}
                  <span className="inv-actions__item-bp">{action.blueprintName}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="inv-bp__card" aria-label="Action history">
          <p className="inv-bp__meta" style={{ marginTop: 0 }}>
            Then-do steps that already ran on this invoice, including ones you start here.
          </p>
          {history.length === 0 ? (
            <p className="inv-bp__meta">No actions have run on this invoice yet.</p>
          ) : (
            <ol className="inv-bp__history">
              {history.map((ev) => (
                <li key={ev.id} className="inv-bp__history-item inv-bp__history-item--action">
                  <div className="inv-bp__history-when">
                    <time dateTime={ev.at}>{formatWhen(ev.at)}</time>
                    <span className="inv-bp__history-kind inv-bp__history-kind--action">Action</span>
                  </div>
                  <div className="inv-bp__history-body">
                    <div className="inv-bp__history-title">{ev.title}</div>
                    {ev.detail ? <div className="inv-bp__history-detail">{ev.detail}</div> : null}
                    <div className="inv-bp__history-bp">{ev.blueprintName}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  )
}
