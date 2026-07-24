import type { AssistantActionItem } from '../../../types/assistant'
import { useNavigate } from 'react-router-dom'
import { useClientSession } from '../../../hooks/useClientSession'
import {
  clientInvoiceDetailPath,
  clientInvoiceUploadPath,
  resolveClientInvoice,
} from '../../../utils/openClientInvoice'
import { stashAssistantPendingUpload } from '../../../utils/assistantTaskStore'
import { openAdminInvoiceWorkspace } from '../../../utils/openAdminInvoiceWorkspace'
import { markAssistantEventCompleted } from '../../../utils/assistantTaskStore'

interface AssistantActionCardProps {
  actions: AssistantActionItem[]
  /** Client portal vs Credyx staff. */
  mode?: 'client' | 'admin'
}

/**
 * Compact task list — one row per invoice with a single primary action.
 * Avoids repeating “Upload missing docs — #123” above and inside the row.
 */
export default function AssistantActionCard({
  actions,
  mode = 'client',
}: AssistantActionCardProps) {
  const navigate = useNavigate()
  const { clientId, clientName } = useClientSession()
  const isAdmin = mode === 'admin'

  const resolveId = (action: AssistantActionItem): string => {
    if (isAdmin) return action.invoiceId || action.invoiceNumber
    const match = resolveClientInvoice(clientId, clientName, {
      invoiceId: action.invoiceId,
      invoiceNumber: action.invoiceNumber,
    })
    return match?.id ?? (action.invoiceId || action.invoiceNumber)
  }

  const openInvoice = (action: AssistantActionItem) => {
    const id = resolveId(action)
    if (isAdmin) {
      openAdminInvoiceWorkspace(id)
      return
    }
    navigate(clientInvoiceDetailPath(id))
  }

  const openUpload = (action: AssistantActionItem) => {
    const id = resolveId(action)
    stashAssistantPendingUpload({ eventId: action.id, invoiceId: id })
    navigate(clientInvoiceUploadPath(id))
  }

  const markDone = (action: AssistantActionItem) => {
    markAssistantEventCompleted(action.id)
    window.dispatchEvent(new CustomEvent('credyx-assistant-task-completed', { detail: action.id }))
  }

  return (
    <div className="assistant-action-card" role="list">
      {actions.map((action) => {
        const isUpload = action.kind === 'upload_docs'
        const isChase =
          action.kind === 'check_payment' || action.kind === 'review_invoice'
        const meta = [
          action.amountLabel,
          action.brokerName,
          action.dueLabel,
        ]
          .filter(Boolean)
          .join(' · ')
        // Prefer explicit detail; otherwise show a short task label (not repeating the invoice #).
        const detail =
          action.detail?.trim() ||
          (action.title && !/^#?\d/.test(action.title.trim())
            ? action.title.replace(/\s*[—-]\s*#\d+.*/i, '').trim()
            : '')

        return (
          <div
            key={action.id}
            className={`assistant-action-card__item${
              action.status !== 'pending' ? ' assistant-action-card__item--done' : ''
            }`}
            role="listitem"
          >
            <div className="assistant-action-card__row">
              <div className="assistant-action-card__meta">
                <button
                  type="button"
                  className="assistant-action-card__inv"
                  onClick={() => openInvoice(action)}
                >
                  #{action.invoiceNumber}
                </button>
                {meta ? <span className="assistant-action-card__sub">{meta}</span> : null}
                {detail ? <p className="assistant-action-card__detail">{detail}</p> : null}
                {action.status === 'done' && (
                  <p className="assistant-action-card__status">Completed</p>
                )}
              </div>

              {action.status === 'pending' && (
                <div className="assistant-action-card__actions">
                  {isUpload ? (
                    <button
                      type="button"
                      className="dashboard-btn-primary assistant-action-card__btn"
                      onClick={() => openUpload(action)}
                    >
                      Upload
                    </button>
                  ) : null}
                  {(isChase || (isAdmin && !isUpload)) && (
                    <button
                      type="button"
                      className="dashboard-btn-primary assistant-action-card__btn"
                      onClick={() => openInvoice(action)}
                    >
                      {isChase ? 'Open' : 'Invoice'}
                    </button>
                  )}
                  {!isUpload && !isChase && !isAdmin && (
                    <button
                      type="button"
                      className="dashboard-btn-secondary assistant-action-card__btn"
                      onClick={() => openInvoice(action)}
                    >
                      Invoice
                    </button>
                  )}
                  {isAdmin && isChase && (
                    <button
                      type="button"
                      className="dashboard-btn-secondary assistant-action-card__btn"
                      onClick={() => markDone(action)}
                    >
                      Done
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
