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
import { mockPayments } from '../data/mockPayments'
import { useTenantDataRevision } from '../hooks/useTenantDataRevision'
import {
  clearBrokerRisk,
  listBrokerRiskForAdmin,
  publishBrokerRisk,
  saveBrokerRiskReviewNote,
} from '../services/brokerRiskService'
import { runNetworkBrokerRiskAnalysis } from '../services/runNetworkBrokerRiskAnalysis'
import AdminBrokerPaymentInsight from '../components/admin/AdminBrokerPaymentInsight'
import {
  groupAdminBrokerRiskProfiles,
  mergeAdminBrokerRiskMetrics,
} from '../utils/groupAdminBrokerRisk'
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
  BROKER_RISK_POLICY,
  type BrokerDelayCause,
} from '../utils/brokerRiskPolicy'
import { isOpenArInvoice } from '../utils/invoiceAging'
import {
  collectBrokerDisputes,
} from '../utils/brokerRiskDisputes'
import { classifyBrokerInvoicePayClocks } from '../utils/brokerInvoicePayClock'
import {
  buildBrokerPaymentTiming,
  formatPaymentTimingPublishNote,
} from '../utils/brokerPaymentTiming'
import {
  computeBrokerPaymentHistory,
  fillMonthSeries,
  formatBrokerMonthLabel,
} from '../utils/brokerPaymentHistory'
import '../styles/adminBrokerRisk.css'

