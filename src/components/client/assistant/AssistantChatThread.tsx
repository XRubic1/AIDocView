import { FormEvent, useEffect, useRef, useState, type ReactNode } from 'react'
import { Loader2, Send } from 'lucide-react'
import type {
  AssistantActionItem,
  AssistantAppAction,
  AssistantCalendarEvent,
  AssistantEmailScopeOption,
  AssistantFollowUp,
  AssistantMessage,
} from '../../../types/assistant'
import {
  ASSISTANT_SUGGESTED_CHIPS,
  buildMockAssistantReplies,
  createUserMessage,
  getMockCalendarEvents,
  getMockDueTodayActions,
  getQuietGreetingMessage,
} from '../../../data/mockAssistantData'
import {
  ADMIN_ASSISTANT_SUGGESTED_CHIPS,
  buildMockAdminAssistantReplies,
  createAdminUserMessage,
  getAdminQuietGreetingMessage,
  getMockAdminCalendarEvents,
  getMockAdminDueTodayActions,
} from '../../../data/mockAdminAssistantData'
import AssistantMessageList from './AssistantMessageList'
import AssistantBuddyFace from './AssistantBuddyFace'
import { useLocation, useNavigate } from 'react-router-dom'
import { useClientSession } from '../../../hooks/useClientSession'
import { useTenantDataRevision } from '../../../hooks/useTenantDataRevision'
import { getClientInvoices, getClientPayments } from '../../../data/clientDemoData'
import { mockInvoices } from '../../../data/mockInvoices'
import { mockBrokers } from '../../../data/mockBrokers'
import { mockPayments } from '../../../data/mockPayments'
import type { Invoice } from '../../../types/invoice'
import type { Payment } from '../../../types/payment'
import { isAIReviewEnabled } from '../../../config/aiReview'
import { buildDisputeDraftForInvoice } from '../../../utils/assistantHoldExplanation'
import {
  formatAssistantUsageLine,
  sendAssistantChatMessage,
  shouldShowAssistantUsageMeter,
  type AssistantChatUsage,
} from '../../../services/assistantChatService'
import {
  getSharedCalendarEventsForClient,
  sharedEventToAssistantEvent,
} from '../../../data/sharedCalendarEvents'
import { applyAssistantCompletions } from '../../../utils/assistantTaskStore'
import {
  attachFollowUps,
  buildHoldEmailScopeOptions,
  buildNoteScopeOptions,
  clearInteractiveFollowUps,
  enrichFollowUps,
} from '../../../utils/assistantFollowUps'
import {
  isAppNavigationIntent,
  matchCatalogFromPrompt,
  resolveAppActions,
} from '../../../utils/assistantAppActions'
import {
  buildPaymentStatusSnapshots,
  isPaymentStatusQuery,
} from '../../../utils/assistantPaymentStatus'
import {
  getAssistantPageHelp,
  mergePageChips,
} from '../../../utils/assistantPageContext'
import { openAdminInvoiceWorkspace } from '../../../utils/openAdminInvoiceWorkspace'
import { getAdminUserDisplayName } from '../../../config/adminNav'
import { useAuth } from '../../../context/AuthContext'

interface AssistantChatThreadProps {
  /** Optional footer slot (e.g. “Open full Assistant”). */
  footerExtra?: ReactNode
  /** Called when action complete/snooze changes due-today state. */
  onActionsChange?: (actions: AssistantActionItem[]) => void
  /** Auto-focus composer when mounted (drawer). */
  autoFocus?: boolean
  /** Client portal vs Credyx staff Assistant. */
  mode?: 'client' | 'admin'
  /** Question to ask automatically on open (e.g. tapped from the page nudge). */
  initialPrompt?: string
}

/** Sync action statuses into any action cards already in the thread. */
function patchActionsInMessages(
  prev: AssistantMessage[],
  nextActions: AssistantActionItem[]
): AssistantMessage[] {
  return prev.map((m) => {
    if (m.kind !== 'action' || !m.actions) return m
    return {
      ...m,
      actions: m.actions.map((a) => nextActions.find((n) => n.id === a.id) ?? a),
    }
  })
}

