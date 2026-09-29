import { useEffect, useMemo, useState } from 'react'
import type { Invoice } from '../../types/invoice'
import { getBrokerById } from '../../data/mockBrokers'
import { getClientById } from '../../services/clientRegistry'
import { useToast } from '../ui/ToastProvider'
import { executeBlueprintThenDo } from './blueprintRunnerActions'
import { runInvoiceBlueprintManual } from './blueprintRunner'
import {
  BLUEPRINT_RUNS_CHANGED_EVENT,
  appendInvoiceActionHistory,
  listInvoiceBlueprintHistory,
} from './blueprintRuns'
import {
  listInvoiceActionBlueprints,
  parseActionRecipientEmails,
  type InvoiceActionBlueprintCard,
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
  const [cards, setCards] = useState(() => listInvoiceActionBlueprints())
  const [history, setHistory] = useState(() =>
    listInvoiceBlueprintHistory(invoice).filter((ev) => ev.kind === 'action')
  )
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [sendTo, setSendTo] = useState('')
  const [runTarget, setRunTarget] = useState<InvoiceActionBlueprintCard | null>(null)
  const [pickedStepKeys, setPickedStepKeys] = useState<string[]>([])

  const stepKey = (step: InvoiceBlueprintAction) => `${step.nodeId}|${step.actionId}`

  const runSteps = runTarget?.steps ?? []

  const suggestions = useMemo(() => {
    const broker = getBrokerById(invoice.broker_id)
    const out: { email: string; label: string }[] = []
    const seen = new Set<string>()
    const push = (email: string | undefined, label: string) => {
      const value = email?.trim()
      if (!value) return
      const key = value.toLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      out.push({ email: value, label })
    }
    for (const entry of broker?.emails ?? []) {
      push(entry.email, entry.category ? `Broker · ${entry.category}` : 'Broker')
    }
    push(broker?.email, 'Broker')
    push(getClientById(invoice.client_id)?.email, 'Carrier')
    return out
  }, [invoice.broker_id, invoice.client_id])

  const defaultTo = suggestions[0]?.email

  const refreshHistory = () => {
    setHistory(
      listInvoiceBlueprintHistory(invoice)
        .filter((ev) => ev.kind === 'action')
        .slice()
        .reverse()
    )
  }

  useEffect(() => {
    setSendTo('')
    setRunTarget(null)
    setCards(listInvoiceActionBlueprints())
    refreshHistory()
    const onRuns = () => refreshHistory()
    window.addEventListener(BLUEPRINT_RUNS_CHANGED_EVENT, onRuns)
    return () => window.removeEventListener(BLUEPRINT_RUNS_CHANGED_EVENT, onRuns)
    // Refresh when the open invoice changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice.id, invoice.invoice_number])

  const toggleRecipient = (email: string) => {
    setSendTo((prev) => {
      const parts = prev
        .split(/[,;\n]+/)
        .map((part) => part.trim())
        .filter(Boolean)
      const key = email.toLowerCase()
      const has = parts.some((part) => part.toLowerCase() === key)
      const next = has
        ? parts.filter((part) => part.toLowerCase() !== key)
        : [...parts, email]
      return next.join(', ')
    })
  }

  const readRecipients = (): string[] | undefined | null => {
    if (!sendTo.trim()) return undefined
    const parsed = parseActionRecipientEmails(sendTo)
    if (parsed.invalid.length > 0) {
      showToast(`Check these addresses: ${parsed.invalid.join(', ')}`, 'error')
      return null
    }
    return parsed.emails.length > 0 ? parsed.emails : undefined
  }

  const openRunOptions = (card: InvoiceActionBlueprintCard) => {
    if (busyKey) return
    if (runTarget?.key === card.key) {
      setRunTarget(null)
      return
    }
    setRunTarget(card)
    setPickedStepKeys([])
  }

  const finishRun = (title: string, detail: string, ok: boolean, blueprintId: string, blueprintName: string) => {
    appendInvoiceActionHistory({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      clientLabel: invoice.client_name,
      blueprintId,
      blueprintName,
      title,
      detail,
    })
    refreshHistory()
    onInvoiceUpdated?.()
    showToast(detail, ok ? 'success' : 'error')
    setRunTarget(null)
  }

  const runGraph = async (mode: 'normal' | 'skip_waits') => {
    if (!runTarget || busyKey) return
    const toEmails = readRecipients()
    if (toEmails === null) return
    setBusyKey(runTarget.key)
    try {
      const result = await runInvoiceBlueprintManual({
        invoiceId: invoice.id,
        blueprintId: runTarget.blueprintId,
        mode,
        authorName,
        toEmails,
      })
      finishRun(
        runTarget.blueprintName,
        result.detail,
        result.ok,
        runTarget.blueprintId,
        runTarget.blueprintName
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Action failed'
      showToast(message, 'error')
    } finally {
      setBusyKey(null)
    }
  }

  const runSelectedSteps = async () => {
    if (!runTarget || busyKey) return
    const toEmails = readRecipients()
    if (toEmails === null) return
    const selected = runSteps.filter((step) => pickedStepKeys.includes(stepKey(step)))
    if (selected.length === 0) {
      showToast('Pick at least one step.', 'error')
      return
    }
    setBusyKey(runTarget.key)
    try {
      const lines: string[] = []
      let ok = true
      for (const step of selected) {
        const result = await executeBlueprintThenDo({
          invoiceId: invoice.id,
          actionId: step.actionId,
          blueprintName: step.blueprintName,
          config: step.config,
          authorName,
          skipIfAlreadySent: false,
          toEmails,
        })
        lines.push(`${step.label}: ${result.detail}`)
        if (!result.ok) ok = false
      }
      finishRun(
        runTarget.blueprintName,
        lines.join(' '),
        ok,
        runTarget.blueprintId,
        runTarget.blueprintName
      )
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
          <label className="inv-actions__sendto">
            <span className="inv-actions__sendto-label">Send to</span>
            <textarea
              className="inv-actions__sendto-input"
              rows={2}
              value={sendTo}
              onChange={(e) => setSendTo(e.target.value)}
              placeholder={
                defaultTo
                  ? `${defaultTo} — or add more, separated by commas`
                  : 'name@broker.com, ap@broker.com'
              }
              autoComplete="off"
              spellCheck={false}
            />
            <span className="inv-bp__meta">
              {defaultTo
                ? `Leave blank to use ${defaultTo}. Extra addresses are copied on the same email.`
                : 'Leave blank to use the address on file. Separate extra addresses with commas.'}
            </span>
          </label>
          {suggestions.length > 0 ? (
            <div className="inv-actions__chips" aria-label="Known emails">
              {suggestions.map((entry) => {
                const selected = sendTo
                  .split(/[,;\n]+/)
                  .some((part) => part.trim().toLowerCase() === entry.email.toLowerCase())
                return (
                  <button
                    key={entry.email}
                    type="button"
                    className={`inv-actions__chip${
                      selected ? ' inv-actions__chip--on' : ''
                    }`}
                    onClick={() => toggleRecipient(entry.email)}
                    disabled={busyKey !== null}
                  >
                    <span>{entry.email}</span>
                    <span className="inv-actions__chip-label">{entry.label}</span>
                  </button>
                )
              })}
            </div>
          ) : null}
          <p className="inv-bp__meta" style={{ marginTop: 0 }}>
            One card per blueprint. Open it to run the whole graph or pick steps.
          </p>
          {cards.length === 0 ? (
            <p className="inv-bp__meta">No invoice actions on your blueprints yet.</p>
          ) : (
            <div className="inv-actions__list">
              {cards.map((card) => (
                <div key={card.key} className="inv-actions__row">
                  <button
                    type="button"
                    className={`inv-actions__item${
                      runTarget?.key === card.key ? ' inv-actions__item--open' : ''
                    }`}
                    disabled={busyKey !== null}
                    onClick={() => openRunOptions(card)}
                  >
                    <span className="inv-actions__item-title">
                      {busyKey === card.key ? 'Running…' : card.blueprintName}
                    </span>
                    <span className="inv-actions__item-detail">
                      {card.steps.map((step) => step.label).join(' · ')}
                    </span>
                  </button>
                  {runTarget?.key === card.key ? (
                    <div className="inv-actions__run" aria-label={`Run ${runTarget.blueprintName}`}>
                      <button
                        type="button"
                        className="inv-actions__choice"
                        disabled={busyKey !== null}
                        onClick={() => void runGraph('skip_waits')}
                      >
                        <span className="inv-actions__choice-title">Skip waits, run every step</span>
                        <span className="inv-actions__choice-detail">
                          Start at the beginning and run each step now. Wait cards are skipped.
                        </span>
                      </button>
                      <div className="inv-actions__steps">
                        <div className="inv-actions__choice-title">Run individual steps</div>
                        {runSteps.map((step) => {
                          const key = stepKey(step)
                          const checked = pickedStepKeys.includes(key)
                          return (
                            <label key={key} className="inv-actions__step">
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={busyKey !== null}
                                onChange={() =>
                                  setPickedStepKeys((prev) =>
                                    prev.includes(key)
                                      ? prev.filter((id) => id !== key)
                                      : [...prev, key]
                                  )
                                }
                              />
                              <span>{step.label}</span>
                            </label>
                          )
                        })}
                        <button
                          type="button"
                          className="inv-actions__choice"
                          disabled={busyKey !== null}
                          onClick={() => void runSelectedSteps()}
                        >
                          <span className="inv-actions__choice-title">Run selected steps</span>
                          <span className="inv-actions__choice-detail">
                            Only the steps you check. Waits in the blueprint are not used.
                          </span>
                        </button>
                      </div>
                      <button
                        type="button"
                        className="inv-actions__choice"
                        disabled={busyKey !== null}
                        onClick={() => void runGraph('normal')}
                      >
                        <span className="inv-actions__choice-title">Run normally</span>
                        <span className="inv-actions__choice-detail">
                          Enroll this invoice and honor each Wait.
                        </span>
                      </button>
                      <button
                        type="button"
                        className="inv-actions__cancel"
                        disabled={busyKey !== null}
                        onClick={() => setRunTarget(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : null}
                </div>
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
