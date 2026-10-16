import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Inbox,
  Mail,
  PenSquare,
  RefreshCw,
  Search,
  Send,
  X,
} from 'lucide-react'
import Spinner from '../../ui/Spinner'
import { useToast } from '../../ui/ToastProvider'
import type { SalesLead } from '../../../services/salesLeadService'
import type { SalesChaseGrade } from '../../../utils/salesLeadRating'
import {
  SALES_EMAIL_TEMPLATES,
  SALES_MERGE_FIELDS,
  isValidEmail,
  listSalesEmailMessages,
  listSalesEmailThreads,
  markSalesThreadRead,
  parseCcList,
  renderSalesTemplate,
  sendSalesEmails,
  type SalesEmailMessage,
  type SalesEmailThread,
  type SalesEmailActivity,
  type SalesSendResult,
} from '../../../services/salesEmailService'

type ThreadFilter = 'all' | 'replies' | 'unread'
type View = { mode: 'compose' } | { mode: 'thread'; threadId: string } | { mode: 'empty' }

const GRADES: SalesChaseGrade[] = ['A', 'B', 'C', 'D', 'F']

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  const today = new Date()
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function leadLabel(lead: SalesLead): string {
  return lead.company_name || lead.mc_number || `DOT ${lead.dot_number ?? ''}`
}