/** Needs review first (urgent), then published / auto / cleared. */
function statusSortRank(status: BrokerRiskReviewStatus): number {
  if (status === 'pending_review') return 0
  if (status === 'published') return 1
  if (status === 'auto_published') return 2
  return 3
}

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

  const [selectedBrokerId, setSelectedBrokerId] = useState<string | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)
  const [notesOnly, setNotesOnly] = useState(false)
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null)
  const [workspace, setWorkspace] = useState<'review' | 'insight'>('review')

  const rows = useMemo(() => {
    void tenantRevision
    void tick
    const levelRank = { high: 0, medium: 1, low: 2, unrated: 3 }
    return listBrokerRiskForAdmin({ reviewStatus: 'all' }).sort((a, b) => {
      const sa = statusSortRank(a.review_status)
      const sb = statusSortRank(b.review_status)
      if (sa !== sb) return sa - sb
      const ra = levelRank[a.computed_risk_level] ?? 9
      const rb = levelRank[b.computed_risk_level] ?? 9
      if (ra !== rb) return ra - rb
      return Date.parse(b.analyzed_at) - Date.parse(a.analyzed_at)
    })
  }, [tenantRevision, tick])

  const groups = useMemo(() => groupAdminBrokerRiskProfiles(rows), [rows])

  const needsReviewCount = useMemo(
    () => groups.filter((g) => g.needsReviewCount > 0).length,
    [groups]
  )

  const selectedGroup =
    groups.find((g) => g.brokerId === selectedBrokerId) ?? groups[0] ?? null
  const selected: BrokerRiskProfile | null = selectedGroup?.representative ?? null

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
          inv.broker_id === selected.broker_id ||
          inv.broker_name === broker?.name ||
          (!broker && inv.broker_id === selected.broker_id)
      )
      .sort((a, b) => Date.parse(b.invoice_date) - Date.parse(a.invoice_date))
  }, [selected, broker?.name, tick])

  const brokerPayments = useMemo(() => {
    if (!selected || brokerInvoices.length === 0) return []
    void tick
    const ids = new Set(brokerInvoices.map((i) => i.id))
    return mockPayments.filter((p) => ids.has(p.invoice_id))
  }, [selected, brokerInvoices, tick])

  const brokerDisputes = useMemo(
    () => collectBrokerDisputes(brokerInvoices, brokerPayments),
    [brokerInvoices, brokerPayments]
  )

  const openBrokerDisputes = useMemo(
    () => brokerDisputes.filter((d) => d.isOpen),
    [brokerDisputes]
  )

  const payClocks = useMemo(
    () => classifyBrokerInvoicePayClocks(brokerInvoices, brokerPayments),
    [brokerInvoices, brokerPayments]
  )

  /** Net terms vs actual average payment — primary timing insight for review. */
  const paymentTiming = useMemo(() => {
    if (!selected) return null
    void tick
    // Prefer live confirmed payments for the selected broker when available.
    const liveAvg =
      brokerPayments.length > 0
        ? (() => {
            const invoiceById = new Map(brokerInvoices.map((i) => [i.id, i]))
            const days: number[] = []
            for (const p of brokerPayments) {
              if (p.status !== 'confirmed') continue
              const inv = invoiceById.get(p.invoice_id)
              if (!inv) continue
              if (payClocks.get(inv.id)?.paused) continue
              const from = (inv.invoice_date || '').slice(0, 10)
              const to = (p.received_date || '').slice(0, 10)
              if (!from || !to) continue
              days.push(daysBetweenDates(from, to))
            }
            if (days.length === 0) return null
            return {
              avg: Math.round(days.reduce((a, b) => a + b, 0) / days.length),
              sample: days.length,
            }
          })()
        : null

    return buildBrokerPaymentTiming({
      paymentTermsDays:
        selected.metrics.payment_terms_days ?? broker?.payment_terms_days ?? null,
      avgDaysInvoiceToPay:
        liveAvg?.avg ??
        selected.metrics.avg_days_invoice_to_pay ??
        selected.metrics.avg_days_to_pay,
      paidSampleSize:
        liveAvg?.sample ?? selected.metrics.paid_sample_size ?? null,
      fallbackTermsDays: BROKER_RISK_POLICY.fallback_terms_days,
    })
  }, [
    selected,
    broker?.payment_terms_days,
    brokerInvoices,
    brokerPayments,
    payClocks,
    tick,
  ])

  const paymentHistory = useMemo(() => {
    if (!selected) return null
    void tick
    return computeBrokerPaymentHistory(selected.broker_id, brokerPayments, brokerInvoices, {
      paymentTermsDays:
        selected.metrics.payment_terms_days ?? broker?.payment_terms_days ?? null,
      brokerName: broker?.name ?? null,
    })
  }, [selected, broker?.name, broker?.payment_terms_days, brokerInvoices, brokerPayments, tick])

  const historyMonths = useMemo(
    () => (paymentHistory ? fillMonthSeries(paymentHistory.months, 12) : []),
    [paymentHistory]
  )

  /** Carrier-visible published level — used to disable redundant Rate / Set High. */
  const publishedRiskLevel = selected?.risk_level
  const alreadyHigh =
    publishedRiskLevel === 'high' &&
    (selected?.review_status === 'published' ||
      selected?.review_status === 'pending_review')
  const alreadyMedium =
    publishedRiskLevel === 'medium' &&
    (selected?.review_status === 'published' ||
      selected?.review_status === 'pending_review')

  const liveCauses = useMemo(() => {
    if (!selected) return null
    void tick
    const carrierNotes = (selectedGroup?.profiles ?? []).flatMap((p) =>
      getBrokerNotes(p.client_id, p.broker_id)
    )
    const invoiceNotes = extractInvoiceNotesForRisk(brokerInvoices)
    // Fold structured disputes into problem notes (same list — no separate section).
    // Skip invoices that already have a dispute note so we don't double up.
    const coveredInvoices = new Set(
      invoiceNotes
        .filter((n) => /dispute/i.test(n.text))
        .map((n) => n.invoice_number)
        .filter(Boolean)
    )
    const disputeAsNotes = openBrokerDisputes
      .filter((d) => !coveredInvoices.has(d.invoiceNumber))
      .map((d) => ({
        text: `Dispute opened: ${d.reasonLabel} — ${d.description || d.reasonLabel}`,
        invoice_number: d.invoiceNumber,
        source: 'invoice' as const,
      }))
    return classifyDelayCauses(carrierNotes, broker?.notes, [
      ...invoiceNotes,
      ...disputeAsNotes,
    ])
  }, [selected, selectedGroup, broker?.notes, brokerInvoices, openBrokerDisputes, tick])

  const groupMetrics = useMemo(
    () => mergeAdminBrokerRiskMetrics(selectedGroup?.profiles ?? []),
    [selectedGroup]
  )

  const verdict = useMemo(() => {
    if (!selected || !liveCauses) return null
    return buildBrokerIssueVerdict({
      computedLevel: selected.computed_risk_level,
      delayCauses: liveCauses,
      latePaymentCount: groupMetrics.late_payment_count,
      openPastTerms: groupMetrics.open_overdue_past_terms,
      suggestClearAsPpw: groupMetrics.suggest_clear_as_ppw,
    })
  }, [selected, liveCauses, groupMetrics])

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
      BROKER_RISK_POLICY.fallback_terms_days
    const asOf = localDateIso()

    // Holds/disputes first (marked, not treated as broker late), then true past-terms.
    return [...filtered].sort((a, b) => {
      const pausedA = payClocks.get(a.id)?.paused ? 1 : 0
      const pausedB = payClocks.get(b.id)?.paused ? 1 : 0
      if (pausedA !== pausedB) return pausedB - pausedA
      const pastDays = (inv: Invoice) => {
        if (payClocks.get(inv.id)?.paused) return -1
        if (!isOpenArInvoice(inv)) return -1
        const submitted = (inv.created_at || inv.invoice_date || asOf).slice(0, 10)
        const age = Math.max(0, daysBetweenDates(submitted, asOf))
        return Math.max(0, age - net)
      }
      const pastA = pastDays(a)
      const pastB = pastDays(b)
      const score = (past: number) =>
        past >= BROKER_RISK_POLICY.high_single_late_days
          ? 2
          : past >= BROKER_RISK_POLICY.open_overdue_min_days
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
    payClocks,
  ])

  /** Broker Net terms used for past-due / age labels. */
  const netTermsDays =
    selected?.metrics.payment_terms_days ??
    broker?.payment_terms_days ??
    BROKER_RISK_POLICY.fallback_terms_days

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
      isOpen && daysPastDue >= BROKER_RISK_POLICY.open_overdue_min_days
    const pastTermsUrgent =
      isOpen && daysPastDue >= BROKER_RISK_POLICY.high_single_late_days
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

  const applyToSelectedBroker = async (
    fn: (profile: BrokerRiskProfile) => Promise<BrokerRiskProfile | null>
  ): Promise<boolean> => {
    const profiles = selectedGroup?.profiles ?? []
    if (profiles.length === 0) return false
    for (const profile of profiles) {
      const updated = await fn(profile)
      if (!updated) return false
    }
    return true
  }

  const handlePublish = async (level: BrokerRiskLevel, note?: string) => {
    if (!selected) return
    // Always push Net vs actual timing into the carrier-visible review note when missing.
    const timingLine = paymentTiming
      ? formatPaymentTimingPublishNote(paymentTiming)
      : null
    const typed = (note ?? reviewNote).trim()
    const finalNote =
      typed ||
      (timingLine
        ? timingLine
        : undefined)
    // If admin typed a custom note without timing, append timing so carriers still see it.
    const withTiming =
      finalNote && timingLine && !finalNote.includes('Average payment moved to')
        ? `${finalNote} ${timingLine}`
        : finalNote
    try {
      const ok = await applyToSelectedBroker((profile) =>
        publishBrokerRisk({
          clientId: profile.client_id,
          brokerId: profile.broker_id,
          riskLevel: level,
          reviewNote: withTiming || undefined,
          reviewedBy: reviewer,
        })
      )
      if (!ok) {
        showToast('Could not publish risk profile', 'error')
        return
      }
      setReviewNote('')
      setSelectedBrokerId(selected.broker_id)
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
      const ok = await applyToSelectedBroker((profile) =>
        clearBrokerRisk({
          clientId: profile.client_id,
          brokerId: profile.broker_id,
          reviewNote: finalNote,
          reviewedBy: reviewer,
        })
      )
      if (!ok) {
        showToast('Could not clear risk profile', 'error')
        return
      }
      setReviewNote('')
      setSelectedBrokerId(selected.broker_id)
      setTick((t) => t + 1)
      showToast('Removed from risk — carrier no longer sees elevated risk', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Clear failed to save', 'error')
    }
  }

  const applyPreset = (preset: (typeof RATE_PRESETS)[number]) => {
    const timingLine = paymentTiming
      ? formatPaymentTimingPublishNote(paymentTiming)
      : null
    const note =
      timingLine && preset.kind === 'publish'
        ? `${preset.note} ${timingLine}`
        : preset.note
    setReviewNote(note)
    if (preset.kind === 'publish' && preset.level) {
      void handlePublish(preset.level, note)
    } else {
      void handleClear(note)
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
      const ok = await applyToSelectedBroker((profile) =>
        saveBrokerRiskReviewNote({
          clientId: profile.client_id,
          brokerId: profile.broker_id,
          reviewNote: note,
          reviewedBy: reviewer,
        })
      )
      if (!ok) {
        showToast('Could not save note', 'error')
        return
      }
      setSelectedBrokerId(selected.broker_id)
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
                {workspace === 'insight'
                  ? 'Confirmed payments across all carriers, month by month'
                  : `Review at ${BROKER_RISK_POLICY.medium_single_late_days}d past Net · Urgent at ${BROKER_RISK_POLICY.high_single_late_days}d · updates as payments post`}
              </p>
            </div>
          </div>

          <div className="admin-broker-risk__top-right">
            <div className="admin-broker-risk__tabs" role="tablist" aria-label="Broker risk views">
              <button
                type="button"
                role="tab"
                aria-selected={workspace === 'review'}
                className={`admin-broker-risk__tab${workspace === 'review' ? ' is-on' : ''}`}
                onClick={() => setWorkspace('review')}
              >
                Review
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={workspace === 'insight'}
                className={`admin-broker-risk__tab${workspace === 'insight' ? ' is-on' : ''}`}
                onClick={() => setWorkspace('insight')}
              >
                Payment insight
              </button>
            </div>
            {workspace === 'review' ? (
              <>
            <p className="admin-broker-risk__queue-summary" style={{ color: c.secondary }}>
              {groups.length} broker{groups.length === 1 ? '' : 's'}
              {needsReviewCount > 0 ? ` · ${needsReviewCount} need review` : ''}
            </p>
            <button
              type="button"
              className="admin-broker-risk__run-btn"
              onClick={handleRunAnalysis}
              disabled={busy}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
              Run analysis
            </button>
              </>
            ) : (
              <p className="admin-broker-risk__queue-summary" style={{ color: c.secondary }}>
                {mockInvoices.length === 0
                  ? 'No invoice data yet'
                  : 'Live from posted payments'}
              </p>
            )}
          </div>
        </header>

        {workspace === 'insight' ? (
          <AdminBrokerPaymentInsight />
        ) : (
        <div className="admin-broker-risk__workspace">
          <section className="admin-broker-risk__queue" aria-label="Broker queue">
            {groups.length === 0 ? (
              <p className="admin-broker-risk__empty" style={{ color: c.secondary }}>
                No broker risk profiles yet. Run analysis to refresh.
              </p>
            ) : (
              <ul className="admin-broker-risk__queue-list">
                {groups.map((group) => {
                  const row = group.representative
                  const b = mockBrokers.find((x) => x.id === row.broker_id)
                  const active = selectedGroup?.brokerId === group.brokerId
                  const needsReview = group.needsReviewCount > 0
                  const urgent = needsReview && row.computed_risk_level === 'high'
                  return (
                    <li key={group.brokerId}>
                      <button
                        type="button"
                        className={`admin-broker-risk__row${active ? ' is-active' : ''}${
                          needsReview ? ' is-urgent' : ''
                        }`}
                        onClick={() => {
                          setSelectedBrokerId(group.brokerId)
                          setNotesOnly(false)
                          setExpandedInvoiceId(null)
                        }}
                      >
                        <div className="admin-broker-risk__row-main">
                          <span className="admin-broker-risk__row-name" style={{ color: c.primary }}>
                            {b?.name ?? row.broker_id}
                          </span>
                          <span className="admin-broker-risk__row-chips">
                            <span
                              className={`admin-broker-risk__chip admin-broker-risk__chip--status-${row.review_status}`}
                            >
                              {urgent ? 'Urgent review' : statusLabel(row.review_status)}
                            </span>
                            <span
                              className={`admin-broker-risk__chip admin-broker-risk__chip--${row.computed_risk_level}`}
                            >
                              {levelLabel(row.computed_risk_level)}
                            </span>
                          </span>
                        </div>
                        <div className="admin-broker-risk__row-meta" style={{ color: c.secondary }}>
                          {group.carrierCount} carrier{group.carrierCount === 1 ? '' : 's'}
                          {(() => {
                            const timing = buildBrokerPaymentTiming({
                              paymentTermsDays: row.metrics.payment_terms_days,
                              avgDaysInvoiceToPay:
                                row.metrics.avg_days_invoice_to_pay ??
                                row.metrics.avg_days_to_pay,
                              paidSampleSize: row.metrics.paid_sample_size ?? null,
                              fallbackTermsDays: BROKER_RISK_POLICY.fallback_terms_days,
                            })
                            if (timing) return ` · ${timing.shortLabel}`
                            return row.metrics.payment_terms_days != null
                              ? ` · Net ${row.metrics.payment_terms_days}`
                              : ''
                          })()}
                          {row.metrics.max_days_past_terms != null
                            ? ` · worst ${row.metrics.max_days_past_terms}d past`
                            : ''}
                          {(row.metrics.hold_count ?? 0) > 0 ||
                          (row.metrics.open_dispute_count ?? 0) > 0
                            ? ` · ${row.metrics.hold_count ?? 0} hold / ${row.metrics.open_dispute_count ?? 0} dispute`
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
                      {selected.mc_number ? `${selected.mc_number} · ` : ''}
                      {selectedGroup && selectedGroup.carrierCount > 1
                        ? `${selectedGroup.carrierCount} carriers · `
                        : ''}
                      {selected.metrics.payment_terms_days != null
                        ? `Net ${selected.metrics.payment_terms_days}`
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
                      clientId={undefined}
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

                {paymentTiming ? (
                  <div
                    className={`admin-broker-risk__timing admin-broker-risk__timing--${paymentTiming.severity}`}
                    role="status"
                  >
                    <p className="admin-broker-risk__timing-title">{paymentTiming.headline}</p>
                    <p className="admin-broker-risk__timing-summary">{paymentTiming.summary}</p>
                    <div className="admin-broker-risk__timing-metrics">
                      <div>
                        <span>Net terms</span>
                        <strong>{paymentTiming.termsDays}d</strong>
                      </div>
                      <div>
                        <span>Avg actual pay</span>
                        <strong>{paymentTiming.avgPayDays}d</strong>
                      </div>
                      <div>
                        <span>
                          {paymentTiming.daysLate > 0
                            ? 'Days late'
                            : paymentTiming.daysLate < 0
                              ? 'Days early'
                              : 'Vs Net'}
                        </span>
                        <strong>
                          {paymentTiming.daysLate === 0
                            ? 'On time'
                            : `${Math.abs(paymentTiming.daysLate)}d`}
                        </strong>
                      </div>
                      {paymentTiming.paidSampleSize > 0 ? (
                        <div>
                          <span>Paid sample</span>
                          <strong>{paymentTiming.paidSampleSize}</strong>
                        </div>
                      ) : null}
                    </div>
                    <p className="admin-broker-risk__timing-hint">
                      Avg pay excludes invoices on hold or in dispute. Publishing Medium/High
                      pushes clean timing to the carrier portal.
                    </p>
                  </div>
                ) : (
                  <div className="admin-broker-risk__timing admin-broker-risk__timing--empty">
                    <p className="admin-broker-risk__timing-title">Actual payment timing</p>
                    <p className="admin-broker-risk__timing-summary">
                      Need at least {BROKER_RISK_POLICY.min_paid_sample_for_payment_timing}{' '}
                      confirmed payments to average vs Net{' '}
                      {selected.metrics.payment_terms_days ??
                        broker?.payment_terms_days ??
                        BROKER_RISK_POLICY.fallback_terms_days}
                      d terms
                      {groupMetrics.paid_sample_size
                        ? ` (have ${groupMetrics.paid_sample_size}).`
                        : '.'}
                    </p>
                  </div>
                )}

                {paymentHistory && paymentHistory.lifetimeCount > 0 ? (
                  <div className="admin-broker-risk__timing">
                    <p className="admin-broker-risk__timing-title">Payment over months</p>
                    <p className="admin-broker-risk__timing-summary">
                      {formatCurrency(paymentHistory.lifetimePaid)} confirmed ·{' '}
                      {paymentHistory.lifetimeCount} payments
                      {paymentHistory.onTimeRate != null
                        ? ` · ${paymentHistory.onTimeRate}% on time vs Net`
                        : ''}
                      {paymentHistory.pausedInvoiceCount > 0
                        ? ` · ${paymentHistory.pausedInvoiceCount} on hold/dispute (not in avg)`
                        : ''}
                    </p>
                    <div className="admin-broker-risk__month-chart" aria-label="Paid by month">
                      {[...historyMonths].reverse().map((m) => {
                        const max = Math.max(1, ...historyMonths.map((x) => x.paidAmount))
                        const height = Math.round((m.paidAmount / max) * 100)
                        return (
                          <div
                            key={m.month}
                            className="admin-broker-risk__month-col"
                            title={`${formatBrokerMonthLabel(m.month)}: ${formatCurrency(m.paidAmount)}`}
                          >
                            <div
                              className="admin-broker-risk__month-track"
                              style={{ backgroundColor: c.stat.slate }}
                            >
                              <div
                                className="admin-broker-risk__month-bar"
                                style={{
                                  height: `${height}%`,
                                  backgroundColor: c.info,
                                }}
                              />
                            </div>
                            <span className="admin-broker-risk__month-tick">{m.month.slice(5)}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="admin-broker-risk__facts">
                  <div>
                    <span>Carrier sees</span>
                    <strong>{levelLabel(selected.risk_level)}</strong>
                  </div>
                  <div>
                    <span>Late payments</span>
                    <strong>
                      {groupMetrics.late_payment_count}
                      {groupMetrics.max_days_past_terms != null
                        ? ` · worst ${groupMetrics.max_days_past_terms}d`
                        : ''}
                    </strong>
                  </div>
                  <div>
                    <span>Open past terms</span>
                    <strong>
                      {groupMetrics.open_overdue_past_terms} ·{' '}
                      {formatCurrency(groupMetrics.overdue_amount)}
                    </strong>
                  </div>
                  <div>
                    <span>Hold / dispute</span>
                    <strong>
                      {groupMetrics.hold_count} hold ·{' '}
                      {groupMetrics.open_dispute_count || openBrokerDisputes.length} dispute
                    </strong>
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
                      {openBrokerDisputes.length > 0 ? (
                        <span className="admin-broker-risk__cause admin-broker-risk__cause--dispute">
                          {openBrokerDisputes.length} open dispute
                          {openBrokerDisputes.length === 1 ? '' : 's'}
                        </span>
                      ) : null}
                    </p>
                    {liveCauses && liveCauses.snippets.length > 0 ? (
                      <ul className="admin-broker-risk__snippet-list">
                        {liveCauses.snippets.slice(0, 8).map((s, i) => (
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
                          const clock = payClocks.get(inv.id)
                          const statusLabel =
                            inv.collection_status === 'W/P'
                              ? `${inv.status} · W/P`
                              : inv.status
                          return (
                            <li
                              key={inv.id}
                              className={`admin-broker-risk__invoice-row${
                                clock?.paused
                                  ? ' is-paused'
                                  : meta.pastTermsUrgent
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
                                  {clock?.label ? (
                                    <span className="admin-broker-risk__pause-badge">
                                      {clock.label}
                                    </span>
                                  ) : null}
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
                                  {clock?.paused ? (
                                    <span className="admin-broker-risk__inv-dash" title="Pay clock paused">
                                      —
                                    </span>
                                  ) : meta.isOpen && meta.daysPastDue > 0 ? (
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
                        {RATE_PRESETS.map((preset) => {
                          const levelAlreadySet =
                            preset.kind === 'publish' &&
                            ((preset.level === 'high' && alreadyHigh) ||
                              (preset.level === 'medium' &&
                                (alreadyMedium || alreadyHigh)))
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              disabled={busy || levelAlreadySet}
                              title={
                                levelAlreadySet
                                  ? `Already ${levelLabel(preset.level ?? 'medium')} — no need to set again`
                                  : undefined
                              }
                              className={`admin-broker-risk__preset admin-broker-risk__preset--${preset.kind}${
                                preset.id === 'clear-ppw' &&
                                (groupMetrics.suggest_clear_as_ppw ||
                                  verdict?.code === 'docs_issue')
                                  ? ' is-suggested'
                                  : ''
                              }${
                                preset.id === 'pub-med' &&
                                verdict?.code === 'broker_issue' &&
                                selected.computed_risk_level === 'medium' &&
                                !levelAlreadySet
                                  ? ' is-suggested'
                                  : ''
                              }${
                                preset.id === 'pub-high' &&
                                verdict?.code === 'broker_issue' &&
                                selected.computed_risk_level === 'high' &&
                                !levelAlreadySet
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
                          )
                        })}
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
                          disabled={busy}
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
                          disabled={busy || alreadyHigh}
                          title={
                            alreadyHigh
                              ? 'Already published High — use Remove risk first if you need to change'
                              : 'Upgrade carrier-visible risk to High'
                          }
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
        )}
      </div>
    </AdminLayout>
  )
}
