/**
 * Credyx Inbox — outbound send log + inbound review queue.
 * Layout matches Collections / Work Queue (toolbar, page tabs, compact table).
 */
import { Fragment, useEffect, useMemo, useState } from 'react'
import { ChevronRight, Inbox, GitBranch, RefreshCw, Search, Send } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useClientTheme } from '../theme/ThemeContext'
import { useToast } from '../components/ui/ToastProvider'
import EmptyState from '../components/ui/EmptyState'
import { mockInvoices, updateInvoice } from '../data/mockInvoices'
import { getBrokerById, updateBrokerAsync } from '../data/mockBrokers'
import { getAdminUserDisplayName } from '../config/adminNav'
import { useAuth } from '../context/AuthContext'
import {
  confirmEmailReview,
  getEmailReviewById,
  hydrateEmailInboxFromSupabase,
  listEmailReviews,
  reclassifyEmailReview,
  runEmailLifecycleChase,
} from '../services/emailLifecycleService'
import type { EmailReviewItem } from '../types/emailLifecycle'
import { proposedActionsForClassification } from '../utils/classifyInboundBrokerReply'
import {
  classificationForReply,
  replyStatusFromClassification,
  type BrokerReplyStatus,
} from '../utils/brokerReplyReading'
import SendLifecycleEmailModal from '../components/admin/SendLifecycleEmailModal'
import {
  listOutboundInboxRows,
  type OutboundInboxKind,
} from '../utils/outboundInboxRows'
import {
  listInboundInboxRows,
} from '../utils/inboundInboxRows'
import { resendOutboundInboxEmail } from '../utils/resendOutboundInboxEmail'
import { tickBlueprintRuns } from '../components/blueprints/blueprintRunner'
import { isBlueprintsRunnerEnabled } from '../config/blueprintsRuntime'

const REPLY_STATUS_LABEL: Record<BrokerReplyStatus, string> = {
  confirmed: 'Confirmed',
  rejected: 'Rejected',
  unknown: 'Unknown',
}

const KIND_TABS: Array<{ id: 'all' | OutboundInboxKind; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'ppw', label: 'PPW' },
  { id: 'chase', label: 'Chase' },
  { id: 'other', label: 'Other' },
]

type InboxTab = 'received' | 'review' | 'sent'
type ReviewFileAs = 'broker_verification' | 'paperwork' | 'payment' | 'remittance'

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function kindPillClass(kind: OutboundInboxKind): string {
  if (kind === 'ppw') return 'status-pill status-pill--compact status-pill--approved'
  if (kind === 'chase') return 'status-pill status-pill--compact status-pill--pending'
  return 'status-pill status-pill--compact status-pill--open'
}

function kindLabel(kind: OutboundInboxKind): string {
  if (kind === 'ppw') return 'PPW'
  if (kind === 'chase') return 'Chase'
  return 'Email'
}