export default function SalesEmailPanel({
  leads,
  sentBy,
  initialRecipientIds,
  onInitialRecipientsConsumed,
  onLeadsChanged,
  activity,
  onActivityChanged,
  openThreadId,
  onOpenThreadConsumed,
}: {
  leads: SalesLead[]
  sentBy: string
  /** Lead ids chosen on the Leads tab; opens the composer with them. */
  initialRecipientIds: string[] | null
  onInitialRecipientsConsumed: () => void
  onLeadsChanged: () => void
  /** Unread reply counts per conversation (loaded by the Sales page). */
  activity: SalesEmailActivity | null
  onActivityChanged: () => void
  /** Conversation to open (e.g. clicked from a lead's reply badge). */
  openThreadId: string | null
  onOpenThreadConsumed: () => void
}) {
  const { showToast } = useToast()
  const [threads, setThreads] = useState<SalesEmailThread[]>([])
  const [loadingThreads, setLoadingThreads] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [threadSearch, setThreadSearch] = useState('')
  const [threadFilter, setThreadFilter] = useState<ThreadFilter>('all')
  const [view, setView] = useState<View>({ mode: 'empty' })

  const [messages, setMessages] = useState<SalesEmailMessage[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [replyBody, setReplyBody] = useState('')
  const [replying, setReplying] = useState(false)
  // system@ copies every sales email into the system Inbox, where it is filed as Sales.
  const [ccText, setCcText] = useState('system@credyx.net')
  const cc = parseCcList(ccText)

  const [recipientIds, setRecipientIds] = useState<string[]>([])
  const [templateId, setTemplateId] = useState(SALES_EMAIL_TEMPLATES[0].id)
  const [subject, setSubject] = useState(SALES_EMAIL_TEMPLATES[0].subject)
  const [body, setBody] = useState(SALES_EMAIL_TEMPLATES[0].body)
  const [pickerQuery, setPickerQuery] = useState('')
  const [skipEmailed, setSkipEmailed] = useState(true)
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [results, setResults] = useState<SalesSendResult[] | null>(null)

  const leadById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads])
  const emailedAddresses = useMemo(
    () => new Set(threads.map((t) => t.to_address.toLowerCase())),
    [threads]
  )
  const emailableLeads = useMemo(() => leads.filter((l) => isValidEmail(l.contact_email)), [leads])

  const loadThreads = useCallback(async () => {
    setLoadingThreads(true)
    try {
      setThreads(await listSalesEmailThreads())
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load emails')
    } finally {
      setLoadingThreads(false)
    }
  }, [])

  useEffect(() => {
    void loadThreads()
  }, [loadThreads])

  // Leads tab → "Email selected" / row Email button.
  useEffect(() => {
    if (!initialRecipientIds) return
    setRecipientIds(initialRecipientIds.filter((id) => isValidEmail(leadById.get(id)?.contact_email)))
    setResults(null)
    setView({ mode: 'compose' })
    onInitialRecipientsConsumed()
  }, [initialRecipientIds, leadById, onInitialRecipientsConsumed])

  const openThread = useCallback(async (thread: SalesEmailThread) => {
    setView({ mode: 'thread', threadId: thread.id })
    setReplyBody('')
    setLoadingMessages(true)
    try {
      setMessages(await listSalesEmailMessages(thread.id))
      if (thread.unread || (activity?.byThread.get(thread.id)?.unread ?? 0) > 0) {
        await markSalesThreadRead(thread.id)
        setThreads((prev) => prev.map((t) => (t.id === thread.id ? { ...t, unread: false } : t)))
        onActivityChanged()
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not load conversation', 'error')
    } finally {
      setLoadingMessages(false)
    }
  }, [showToast, activity, onActivityChanged])

  useEffect(() => {
    if (!openThreadId || threads.length === 0) return
    const thread = threads.find((t) => t.id === openThreadId)
    if (thread) void openThread(thread)
    onOpenThreadConsumed()
  }, [openThreadId, threads, openThread, onOpenThreadConsumed])

  const filteredThreads = useMemo(() => {
    const q = threadSearch.trim().toLowerCase()
    return threads.filter((t) => {
      if (threadFilter === 'replies' && t.last_direction !== 'inbound') return false
      if (threadFilter === 'unread' && !t.unread) return false
      if (!q) return true
      return (
        t.to_address.toLowerCase().includes(q) ||
        (t.company_name ?? '').toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q)
      )
    })
  }, [threads, threadSearch, threadFilter])

  const activeThread =
    view.mode === 'thread' ? threads.find((t) => t.id === view.threadId) ?? null : null
  const activeLead = activeThread?.lead_id ? leadById.get(activeThread.lead_id) ?? null : null

  /* Composer helpers */
  const recipients = recipientIds
    .map((id) => leadById.get(id))
    .filter((l): l is SalesLead => Boolean(l))
  const previewLead = recipients[0] ?? null

  const addRecipients = (ids: string[]) =>
    setRecipientIds((prev) => [...prev, ...ids.filter((id) => !prev.includes(id))])

  const pickerMatches = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase()
    if (!q) return []
    return emailableLeads
      .filter((l) => !recipientIds.includes(l.id))
      .filter(
        (l) =>
          (l.company_name ?? '').toLowerCase().includes(q) ||
          (l.contact_email ?? '').toLowerCase().includes(q) ||
          l.mc_digits.includes(q) ||
          String(l.dot_number ?? '').includes(q)
      )
      .slice(0, 6)
  }, [pickerQuery, emailableLeads, recipientIds])

  const gradeCandidates = (grade: SalesChaseGrade) =>
    emailableLeads.filter(
      (l) =>
        l.chase_grade === grade &&
        !recipientIds.includes(l.id) &&
        !(skipEmailed && emailedAddresses.has((l.contact_email ?? '').toLowerCase()))
    )

  const applyTemplate = (id: string) => {
    const template = SALES_EMAIL_TEMPLATES.find((t) => t.id === id)
    if (!template) return
    setTemplateId(id)
    setSubject(template.subject)
    setBody(template.body)
  }

  const insertField = (key: string) => setBody((prev) => `${prev}{{${key}}}`)

  const startCompose = () => {
    setRecipientIds([])
    setResults(null)
    setView({ mode: 'compose' })
  }

  // Without the storage tables, sends would go out but never be saved — block until migrated.
  const storageMissing = Boolean(loadError && /migration/i.test(loadError))

  const handleSend = async () => {
    if (sending || storageMissing || cc.invalid.length > 0 || recipients.length === 0 || !subject.trim() || !body.trim()) return
    if (
      recipients.length > 1 &&
      !window.confirm(`Send this email to ${recipients.length} carriers? Each gets their own copy.`)
    ) {
      return
    }
    setSending(true)
    setResults(null)
    setProgress({ done: 0, total: recipients.length })
    try {
      const summary = await sendSalesEmails({
        recipients: recipients.map((lead) => ({ lead, to: lead.contact_email ?? '' })),
        subject,
        body,
        sentBy,
        cc: cc.valid,
        onProgress: (done, total) => setProgress({ done, total }),
      })
      setResults(summary.results)
      showToast(
        summary.failed === 0
          ? `Sent ${summary.sent} email${summary.sent === 1 ? '' : 's'}`
          : `Sent ${summary.sent}, ${summary.failed} failed`,
        summary.sent === 0 ? 'error' : 'success'
      )
      if (summary.sent > 0) setRecipientIds(summary.results.filter((r) => !r.ok).map((r) => r.leadId!).filter(Boolean))
      await loadThreads()
      onLeadsChanged()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Send failed', 'error')
    } finally {
      setSending(false)
      setProgress(null)
    }
  }

  const handleReply = async () => {
    if (!activeThread || !replyBody.trim() || replying || storageMissing || cc.invalid.length > 0) return
    setReplying(true)
    try {
      const baseSubject = activeThread.subject.replace(/^(re:\s*)+/i, '')
      const summary = await sendSalesEmails({
        recipients: [{ lead: activeLead, to: activeThread.to_address }],
        subject: `Re: ${baseSubject}`,
        body: replyBody,
        sentBy,
        cc: cc.valid,
      })
      if (summary.sent === 1) {
        showToast('Reply sent', 'success')
        setReplyBody('')
      } else {
        showToast(summary.results[0]?.error ?? 'Reply failed', 'error')
      }
      setMessages(await listSalesEmailMessages(activeThread.id))
      await loadThreads()
      onLeadsChanged()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Reply failed', 'error')
    } finally {
      setReplying(false)
    }
  }

  const failedResults = results?.filter((r) => !r.ok) ?? []
  const sentResults = results?.filter((r) => r.ok) ?? []

  return (
    <div className={`sl-mail sl-card${view.mode !== 'empty' ? ' has-detail' : ''}`}>
      {/* Conversation list */}
      <aside className="sl-mail__list">
        <div className="sl-mail__list-head">
          <button type="button" className="sl-btn sl-btn--primary sl-btn--block" onClick={startCompose}>
            <PenSquare size={16} aria-hidden />
            New email
          </button>
          <div className="sl-search">
            <Search size={15} aria-hidden />
            <input
              type="search"
              value={threadSearch}
              onChange={(e) => setThreadSearch(e.target.value)}
              placeholder="Search emails"
              aria-label="Search emails"
            />
          </div>
          <div className="sl-seg" role="group" aria-label="Filter conversations">
            {(
              [
                ['all', 'All'],
                ['replies', 'Replies'],
                ['unread', 'Unread'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`sl-seg__btn${threadFilter === key ? ' is-active' : ''}`}
                aria-pressed={threadFilter === key}
                onClick={() => setThreadFilter(key)}
              >
                {label}
                {key === 'unread' && threads.some((t) => t.unread) ? (
                  <span className="sl-seg__count">{threads.filter((t) => t.unread).length}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        <div className="sl-mail__threads">
          {loadingThreads && threads.length === 0 ? (
            <div className="sl-center">
              <Spinner />
            </div>
          ) : loadError ? (
            <div className="sl-mail__error">
              <AlertCircle size={18} aria-hidden />
              <p>{loadError}</p>
              <button type="button" className="sl-btn sl-btn--sm" onClick={() => void loadThreads()}>
                <RefreshCw size={14} aria-hidden />
                Retry
              </button>
            </div>
          ) : filteredThreads.length === 0 ? (
            <div className="sl-mail__none">
              <Inbox size={22} aria-hidden />
              <p>{threads.length === 0 ? 'No emails sent yet.' : 'No conversations match.'}</p>
            </div>
          ) : (
            <ul>
              {filteredThreads.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className={`sl-thread${activeThread?.id === t.id ? ' is-active' : ''}${t.unread ? ' is-unread' : ''}`}
                    onClick={() => void openThread(t)}
                  >
                    <span className="sl-thread__top">
                      <span className="sl-thread__name">{t.company_name || t.to_address}</span>
                      <span className="sl-thread__right">
                        {(activity?.byThread.get(t.id)?.unread ?? 0) > 0 ? (
                          <span className="sl-count" aria-label={`${activity?.byThread.get(t.id)?.unread} new`}>
                            {activity?.byThread.get(t.id)?.unread}
                          </span>
                        ) : null}
                        <span className="sl-thread__when">{formatWhen(t.last_message_at)}</span>
                      </span>
                    </span>
                    <span className="sl-thread__subject">{t.subject || '(no subject)'}</span>
                    <span className="sl-thread__meta">
                      {t.last_direction === 'inbound' ? (
                        <span className="sl-tag sl-tag--reply">Replied</span>
                      ) : (
                        <span className="sl-tag">Sent</span>
                      )}
                      <span className="sl-thread__addr">{t.to_address}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Detail */}
      <section className="sl-mail__detail">
        {view.mode === 'empty' ? (
          <div className="sl-mail__placeholder">
            <Mail size={28} aria-hidden />
            <h3>Email carriers</h3>
            <p>
              Send one email or a bulk email to many leads at once. Every email and reply is saved here.
            </p>
            <button type="button" className="sl-btn sl-btn--primary" onClick={startCompose}>
              <PenSquare size={16} aria-hidden />
              New email
            </button>
          </div>
        ) : view.mode === 'compose' ? (
          <div className="sl-compose">
            <header className="sl-detail-head">
              <button
                type="button"
                className="sl-icon-btn sl-mail__back"
                onClick={() => setView({ mode: 'empty' })}
                aria-label="Back to conversations"
              >
                <ArrowLeft size={16} />
              </button>
              <h3>New email</h3>
              <span className="sl-muted">
                {recipients.length} recipient{recipients.length === 1 ? '' : 's'}
              </span>
            </header>

            <div className="sl-compose__body">
              <div className="sl-field">
                <span className="sl-field__label">To</span>
                <div className="sl-recipients">
                  {recipients.map((lead) => (
                    <span key={lead.id} className="sl-chip" title={lead.contact_email ?? ''}>
                      <span className={`sl-grade sl-grade--${lead.chase_grade} sl-grade--xs`}>{lead.chase_grade}</span>
                      {leadLabel(lead)}
                      <button
                        type="button"
                        aria-label={`Remove ${leadLabel(lead)}`}
                        onClick={() => setRecipientIds((prev) => prev.filter((id) => id !== lead.id))}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  <div className="sl-picker">
                    <input
                      value={pickerQuery}
                      onChange={(e) => setPickerQuery(e.target.value)}
                      placeholder={recipients.length ? 'Add more…' : 'Search leads by company, email, MC or DOT'}
                      aria-label="Add recipient"
                    />
                    {pickerMatches.length > 0 ? (
                      <ul className="sl-picker__menu">
                        {pickerMatches.map((lead) => (
                          <li key={lead.id}>
                            <button
                              type="button"
                              onClick={() => {
                                addRecipients([lead.id])
                                setPickerQuery('')
                              }}
                            >
                              <span className={`sl-grade sl-grade--${lead.chase_grade} sl-grade--xs`}>{lead.chase_grade}</span>
                              <span className="sl-picker__name">{leadLabel(lead)}</span>
                              <span className="sl-picker__email">{lead.contact_email}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
                <div className="sl-quick">
                  <span className="sl-muted">Add by grade:</span>
                  {GRADES.map((grade) => {
                    const candidates = gradeCandidates(grade)
                    return (
                      <button
                        key={grade}
                        type="button"
                        className="sl-quick__btn"
                        disabled={candidates.length === 0}
                        onClick={() => addRecipients(candidates.map((l) => l.id))}
                      >
                        Grade {grade} · {candidates.length}
                      </button>
                    )
                  })}
                  <label className="sl-check">
                    <input
                      type="checkbox"
                      checked={skipEmailed}
                      onChange={(e) => setSkipEmailed(e.target.checked)}
                    />
                    Skip already emailed
                  </label>
                  {recipients.length > 0 ? (
                    <button type="button" className="sl-link" onClick={() => setRecipientIds([])}>
                      Clear all
                    </button>
                  ) : null}
                </div>
              </div>

              <label className="sl-field">
                <span className="sl-field__label">CC <span className="sl-optional">optional · copied on every email</span></span>
                <input
                  className={`sl-input${cc.invalid.length ? ' is-invalid' : ''}`}
                  value={ccText}
                  onChange={(e) => setCcText(e.target.value)}
                  placeholder="you@credyx.net, teammate@credyx.net"
                  aria-label="CC"
                />
                {cc.invalid.length ? (
                  <span className="sl-field__error">Not a valid email: {cc.invalid.join(', ')}</span>
                ) : null}
              </label>

              <div className="sl-field">
                <span className="sl-field__label">Template</span>
                <div className="sl-seg" role="group" aria-label="Template">
                  {SALES_EMAIL_TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`sl-seg__btn${templateId === t.id ? ' is-active' : ''}`}
                      onClick={() => applyTemplate(t.id)}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>

              <label className="sl-field">
                <span className="sl-field__label">Subject</span>
                <input
                  className="sl-input"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject"
                />
              </label>

              <div className="sl-field">
                <span className="sl-field__label">Message</span>
                <textarea
                  className="sl-input sl-textarea"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={11}
                  placeholder="Write your email…"
                />
                <div className="sl-quick">
                  <span className="sl-muted">Insert:</span>
                  {SALES_MERGE_FIELDS.map((f) => (
                    <button key={f.key} type="button" className="sl-quick__btn" onClick={() => insertField(f.key)}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {previewLead && (subject.trim() || body.trim()) ? (
                <div className="sl-preview">
                  <p className="sl-preview__label">Preview for {leadLabel(previewLead)}</p>
                  <p className="sl-preview__subject">{renderSalesTemplate(subject, previewLead)}</p>
                  <p className="sl-preview__body">{renderSalesTemplate(body, previewLead)}</p>
                </div>
              ) : null}

              {results ? (
                <div className={`sl-result${failedResults.length ? ' has-failures' : ''}`}>
                  <p>
                    <CheckCircle2 size={16} aria-hidden /> {sentResults.length} sent
                    {failedResults.length ? ` · ${failedResults.length} failed (kept as recipients so you can retry)` : ''}
                  </p>
                  {failedResults.slice(0, 5).map((r) => (
                    <p key={r.to} className="sl-result__fail">
                      {r.to}: {r.error}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>

            <footer className="sl-compose__foot">
              {progress ? (
                <div className="sl-progress" aria-live="polite">
                  <div className="sl-progress__bar">
                    <span style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} />
                  </div>
                  <span>
                    Sending {progress.done} of {progress.total}…
                  </span>
                </div>
              ) : storageMissing ? (
                <span className="sl-muted sl-warn-text">Sending is off until the sales email tables are added to Supabase.</span>
              ) : (
                <span className="sl-muted">Sent from system@credyx.net. Each carrier gets their own copy; replies come back here.</span>
              )}
              <button
                type="button"
                className="sl-btn sl-btn--primary"
                disabled={sending || storageMissing || cc.invalid.length > 0 || recipients.length === 0 || !subject.trim() || !body.trim()}
                onClick={() => void handleSend()}
              >
                <Send size={15} aria-hidden />
                {sending
                  ? 'Sending…'
                  : recipients.length > 1
                    ? `Send to ${recipients.length}`
                    : 'Send'}
              </button>
            </footer>
          </div>
        ) : (
          <div className="sl-convo">
            <header className="sl-detail-head">
              <button
                type="button"
                className="sl-icon-btn sl-mail__back"
                onClick={() => setView({ mode: 'empty' })}
                aria-label="Back to conversations"
              >
                <ArrowLeft size={16} />
              </button>
              {activeLead ? (
                <span className={`sl-grade sl-grade--${activeLead.chase_grade}`}>{activeLead.chase_grade}</span>
              ) : null}
              <div className="sl-detail-head__title">
                <h3>{activeThread?.company_name || activeThread?.to_address}</h3>
                <span className="sl-muted">{activeThread?.to_address}</span>
              </div>
            </header>

            <div className="sl-convo__messages">
              {loadingMessages ? (
                <div className="sl-center">
                  <Spinner />
                </div>
              ) : (
                messages.map((m) => (
                  <article
                    key={m.id}
                    className={`sl-msg sl-msg--${m.direction}${m.status === 'failed' ? ' is-failed' : ''}`}
                  >
                    <header className="sl-msg__head">
                      <span className="sl-msg__who">
                        {m.direction === 'inbound' ? activeThread?.company_name || m.from_address : `You${m.sent_by ? ` · ${m.sent_by}` : ''}`}
                      </span>
                      <span className="sl-msg__when">
                        {new Date(m.sent_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                    </header>
                    <p className="sl-msg__subject">{m.subject}</p>
                    {m.cc?.length ? <p className="sl-msg__cc">CC: {m.cc.join(', ')}</p> : null}
                    <p className="sl-msg__body">{m.body_text}</p>
                    {m.status === 'failed' ? (
                      <p className="sl-msg__error">
                        <AlertCircle size={13} aria-hidden /> Not delivered: {m.error}
                      </p>
                    ) : null}
                  </article>
                ))
              )}
            </div>

            <footer className="sl-convo__reply">
              <textarea
                className="sl-input sl-textarea"
                rows={3}
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder={`Reply to ${activeThread?.to_address ?? ''}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void handleReply()
                }}
              />
              <input
                className={`sl-input sl-input--sm${cc.invalid.length ? ' is-invalid' : ''}`}
                value={ccText}
                onChange={(e) => setCcText(e.target.value)}
                placeholder="CC (optional): you@credyx.net"
                aria-label="CC"
              />
              <div className="sl-convo__reply-actions">
                <span className="sl-muted">Ctrl + Enter to send</span>
                <button
                  type="button"
                  className="sl-btn sl-btn--primary"
                  disabled={replying || !replyBody.trim() || cc.invalid.length > 0}
                  onClick={() => void handleReply()}
                >
                  <Send size={15} aria-hidden />
                  {replying ? 'Sending…' : 'Send reply'}
                </button>
              </div>
            </footer>
          </div>
        )}
      </section>
    </div>
  )
}
