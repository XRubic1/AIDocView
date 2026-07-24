import { useNavigate } from 'react-router-dom'
import type {
  AssistantAppAction,
  AssistantEmailScopeOption,
  AssistantFollowUp,
  AssistantMessage,
} from '../../../types/assistant'
import AssistantActionCard from './AssistantActionCard'
import AssistantRiskCard from './AssistantRiskCard'
import AssistantExpectedPaymentCard from './AssistantExpectedPaymentCard'
import AssistantEmailDraftCard from './AssistantEmailDraftCard'
import AssistantFollowUpBar from './AssistantFollowUpBar'
import AssistantEmailScopePicker from './AssistantEmailScopePicker'
import AssistantNoteDraftCard from './AssistantNoteDraftCard'
import AssistantDisputeDraftCard from './AssistantDisputeDraftCard'
import AssistantPaymentStatusCardView from './AssistantPaymentStatusCard'
import AssistantArSummaryCardView from './AssistantArSummaryCard'
import AssistantAppActionCard from './AssistantAppActionCard'
import AssistantMarkdown from './AssistantMarkdown'
import { useClientSession } from '../../../hooks/useClientSession'
import {
  clientInvoiceDetailPath,
  resolveClientInvoice,
} from '../../../utils/openClientInvoice'
import { openAdminInvoiceWorkspace } from '../../../utils/openAdminInvoiceWorkspace'
import { mockInvoices } from '../../../data/mockInvoices'

interface AssistantMessageListProps {
  messages: AssistantMessage[]
  mode?: 'client' | 'admin'
  disabled?: boolean
  noteAuthorName?: string
  onFollowUp?: (followUp: AssistantFollowUp) => void
  onEmailScopeSelect?: (option: AssistantEmailScopeOption) => void
  onEmailScopeCancel?: () => void
  onAppAction?: (action: AssistantAppAction) => void
  scopePickerLabel?: string
}