export default function AdminEmailInbox() {
  const c = useClientTheme()
  const { showToast } = useToast()
  const { resolved } = useAuth()
  const actor = getAdminUserDisplayName(resolved.user?.email ?? null)
  const [tick, setTick] = useState(0)
  const [tab, setTab] = useState<InboxTab>('received')
  const [kindFilter, setKindFilter] = useState<'all' | OutboundInboxKind>('all')
  const [clientFilter, setClientFilter] = useState('')
  const [brokerFilter, setBrokerFilter] = useState('')
  const [sentQuery, setSentQuery] = useState('')
  const [receivedQuery, setReceivedQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [expandedReceivedId, setExpandedReceivedId] = useState<string | null>(null)
  const [fileAs, setFileAs] = useState<Record<string, ReviewFileAs>>({})
  const [fileStatus, setFileStatus] = useState<Record<string, 'confirmed' | 'rejected'>>({})
  const [filePayDate, setFilePayDate] = useState<Record<string, string>>({})
  const [resendTo, setResendTo] = useState('')
  const [resending, setResending] = useState(false)

  const [busy, setBusy] = useState(false)
  const [composeInvoiceId, setComposeInvoiceId] = useState<string | null>(null)
  const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null)

  useEffect(() => {
    void hydrateEmailInboxFromSupabase().then(() => setTick((n) => n + 1))
  }, [])

  const allSent = useMemo(() => listOutboundInboxRows(), [tick])
  const pending = useMemo(() => listEmailReviews('pending_review'), [tick])
  const allReceived = useMemo(() => listInboundInboxRows(), [tick])

  const receivedRows = useMemo(() => {
    const q = receivedQuery.trim().toLowerCase()
    if (!q) return allReceived
    return allReceived.filter(
      (r) =>
        r.subject.toLowerCase().includes(q) ||
        r.from.toLowerCase().includes(q) ||
        r.to.toLowerCase().includes(q) ||
        r.clientName.toLowerCase().includes(q) ||
        r.brokerName.toLowerCase().includes(q) ||
        r.invoiceNumber.toLowerCase().includes(q) ||
        (r.matchLabel || '').toLowerCase().includes(q) ||
        (r.body || '').toLowerCase().includes(q)
    )
  }, [allReceived, receivedQuery])

  const clients = useMemo(() => {
    const map = new Map<string, string>()
    for (const row of allSent) {
      if (row.clientId) map.set(row.clientId, row.clientName)
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [allSent])

  const brokers = useMemo(() => {
    const map = new Map<string, string>()
    for (const row of allSent) {
      if (row.brokerId) map.set(row.brokerId, row.brokerName)
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [allSent])

  const kindCounts = useMemo(() => {
    const counts = { all: allSent.length, ppw: 0, chase: 0, other: 0 }
    for (const row of allSent) counts[row.kind] += 1
    return counts
  }, [allSent])

  const sentRows = useMemo(() => {
    const q = sentQuery.trim().toLowerCase()
    return allSent.filter((r) => {
      if (kindFilter !== 'all' && r.kind !== kindFilter) return false
      if (clientFilter && r.clientId !== clientFilter) return false
      if (brokerFilter && r.brokerId !== brokerFilter) return false
      if (!q) return true
      return (
        r.subject.toLowerCase().includes(q) ||
        r.to.toLowerCase().includes(q) ||
        r.clientName.toLowerCase().includes(q) ||
        r.brokerName.toLowerCase().includes(q) ||
        r.invoiceNumber.toLowerCase().includes(q) ||
        (r.loadNumber || '').toLowerCase().includes(q) ||
        (r.body || '').toLowerCase().includes(q)
      )
    })
  }, [allSent, kindFilter, clientFilter, brokerFilter, sentQuery])

  const selected = useMemo(
    () => sentRows.find((r) => r.id === selectedId) ?? null,
    [sentRows, selectedId]
  )

  useEffect(() => {
    if (selected) setResendTo(selected.to)
  }, [selected?.id, selected?.to])

  const inputStyle = { backgroundColor: c.card, color: c.primary, borderColor: c.border }

  const handleResend = async () => {
    if (!selected) return
    setResending(true)
    try {
      const result = await resendOutboundInboxEmail({
        row: selected,
        to: resendTo,
        sentBy: actor,
        userId: resolved.user?.email ?? undefined,
      })
      if (!result.ok) {
        showToast(result.error ?? 'Resend failed', 'error')
        return
      }
      showToast(`Resent to ${resendTo.trim()}`, 'success')
      setTick((n) => n + 1)
    } finally {
      setResending(false)
    }
  }

  const confirm = async (item: EmailReviewItem) => {
    const kind = fileAs[item.id]
    if (!kind) {
      showToast('Choose how to file this reply', 'error')
      return
    }
    const fromEmail = item.from_address?.trim() ?? ''
    const replyStatus = fileStatus[item.id] ?? 'confirmed'
    const payDate = (filePayDate[item.id] ?? '').trim()
    if (kind === 'broker_verification' && !fromEmail.includes('@')) {
      showToast('This email has no from address to use as the confirmation email', 'error')
      return
    }
    if (kind === 'payment' && !payDate) {
      showToast('Payment date is required', 'error')
      return
    }

    const status: BrokerReplyStatus =
      kind === 'broker_verification' || kind === 'remittance' ? 'confirmed' : replyStatus
    const outboundKind =
      kind === 'paperwork' ? 'paperwork' : kind === 'payment' || kind === 'remittance' ? 'payment' : 'other'
    const classification = classificationForReply(status, outboundKind, item.body_text)
    const invoiceId = item.invoice_id || undefined
    const kindLabel =
      kind === 'broker_verification'
        ? 'Broker verification'
        : kind === 'paperwork'
          ? 'Paperwork status'
          : kind === 'payment'
            ? 'Payment status'
            : 'Remittance'
    const summary =
      kind === 'broker_verification'
        ? `Broker verification · confirmation email ${fromEmail}`
        : `${kindLabel} · ${status === 'confirmed' ? 'Confirmed' : 'Rejected'}${payDate ? ` · ${payDate}` : ''}`

    setBusy(true)
    try {
      const invoice = invoiceId ? mockInvoices.find((inv) => inv.id === invoiceId) : undefined
      if (kind === 'broker_verification') {
        const brokerId = item.broker_id || invoice?.broker_id
        const broker = brokerId ? getBrokerById(brokerId) : undefined
        if (broker) {
          const emails = broker.emails ?? []
          const already = emails.some((entry) => entry.email.trim().toLowerCase() === fromEmail.toLowerCase())
          await updateBrokerAsync(broker.id, {
            verification_type: 'email',
            email: fromEmail,
            emails: already ? emails : [{ email: fromEmail, category: 'accounting' }, ...emails],
          })
        }
      }
      if (invoice && payDate && (kind === 'paperwork' || kind === 'payment' || kind === 'remittance')) {
        updateInvoice(invoice.id, { expected_payment_date: payDate })
      }
      if (invoice && kind !== 'broker_verification') {
        const { runBrokerReplyBlueprint } = await import('../components/blueprints/blueprintReplyOutcome')
        await runBrokerReplyBlueprint(
          invoice,
          {
            status,
            outboundKind,
            summary,
            classification,
            proposed_actions: proposedActionsForClassification(classification),
            payDate: payDate || null,
          },
          fromEmail
        )
      }
      const result = await confirmEmailReview(item.id, {
        actorName: actor,
        classification,
        invoiceId,
        actions: [],
        extraNote: summary,
      })
      if (!result.ok) {
        showToast(result.error ?? 'Could not confirm', 'error')
        return
      }
      showToast(summary, 'success')
      setTick((n) => n + 1)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden" style={{ backgroundColor: c.background }}>
      <header
        className="shrink-0 px-4 py-3 border-b flex flex-wrap items-center justify-between gap-3"
        style={{ borderColor: c.border, backgroundColor: c.card }}
      >
        <div className="min-w-0">
          <h1 className="text-lg font-semibold flex items-center gap-2" style={{ color: c.primary }}>
            <Inbox className="w-5 h-5 shrink-0" style={{ color: '#1684FE' }} />
            Inbox
          </h1>
          <p className="text-xs mt-0.5" style={{ color: c.secondary }}>
            Outbound Credyx emails by invoice, carrier, and broker
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="dashboard-btn-secondary !h-8 inline-flex items-center gap-1.5"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void runEmailLifecycleChase()
                .then((r) => {
                  showToast(
                    `Blueprints ran — ${r.sent} emails, ${r.actions} staff items`,
                    'success'
                  )
                  setTick((n) => n + 1)
                })
                .finally(() => setBusy(false))
            }}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Run chase
          </button>
          <button
            type="button"
            className="dashboard-btn-secondary !h-8 inline-flex items-center gap-1.5"
            disabled={busy}
            title={
              isBlueprintsRunnerEnabled()
                ? 'Advance due blueprint Wait clocks (notes/status only)'
                : 'Enable Live runner on Blueprints first'
            }
            onClick={() => {
              if (!isBlueprintsRunnerEnabled()) {
                showToast('Turn on Live runner under Blueprints first.', 'error')
                return
              }
              setBusy(true)
              void tickBlueprintRuns(actor)
                .then(({ advanced }) => {
                  showToast(
                    advanced > 0
                      ? `Blueprints — advanced ${advanced} run${advanced === 1 ? '' : 's'}`
                      : 'Blueprints — no waiting runs were due',
                    'success'
                  )
                  setTick((n) => n + 1)
                })
                .finally(() => setBusy(false))
            }}
          >
            <GitBranch className="w-3.5 h-3.5" />
            Run blueprints
          </button>
        </div>
      </header>

      <div
        className="shrink-0 px-4 pt-2 border-b flex gap-1"
        style={{ borderColor: c.border, backgroundColor: c.card }}
      >
        <button
          type="button"
          className={`page-tab ${tab === 'received' ? 'page-tab--active' : ''}`}
          onClick={() => setTab('received')}
        >
          Received ({allReceived.length})
        </button>
        <button
          type="button"
          className={`page-tab ${tab === 'review' ? 'page-tab--active' : ''}`}
          onClick={() => setTab('review')}
        >
          Needs review ({pending.length})
        </button>
        <button
          type="button"
          className={`page-tab ${tab === 'sent' ? 'page-tab--active' : ''}`}
          onClick={() => setTab('sent')}
        >
          Sent ({allSent.length})
        </button>
      </div>

      {tab === 'received' ? (
        <>
          <div
            className="client-page-toolbar px-4 py-2 border-b shrink-0"
            style={{ borderColor: c.border, backgroundColor: c.card }}
          >
            <div className="flex-1 relative min-w-0 max-w-xl">
              <Search
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
                style={{ color: c.secondary }}
              />
              <input
                type="text"
                placeholder="Search received mail…"
                value={receivedQuery}
                onChange={(e) => setReceivedQuery(e.target.value)}
                className="client-input pl-8 w-full"
                style={inputStyle}
              />
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {receivedRows.length === 0 ? (
              <div className="flex items-center justify-center p-8 min-h-[200px]">
                <EmptyState
                  title="No received emails yet"
                  hint="Inbound mail to system@credyx.net (test) or billing@ lands here after Cloudflare → Resend Receiving → email-inbound."
                />
              </div>
            ) : (
              <table className="dashboard-table dashboard-table--compact">
                <thead>
                  <tr>
                    <th className="w-8" />
                    <th>When</th>
                    <th>From</th>
                    <th>Classified as</th>
                    <th>Pulled</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {receivedRows.map((row) => {
                    const open = expandedReceivedId === row.id
                    const review = row.reviewId ? getEmailReviewById(row.reviewId) : undefined
                    const statusLabel =
                      row.replyStatus === 'confirmed'
                        ? 'Confirmed'
                        : row.replyStatus === 'rejected'
                          ? 'Rejected'
                          : row.replyStatus === 'unknown'
                            ? 'Unknown'
                            : row.pendingReview
                              ? 'Needs review'
                              : 'Logged'
                    const statusClass =
                      row.replyStatus === 'confirmed'
                        ? 'status-pill status-pill--compact status-pill--paid'
                        : row.replyStatus === 'rejected'
                          ? 'status-pill status-pill--compact status-pill--overdue'
                          : row.pendingReview || row.replyStatus === 'unknown'
                            ? 'status-pill status-pill--compact status-pill--pending'
                            : 'status-pill status-pill--compact status-pill--open'
                    return (
                      <Fragment key={row.id}>
                        <tr
                          onClick={() => setExpandedReceivedId(open ? null : row.id)}
                          className={open ? 'is-selected' : undefined}
                          style={{ cursor: 'pointer' }}
                        >
                          <td>
                            <ChevronRight
                              className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
                              style={{ color: c.secondary }}
                            />
                          </td>
                          <td className="whitespace-nowrap">{formatWhen(row.sentAt)}</td>
                          <td className="truncate max-w-[160px]" title={row.from}>
                            {row.from}
                          </td>
                          <td className="whitespace-nowrap">{row.classifiedAs}</td>
                          <td className="truncate max-w-[360px]" title={row.pulled}>
                            {row.pulled}
                          </td>
                          <td>
                            <span className={statusClass}>{statusLabel}</span>
                          </td>
                        </tr>
                        {open ? (
                          <tr>
                            <td colSpan={6} style={{ backgroundColor: c.background }}>
                              <div className="py-2 space-y-2">
                                <p className="text-sm font-medium" style={{ color: c.primary }}>
                                  {row.subject || '(no subject)'}
                                </p>
                                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs max-w-3xl">
                                  <div>
                                    <dt style={{ color: c.secondary }}>Classified as</dt>
                                    <dd className="font-medium" style={{ color: c.primary }}>
                                      {row.classifiedAs}
                                      {row.replyStatus ? ` · ${REPLY_STATUS_LABEL[row.replyStatus]}` : ''}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt style={{ color: c.secondary }}>Invoice</dt>
                                    <dd style={{ color: c.primary }}>{row.invoiceNumber || '—'}</dd>
                                  </div>
                                  <div>
                                    <dt style={{ color: c.secondary }}>Load</dt>
                                    <dd style={{ color: c.primary }}>{row.loadNumber || '—'}</dd>
                                  </div>
                                  <div>
                                    <dt style={{ color: c.secondary }}>From</dt>
                                    <dd className="break-all" style={{ color: c.primary }}>
                                      {row.from || '—'}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt style={{ color: c.secondary }}>Payment date</dt>
                                    <dd style={{ color: c.primary }}>{row.payDate || '—'}</dd>
                                  </div>
                                  <div className="sm:col-span-2">
                                    <dt style={{ color: c.secondary }}>Pulled</dt>
                                    <dd style={{ color: c.primary }}>{row.pulled}</dd>
                                  </div>
                                </dl>
                                <pre
                                  className="text-xs whitespace-pre-wrap break-words rounded border p-3 max-h-64 overflow-auto"
                                  style={{
                                    color: c.primary,
                                    backgroundColor: c.card,
                                    borderColor: c.border,
                                  }}
                                >
                                  {row.body?.trim() || '(empty response)'}
                                </pre>
                                {review && row.pendingReview ? (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl">
                                    <label className="text-xs sm:col-span-2" style={{ color: c.secondary }}>
                                      Classify
                                      <select
                                        className="client-input w-full text-sm mt-1"
                                        style={inputStyle}
                                        value={fileAs[review.id] ?? ''}
                                        onChange={(e) =>
                                          setFileAs((prev) => ({
                                            ...prev,
                                            [review.id]: e.target.value as ReviewFileAs,
                                          }))
                                        }
                                      >
                                        <option value="">Choose…</option>
                                        <option value="broker_verification">Broker verification</option>
                                        <option value="paperwork">Paperwork status</option>
                                        <option value="payment">Payment status</option>
                                        <option value="remittance">Remittance</option>
                                      </select>
                                    </label>
                                    {fileAs[review.id] === 'broker_verification' ? (
                                      <div className="sm:col-span-2">
                                        <div className="text-xs" style={{ color: c.secondary }}>
                                          Confirmation email
                                        </div>
                                        <div className="text-sm font-medium break-all" style={{ color: c.primary }}>
                                          {review.from_address?.trim() || row.from || 'No from address on this email'}
                                        </div>
                                      </div>
                                    ) : null}
                                    {fileAs[review.id] === 'paperwork' || fileAs[review.id] === 'payment' ? (
                                      <>
                                        <label className="text-xs" style={{ color: c.secondary }}>
                                          Result
                                          <select
                                            className="client-input w-full text-sm mt-1"
                                            style={inputStyle}
                                            value={fileStatus[review.id] ?? 'confirmed'}
                                            onChange={(e) =>
                                              setFileStatus((prev) => ({
                                                ...prev,
                                                [review.id]: e.target.value as 'confirmed' | 'rejected',
                                              }))
                                            }
                                          >
                                            <option value="confirmed">Confirmed</option>
                                            <option value="rejected">Rejected</option>
                                          </select>
                                        </label>
                                        <label className="text-xs" style={{ color: c.secondary }}>
                                          Payment date
                                          {fileAs[review.id] === 'payment' ? ' (required)' : ' (optional)'}
                                          <input
                                            type="date"
                                            className="client-input w-full text-sm mt-1"
                                            style={inputStyle}
                                            value={filePayDate[review.id] ?? ''}
                                            onChange={(e) =>
                                              setFilePayDate((prev) => ({
                                                ...prev,
                                                [review.id]: e.target.value,
                                              }))
                                            }
                                          />
                                        </label>
                                      </>
                                    ) : null}
                                    <div className="sm:col-span-2">
                                      <button
                                        type="button"
                                        className="dashboard-btn-primary !h-8 text-sm"
                                        disabled={busy || !fileAs[review.id]}
                                        onClick={() => void confirm(review)}
                                      >
                                        Confirm
                                      </button>
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}

      {tab === 'sent' ? (
        <>
          <div
            className="client-page-toolbar px-4 py-2 border-b shrink-0 space-y-2"
            style={{ borderColor: c.border, backgroundColor: c.card }}
          >
            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <div className="flex-1 relative min-w-0">
                <Search
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
                  style={{ color: c.secondary }}
                />
                <input
                  type="text"
                  placeholder="Search invoice, carrier, broker, load, email…"
                  value={sentQuery}
                  onChange={(e) => setSentQuery(e.target.value)}
                  className="client-input pl-8 w-full"
                  style={inputStyle}
                />
              </div>
              <select
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
                className="client-input w-full md:w-auto min-w-[160px]"
                style={inputStyle}
                aria-label="Filter by carrier"
              >
                <option value="">All carriers</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
              <select
                value={brokerFilter}
                onChange={(e) => setBrokerFilter(e.target.value)}
                className="client-input w-full md:w-auto min-w-[160px]"
                style={inputStyle}
                aria-label="Filter by broker"
              >
                <option value="">All brokers</option>
                {brokers.map((broker) => (
                  <option key={broker.id} value={broker.id}>
                    {broker.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {KIND_TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setKindFilter(item.id)}
                  className={`page-tab !py-1 !px-2 !text-xs ${
                    kindFilter === item.id ? 'page-tab--active' : ''
                  }`}
                >
                  {item.label} ({kindCounts[item.id]})
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
            {/* Column wrapper required: client-table-scroll uses height:0 and needs a flex-col parent */}
            <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
              <div className="client-table-scroll">
                {sentRows.length === 0 ? (
                  <div className="flex items-center justify-center p-8 min-h-[200px]">
                    <EmptyState
                      title="No emails in this view"
                      hint="Try clearing filters. PPW and chase sends appear here after they go out."
                    />
                  </div>
                ) : (
                  <table className="dashboard-table dashboard-table--compact">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Type</th>
                        <th>Invoice</th>
                        <th>Carrier</th>
                        <th>Broker</th>
                        <th>To</th>
                        <th>Subject</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sentRows.map((row) => {
                        const active = row.id === selectedId
                        return (
                          <tr
                            key={row.id}
                            className="dashboard-table-row--clickable cursor-pointer"
                            style={
                              active
                                ? { backgroundColor: 'rgba(22, 132, 254, 0.08)' }
                                : undefined
                            }
                            onClick={() => setSelectedId(row.id)}
                          >
                            <td
                              className="tabular-nums whitespace-nowrap text-xs"
                              style={{ color: c.secondary }}
                            >
                              {formatWhen(row.sentAt)}
                            </td>
                            <td>
                              <span className={kindPillClass(row.kind)}>{kindLabel(row.kind)}</span>
                            </td>
                            <td>
                              {row.invoiceId ? (
                                <Link
                                  to={`/collections/invoice/${row.invoiceId}`}
                                  className="font-medium text-[#1684FE] hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {row.invoiceNumber}
                                </Link>
                              ) : (
                                <span style={{ color: c.primary }}>{row.invoiceNumber}</span>
                              )}
                              {row.loadNumber ? (
                                <div className="text-[11px]" style={{ color: c.secondary }}>
                                  Load {row.loadNumber}
                                </div>
                              ) : null}
                            </td>
                            <td className="max-w-[140px] truncate" title={row.clientName}>
                              {row.clientName}
                            </td>
                            <td className="max-w-[140px] truncate" title={row.brokerName}>
                              {row.brokerName}
                            </td>
                            <td className="max-w-[160px] truncate text-xs" title={row.to}>
                              {row.to}
                            </td>
                            <td className="max-w-[220px] truncate" title={row.subject}>
                              {row.subject}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {selected ? (
              <aside
                className="shrink-0 max-h-[45vh] lg:max-h-none lg:w-[360px] border-t lg:border-t-0 lg:border-l overflow-y-auto p-4 space-y-3"
                style={{ borderColor: c.border, backgroundColor: c.card }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className={kindPillClass(selected.kind)}>{kindLabel(selected.kind)}</span>
                    <h2
                      className="text-sm font-semibold mt-1.5 leading-snug"
                      style={{ color: c.primary }}
                    >
                      {selected.subject}
                    </h2>
                    <p className="text-xs mt-1 tabular-nums" style={{ color: c.secondary }}>
                      {formatWhen(selected.sentAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-xs font-medium shrink-0"
                    style={{ color: c.secondary }}
                    onClick={() => setSelectedId(null)}
                  >
                    Close
                  </button>
                </div>
                <dl className="grid grid-cols-[72px_1fr] gap-x-2 gap-y-1.5 text-xs">
                  <dt style={{ color: c.secondary }}>To</dt>
                  <dd className="break-all" style={{ color: c.primary }}>
                    {selected.to}
                  </dd>
                  <dt style={{ color: c.secondary }}>Carrier</dt>
                  <dd style={{ color: c.primary }}>{selected.clientName}</dd>
                  <dt style={{ color: c.secondary }}>Broker</dt>
                  <dd style={{ color: c.primary }}>{selected.brokerName}</dd>
                  <dt style={{ color: c.secondary }}>Invoice</dt>
                  <dd>
                    {selected.invoiceId ? (
                      <Link
                        to={`/collections/invoice/${selected.invoiceId}`}
                        className="text-[#1684FE] font-medium hover:underline"
                      >
                        {selected.invoiceNumber}
                        {selected.loadNumber ? ` · Load ${selected.loadNumber}` : ''}
                      </Link>
                    ) : (
                      selected.invoiceNumber
                    )}
                  </dd>
                </dl>
                {selected.body ? (
                  <pre
                    className="text-xs whitespace-pre-wrap rounded-md p-2.5 max-h-40 overflow-auto border"
                    style={{
                      color: c.primary,
                      backgroundColor: c.background,
                      borderColor: c.border,
                    }}
                  >
                    {selected.body}
                  </pre>
                ) : null}

                <div
                  className="rounded-md border p-3 space-y-2"
                  style={{ borderColor: c.border, backgroundColor: c.background }}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: c.secondary }}>
                    Resend
                  </p>
                  <label className="block text-xs" style={{ color: c.secondary }}>
                    Recipient email
                    <input
                      type="email"
                      className="client-input w-full text-sm mt-1"
                      value={resendTo}
                      onChange={(e) => setResendTo(e.target.value)}
                      style={inputStyle}
                      placeholder="broker@example.com"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="text-xs font-medium text-[#1684FE]"
                      onClick={() => setResendTo(selected.to)}
                    >
                      Use original
                    </button>
                  </div>
                  <button
                    type="button"
                    className="dashboard-btn-primary !h-8 w-full inline-flex items-center justify-center gap-1.5 text-sm"
                    disabled={resending || !resendTo.trim() || !selected.invoiceId}
                    onClick={() => void handleResend()}
                  >
                    <Send className="w-3.5 h-3.5" />
                    {resending ? 'Sending…' : 'Resend email'}
                  </button>
                  <p className="text-[11px] leading-snug" style={{ color: c.secondary }}>
                    Resend is logged on the invoice
                    {selected.kind === 'ppw' ? ' (PPW send history + note)' : ' (inbox + note)'}.
                  </p>
                </div>
              </aside>
            ) : null}
          </div>
        </>
      ) : null}

      {tab === 'review' ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {pending.length === 0 ? (
            <div className="flex items-center justify-center p-8 min-h-[200px]">
              <EmptyState
                title="Nothing waiting for confirm"
                hint="Broker replies that still need a look show up here."
              />
            </div>
          ) : (
            <table className="dashboard-table dashboard-table--compact">
              <thead>
                <tr>
                  <th className="w-8" />
                  <th>When</th>
                  <th>From</th>
                  <th>Invoice</th>
                  <th>Overview</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((item) => {
                  const status =
                    item.reply_status ?? replyStatusFromClassification(item.classification)
                  const open = expandedReviewId === item.id
                  const overview =
                    item.summary?.trim() || item.subject?.trim() || 'No overview'
                  return (
                    <Fragment key={item.id}>
                      <tr
                        onClick={() => setExpandedReviewId(open ? null : item.id)}
                        className={open ? 'is-selected' : undefined}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <ChevronRight
                            className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
                            style={{ color: c.secondary }}
                          />
                        </td>
                        <td className="whitespace-nowrap">{formatWhen(item.created_at)}</td>
                        <td className="truncate max-w-[160px]" title={item.from_address}>
                          {item.from_address || '—'}
                        </td>
                        <td className="whitespace-nowrap">
                          {item.invoice_number ?? 'Unmatched'}
                          {item.load_number ? ` · ${item.load_number}` : ''}
                        </td>
                        <td className="truncate max-w-[360px]" title={overview}>
                          {overview}
                        </td>
                        <td>
                          <span className="status-pill status-pill--compact status-pill--pending">
                            {REPLY_STATUS_LABEL[status]}
                          </span>
                        </td>
                      </tr>
                      {open ? (
                        <tr>
                          <td colSpan={6} style={{ backgroundColor: c.background }}>
                            <div className="py-2 space-y-2">
                              {item.subject ? (
                                <p className="text-sm font-medium" style={{ color: c.primary }}>
                                  {item.subject}
                                </p>
                              ) : null}
                              <pre
                                className="text-xs whitespace-pre-wrap break-words rounded border p-3 max-h-64 overflow-auto"
                                style={{
                                  color: c.primary,
                                  backgroundColor: c.card,
                                  borderColor: c.border,
                                }}
                              >
                                {item.body_text?.trim() || '(empty response)'}
                              </pre>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl">
                                <label className="text-xs sm:col-span-2" style={{ color: c.secondary }}>
                                  File as
                                  <select
                                    className="client-input w-full text-sm mt-1"
                                    style={inputStyle}
                                    value={fileAs[item.id] ?? ''}
                                    onChange={(e) =>
                                      setFileAs((prev) => ({
                                        ...prev,
                                        [item.id]: e.target.value as ReviewFileAs,
                                      }))
                                    }
                                  >
                                    <option value="">Choose…</option>
                                    <option value="broker_verification">Broker verification</option>
                                    <option value="paperwork">Paperwork status</option>
                                    <option value="payment">Payment status</option>
                                    <option value="remittance">Remittance</option>
                                  </select>
                                </label>
                                {fileAs[item.id] === 'broker_verification' ? (
                                  <div className="sm:col-span-2">
                                    <div className="text-xs" style={{ color: c.secondary }}>
                                      Confirmation email
                                    </div>
                                    <div className="text-sm font-medium break-all" style={{ color: c.primary }}>
                                      {item.from_address?.trim() || 'No from address on this email'}
                                    </div>
                                  </div>
                                ) : null}
                                {fileAs[item.id] === 'paperwork' || fileAs[item.id] === 'payment' ? (
                                  <>
                                    <label className="text-xs" style={{ color: c.secondary }}>
                                      Result
                                      <select
                                        className="client-input w-full text-sm mt-1"
                                        style={inputStyle}
                                        value={fileStatus[item.id] ?? 'confirmed'}
                                        onChange={(e) =>
                                          setFileStatus((prev) => ({
                                            ...prev,
                                            [item.id]: e.target.value as 'confirmed' | 'rejected',
                                          }))
                                        }
                                      >
                                        <option value="confirmed">Confirmed</option>
                                        <option value="rejected">Rejected</option>
                                      </select>
                                    </label>
                                    <label className="text-xs" style={{ color: c.secondary }}>
                                      Payment date
                                      {fileAs[item.id] === 'payment' ? ' (required)' : ' (optional)'}
                                      <input
                                        type="date"
                                        className="client-input w-full text-sm mt-1"
                                        style={inputStyle}
                                        value={filePayDate[item.id] ?? ''}
                                        onChange={(e) =>
                                          setFilePayDate((prev) => ({
                                            ...prev,
                                            [item.id]: e.target.value,
                                          }))
                                        }
                                      />
                                    </label>
                                  </>
                                ) : null}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className="dashboard-btn-primary !h-8 text-sm"
                                  disabled={busy || !fileAs[item.id]}
                                  onClick={() => void confirm(item)}
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  className="dashboard-btn-secondary !h-8 text-sm"
                                  disabled={busy}
                                  onClick={() => {
                                    setBusy(true)
                                    void reclassifyEmailReview(item.id)
                                      .then(() => setTick((n) => n + 1))
                                      .finally(() => setBusy(false))
                                  }}
                                >
                                  Reclassify
                                </button>
                                <button
                                  type="button"
                                  className="dashboard-btn-secondary !h-8 text-sm"
                                  disabled={!item.invoice_id}
                                  onClick={() => setComposeInvoiceId(item.invoice_id)}
                                >
                                  Compose
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : null}

      {composeInvoiceId ? (
        <SendLifecycleEmailModal
          invoiceId={composeInvoiceId}
          templateId="broker_claim_scope"
          onClose={() => {
            setComposeInvoiceId(null)
            setTick((n) => n + 1)
          }}
        />
      ) : null}
    </div>
  )
}
