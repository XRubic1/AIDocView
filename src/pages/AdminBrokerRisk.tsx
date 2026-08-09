/**
 * Credyx Broker Risk — review queue for terms-aware rules analysis.
 * Full-viewport workspace (no page scroll): queue + detail + pinned actions.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  RefreshCw,
  ShieldAlert,
  StickyNote,
} from 'lucide-react'
import AdminLayout from '../components/AdminLayout'
import BrokerInternalNotesBanner from '../components/brokers/BrokerInternalNotesBanner'
import BrokerRiskAuditTimeline from '../components/brokers/BrokerRiskAuditTimeline'
import { useToast } from '../components/ui/ToastProvider'
import { hydrateAuditLogsFromSupabase } from '../services/supabase/hydrateStores'
import { useAuth } from '../context/AuthContext'
import { getAdminUserDisplayName } from '../config/adminNav'
import { mockBrokers } from '../data/mockBrokers'
import { findBrokerByName } from '../utils/brokerResolve'
import { mockInvoices } from '../data/mockInvoices'
import { useTenantDataRevision } from '../hooks/useTenantDataRevision'
import {
  clearBrokerRisk,
  listBrokerRiskForAdmin,
  publishBrokerRisk,
  saveBrokerRiskReviewNote,
} from '../services/brokerRiskService'
import { runNetworkBrokerRiskAnalysis } from '../services/runNetworkBrokerRiskAnalysis'
import { getClientById } from '../services/clientRegistry'
import type { BrokerRiskLevel, BrokerRiskProfile, BrokerRiskReviewStatus } from '../types/brokerRisk'
import type { Invoice } from '../types/invoice'
import { useClientTheme } from '../theme/ThemeContext'
import { formatCurrency, formatDate } from '../utils/format'
import { getBrokerNotes } from '../utils/clientBrokers'
import {
  classifyDelayCauses,
  delayCauseLabel,
  extractInvoiceNotesForRisk,
  buildBrokerIssueVerdict,
  isRoutineLifecycleNote,
  daysBetweenDates,
  addDaysIso,
  localDateIso,
  DEFAULT_BROKER_RISK_POLICY,
  type BrokerDelayCause,
} from '../utils/brokerRiskPolicy'
import { isOpenArInvoice } from '../utils/invoiceAging'
import '../styles/adminBrokerRisk.css'

type FilterTab = 'pending_review' | 'published' | 'cleared' | 'auto_published' | 'all'

const TABS: Array<{ id: FilterTab; label: string }> = [
  { id: 'pending_review', label: 'Needs review' },
  { id: 'published', label: 'Published' },
  { id: 'cleared', label: 'Cleared' },
  { id: 'auto_published', label: 'Auto' },
  { id: 'all', label: 'All' },
]

function levelLabel(level: string): string {
  if (level === 'low') return 'Low'
  if (level === 'high') return 'High'
  if (level === 'unrated') return 'Unrated'
  return 'Medium'
}

function statusLabel(status: BrokerRiskReviewStatus): string {
  if (status === 'pending_review') return 'Needs review'
  if (status === 'published') return 'Published'
  if (status === 'cleared') return 'Cleared'
  return 'Auto'
}

function causeChipClass(cause: BrokerDelayCause | undefined): string {
  if (cause === 'ppw_docs') return 'admin-broker-risk__cause admin-broker-risk__cause--ppw'
  if (cause === 'broker_slow_pay') return 'admin-broker-risk__cause admin-broker-risk__cause--pay'
  if (cause === 'dispute') return 'admin-broker-risk__cause admin-broker-risk__cause--dispute'
  if (cause === 'mixed') return 'admin-broker-risk__cause admin-broker-risk__cause--mixed'
  return 'admin-broker-risk__cause'
}

function verdictClass(code: string): string {
  return `admin-broker-risk__verdict admin-broker-risk__verdict--${code}`
}

const RATE_PRESETS: Array<{
  id: string
  label: string
  kind: 'publish' | 'clear'
  level?: BrokerRiskLevel
  note: string
}> = [
  {
    id: 'pub-med',
    label: 'Rate Medium',
    kind: 'publish',
    level: 'medium',
    note: 'Credyx review: broker payment delays beyond Net terms — publish Medium risk.',
  },
  {
    id: 'pub-high',
    label: 'Rate High',
    kind: 'publish',
    level: 'high',
    note: 'Credyx review: repeated / severe broker payment delays — publish High risk.',
  },
  {
    id: 'clear-ppw',
    label: 'Clear — docs / PPW',
    kind: 'clear',
    note: 'Cleared: delay explained by PPW / paperwork / missing docs — not broker slow pay.',
  },
  {
    id: 'clear-ok',
    label: 'Clear — not risky',
    kind: 'clear',
    note: 'Cleared: timing is within expected Net terms / not a broker risk signal.',
  },
]

export default function AdminBrokerRisk() {
  const c = useClientTheme()
  const { showToast } = useToast()
  const { resolved } = useAuth()
  const reviewer = getAdminUserDisplayName(resolved.user?.email ?? null)
  const tenantRevision = useTenantDataRevision()

  const [tab, setTab] = useState<FilterTab>('pending_review')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)
  const [notesOnly, setNotesOnly] = useState(false)
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null)

  const tabCounts = useMemo(() => {
    void tenantRevision
    void tick
    const all = listBrokerRiskForAdmin({ reviewStatus: 'all' })
    return {
      pending_review: all.filter((p) => p.review_status === 'pending_review').length,
      published: all.filter((p) => p.review_status === 'published').length,
      cleared: all.filter((p) => p.review_status === 'cleared').length,
      auto_published: all.filter((p) => p.review_status === 'auto_published').length,
      all: all.length,
    }
  }, [tenantRevision, tick])

  const rows = useMemo(() => {
    void tenantRevision
    void tick
    const filter =
      tab === 'all' ? { reviewStatus: 'all' as const } : { reviewStatus: tab }
    return listBrokerRiskForAdmin(filter).sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2, unrated: 3 }
      const ra = rank[a.computed_risk_level] ?? 9
      const rb = rank[b.computed_risk_level] ?? 9
      if (ra !== rb) return ra - rb
      return Date.parse(b.analyzed_at) - Date.parse(a.analyzed_at)
    })
  }, [tab, tenantRevision, tick])

  const selected: BrokerRiskProfile | null =
    rows.find((r) => r.id === selectedId) ?? rows[0] ?? null

  /** Catalog broker — resolve by id, then name slug used by risk profiles. */
  const broker = useMemo(() => {
    if (!selected) return undefined
    const byId = mockBrokers.find((b) => b.id === selected.broker_id)
    if (byId) return byId
    if (selected.broker_id.startsWith('broker-name-')) {
      const slugName = selected.broker_id
        .replace(/^broker-name-/, '')
        .replace(/-/g, ' ')
      return findBrokerByName(slugName)
    }
    return undefined
  }, [selected, tick, tenantRevision])
  const client = selected ? getClientById(selected.client_id) : undefined

  // Prefill review note when switching brokers (published / cleared / pending).
  useEffect(() => {
    setReviewNote(selected?.review_note?.trim() ?? '')
  }, [selected?.id, selected?.review_note])

  // Keep risk audit timeline in sync with Supabase.
  useEffect(() => {
    void hydrateAuditLogsFromSupabase()
      .then(() => setTick((t) => t + 1))
      .catch(console.error)
  }, [selected?.id])

  const brokerInvoices = useMemo((): Invoice[] => {
    if (!selected) return []
    void tick
    return mockInvoices
      .filter(
        (inv) =>
          inv.client_id === selected.client_id &&
          (inv.broker_id === selected.broker_id ||
            inv.broker_name === broker?.name ||
            (!broker && inv.broker_id === selected.broker_id))
      )
      .sort((a, b) => Date.parse(b.invoice_date) - Date.parse(a.invoice_date))
  }, [selected, broker?.name, tick])

  const liveCauses = useMemo(() => {
    if (!selected) return null
    void tick
    const carrierNotes = getBrokerNotes(selected.client_id, selected.broker_id)
    const invoiceNotes = extractInvoiceNotesForRisk(brokerInvoices)
    return classifyDelayCauses(carrierNotes, broker?.notes, invoiceNotes)
  }, [selected, broker?.notes, brokerInvoices, tick])

  const verdict = useMemo(() => {
    if (!selected || !liveCauses) return null
    return buildBrokerIssueVerdict({
      computedLevel: selected.computed_risk_level,
      delayCauses: liveCauses,
      latePaymentCount: selected.metrics.late_payment_count,
      openPastTerms: selected.metrics.open_overdue_past_terms,
      suggestClearAsPpw: selected.metrics.suggest_clear_as_ppw,
    })
  }, [selected, liveCauses])

  const visibleInvoices = useMemo(() => {
    const filtered = !notesOnly
      ? brokerInvoices
      : brokerInvoices.filter((inv) => {
          const problemNotes = (inv.notes_history ?? []).some(
            (n) => n.note?.trim() && !isRoutineLifecycleNote(n.note)
          )
          return (
            problemNotes ||
            (Boolean(inv.notes?.trim()) && !isRoutineLifecycleNote(inv.notes ?? '')) ||
            Boolean(inv.hold_reason?.trim()) ||
            inv.collection_status === 'W/P'
          )
        })

    const net =
      selected?.metrics.payment_terms_days ??
      broker?.payment_terms_days ??
      DEFAULT_BROKER_RISK_POLICY.fallback_terms_days
    const asOf = localDateIso()

    // Past-terms / urgent open invoices first so reviewers see them immediately.
    return [...filtered].sort((a, b) => {
      const pastDays = (inv: Invoice) => {
        if (!isOpenArInvoice(inv)) return -1
        const submitted = (inv.created_at || inv.invoice_date || asOf).slice(0, 10)
        const age = Math.max(0, daysBetweenDates(submitted, asOf))
        return Math.max(0, age - net)
      }
      const pastA = pastDays(a)
      const pastB = pastDays(b)
      const score = (past: number) =>
        past >= DEFAULT_BROKER_RISK_POLICY.high_single_late_days
          ? 2
          : past >= DEFAULT_BROKER_RISK_POLICY.open_overdue_min_days
            ? 1
            : 0
      const sa = score(pastA)
      const sb = score(pastB)
      if (sa !== sb) return sb - sa
      if (pastA !== pastB) return pastB - pastA
      return Date.parse(b.invoice_date) - Date.parse(a.invoice_date)
    })
  }, [
    brokerInvoices,
    notesOnly,
    selected?.metrics.payment_terms_days,
    broker?.payment_terms_days,
  ])

  /** Broker Net terms used for past-due / age labels. */
  const netTermsDays =
    selected?.metrics.payment_terms_days ??
    broker?.payment_terms_days ??
    DEFAULT_BROKER_RISK_POLICY.fallback_terms_days

  /**
   * Age + past due share one clock: submit → +Net terms → due.
   * Example Net 30, submitted 32d ago → Age 32d, Past due 2d (never past due > age).
   */
  function invoiceTermsMeta(inv: Invoice) {
    const asOf = localDateIso()
    const submitted = (inv.created_at || inv.invoice_date || asOf).slice(0, 10)
    const ageEnd =
      inv.status === 'paid'
        ? (inv.updated_at || inv.created_at || asOf).slice(0, 10)
        : asOf
    const ageDays = Math.max(0, daysBetweenDates(submitted, ageEnd))
    const due = addDaysIso(submitted, netTermsDays)
    const daysPastDue = Math.max(0, ageDays - netTermsDays)
    const isOpen = isOpenArInvoice(inv)
    const pastTermsReview =
      isOpen && daysPastDue >= DEFAULT_BROKER_RISK_POLICY.open_overdue_min_days
    const pastTermsUrgent =
      isOpen && daysPastDue >= DEFAULT_BROKER_RISK_POLICY.high_single_late_days
    return {
      ageDays,
      submitted,
      due,
      daysPastDue,
      isOpen,
      pastTermsReview,
      pastTermsUrgent,
    }
  }

  const handleRunAnalysis = () => {
    setBusy(true)
    try {
      const result = runNetworkBrokerRiskAnalysis(true)
      setTick((t) => t + 1)
      showToast(
        `Analyzed ${result.profiles} broker profiles · ${result.pendingReview} need review`,
        'success'
      )
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Analysis failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handlePublish = async (level: BrokerRiskLevel, note?: string) => {
    if (!selected) return
    const finalNote = (note ?? reviewNote).trim()
    try {
      const updated = await publishBrokerRisk({
        clientId: selected.client_id,
        brokerId: selected.broker_id,
        riskLevel: level,
        reviewNote: finalNote || undefined,
        reviewedBy: reviewer,
      })
      if (!updated) {
        showToast('Could not publish risk profile', 'error')
        return
      }
      setReviewNote('')
      setTab('published')
      setSelectedId(updated.id)
      setTick((t) => t + 1)
      showToast(`Published ${levelLabel(level)} risk to carrier`, 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Publish failed to save', 'error')
    }
  }

  const handleClear = async (note?: string) => {
    if (!selected) return
    const finalNote =
      (note ?? reviewNote).trim() ||
      'Cleared after Credyx review — not treated as broker risk.'
    try {
      const updated = await clearBrokerRisk({
        clientId: selected.client_id,
        brokerId: selected.broker_id,
        reviewNote: finalNote,
        reviewedBy: reviewer,
      })
      if (!updated) {
        showToast('Could not clear risk profile', 'error')
        return
      }
      setReviewNote('')
      setTab('cleared')
      setSelectedId(updated.id)
      setTick((t) => t + 1)
      showToast('Removed from risk — carrier no longer sees elevated risk', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Clear failed to save', 'error')
    }
  }

  const applyPreset = (preset: (typeof RATE_PRESETS)[number]) => {
    setReviewNote(preset.note)
    if (preset.kind === 'publish' && preset.level) {
      void handlePublish(preset.level, preset.note)
    } else {
      void handleClear(preset.note)
    }
  }

  /** Save note only — keeps Published / Cleared / Auto status as-is. */
  const handleSaveNote = async () => {
    if (!selected) return
    const note = reviewNote.trim()
    if (!note) {
      showToast('Enter a note first', 'error')
      return
    }
    try {
      const updated = await saveBrokerRiskReviewNote({
        clientId: selected.client_id,
        brokerId: selected.broker_id,
        reviewNote: note,
        reviewedBy: reviewer,
      })
      if (!updated) {
        showToast('Could not save note', 'error')
        return
      }
      setSelectedId(updated.id)
      setTick((t) => t + 1)
      showToast('Note saved', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save note', 'error')
    }
  }

  const isUrgent =
    selected?.review_status === 'pending_review' &&
    selected?.computed_risk_level === 'high'

  return (
    <AdminLayout flushMain>
      <div className="admin-broker-risk" style={{ ['--abr-primary' as string]: c.primary }}>
        <header className="admin-broker-risk__top">
          <div className="admin-broker-risk__heading">
            <ShieldAlert className="admin-broker-risk__title-icon" style={{ color: c.warning }} />
            <div>
              <h1 style={{ color: c.primary }}>Broker Risk</h1>
              <p style={{ color: c.secondary }}>
                Review at 15d past Net · Urgent at 21d
              </p>
            </div>
          </div>

          <div className="admin-broker-risk__top-right">
            <div className="admin-broker-risk__tabs" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className={`admin-broker-risk__tab${tab === t.id ? ' is-active' : ''}`}
                  onClick={() => {
                    setTab(t.id)
                    setSelectedId(null)
                  }}
                >
                  {t.label}
                  <span className="admin-broker-risk__tab-count">{tabCounts[t.id]}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="admin-broker-risk__run-btn"
              onClick={handleRunAnalysis}
              disabled={busy}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
              Run analysis
            </button>
          </div>
        </header>

        <div className="admin-broker-risk__workspace">
          <section className="admin-broker-risk__queue" aria-label="Broker queue">
            {rows.length === 0 ? (
              <p className="admin-broker-risk__empty" style={{ color: c.secondary }}>
                Nothing in this filter. Run analysis to refresh.
              </p>
            ) : (
              <ul className="admin-broker-risk__queue-list">
                {rows.map((row) => {
                  const b = mockBrokers.find((x) => x.id === row.broker_id)
                  const cl = getClientById(row.client_id)
                  const active = selected?.id === row.id
                  const urgent =
                    row.review_status === 'pending_review' &&
                    row.computed_risk_level === 'high'
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        className={`admin-broker-risk__row${active ? ' is-active' : ''}${
                          urgent ? ' is-urgent' : ''
                        }`}
                        onClick={() => {
                          setSelectedId(row.id)
                          setNotesOnly(false)
                          setExpandedInvoiceId(null)
                        }}
                      >
                        <div className="admin-broker-risk__row-main">
                          <span className="admin-broker-risk__row-name" style={{ color: c.primary }}>
                            {b?.name ?? row.broker_id}
                          </span>
                          <span className="admin-broker-risk__row-chips">
                            {urgent ? (
                              <span className="admin-broker-risk__chip admin-broker-risk__chip--urgent">
                                Urgent
                              </span>
                            ) : (
                              <span
                                className={`admin-broker-risk__chip admin-broker-risk__chip--${row.computed_risk_level}`}
                              >
                                {levelLabel(row.computed_risk_level)}
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="admin-broker-risk__row-meta" style={{ color: c.secondary }}>
                          {cl?.name ?? row.client_id}
                          {row.metrics.payment_terms_days != null
                            ? ` · Net ${row.metrics.payment_terms_days}`
                            : ''}
                          {row.metrics.max_days_past_terms != null
                            ? ` · ${row.metrics.max_days_past_terms}d late`
                            : ''}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <aside className="admin-broker-risk__panel" aria-label="Review detail">
            {!selected ? (
              <div className="admin-broker-risk__panel-empty" style={{ color: c.secondary }}>
                Select a broker to review.
              </div>
            ) : (
              <>
                <div className="admin-broker-risk__panel-head">
                  <div className="admin-broker-risk__panel-title">
                    <h2 style={{ color: c.primary }}>
                      {broker?.name ?? selected.broker_id}
                    </h2>
                    <p style={{ color: c.secondary }}>
                      {client?.name ?? selected.client_id}
                      {selected.mc_number ? ` · ${selected.mc_number}` : ''}
                      {selected.metrics.payment_terms_days != null
                        ? ` · Net ${selected.metrics.payment_terms_days}`
                        : ''}
                      {' · '}
                      {statusLabel(selected.review_status)}
                    </p>
                  </div>
                  <div className="admin-broker-risk__panel-badges">
                    <span
                      className={`admin-broker-risk__chip admin-broker-risk__chip--${selected.computed_risk_level}`}
                    >
                      {levelLabel(selected.computed_risk_level)}
                    </span>
                    {isUrgent ? (
                      <span className="admin-broker-risk__chip admin-broker-risk__chip--urgent">
                        Urgent
                      </span>
                    ) : null}
                  </div>
                </div>

                <BrokerInternalNotesBanner
                  brokerId={broker?.id ?? selected.broker_id}
                  brokerName={
                    broker?.name ??
                    (selected.broker_id.startsWith('broker-name-')
                      ? selected.broker_id
                          .replace(/^broker-name-/, '')
                          .replace(/-/g, ' ')
                      : undefined)
                  }
                  editable
                  onSaved={() => setTick((t) => t + 1)}
                  topActions={
                    <BrokerRiskAuditTimeline
                      brokerId={broker?.id ?? selected.broker_id}
                      brokerName={broker?.name ?? selected.broker_id}
                      clientId={selected.client_id}
                      profile={selected}
                      refreshKey={tick}
                      asButton
                    />
                  }
                />

                {verdict && (
                  <div className={verdictClass(verdict.code)} role="status">
                    <p className="admin-broker-risk__verdict-title">{verdict.title}</p>
                    <p className="admin-broker-risk__verdict-action">{verdict.action}</p>
                  </div>
                )}

                <div className="admin-broker-risk__facts">
                  <div>
                    <span>Carrier sees</span>
                    <strong>{levelLabel(selected.risk_level)}</strong>
                  </div>
                  <div>
                    <span>Late payments</span>
                    <strong>
                      {selected.metrics.late_payment_count}
                      {selected.metrics.max_days_past_terms != null
                        ? ` · worst ${selected.metrics.max_days_past_terms}d`
                        : ''}
                    </strong>
                  </div>
                  <div>
                    <span>Open past terms</span>
                    <strong>
                      {selected.metrics.open_overdue_past_terms} ·{' '}
                      {formatCurrency(selected.metrics.overdue_amount)}
                    </strong>
                  </div>
                  <div>
                    <span>Confidence</span>
                    <strong className="capitalize">{selected.confidence}</strong>
                  </div>
                </div>

                <div className="admin-broker-risk__panel-body">
                  <div className="admin-broker-risk__col">
                    <p className="admin-broker-risk__section-label">
                      Problem notes
                      {liveCauses && liveCauses.primary !== 'none' ? (
                        <span className={causeChipClass(liveCauses.primary)}>
                          {delayCauseLabel(liveCauses.primary)}
                        </span>
                      ) : null}
                    </p>
                    {liveCauses && liveCauses.snippets.length > 0 ? (
                      <ul className="admin-broker-risk__snippet-list">
                        {liveCauses.snippets.slice(0, 6).map((s, i) => (
                          <li key={`${s.cause}-${i}`}>
                            <span
                              className={`admin-broker-risk__snip-tag admin-broker-risk__snip-tag--${s.cause}`}
                            >
                              {s.cause === 'ppw_docs'
                                ? 'Docs'
                                : s.cause === 'broker_slow_pay'
                                  ? 'Broker'
                                  : 'Dispute'}
                            </span>
                            <span>
                              {s.invoice_number ? `#${s.invoice_number} · ` : ''}
                              {s.text}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="admin-broker-risk__muted" style={{ color: c.mutedLight }}>
                        No problem notes (routine PPW notes hidden).
                      </p>
                    )}
                  </div>

                  <div className="admin-broker-risk__col">
                    <div className="admin-broker-risk__invoices-head">
                      <p className="admin-broker-risk__section-label">
                        <FileText className="w-3.5 h-3.5" />
                        Invoices ({visibleInvoices.length})
                        <span className="admin-broker-risk__terms-pill">
                          Net {netTermsDays}
                        </span>
                      </p>
                      <button
                        type="button"
                        className={`admin-broker-risk__notes-toggle${notesOnly ? ' is-on' : ''}`}
                        onClick={() => {
                          setNotesOnly((v) => !v)
                          setExpandedInvoiceId(null)
                        }}
                      >
                        <StickyNote className="w-3 h-3" />
                        {notesOnly ? 'All' : 'Notes'}
                      </button>
                    </div>
                    {visibleInvoices.length === 0 ? (
                      <p className="admin-broker-risk__muted" style={{ color: c.mutedLight }}>
                        {notesOnly ? 'No invoices with problem notes.' : 'No invoices.'}
                      </p>
                    ) : (
                      <ul className="admin-broker-risk__invoice-list">
                        <li className="admin-broker-risk__invoice-cols" aria-hidden>
                          <span>Invoice</span>
                          <span>Amount</span>
                          <span>Status</span>
                          <span title="Days since submitted to Credyx">Age</span>
                          <span title="Days past submit + Net terms (Age − Net)">Past due</span>
                          <span>Notes</span>
                        </li>
                        {visibleInvoices.slice(0, 12).map((inv) => {
                          const history = inv.notes_history ?? []
                          const problemHistory = history.filter(
                            (n) => n.note?.trim() && !isRoutineLifecycleNote(n.note)
                          )
                          const showNotes = notesOnly ? problemHistory : history
                          const noteCount =
                            (notesOnly ? problemHistory.length : history.length) +
                            (inv.hold_reason?.trim() ? 1 : 0) +
                            (inv.collection_status === 'W/P' ? 1 : 0)
                          const open = expandedInvoiceId === inv.id
                          const meta = invoiceTermsMeta(inv)
                          const statusLabel =
                            inv.collection_status === 'W/P'
                              ? `${inv.status} · W/P`
                              : inv.status
                          return (
                            <li
                              key={inv.id}
                              className={`admin-broker-risk__invoice-row${
                                meta.pastTermsUrgent
                                  ? ' is-urgent-past'
                                  : meta.pastTermsReview
                                    ? ' is-past-terms'
                                    : ''
                              }${open ? ' is-open' : ''}`}
                            >
                              <button
                                type="button"
                                className="admin-broker-risk__invoice-btn"
                                onClick={() =>
                                  setExpandedInvoiceId((id) => (id === inv.id ? null : inv.id))
                                }
                              >
                                <span
                                  className="admin-broker-risk__inv-num"
                                  style={{ color: c.primary }}
                                >
                                  #{inv.invoice_number}
                                </span>
                                <span className="admin-broker-risk__inv-amt tabular-nums">
                                  {formatCurrency(inv.amount)}
                                </span>
                                <span
                                  className="admin-broker-risk__inv-status"
                                  style={{ color: c.secondary }}
                                >
                                  {statusLabel}
                                </span>
                                <span className="admin-broker-risk__inv-age tabular-nums">
                                  {meta.ageDays}d
                                </span>
                                <span className="admin-broker-risk__inv-past">
                                  {meta.isOpen && meta.daysPastDue > 0 ? (
                                    <span
                                      className={`admin-broker-risk__past-badge${
                                        meta.pastTermsUrgent
                                          ? ' admin-broker-risk__past-badge--urgent'
                                          : meta.pastTermsReview
                                            ? ''
                                            : ' admin-broker-risk__past-badge--soft'
                                      }`}
                                    >
                                      {meta.daysPastDue}d
                                    </span>
                                  ) : (
                                    <span className="admin-broker-risk__inv-dash">—</span>
                                  )}
                                </span>
                                <span className="admin-broker-risk__note-count tabular-nums">
                                  {noteCount || '—'}
                                </span>
                              </button>
                              {open && (
                                <ul className="admin-broker-risk__invoice-notes">
                                  {inv.collection_status === 'W/P' && (
                                    <li>
                                      <strong>Will Pay</strong>
                                      {inv.collection_date
                                        ? ` · ${formatDate(inv.collection_date)}`
                                        : ''}
                                    </li>
                                  )}
                                  {inv.hold_reason?.trim() && (
                                    <li>
                                      <strong>Hold:</strong> {inv.hold_reason}
                                    </li>
                                  )}
                                  {showNotes.map((n) => (
                                    <li key={n.id}>
                                      <span className="admin-broker-risk__note-meta">
                                        {n.created_by || 'Credyx'} · {formatDate(n.created_at)}
                                      </span>
                                      <div>{n.note}</div>
                                    </li>
                                  ))}
                                  {noteCount === 0 && (
                                    <li style={{ color: c.mutedLight }}>No notes.</li>
                                  )}
                                </ul>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                </div>

                <footer className="admin-broker-risk__actions">
                  {selected.review_status === 'pending_review' && (
                    <>
                      <div className="admin-broker-risk__presets">
                        {RATE_PRESETS.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            className={`admin-broker-risk__preset admin-broker-risk__preset--${preset.kind}${
                              preset.id === 'clear-ppw' &&
                              (selected.metrics.suggest_clear_as_ppw ||
                                verdict?.code === 'docs_issue')
                                ? ' is-suggested'
                                : ''
                            }${
                              preset.id === 'pub-med' &&
                              verdict?.code === 'broker_issue' &&
                              selected.computed_risk_level === 'medium'
                                ? ' is-suggested'
                                : ''
                            }${
                              preset.id === 'pub-high' &&
                              verdict?.code === 'broker_issue' &&
                              selected.computed_risk_level === 'high'
                                ? ' is-suggested'
                                : ''
                            }`}
                            onClick={() => applyPreset(preset)}
                          >
                            {preset.kind === 'publish' ? (
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            )}
                            {preset.label}
                          </button>
                        ))}
                      </div>
                      <div className="admin-broker-risk__custom-row">
                        <input
                          type="text"
                          value={reviewNote}
                          onChange={(e) => setReviewNote(e.target.value)}
                          placeholder="Optional custom note…"
                          className="admin-broker-risk__note-input"
                        />
                        <button
                          type="button"
                          className="admin-broker-risk__btn admin-broker-risk__btn--publish"
                          onClick={() =>
                            void handlePublish(
                              selected.computed_risk_level === 'high' ? 'high' : 'medium',
                              reviewNote || undefined
                            )
                          }
                        >
                          Publish
                        </button>
                        <button
                          type="button"
                          className="admin-broker-risk__btn admin-broker-risk__btn--clear"
                          onClick={() => void handleClear(reviewNote || undefined)}
                        >
                          Clear
                        </button>
                      </div>
                    </>
                  )}

                  {selected.review_status === 'published' && (
                    <>
                      <div className="admin-broker-risk__custom-row">
                        <p className="admin-broker-risk__status-line" style={{ color: c.secondary }}>
                          Carrier sees {levelLabel(selected.risk_level)} — add a note anytime
                        </p>
                      </div>
                      <div className="admin-broker-risk__custom-row">
                        <input
                          type="text"
                          value={reviewNote}
                          onChange={(e) => setReviewNote(e.target.value)}
                          placeholder="Add or update review note…"
                          className="admin-broker-risk__note-input"
                        />
                        <button
                          type="button"
                          className="admin-broker-risk__btn admin-broker-risk__btn--note"
                          onClick={() => void handleSaveNote()}
                        >
                          <StickyNote className="w-3.5 h-3.5" />
                          Save note
                        </button>
                        <button
                          type="button"
                          className="admin-broker-risk__btn admin-broker-risk__btn--clear"
                          onClick={() =>
                            void handleClear(
                              reviewNote.trim() ||
                                'Removed from risk — Credyx cleared published broker risk for the carrier.'
                            )
                          }
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Remove risk
                        </button>
                        <button
                          type="button"
                          className="admin-broker-risk__btn admin-broker-risk__btn--publish"
                          onClick={() => void handlePublish('high', reviewNote || undefined)}
                        >
                          Set High
                        </button>
                      </div>
                    </>
                  )}

                  {selected.review_status === 'cleared' && (
                    <>
                      <div className="admin-broker-risk__custom-row">
                        <p className="admin-broker-risk__status-line" style={{ color: c.secondary }}>
                          Cleared (okay) — add a note anytime
                        </p>
                      </div>
                      <div className="admin-broker-risk__custom-row">
                        <input
                          type="text"
                          value={reviewNote}
                          onChange={(e) => setReviewNote(e.target.value)}
                          placeholder="Add or update review note…"
                          className="admin-broker-risk__note-input"
                        />
                        <button
                          type="button"
                          className="admin-broker-risk__btn admin-broker-risk__btn--note"
                          onClick={() => void handleSaveNote()}
                        >
                          <StickyNote className="w-3.5 h-3.5" />
                          Save note
                        </button>
                        <button
                          type="button"
                          className="admin-broker-risk__btn admin-broker-risk__btn--publish"
                          onClick={() =>
                            void handlePublish(
                              'medium',
                              reviewNote.trim() ||
                                'Re-published Medium risk after Credyx re-review.'
                            )
                          }
                        >
                          Re-publish Medium
                        </button>
                        <button
                          type="button"
                          className="admin-broker-risk__btn admin-broker-risk__btn--publish"
                          onClick={() =>
                            void handlePublish(
                              'high',
                              reviewNote.trim() ||
                                'Re-published High risk after Credyx re-review.'
                            )
                          }
                        >
                          Re-publish High
                        </button>
                      </div>
                    </>
                  )}

                  {selected.review_status === 'auto_published' && (
                    <>
                      <p className="admin-broker-risk__status-line" style={{ color: c.secondary }}>
                        Auto-published low (okay) — add a note anytime
                      </p>
                      <div className="admin-broker-risk__custom-row">
                        <input
                          type="text"
                          value={reviewNote}
                          onChange={(e) => setReviewNote(e.target.value)}
                          placeholder="Add or update review note…"
                          className="admin-broker-risk__note-input"
                        />
                        <button
                          type="button"
                          className="admin-broker-risk__btn admin-broker-risk__btn--note"
                          onClick={() => void handleSaveNote()}
                        >
                          <StickyNote className="w-3.5 h-3.5" />
                          Save note
                        </button>
                      </div>
                    </>
                  )}

                  {selected.reviewed_at && (
                    <p className="admin-broker-risk__reviewed" style={{ color: c.mutedLight }}>
                      Last review: {selected.reviewed_by} ·{' '}
                      {new Date(selected.reviewed_at).toLocaleString()}
                      {selected.review_note ? ` — ${selected.review_note}` : ''}
                    </p>
                  )}
                </footer>
              </>
            )}
          </aside>
        </div>
      </div>
    </AdminLayout>
  )
}