function mergeClientCalendar(
  clientId: string | undefined,
  invoices: Invoice[],
  payments: Payment[]
): AssistantCalendarEvent[] {
  const live = getMockCalendarEvents(invoices, payments)
  if (!clientId) return live
  const shared = getSharedCalendarEventsForClient(clientId).map(sharedEventToAssistantEvent)
  const sharedIds = new Set(shared.map((e) => e.id))
  return applyAssistantCompletions([
    ...live.filter((e) => !sharedIds.has(e.id)),
    ...shared,
  ])
}

/**
 * Shared chat thread + composer used by drawer and full Assistant page.
 * Uses OpenAI (via openai-proxy) grounded in live A/R; falls back to keyword replies if AI is unavailable.
 */
export default function AssistantChatThread({
  footerExtra,
  onActionsChange,
  autoFocus = false,
  mode = 'client',
  initialPrompt,
}: AssistantChatThreadProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const isAdmin = mode === 'admin'
  const { clientId, clientName, client } = useClientSession()
  // What the buddy can help with on the screen the user is currently looking at.
  const pageHelp = getAssistantPageHelp(location.pathname, mode)
  const { resolved } = useAuth()
  const tenantRevision = useTenantDataRevision()
  const noteAuthorName = isAdmin
    ? getAdminUserDisplayName(resolved.user?.email ?? null) || 'Credyx'
    : clientName || client?.name || 'Carrier'

  const loadClientData = (): { invoices: Invoice[]; payments: Payment[] } => {
    if (!clientId) return { invoices: [], payments: [] }
    return {
      invoices: getClientInvoices(clientId, clientName),
      payments: getClientPayments(clientId, clientName),
    }
  }

  const loadActions = (): AssistantActionItem[] => {
    if (isAdmin) return getMockAdminDueTodayActions(mockInvoices, mockBrokers)
    const { invoices, payments } = loadClientData()
    return getMockDueTodayActions(invoices, payments)
  }

  const loadCalendar = (): AssistantCalendarEvent[] => {
    if (isAdmin) return getMockAdminCalendarEvents(mockInvoices, mockBrokers)
    const { invoices, payments } = loadClientData()
    return mergeClientCalendar(clientId, invoices, payments)
  }

  const loadGreeting = (): AssistantMessage => {
    if (isAdmin) return getAdminQuietGreetingMessage(mockInvoices, mockBrokers, pageHelp)
    const { invoices, payments } = loadClientData()
    return getQuietGreetingMessage(invoices, payments, clientName, pageHelp)
  }

  const [messages, setMessages] = useState<AssistantMessage[]>(() => [loadGreeting()])
  const [actions, setActions] = useState<AssistantActionItem[]>(() => loadActions())
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUsage, setLastUsage] = useState<AssistantChatUsage | null>(null)
  const [sessionUsage, setSessionUsage] = useState({
    calls: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
  })
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const sentInitialPromptRef = useRef<string | null>(null)

  const chips = mergePageChips(
    pageHelp,
    isAdmin ? ADMIN_ASSISTANT_SUGGESTED_CHIPS : ASSISTANT_SUGGESTED_CHIPS
  )
  const aiEnabled = isAIReviewEnabled()
  const showUsageMeter = shouldShowAssistantUsageMeter()

  const refreshActions = () => {
    const next = loadActions()
    setActions(next)
    setMessages((prev) => {
      if (prev.length === 1 && prev[0]?.kind === 'quiet') {
        return [loadGreeting()]
      }
      return patchActionsInMessages(prev, next)
    })
  }

  useEffect(() => {
    refreshActions()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh when tenant / mode / client changes
  }, [clientId, clientName, tenantRevision, mode])

  // Re-offer page-specific help when the user navigates with an untouched thread.
  useEffect(() => {
    setMessages((prev) =>
      prev.length === 1 && prev[0]?.kind === 'quiet' ? [loadGreeting()] : prev
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- greeting depends on the current page
  }, [pageHelp?.id])

  useEffect(() => {
    const onFocus = () => refreshActions()
    const onDone = () => refreshActions()
    window.addEventListener('focus', onFocus)
    window.addEventListener('credyx-assistant-task-completed', onDone)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('credyx-assistant-task-completed', onDone)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, clientName, mode])

  useEffect(() => {
    onActionsChange?.(actions)
  }, [actions, onActionsChange])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, isSending])

  useEffect(() => {
    if (autoFocus) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 80)
      return () => window.clearTimeout(t)
    }
  }, [autoFocus])

  const submit = async (raw: string) => {
    const text = raw.trim()
    if (!text || isSending) return

    const userMsg = isAdmin ? createAdminUserMessage(text) : createUserMessage(text)
    setMessages((prev) => [...clearInteractiveFollowUps(prev), userMsg])
    setInput('')
    setError(null)

    const { invoices, payments } = isAdmin
      ? { invoices: mockInvoices, payments: mockPayments }
      : loadClientData()
    const dueToday = loadActions()
    const calendarEvents = loadCalendar()

    if (!aiEnabled) {
      let replies = isAdmin
        ? buildMockAdminAssistantReplies(text, dueToday)
        : buildMockAssistantReplies(text, dueToday, { invoices, payments })
      if (isAppNavigationIntent(text)) {
        const matched = matchCatalogFromPrompt(text, mode, 3)
        if (matched.length && !replies.some((m) => m.appActions?.length)) {
          replies = [
            {
              id: `nav-${Date.now().toString(36)}`,
              role: 'assistant',
              kind: 'plain',
              createdAt: new Date().toISOString(),
              text: 'I can take you there — tap a button:',
            },
            {
              id: `nav-act-${Date.now().toString(36)}`,
              role: 'assistant',
              kind: 'app_action',
              createdAt: new Date().toISOString(),
              appActions: matched,
            },
          ]
        }
      }
      if (/\b(dispute|contest|challenge)\b/i.test(text)) {
        const nums = [...text.matchAll(/#?\b(\d{3,})\b/g)].map((m) => m[1])
        const inv =
          invoices.find((i) =>
            nums.some(
              (n) => String(i.invoice_number).replace(/^#/, '') === n || i.id === n
            )
          ) ||
          // Fall back to the invoice most recently discussed in this chat.
          [...messages]
            .reverse()
            .map((m) =>
              invoices.find(
                (i) =>
                  i.id ===
                  (m.paymentStatus?.invoiceId ||
                    m.noteDraft?.invoiceId ||
                    m.disputeDraft?.invoiceId)
              )
            )
            .find(Boolean)
        if (inv) {
          const disputeDraft = buildDisputeDraftForInvoice(inv, mode)
          replies = [
            {
              id: `disp-${Date.now().toString(36)}`,
              role: 'assistant',
              kind: 'dispute_draft',
              createdAt: new Date().toISOString(),
              text: disputeDraft.youUploaded
                ? `You already uploaded paperwork on **${inv.invoice_number}** — this dispute asks Credyx to review it and clear the hold.`
                : `Let’s open a dispute on **${inv.invoice_number}** — review and confirm below.`,
              disputeDraft,
            },
          ]
        }
      }
      if (
        isPaymentStatusQuery(text) &&
        !replies.some((m) => m.kind === 'payment_status' || m.kind === 'dispute_draft')
      ) {
        const nums = [...text.matchAll(/#?\b(\d{3,})\b/g)].map((m) => m[1])
        let matchedInv = invoices.filter((inv) =>
          nums.some(
            (n) =>
              String(inv.invoice_number).replace(/^#/, '') === n || inv.id === n
          )
        )
        // Follow-ups like “is that a short payment?” — reuse last payment card in thread.
        if (matchedInv.length === 0) {
          for (let i = messages.length - 1; i >= 0; i--) {
            const id = messages[i].paymentStatus?.invoiceId
            if (!id) continue
            const inv = invoices.find((x) => x.id === id)
            if (inv) {
              matchedInv = [inv]
              break
            }
          }
        }
        if (matchedInv.length) {
          const snaps = buildPaymentStatusSnapshots(matchedInv, payments, 4)
          replies = [
            {
              id: `pay-lead-${Date.now().toString(36)}`,
              role: 'assistant',
              kind: 'plain',
              createdAt: new Date().toISOString(),
              text:
                snaps.length === 1
                  ? snaps[0].isPartialRemittance
                    ? `Yes — #${snaps[0].invoiceNumber} has a short remittance awaiting your confirmation:`
                    : `Here’s the payment status for #${snaps[0].invoiceNumber}:`
                  : `Here’s the payment status for ${snaps.length} invoices:`,
            },
            ...snaps.map((snap, i) => ({
              id: `pay-${Date.now().toString(36)}-${i}`,
              role: 'assistant' as const,
              kind: 'payment_status' as const,
              createdAt: new Date().toISOString(),
              paymentStatus: {
                invoiceId: snap.invoiceId,
                invoiceNumber: snap.invoiceNumber,
                brokerName: snap.brokerName,
                headline: snap.headline,
                headlineLabel: snap.headlineLabel,
                summary: snap.summary,
                faceAmountLabel: snap.faceAmountLabel,
                confirmedReceivedLabel: snap.confirmedReceivedLabel,
                postedAwaitingConfirmLabel: snap.postedAwaitingConfirmLabel,
                remainingAfterPendingLabel: snap.remainingAfterPendingLabel,
                isPartialRemittance: snap.isPartialRemittance,
                balanceDueLabel: snap.balanceDueLabel,
                balanceTone: snap.balanceTone,
                displayStatus: snap.displayStatus,
                variance: snap.variance,
                invoiceStatus: snap.invoiceStatus,
                why: snap.why
                  ? {
                      source: snap.why.source,
                      paymentStatusLabel: snap.why.paymentStatusLabel,
                      reason: snap.why.reason,
                      reversalType: snap.why.reversalType,
                      date: snap.why.date,
                    }
                  : undefined,
                payments: snap.payments.map((p) => ({
                  id: p.id,
                  amountLabel: p.amountLabel,
                  statusLabel: p.statusLabel,
                  date: p.date,
                  reason: p.reason,
                })),
              },
            })),
          ]
        }
      }
      const withFu = attachFollowUps(
        replies,
        enrichFollowUps(text, mode, undefined, replies.map((m) => m.text || '').join('\n'))
      )
      setMessages((prev) => [...prev, ...withFu])
      setError(
        'AI is offline — using basic replies. Deploy openai-proxy with OPENAI_API_KEY to enable live answers.'
      )
      return
    }

    setIsSending(true)
    try {
      const { messages: replies, usage } = await sendAssistantChatMessage({
        prompt: text,
        history: [...messages, userMsg],
        context: {
          mode,
          clientName: isAdmin ? undefined : clientName,
          clientEmail: isAdmin ? undefined : client?.email,
          invoices,
          payments,
          calendarEvents,
          dueTodayActions: dueToday,
          brokers: mockBrokers,
          prompt: text,
          currentPage: pageHelp
            ? { title: pageHelp.title, offer: pageHelp.offer }
            : undefined,
        },
      })
      setMessages((prev) => [...prev, ...replies])
      setLastUsage(usage)
      setSessionUsage((prev) => ({
        calls: prev.calls + 1,
        promptTokens: prev.promptTokens + usage.promptTokens,
        completionTokens: prev.completionTokens + usage.completionTokens,
        totalTokens: prev.totalTokens + usage.totalTokens,
        estimatedCostUsd: prev.estimatedCostUsd + usage.estimatedCostUsd,
      }))
    } catch (err) {
      const fallback = isAdmin
        ? buildMockAdminAssistantReplies(text, dueToday)
        : buildMockAssistantReplies(text, dueToday, { invoices, payments })
      const withFu = attachFollowUps(
        fallback,
        enrichFollowUps(text, mode, undefined, fallback.map((m) => m.text || '').join('\n'))
      )
      setMessages((prev) => [...prev, ...withFu])
      setError(
        err instanceof Error
          ? err.message
          : 'Could not reach the assistant. Showing a basic reply instead.'
      )
    } finally {
      setIsSending(false)
    }
  }

  // Ask the starter question once when opened from a page nudge.
  useEffect(() => {
    const starter = initialPrompt?.trim()
    if (!starter || sentInitialPromptRef.current === starter) return
    sentInitialPromptRef.current = starter
    void submit(starter)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per starter prompt
  }, [initialPrompt])

  /** Open an in-app destination from a buddy action button. */
  const onAppAction = (action: AssistantAppAction) => {
    if (action.path.includes('/invoices/workspace')) {
      const qs = action.path.split('?')[1] || ''
      const invoiceId = new URLSearchParams(qs).get('invoice')
      openAdminInvoiceWorkspace(invoiceId)
      return
    }
    navigate(action.path)
  }

  /** Clickable “Want me to go deeper?” chip. */
  const onFollowUp = (followUp: AssistantFollowUp) => {
    if (isSending) return
    if (followUp.action === 'email_scope') {
      const invoices = isAdmin ? mockInvoices : loadClientData().invoices
      const options = buildHoldEmailScopeOptions(invoices, mode)
      const picker: AssistantMessage = {
        id: `scope-${Date.now().toString(36)}`,
        role: 'assistant',
        kind: 'followup_picker',
        createdAt: new Date().toISOString(),
        text: 'Draft an email for…',
        emailScopeOptions: options,
      }
      setMessages((prev) => [...clearInteractiveFollowUps(prev), picker])
      return
    }
    if (followUp.action === 'note_scope') {
      const invoices = isAdmin ? mockInvoices : loadClientData().invoices
      const options = buildNoteScopeOptions(invoices, mode)
      const picker: AssistantMessage = {
        id: `note-scope-${Date.now().toString(36)}`,
        role: 'assistant',
        kind: 'followup_picker',
        createdAt: new Date().toISOString(),
        text: 'Add a note on…',
        emailScopeOptions: options,
      }
      setMessages((prev) => [...clearInteractiveFollowUps(prev), picker])
      return
    }
    if (followUp.action === 'app_nav' && followUp.appActionId) {
      const [action] = resolveAppActions(mode, [{ id: followUp.appActionId }])
      if (action) onAppAction(action)
      return
    }
    if (followUp.prompt?.trim()) {
      void submit(followUp.prompt)
    }
  }

  const onEmailScopeSelect = (option: AssistantEmailScopeOption) => {
    if (!option.prompt.trim() || isSending) return
    void submit(option.prompt)
  }

  const onEmailScopeCancel = () => {
    setMessages((prev) => prev.filter((m) => m.kind !== 'followup_picker'))
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void submit(input)
  }

  return (
    <div className="assistant-thread">
      <div ref={scrollRef} className="assistant-thread__scroll">
        <AssistantMessageList
          messages={messages}
          mode={mode}
          disabled={isSending}
          noteAuthorName={noteAuthorName}
          onFollowUp={onFollowUp}
          onEmailScopeSelect={onEmailScopeSelect}
          onEmailScopeCancel={onEmailScopeCancel}
          onAppAction={onAppAction}
        />
        {isSending && (
          <div className="assistant-msg assistant-msg--assistant" aria-live="polite">
            <div className="assistant-msg__bubble assistant-msg__bubble--assistant assistant-msg__bubble--typing">
              <AssistantBuddyFace size={22} mood="listening" animated className="assistant-typing__face" />
              <span>Thinking…</span>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="assistant-thread__error" role="status">
          {error}
        </p>
      )}

      {showUsageMeter && lastUsage && (
        <div className="assistant-thread__usage" aria-live="polite">
          <p className="assistant-thread__usage-label">Testing · AI usage</p>
          <p className="assistant-thread__usage-line">
            Last: {formatAssistantUsageLine(lastUsage)}
          </p>
          {sessionUsage.calls > 1 && (
            <p className="assistant-thread__usage-line">
              Session: {sessionUsage.calls} calls ·{' '}
              {sessionUsage.totalTokens.toLocaleString()} tok (
              {sessionUsage.promptTokens.toLocaleString()} in /{' '}
              {sessionUsage.completionTokens.toLocaleString()} out) · ~$
              {sessionUsage.estimatedCostUsd.toFixed(4)}
            </p>
          )}
        </div>
      )}

      <div className="assistant-thread__chips">
        {chips.map((chip) => (
          <button
            key={chip}
            type="button"
            className="assistant-chip"
            disabled={isSending}
            onClick={() => void submit(chip)}
          >
            {chip}
          </button>
        ))}
      </div>

      <form className="assistant-thread__composer" onSubmit={onSubmit}>
        <input
          ref={inputRef}
          type="text"
          className="client-input assistant-thread__input"
          placeholder={
            isAdmin ? 'Ask Credyx ops…' : 'Ask me anything about your company…'
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isSending}
          aria-label="Message Assistant"
        />
        <button
          type="submit"
          className="dashboard-btn-primary assistant-thread__send"
          disabled={!input.trim() || isSending}
          aria-label="Send"
        >
          {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>

      {footerExtra ? <div className="assistant-thread__extra">{footerExtra}</div> : null}
    </div>
  )
}
