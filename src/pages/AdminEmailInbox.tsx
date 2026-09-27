/**
 * Credyx Inbox — outbound send log + inbound review queue.
 * Layout matches Collections / Work Queue (toolbar, page tabs, compact table).
 */
import { useEffect, useMemo, useState } from 'react'
import { Inbox, GitBranch, RefreshCw, Search, Send, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useClientTheme } from '../theme/ThemeContext'
import { useToast } from '../components/ui/ToastProvider'
import EmptyState from '../components/ui/EmptyState'
import { mockInvoices } from '../data/mockInvoices'
import { getAdminUserDisplayName } from '../config/adminNav'
import { useAuth } from '../context/AuthContext'
import {
  confirmEmailReview,
  hydrateEmailInboxFromSupabase,
  ingestBrokerReply,
  listEmailReviews,
  reclassifyEmailReview,
  runEmailLifecycleChase,
} from '../services/emailLifecycleService'
import type { EmailReviewItem, InboundClassification } from '../types/emailLifecycle'
import { proposedActionsForClassification } from '../utils/classifyInboundBrokerReply'
import {
  parseDroppedEmailFile,
  parseDroppedEmailText,
} from '../utils/parseDroppedEmail'
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

const CLASS_LABEL: Record<InboundClassification, string> = {
  paperwork_ok: 'Paperwork good',
  payment_ok: 'Payment status',
  negative: 'Negative',
  missing_docs: 'Missing docs / hold',
  claim: 'Claim',
  unclear: 'Unclear',
  non_response_paperwork: 'No reply — paperwork',
  non_response_payment: 'No reply — payment',
}

const STAFF_CLASSIFICATIONS: InboundClassification[] = [
  'missing_docs',
  'paperwork_ok',
  'payment_ok',
  'claim',
  'negative',
  'unclear',
]

const KIND_TABS: Array<{ id: 'all' | OutboundInboxKind; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'ppw', label: 'PPW' },
  { id: 'chase', label: 'Chase' },
  { id: 'other', label: 'Other' },
]