/** Renders chat bubbles and structured assistant cards. */
export default function AssistantMessageList({
  messages,
  mode = 'client',
  disabled = false,
  noteAuthorName = 'User',
  onFollowUp,
  onEmailScopeSelect,
  onEmailScopeCancel,
  onAppAction,
  scopePickerLabel,
}: AssistantMessageListProps) {
  const navigate = useNavigate()
  const { clientId, clientName } = useClientSession()
  const isAdmin = mode === 'admin'

  // Only the latest follow-up set stays interactive.
  const activeFollowUpId = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant' && (m.followUps?.length ?? 0) > 0)?.id

  const openInvoiceByNumber = (invoiceNumber: string) => {
    const needle = invoiceNumber.trim().replace(/^#/, '')
    if (!needle) return

    if (isAdmin) {
      const match = mockInvoices.find(
        (inv) =>
          inv.id === needle ||
          String(inv.invoice_number).trim().replace(/^#/, '') === needle ||
          String(inv.load_number || '').trim() === needle
      )
      openAdminInvoiceWorkspace(match?.id ?? needle)
      return
    }

    const match = resolveClientInvoice(clientId, clientName, {
      invoiceId: needle,
      invoiceNumber: needle,
    })
    navigate(clientInvoiceDetailPath(match?.id ?? needle))
  }

  return (
    <div className="assistant-msg-list" role="log" aria-live="polite">
      {messages.map((msg) => {
        if (msg.role === 'user') {
          return (
            <div key={msg.id} className="assistant-msg assistant-msg--user">
              <div className="assistant-msg__bubble">{msg.text}</div>
            </div>
          )
        }

        const followUps =
          msg.id === activeFollowUpId && msg.followUps?.length && onFollowUp ? (
            <AssistantFollowUpBar
              followUps={msg.followUps}
              disabled={disabled}
              onSelect={onFollowUp}
            />
          ) : null

        if (msg.kind === 'followup_picker' && msg.emailScopeOptions?.length) {
          return (
            <div key={msg.id} className="assistant-msg assistant-msg--assistant">
              <AssistantEmailScopePicker
                options={msg.emailScopeOptions}
                disabled={disabled}
                label={msg.text?.trim() || scopePickerLabel || 'Choose…'}
                onSelect={(opt) => onEmailScopeSelect?.(opt)}
                onCancel={onEmailScopeCancel}
              />
            </div>
          )
        }

        if (msg.kind === 'action' && msg.actions?.length) {
          return (
            <div key={msg.id} className="assistant-msg assistant-msg--assistant">
              {msg.text?.trim() ? (
                <div className="assistant-msg__bubble assistant-msg__bubble--assistant assistant-msg__bubble--lead">
                  <AssistantMarkdown
                    text={msg.text}
                    onOpenInvoice={openInvoiceByNumber}
                  />
                </div>
              ) : null}
              <AssistantActionCard actions={msg.actions} mode={mode} />
              {followUps}
            </div>
          )
        }

        if (msg.kind === 'risk' && msg.risk) {
          return (
            <div key={msg.id} className="assistant-msg assistant-msg--assistant">
              <AssistantRiskCard risk={msg.risk} />
              {followUps}
            </div>
          )
        }

        if (msg.kind === 'expected_payment' && msg.expectedPayment) {
          return (
            <div key={msg.id} className="assistant-msg assistant-msg--assistant">
              <AssistantExpectedPaymentCard
                payment={msg.expectedPayment}
                note={msg.text}
              />
              {followUps}
            </div>
          )
        }

        if (msg.kind === 'email_draft' && msg.emailDraft) {
          return (
            <div key={msg.id} className="assistant-msg assistant-msg--assistant">
              <AssistantEmailDraftCard draft={msg.emailDraft} note={msg.text} />
              {followUps}
            </div>
          )
        }

        if (msg.kind === 'note_draft' && msg.noteDraft) {
          return (
            <div key={msg.id} className="assistant-msg assistant-msg--assistant">
              <AssistantNoteDraftCard
                draft={msg.noteDraft}
                mode={mode}
                authorName={noteAuthorName}
                note={msg.text}
                onOpenInvoice={(invoiceId, invoiceNumber) => {
                  if (isAdmin) {
                    openAdminInvoiceWorkspace(invoiceId)
                    return
                  }
                  openInvoiceByNumber(invoiceNumber || invoiceId)
                }}
              />
              {followUps}
            </div>
          )
        }

        if (msg.kind === 'dispute_draft' && msg.disputeDraft) {
          return (
            <div key={msg.id} className="assistant-msg assistant-msg--assistant">
              <AssistantDisputeDraftCard
                draft={msg.disputeDraft}
                authorName={noteAuthorName}
                note={msg.text}
                onOpenInvoice={(invoiceId, invoiceNumber) => {
                  if (isAdmin) {
                    openAdminInvoiceWorkspace(invoiceId)
                    return
                  }
                  openInvoiceByNumber(invoiceNumber || invoiceId)
                }}
              />
              {followUps}
            </div>
          )
        }

        if (msg.kind === 'ar_summary' && msg.arSummary) {
          return (
            <div key={msg.id} className="assistant-msg assistant-msg--assistant">
              <AssistantArSummaryCardView summary={msg.arSummary} note={msg.text} />
              {followUps}
            </div>
          )
        }

        if (msg.kind === 'payment_status' && msg.paymentStatus) {
          return (
            <div key={msg.id} className="assistant-msg assistant-msg--assistant">
              <AssistantPaymentStatusCardView
                status={msg.paymentStatus}
                note={msg.text}
                onOpenInvoice={(invoiceId, invoiceNumber) => {
                  if (isAdmin) {
                    openAdminInvoiceWorkspace(invoiceId)
                    return
                  }
                  openInvoiceByNumber(invoiceNumber || invoiceId)
                }}
              />
              {followUps}
            </div>
          )
        }

        if (msg.kind === 'app_action' && msg.appActions?.length) {
          return (
            <div key={msg.id} className="assistant-msg assistant-msg--assistant">
              {msg.text?.trim() ? (
                <div className="assistant-msg__bubble assistant-msg__bubble--assistant assistant-msg__bubble--lead">
                  <AssistantMarkdown
                    text={msg.text}
                    onOpenInvoice={openInvoiceByNumber}
                  />
                </div>
              ) : null}
              <AssistantAppActionCard
                actions={msg.appActions}
                disabled={disabled}
                onOpen={(action) => onAppAction?.(action)}
              />
              {followUps}
            </div>
          )
        }

        return (
          <div
            key={msg.id}
            className={`assistant-msg assistant-msg--assistant${
              msg.kind === 'quiet' ? ' assistant-msg--quiet' : ''
            }`}
          >
            <div className="assistant-msg__bubble assistant-msg__bubble--assistant">
              {msg.text ? (
                <AssistantMarkdown
                  text={msg.text}
                  onOpenInvoice={openInvoiceByNumber}
                />
              ) : null}
            </div>
            {followUps}
          </div>
        )
      })}
    </div>
  )
}