type InboxTab = 'received' | 'review' | 'sent'

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
  const [selectedReceivedId, setSelectedReceivedId] = useState<string | null>(null)
  const [resendTo, setResendTo] = useState('')
  const [resending, setResending] = useState(false)

  const [pasteInvoiceId, setPasteInvoiceId] = useState('')
  const [pasteFrom, setPasteFrom] = useState('')
  const [pasteSubject, setPasteSubject] = useState('')
  const [pasteBody, setPasteBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [composeInvoiceId, setComposeInvoiceId] = useState<string | null>(null)
  const [cardClass, setCardClass] = useState<Record<string, InboundClassification>>({})
  const [cardInvoice, setCardInvoice] = useState<Record<string, string>>({})

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

  const selectedReceived = useMemo(
    () => receivedRows.find((r) => r.id === selectedReceivedId) ?? null,
    [receivedRows, selectedReceivedId]
  )

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

  const queueParsed = async (
    fromAddress: string,
    subject: string,
    bodyText: string,
    invoiceId?: string
  ) => {
    if (!bodyText.trim() && !subject.trim()) {
      showToast('That drop had no readable email body', 'error')
      return
    }
    await ingestBrokerReply({
      invoiceId: invoiceId || pasteInvoiceId || undefined,
      fromAddress: fromAddress || 'broker@unknown',
      subject: subject || '(no subject)',
      bodyText,
    })
    setTick((n) => n + 1)
  }

  const ingest = () => {
    if (!pasteBody.trim()) {
      showToast('Paste or drop the broker email', 'error')
      return
    }
    setBusy(true)
    void queueParsed(pasteFrom, pasteSubject, pasteBody, pasteInvoiceId || undefined)
      .then(() => {
        setPasteBody('')
        showToast('Queued for review', 'success')
        setTab('review')
      })
      .finally(() => setBusy(false))
  }

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (list.length === 0) return
    setBusy(true)
    try {
      let ok = 0
      for (const file of list) {
        try {
          const parsed = await parseDroppedEmailFile(file)
          await queueParsed(parsed.fromAddress, parsed.subject, parsed.bodyText)
          ok += 1
        } catch (err) {
          showToast(
            err instanceof Error
              ? `Could not read ${file.name}: ${err.message}`
              : 'Could not read that file',
            'error'
          )
        }
      }
      if (ok > 0) {
        showToast(`Queued ${ok} email${ok === 1 ? '' : 's'}`, 'success')
        setTab('review')
      }
    } finally {
      setBusy(false)
    }
  }

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files.length > 0) {
      await handleFiles(e.dataTransfer.files)
      return
    }
    const parsed = parseDroppedEmailText(
      e.dataTransfer.getData('text/plain'),
      e.dataTransfer.getData('text/html')
    )
    if (!parsed) {
      showToast(
        'Outlook did not attach a file. Try dragging the message onto this box, or save as .eml first.',
        'error'
      )
      return
    }
    setBusy(true)
    try {
      await queueParsed(parsed.fromAddress, parsed.subject, parsed.bodyText)
      showToast('Queued for review', 'success')
      setTab('review')
    } finally {
      setBusy(false)
    }
  }

  const confirm = async (item: EmailReviewItem) => {
    const classification = cardClass[item.id] ?? item.classification
    const invoiceId = cardInvoice[item.id] || item.invoice_id || undefined
    setBusy(true)
    try {
      const result = await confirmEmailReview(item.id, {
        actorName: actor,
        classification,
        invoiceId,
        actions: proposedActionsForClassification(classification),
      })
      if (!result.ok) {
        showToast(result.error ?? 'Could not confirm', 'error')
        return
      }
      showToast('Applied', 'success')
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
          <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
            <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
              <div className="client-table-scroll">
                {receivedRows.length === 0 ? (
                  <div className="flex items-center justify-center p-8 min-h-[200px]">
                    <EmptyState
                      title="No received emails yet"
                      hint="Inbound mail to system@credyx.net (test) or billing@ lands here after Cloudflare → Resend Receiving → email-inbound. You can also paste/drop on Needs review."
                    />
                  </div>
                ) : (
                  <table className="dashboard-table dashboard-table--compact">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>From</th>
                        <th>To</th>
                        <th>Subject</th>
                        <th>Match</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receivedRows.map((row) => (
                        <tr
                          key={row.id}
                          className={
                            selectedReceivedId === row.id ? 'is-selected' : undefined
                          }
                          onClick={() => setSelectedReceivedId(row.id)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td className="whitespace-nowrap">{formatWhen(row.sentAt)}</td>
                          <td className="truncate max-w-[140px]" title={row.from}>
                            {row.from}
                          </td>
                          <td className="truncate max-w-[120px]" title={row.to}>
                            {row.to}
                          </td>
                          <td className="truncate max-w-[220px]" title={row.subject}>
                            {row.subject}
                          </td>
                          <td className="truncate max-w-[260px]" title={row.matchLabel}>
                            {row.matchLabel}
                          </td>
                          <td>
                            {row.pendingReview ? (
                              <span className="status-pill status-pill--compact status-pill--pending">
                                Needs review
                              </span>
                            ) : (
                              <span className="status-pill status-pill--compact status-pill--open">
                                Logged
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            <aside
              className="lg:w-[360px] shrink-0 border-t lg:border-t-0 lg:border-l overflow-y-auto p-4 space-y-3"
              style={{ borderColor: c.border, backgroundColor: c.card }}
            >
              {!selectedReceived ? (
                <p className="text-sm" style={{ color: c.secondary }}>
                  Select a received email.
                </p>
              ) : (
                <>
                  <div>
                    <div className="text-xs uppercase tracking-wide" style={{ color: c.secondary }}>
                      From
                    </div>
                    <div className="text-sm font-medium break-all">{selectedReceived.from}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide" style={{ color: c.secondary }}>
                      To
                    </div>
                    <div className="text-sm break-all">{selectedReceived.to || '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide" style={{ color: c.secondary }}>
                      Subject
                    </div>
                    <div className="text-sm font-medium break-words">
                      {selectedReceived.subject || '(no subject)'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide" style={{ color: c.secondary }}>
                      Match
                    </div>
                    <div className="text-sm font-medium break-words">
                      {selectedReceived.matchLabel}
                    </div>
                    {!selectedReceived.matchConfirmed &&
                    selectedReceived.matchLabel &&
                    selectedReceived.matchLabel !== '—' ? (
                      <div className="text-xs mt-0.5" style={{ color: c.secondary }}>
                        Guess from subject/body — not linked in system yet
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide" style={{ color: c.secondary }}>
                      Body
                    </div>
                    <pre
                      className="text-xs whitespace-pre-wrap break-words p-3 rounded border max-h-[50vh] overflow-y-auto mt-1"
                      style={{ borderColor: c.border, backgroundColor: c.background }}
                    >
                      {selectedReceived.body?.trim() || '(empty body — send a new test after deploy)'}
                    </pre>
                  </div>
                  {selectedReceived.pendingReview && selectedReceived.reviewId ? (
                    <button
                      type="button"
                      className="client-btn client-btn--primary text-sm"
                      onClick={() => setTab('review')}
                    >
                      Open in Needs review
                    </button>
                  ) : null}
                </>
              )}
            </aside>
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
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          <section
            className={`rounded-lg border-2 border-dashed p-4 space-y-3 transition-colors ${
              dragging ? 'bg-sky-50/60' : ''
            }`}
            style={{
              borderColor: dragging ? '#1684FE' : c.border,
              backgroundColor: dragging ? undefined : c.card,
            }}
            onDragEnter={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'copy'
              setDragging(true)
            }}
            onDragLeave={(e) => {
              if (e.currentTarget.contains(e.relatedTarget as Node)) return
              setDragging(false)
            }}
            onDrop={(e) => void onDrop(e)}
          >
            <div className="text-center py-2">
              <Upload className="w-5 h-5 mx-auto mb-2" style={{ color: '#1684FE' }} />
              <p className="text-sm font-semibold" style={{ color: c.primary }}>
                Drop Outlook emails here
              </p>
              <p className="text-xs mt-1" style={{ color: c.secondary }}>
                .msg / .eml — AI classifies; you confirm before hold
              </p>
              <label className="mt-2 inline-block text-sm font-medium text-[#1684FE] cursor-pointer">
                Choose files
                <input
                  type="file"
                  className="sr-only"
                  accept=".msg,.eml,message/rfc822,application/vnd.ms-outlook"
                  multiple
                  onChange={(e) => {
                    if (e.target.files) void handleFiles(e.target.files)
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                className="client-input w-full text-sm sm:col-span-2"
                value={pasteInvoiceId}
                onChange={(e) => setPasteInvoiceId(e.target.value)}
                style={inputStyle}
              >
                <option value="">Match invoice from the email…</option>
                {mockInvoices.slice(0, 80).map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoice_number} · {inv.broker_name} · {inv.client_name}
                  </option>
                ))}
              </select>
              <input
                className="client-input w-full text-sm"
                placeholder="From"
                value={pasteFrom}
                onChange={(e) => setPasteFrom(e.target.value)}
                style={inputStyle}
              />
              <input
                className="client-input w-full text-sm"
                placeholder="Subject"
                value={pasteSubject}
                onChange={(e) => setPasteSubject(e.target.value)}
                style={inputStyle}
              />
              <textarea
                className="client-input w-full text-sm min-h-[72px] sm:col-span-2"
                placeholder="Or paste the email body"
                value={pasteBody}
                onChange={(e) => setPasteBody(e.target.value)}
                style={inputStyle}
              />
            </div>
            <button
              type="button"
              className="dashboard-btn-primary !h-8 text-sm"
              disabled={busy}
              onClick={ingest}
            >
              Classify and queue
            </button>
          </section>

          {pending.length === 0 ? (
            <EmptyState
              title="Nothing waiting for confirm"
              hint="Inbound broker replies you drop or paste show up here."
            />
          ) : (
            <ul className="space-y-3">
              {pending.map((item) => {
                const classification = cardClass[item.id] ?? item.classification
                const invoiceId = cardInvoice[item.id] ?? item.invoice_id ?? ''
                return (
                  <li
                    key={item.id}
                    className="rounded-lg border p-3 space-y-2"
                    style={{ borderColor: c.border, backgroundColor: c.card }}
                  >
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="status-pill status-pill--compact status-pill--pending">
                        {CLASS_LABEL[classification]}
                      </span>
                      <span className="text-sm font-medium" style={{ color: c.primary }}>
                        {item.invoice_number ?? 'Unmatched'}
                        {item.load_number ? ` · Load ${item.load_number}` : ''}
                      </span>
                    </div>
                    <p className="text-sm" style={{ color: c.primary }}>
                      {item.summary}
                    </p>
                    {item.body_text ? (
                      <pre
                        className="text-xs whitespace-pre-wrap rounded p-2 max-h-28 overflow-auto border"
                        style={{
                          color: c.secondary,
                          backgroundColor: c.background,
                          borderColor: c.border,
                        }}
                      >
                        {item.body_text}
                      </pre>
                    ) : null}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label className="text-xs" style={{ color: c.secondary }}>
                        Type
                        <select
                          className="client-input w-full text-sm mt-1"
                          value={classification}
                          style={inputStyle}
                          onChange={(e) =>
                            setCardClass((prev) => ({
                              ...prev,
                              [item.id]: e.target.value as InboundClassification,
                            }))
                          }
                        >
                          {STAFF_CLASSIFICATIONS.map((k) => (
                            <option key={k} value={k}>
                              {CLASS_LABEL[k]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs" style={{ color: c.secondary }}>
                        Invoice
                        <select
                          className="client-input w-full text-sm mt-1"
                          value={invoiceId}
                          style={inputStyle}
                          onChange={(e) =>
                            setCardInvoice((prev) => ({ ...prev, [item.id]: e.target.value }))
                          }
                        >
                          <option value="">Select invoice…</option>
                          {mockInvoices.slice(0, 80).map((inv) => (
                            <option key={inv.id} value={inv.id}>
                              {inv.invoice_number} · {inv.client_name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="dashboard-btn-primary !h-8 text-sm"
                        disabled={busy}
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
                        onClick={() =>
                          setComposeInvoiceId(invoiceId || item.invoice_id || null)
                        }
                      >
                        Compose
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
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
