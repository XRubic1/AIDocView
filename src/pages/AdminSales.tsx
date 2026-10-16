import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Info,
  Mail,
  NotebookPen,
  Pencil,
  Plus,
  RefreshCw,
  RotateCw,
  Save,
  Search,
  Shield,
  StickyNote,
  Target,
  Trash2,
  X,
} from 'lucide-react'
import { useToast } from '../components/ui/ToastProvider'
import Spinner from '../components/ui/Spinner'
import SalesLeadRatingSettingsPanel, {
  salesLeadPolicyToForm,
  type SalesLeadRatingSettingsForm,
} from '../components/admin/SalesLeadRatingSettingsPanel'
import BrokerSnapshotSummaryView from '../components/client/BrokerSnapshotSummaryView'
import {
  addSalesLead,
  addSalesLeadsFromDotNotepad,
  addManualSalesLead,
  updateSalesLeadDetails,
  type ManualSalesLeadInput,
  deleteSalesLead,
  listSalesLeads,
  parseDotNotepad,
  refreshSalesLead,
  summarizeSalesLeads,
  updateSalesLead,
  type DotNotepadBatchItemResult,
  type SalesLead,
  type SalesLeadLookupBy,
  type SalesLeadStatus,
} from '../services/salesLeadService'
import {
  loadSalesLeadRatingPolicy,
  saveSalesLeadRatingPolicy,
} from '../services/platformSettingsService'
import type { SalesChaseGrade } from '../utils/salesLeadRating'
import SalesEmailPanel from '../components/admin/sales/SalesEmailPanel'
import SalesLeadFormModal from '../components/admin/sales/SalesLeadFormModal'
import {
  isValidEmail,
  loadSalesEmailActivity,
  type SalesEmailActivity,
  type SalesThreadActivity,
} from '../services/salesEmailService'
import { useAuth } from '../context/AuthContext'
import { getAdminUserDisplayName } from '../config/adminNav'
import '../styles/adminSalesClean.css'

type TabId = 'leads' | 'email' | 'notepad' | 'rating'

const STATUS_OPTIONS: { value: SalesLeadStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'researching', label: 'Researching' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'replied', label: 'Replied' },
  { value: 'converted', label: 'Converted' },
  { value: 'declined', label: 'Declined' },
  { value: 'skipped', label: 'Skipped' },
]

const TABS: { id: TabId; label: string }[] = [
  { id: 'leads', label: 'Leads' },
  { id: 'email', label: 'Email' },
  { id: 'notepad', label: 'Notepad' },
  { id: 'rating', label: 'Rating rules' },
]

function GradeBadge({ grade, onClick }: { grade: SalesChaseGrade; onClick?: () => void }) {
  if (!onClick) return <span className={`sl-grade sl-grade--${grade}`}>{grade}</span>
  return (
    <button
      type="button"
      className={`sl-grade sl-grade--${grade} sl-grade--button`}
      onClick={onClick}
      title="Why this grade"
      aria-label={`Grade ${grade} — why`}
    >
      {grade}
    </button>
  )
}

function formatEmailedAt(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function formatYears(years: number | null): string {
  if (years == null) return '—'
  return years < 1 ? `${Math.round(years * 12)} mo` : `${years.toFixed(1)} yr`
}

/**
 * If clipboard looks like an MC/DOT, return digits (+ preferred lookup mode).
 * Ignores long/random clipboard text.
 */
function parseClipboardLeadId(raw: string): { value: string; by?: SalesLeadLookupBy } | null {
  const text = raw.trim()
  if (!text || text.length > 48) return null

  const upper = text.toUpperCase()
  const digits = text.replace(/\D/g, '')
  if (digits.length < 4 || digits.length > 10) return null

  if (/\bDOT\b/.test(upper) || upper.startsWith('USDOT') || upper.startsWith('DOT')) {
    return { value: digits, by: 'dot' }
  }
  if (/^MC[\s#-]?/i.test(text) || /^MX[\s#-]?/i.test(text) || /^FF[\s#-]?/i.test(text)) {
    return { value: digits, by: 'mc' }
  }

  // Clipboard is essentially just the number (optional spaces/dashes).
  const compact = text.replace(/[\s#-]/g, '')
  if (/^\d+$/.test(compact) || /^[A-Z]{0,2}\d+$/i.test(compact)) {
    return { value: digits }
  }

  return null
}

/** Admin cold-outreach leads: MC/DOT → BrokerSnapshot → chase grade A–F. */
export default function AdminSales() {
  const { showToast } = useToast()
  const { resolved } = useAuth()
  const sentBy = getAdminUserDisplayName(resolved.user?.email ?? null)
  const [tab, setTab] = useState<TabId>('leads')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [emailRecipientIds, setEmailRecipientIds] = useState<string[] | null>(null)
  const [leadForm, setLeadForm] = useState<
    { mode: 'add'; prefill?: Partial<ManualSalesLeadInput> } | { mode: 'edit'; lead: SalesLead } | null
  >(null)
  const [savingLeadForm, setSavingLeadForm] = useState(false)
  const [activity, setActivity] = useState<SalesEmailActivity | null>(null)

  const loadActivity = useCallback(async () => {
    try {
      setActivity(await loadSalesEmailActivity())
    } catch {
      setActivity(null)
    }
  }, [])

  useEffect(() => {
    void loadActivity()
    // Pick up new replies while the page stays open.
    const id = window.setInterval(() => void loadActivity(), 60_000)
    return () => window.clearInterval(id)
  }, [loadActivity])
  const [loading, setLoading] = useState(true)
  const [leads, setLeads] = useState<SalesLead[]>([])
  const [gradeFilter, setGradeFilter] = useState<SalesChaseGrade | 'all'>('all')
  const [search, setSearch] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [lookupBy, setLookupBy] = useState<SalesLeadLookupBy>('mc')
  const [idInput, setIdInput] = useState('')
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [ratingForm, setRatingForm] = useState<SalesLeadRatingSettingsForm | null>(null)
  const [savingRating, setSavingRating] = useState(false)
  const [whyLead, setWhyLead] = useState<SalesLead | null>(null)
  const [detailLead, setDetailLead] = useState<SalesLead | null>(null)
  const [notesLead, setNotesLead] = useState<SalesLead | null>(null)
  const [notesDraft, setNotesDraft] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notepadText, setNotepadText] = useState('')
  const [notepadImporting, setNotepadImporting] = useState(false)
  const [notepadProgress, setNotepadProgress] = useState<{
    done: number
    total: number
  } | null>(null)
  const [notepadLog, setNotepadLog] = useState<DotNotepadBatchItemResult[]>([])

  const notepadDotCount = useMemo(() => parseDotNotepad(notepadText).length, [notepadText])

  const loadLeads = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await listSalesLeads()
      setLeads(rows)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load sales leads', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  const loadRating = useCallback(async () => {
    try {
      const policy = await loadSalesLeadRatingPolicy()
      setRatingForm(salesLeadPolicyToForm(policy))
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load rating rules', 'error')
    }
  }, [showToast])

  useEffect(() => {
    void loadLeads()
    void loadRating()
  }, [loadLeads, loadRating])

  /** Open Add lead and auto-fill from clipboard when it looks like an MC/DOT. */
  const openAddLead = useCallback(async () => {
    setIdInput('')
    setShowAddModal(true)
    if (!navigator.clipboard?.readText) return
    try {
      const text = await navigator.clipboard.readText()
      const parsed = parseClipboardLeadId(text)
      if (!parsed) return
      setIdInput(parsed.value)
      if (parsed.by) setLookupBy(parsed.by)
    } catch {
      // Clipboard permission denied — leave field empty for manual entry.
    }
  }, [])

  // Press F to open Add lead (when not typing in a field).
  useEffect(() => {
    if (tab !== 'leads') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'f' && e.key !== 'F') return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
        return
      }
      if (showAddModal || whyLead || detailLead || notesLead || leadForm) return
      e.preventDefault()
      void openAddLead()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tab, showAddModal, whyLead, detailLead, notesLead, leadForm, openAddLead])

  const summary = useMemo(() => summarizeSalesLeads(leads), [leads])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return leads.filter((lead) => {
      if (gradeFilter !== 'all' && lead.chase_grade !== gradeFilter) return false
      if (!q) return true
      return (
        lead.company_name?.toLowerCase().includes(q) ||
        lead.mc_number.toLowerCase().includes(q) ||
        lead.mc_digits.includes(q) ||
        String(lead.dot_number ?? '').includes(q) ||
        lead.contact_email?.toLowerCase().includes(q) ||
        lead.officer?.toLowerCase().includes(q) ||
        lead.notes?.toLowerCase().includes(q) ||
        lead.grade_why.toLowerCase().includes(q)
      )
    })
  }, [leads, gradeFilter, search])

  const activityFor = useCallback(
    (lead: SalesLead): SalesThreadActivity | null =>
      activity?.byLeadId.get(lead.id) ??
      (lead.contact_email ? activity?.byAddress.get(lead.contact_email.toLowerCase()) : undefined) ??
      null,
    [activity]
  )

  // Leads with new replies first (newest reply on top); everything else keeps its order.
  const sortedLeads = useMemo(() => {
    const withReplies = filtered
      .filter((lead) => (activityFor(lead)?.unread ?? 0) > 0)
      .sort((a, b) => (activityFor(b)?.lastReplyAt ?? '').localeCompare(activityFor(a)?.lastReplyAt ?? ''))
    if (withReplies.length === 0) return filtered
    const ids = new Set(withReplies.map((l) => l.id))
    return [...withReplies, ...filtered.filter((l) => !ids.has(l.id))]
  }, [filtered, activityFor])

  const handleAddLead = async () => {
    if (adding) return
    setAdding(true)
    try {
      const lead = await addSalesLead(idInput, lookupBy)
      setLeads((prev) => [lead, ...prev.filter((row) => row.id !== lead.id)])
      setShowAddModal(false)
      setIdInput('')
      const label = lead.company_name || lead.mc_number || `DOT ${lead.dot_number}`
      showToast(
        lead.snapshot?.found
          ? `Added ${label} — grade ${lead.chase_grade}`
          : `Added ${label} (not found — grade F)`,
        'success'
      )
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not add lead', 'error')
    } finally {
      setAdding(false)
    }
  }

  const handleRefresh = async (leadId: string) => {
    setBusyId(leadId)
    try {
      const updated = await refreshSalesLead(leadId)
      setLeads((prev) => prev.map((row) => (row.id === leadId ? updated : row)))
      setDetailLead((prev) => (prev?.id === leadId ? updated : prev))
      showToast(`Refreshed — grade ${updated.chase_grade}`, 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Refresh failed', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const handleStatus = async (leadId: string, status: SalesLeadStatus) => {
    setBusyId(leadId)
    try {
      const updated = await updateSalesLead(leadId, { status })
      setLeads((prev) => prev.map((row) => (row.id === leadId ? updated : row)))
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (leadId: string) => {
    if (!window.confirm('Remove this lead from the sales list?')) return
    setBusyId(leadId)
    try {
      await deleteSalesLead(leadId)
      setLeads((prev) => prev.filter((row) => row.id !== leadId))
      showToast('Lead removed', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const openNotes = (lead: SalesLead) => {
    setNotesLead(lead)
    setNotesDraft(lead.notes ?? '')
  }

  const handleSaveNotes = async () => {
    if (!notesLead || savingNotes) return
    setSavingNotes(true)
    try {
      const updated = await updateSalesLead(notesLead.id, {
        notes: notesDraft.trim() ? notesDraft.trim() : null,
      })
      setLeads((prev) => prev.map((row) => (row.id === notesLead.id ? updated : row)))
      setDetailLead((prev) => (prev?.id === notesLead.id ? updated : prev))
      setNotesLead(null)
      showToast('Notes saved', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save notes', 'error')
    } finally {
      setSavingNotes(false)
    }
  }

  const handleNotepadImport = async () => {
    const dots = parseDotNotepad(notepadText)
    if (dots.length === 0) {
      showToast('Paste at least one DOT (separate with commas)', 'error')
      return
    }
    if (notepadImporting) return
    setNotepadImporting(true)
    setNotepadLog([])
    setNotepadProgress({ done: 0, total: dots.length })
    try {
      const result = await addSalesLeadsFromDotNotepad(notepadText, (done, total, item) => {
        setNotepadProgress({ done, total })
        setNotepadLog((prev) => [...prev, item])
      })
      if (result.added.length > 0) {
        setLeads((prev) => {
          const ids = new Set(result.added.map((l) => l.id))
          return [...result.added, ...prev.filter((row) => !ids.has(row.id))]
        })
      }
      showToast(
        `Notepad done — ${result.added.length} added, ${result.skipped.length} skipped, ${result.errors.length} errors`,
        result.errors.length > 0 && result.added.length === 0 ? 'error' : 'success'
      )
      if (result.added.length > 0 && result.errors.length === 0) {
        setNotepadText('')
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Notepad import failed', 'error')
    } finally {
      setNotepadImporting(false)
      setNotepadProgress(null)
    }
  }

  const handleSaveRating = async () => {
    if (!ratingForm || savingRating) return
    setSavingRating(true)
    try {
      await saveSalesLeadRatingPolicy({
        years_a_max: Number(ratingForm.years_a_max) || 0,
        years_b_max: Number(ratingForm.years_b_max) || 0,
        years_c_max: Number(ratingForm.years_c_max) || 0,
        years_d_max: Number(ratingForm.years_d_max) || 0,
        trucks_a_max: Number(ratingForm.trucks_a_max) || 0,
        trucks_b_max: Number(ratingForm.trucks_b_max) || 0,
        trucks_c_max: Number(ratingForm.trucks_c_max) || 0,
        trucks_d_max: Number(ratingForm.trucks_d_max) || 0,
        combine_mode: ratingForm.combine_mode,
        force_f_if_not_authorized: ratingForm.force_f_if_not_authorized,
        force_f_if_no_carrier_authority: ratingForm.force_f_if_no_carrier_authority,
        demote_if_insurance_bad: ratingForm.demote_if_insurance_bad,
        demote_if_safety_bad: ratingForm.demote_if_safety_bad,
      })
      showToast('Rating rules saved — refresh leads to re-score', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save rating rules', 'error')
    } finally {
      setSavingRating(false)
    }
  }

  const leadName = (lead: SalesLead) =>
    lead.company_name || lead.mc_number || `DOT ${lead.dot_number ?? ''}`

  const visibleIds = filtered.map((l) => l.id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))
  const selectedLeads = leads.filter((l) => selectedIds.has(l.id))
  const selectedWithEmail = selectedLeads.filter((l) => isValidEmail(l.contact_email))

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleAllVisible = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id))
      else visibleIds.forEach((id) => next.add(id))
      return next
    })

  const emailLeads = (ids: string[]) => {
    setEmailRecipientIds(ids)
    setTab('email')
  }

  const consumeEmailRecipients = useCallback(() => setEmailRecipientIds(null), [])

  const [openThreadId, setOpenThreadId] = useState<string | null>(null)
  const consumeOpenThread = useCallback(() => setOpenThreadId(null), [])
  const openConversation = (threadId: string) => {
    setOpenThreadId(threadId)
    setTab('email')
  }

  const openManualFromLookup = () => {
    const digits = idInput.replace(/\D/g, '')
    setShowAddModal(false)
    setIdInput('')
    setLeadForm({ mode: 'add', prefill: digits ? (lookupBy === 'mc' ? { mc: digits } : { dot: digits }) : undefined })
  }

  const handleSaveLeadForm = async (input: ManualSalesLeadInput) => {
    if (!leadForm || savingLeadForm) return
    setSavingLeadForm(true)
    try {
      if (leadForm.mode === 'add') {
        const lead = await addManualSalesLead(input)
        setLeads((prev) => [lead, ...prev])
        showToast(`Added ${leadName(lead)} — grade ${lead.chase_grade}`, 'success')
      } else {
        const lead = await updateSalesLeadDetails(leadForm.lead.id, leadForm.lead, input)
        setLeads((prev) => prev.map((row) => (row.id === lead.id ? lead : row)))
        setDetailLead((prev) => (prev?.id === lead.id ? lead : prev))
        showToast('Lead updated', 'success')
      }
      setLeadForm(null)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save lead', 'error')
    } finally {
      setSavingLeadForm(false)
    }
  }

  /** Leads typed in without an MC or DOT have nothing to look up. */
  const canLookup = (lead: SalesLead) => Boolean(lead.mc_number) || lead.dot_number != null

  return (
    <div className="client-shell-scroll sl h-full min-h-0 overflow-y-auto">
      <div className="sl-page">
        <header className="sl-head">
          <div>
            <h1>Sales</h1>
            <p>Carrier leads by MC or DOT, graded by fleet size and time in business.</p>
          </div>
          <div className="sl-head__actions">
            <button
              type="button"
              className="sl-btn"
              onClick={() => {
                void loadLeads()
                void loadActivity()
              }}
            >
              <RefreshCw size={15} aria-hidden />
              Refresh
            </button>
            {tab === 'leads' && (
              <button type="button" className="sl-btn sl-btn--primary" onClick={() => void openAddLead()}>
                <Plus size={16} aria-hidden />
                Add lead
                <kbd>F</kbd>
              </button>
            )}
            {tab === 'notepad' && (
              <button
                type="button"
                className="sl-btn sl-btn--primary"
                disabled={notepadImporting || notepadDotCount === 0}
                onClick={() => void handleNotepadImport()}
              >
                <NotebookPen size={16} aria-hidden />
                {notepadImporting
                  ? `Importing ${notepadProgress?.done ?? 0}/${notepadProgress?.total ?? 0}…`
                  : `Import ${notepadDotCount} DOT${notepadDotCount === 1 ? '' : 's'}`}
              </button>
            )}
            {tab === 'rating' && (
              <button
                type="button"
                className="sl-btn sl-btn--primary"
                disabled={savingRating || !ratingForm}
                onClick={() => void handleSaveRating()}
              >
                <Save size={16} aria-hidden />
                {savingRating ? 'Saving…' : 'Save rules'}
              </button>
            )}
          </div>
        </header>

        <div className="sl-tabs" role="tablist" aria-label="Sales sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`sl-tab${tab === t.id ? ' is-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.id === 'email' ? <Mail size={15} aria-hidden /> : null}
              {t.label}
              {t.id === 'email' && (activity?.totalUnread ?? 0) > 0 ? (
                <span className="sl-count" aria-label={`${activity?.totalUnread} new emails`}>
                  {activity?.totalUnread}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {tab === 'email' ? (
          <SalesEmailPanel
            leads={leads}
            sentBy={sentBy}
            initialRecipientIds={emailRecipientIds}
            onInitialRecipientsConsumed={consumeEmailRecipients}
            onLeadsChanged={() => {
              void loadLeads()
              void loadActivity()
            }}
            activity={activity}
            onActivityChanged={() => void loadActivity()}
            openThreadId={openThreadId}
            onOpenThreadConsumed={consumeOpenThread}
          />
        ) : tab === 'rating' ? (
          <div className="sl-card sl-card--pad">
            {ratingForm ? (
              <SalesLeadRatingSettingsPanel
                settings={ratingForm}
                onChange={(patch) => setRatingForm((prev) => (prev ? { ...prev, ...patch } : prev))}
              />
            ) : (
              <div className="sl-center">
                <Spinner />
              </div>
            )}
          </div>
        ) : tab === 'notepad' ? (
          <div className="sl-card sl-card--pad sl-notepad">
            <div>
              <h2 className="sl-card__title">DOT notepad</h2>
              <p className="sl-muted">
                Paste DOTs from the BrokerSnapshot map, separated by commas, for example{' '}
                <code>2550736, 104121, 3083852</code>. Each one is looked up, graded and added.
                Duplicates are skipped.
              </p>
            </div>

            <textarea
              value={notepadText}
              onChange={(e) => setNotepadText(e.target.value)}
              disabled={notepadImporting}
              rows={10}
              placeholder="2550736, 104121, 3083852, …"
              className="sl-input sl-textarea sl-mono"
            />

            <div className="sl-notepad__bar">
              <span className="sl-muted">
                {notepadDotCount} unique DOT{notepadDotCount === 1 ? '' : 's'} ready
                {notepadProgress ? ` · ${notepadProgress.done}/${notepadProgress.total} done` : ''}
              </span>
              <button
                type="button"
                className="sl-btn"
                disabled={notepadImporting || !notepadText.trim()}
                onClick={() => {
                  setNotepadText('')
                  setNotepadLog([])
                }}
              >
                Clear
              </button>
            </div>

            {notepadProgress && (
              <div className="sl-progress__bar">
                <span
                  style={{
                    width: `${Math.round((notepadProgress.done / Math.max(notepadProgress.total, 1)) * 100)}%`,
                  }}
                />
              </div>
            )}

            {notepadLog.length > 0 && (
              <div className="sl-log">
                <table className="sl-table">
                  <thead>
                    <tr>
                      <th>DOT</th>
                      <th>Result</th>
                      <th>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...notepadLog].reverse().map((item, idx) => (
                      <tr key={`${item.dot}-${idx}`}>
                        <td className="sl-num">{item.dot}</td>
                        <td>
                          {item.status === 'added' && (
                            <span className="sl-tag sl-tag--good">Added · {item.lead.chase_grade}</span>
                          )}
                          {item.status === 'skipped' && <span className="sl-tag">Skipped</span>}
                          {item.status === 'error' && <span className="sl-tag sl-tag--bad">Error</span>}
                        </td>
                        <td className="sl-muted sl-clip">
                          {item.status === 'added'
                            ? item.lead.company_name || item.lead.mc_number || '—'
                            : item.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="sl-toolbar">
              <div className="sl-grades" role="group" aria-label="Filter by grade">
                {(
                  [
                    ['all', 'All', summary.all],
                    ['A', 'A', summary.A],
                    ['B', 'B', summary.B],
                    ['C', 'C', summary.C],
                    ['D', 'D', summary.D],
                    ['F', 'F', summary.F],
                  ] as const
                ).map(([key, label, value]) => (
                  <button
                    key={key}
                    type="button"
                    className={`sl-grade-filter${gradeFilter === key ? ' is-active' : ''}`}
                    aria-pressed={gradeFilter === key}
                    onClick={() => setGradeFilter(key)}
                  >
                    {key === 'all' ? label : <span className={`sl-grade sl-grade--${key} sl-grade--xs`}>{label}</span>}
                    <span className="sl-grade-filter__count">{value}</span>
                  </button>
                ))}
              </div>
              <div className="sl-search sl-search--grow">
                <Search size={15} aria-hidden />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search company, MC, DOT, email or notes"
                  aria-label="Search leads"
                />
              </div>
            </div>

            {selectedIds.size > 0 ? (
              <div className="sl-bulkbar" role="region" aria-label="Selected leads">
                <span>
                  <strong>{selectedIds.size}</strong> selected
                  {selectedWithEmail.length < selectedIds.size
                    ? ` · ${selectedWithEmail.length} with an email`
                    : ''}
                </span>
                <div className="sl-bulkbar__actions">
                  <button type="button" className="sl-link" onClick={() => setSelectedIds(new Set())}>
                    Clear
                  </button>
                  <button
                    type="button"
                    className="sl-btn sl-btn--primary sl-btn--sm"
                    disabled={selectedWithEmail.length === 0}
                    onClick={() => emailLeads(selectedWithEmail.map((l) => l.id))}
                  >
                    <Mail size={14} aria-hidden />
                    Email {selectedWithEmail.length}
                  </button>
                </div>
              </div>
            ) : null}

            {loading && leads.length === 0 ? (
              <div className="sl-center">
                <Spinner />
              </div>
            ) : (
              <div className="sl-card sl-table-card">
                <div className="sl-table-scroll">
                  <table className="sl-table sl-leads">
                    <thead>
                      <tr>
                        <th className="sl-col-check">
                          <input
                            type="checkbox"
                            checked={allVisibleSelected}
                            onChange={toggleAllVisible}
                            aria-label="Select all shown leads"
                          />
                        </th>
                        <th className="sl-col-grade">Grade</th>
                        <th>Company</th>
                        <th className="sl-col-fleet">Fleet</th>
                        <th>Contact</th>
                        <th className="sl-col-status">Status</th>
                        <th className="sl-col-actions" aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={7}>
                            <div className="sl-empty">
                              <Target size={26} aria-hidden />
                              <p>
                                {leads.length === 0
                                  ? 'No leads yet. Add a carrier MC or DOT to look them up and grade them.'
                                  : 'No leads match this filter.'}
                              </p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        sortedLeads.map((lead) => {
                          const act = activityFor(lead)
                          const newReplies = act?.unread ?? 0
                          return (
                          <tr
                            key={lead.id}
                            className={`${selectedIds.has(lead.id) ? 'is-selected' : ''}${newReplies > 0 ? ' has-reply' : ''}`.trim() || undefined}
                          >
                            <td className="sl-col-check">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(lead.id)}
                                onChange={() => toggleSelect(lead.id)}
                                aria-label={`Select ${leadName(lead)}`}
                              />
                            </td>
                            <td className="sl-col-grade">
                              <GradeBadge grade={lead.chase_grade} onClick={() => setWhyLead(lead)} />
                            </td>
                            <td>
                              <button
                                type="button"
                                className="sl-company"
                                onClick={() => setDetailLead(lead)}
                                title="View BrokerSnapshot"
                              >
                                {lead.company_name || '—'}
                              </button>
                              <span className="sl-sub">
                                {[lead.mc_number, lead.dot_number != null ? `DOT ${lead.dot_number}` : null]
                                  .filter(Boolean)
                                  .join(' · ') || '—'}
                                {lead.operating_status ? ` · ${lead.operating_status}` : ''}
                              </span>
                            </td>
                            <td className="sl-col-fleet">
                              <span className="sl-main">
                                {lead.total_trucks ?? lead.total_power_units ?? '—'} trucks
                              </span>
                              <span className="sl-sub">{formatYears(lead.years_in_business)} in business</span>
                            </td>
                            <td>
                              <span className="sl-main sl-clip">{lead.officer || '—'}</span>
                              <span className="sl-sub sl-clip">
                                {lead.contact_email ? (
                                  <a href={`mailto:${lead.contact_email}`} title={lead.contact_email}>
                                    {lead.contact_email}
                                  </a>
                                ) : (
                                  'No email'
                                )}
                                {lead.contact_phone ? ` · ${lead.contact_phone}` : ''}
                              </span>
                            </td>
                            <td className="sl-col-status">
                              <select
                                className={`sl-status sl-status--${lead.status}`}
                                value={lead.status}
                                disabled={busyId === lead.id}
                                onChange={(e) => void handleStatus(lead.id, e.target.value as SalesLeadStatus)}
                                aria-label={`Status for ${leadName(lead)}`}
                              >
                                {STATUS_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                              {act?.lastEmailedAt ? (
                                <span className="sl-sub sl-emailed" title="Last emailed">
                                  Emailed {formatEmailedAt(act.lastEmailedAt)}
                                </span>
                              ) : null}
                            </td>
                            <td className="sl-col-actions">
                              <div className="sl-row-actions">
                                <button
                                  type="button"
                                  className={`sl-icon-btn sl-mail-btn${newReplies > 0 ? ' has-count' : ''}`}
                                  title={
                                    newReplies > 0
                                      ? `${newReplies} new repl${newReplies === 1 ? 'y' : 'ies'} — open conversation`
                                      : lead.contact_email
                                        ? `Email ${lead.contact_email}`
                                        : 'No email on file'
                                  }
                                  aria-label={
                                    newReplies > 0
                                      ? `${newReplies} new emails from ${leadName(lead)}`
                                      : `Email ${leadName(lead)}`
                                  }
                                  disabled={!isValidEmail(lead.contact_email) && newReplies === 0}
                                  onClick={() =>
                                    newReplies > 0 && act ? openConversation(act.threadId) : emailLeads([lead.id])
                                  }
                                >
                                  <Mail size={15} />
                                  {newReplies > 0 ? <span className="sl-count sl-count--corner">{newReplies}</span> : null}
                                </button>
                                <button
                                  type="button"
                                  className="sl-icon-btn"
                                  title="Edit details"
                                  aria-label={`Edit ${leadName(lead)}`}
                                  onClick={() => setLeadForm({ mode: 'edit', lead })}
                                >
                                  <Pencil size={15} />
                                </button>
                                <button
                                  type="button"
                                  className={`sl-icon-btn${lead.notes ? ' has-note' : ''}`}
                                  title={lead.notes || 'Add notes'}
                                  aria-label={`Notes for ${leadName(lead)}`}
                                  onClick={() => openNotes(lead)}
                                >
                                  <StickyNote size={15} />
                                </button>
                                <button
                                  type="button"
                                  className="sl-icon-btn"
                                  title={canLookup(lead) ? 'Look up again and re-grade' : 'No MC or DOT to look up'}
                                  aria-label={`Refresh ${leadName(lead)}`}
                                  disabled={busyId === lead.id || !canLookup(lead)}
                                  onClick={() => void handleRefresh(lead.id)}
                                >
                                  <RotateCw size={15} />
                                </button>
                                <button
                                  type="button"
                                  className="sl-icon-btn sl-icon-btn--danger"
                                  title="Remove lead"
                                  aria-label={`Remove ${leadName(lead)}`}
                                  disabled={busyId === lead.id}
                                  onClick={() => void handleDelete(lead.id)}
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                {filtered.length > 0 ? (
                  <div className="sl-table-foot">
                    {filtered.length} of {leads.length} leads
                  </div>
                ) : null}
              </div>
            )}
          </>
        )}
      </div>

      {showAddModal && (
        <div className="sl-overlay" role="presentation" onClick={() => !adding && setShowAddModal(false)}>
          <div className="sl-modal" role="dialog" aria-modal aria-label="Add lead" onClick={(e) => e.stopPropagation()}>
            <h2>Add lead</h2>
            <p className="sl-muted">
              Looks up trucks, years in business, authority and insurance, then grades the carrier
              with your rating rules. A copied MC or DOT is filled in automatically.
            </p>
            <div className="sl-seg sl-seg--full" role="group" aria-label="Look up by">
              <button
                type="button"
                className={`sl-seg__btn${lookupBy === 'mc' ? ' is-active' : ''}`}
                onClick={() => setLookupBy('mc')}
              >
                By MC
              </button>
              <button
                type="button"
                className={`sl-seg__btn${lookupBy === 'dot' ? ' is-active' : ''}`}
                onClick={() => setLookupBy('dot')}
              >
                By DOT
              </button>
            </div>
            <label className="sl-field">
              <span className="sl-field__label">{lookupBy === 'mc' ? 'MC number' : 'DOT number'}</span>
              <input
                autoFocus
                className="sl-input"
                value={idInput}
                onChange={(e) => setIdInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleAddLead()
                }}
                placeholder={lookupBy === 'mc' ? 'e.g. 123456' : 'e.g. 987654'}
              />
            </label>
            <p className="sl-muted sl-modal__alt">
              No MC or DOT, or not in BrokerSnapshot?{' '}
              <button type="button" className="sl-link" disabled={adding} onClick={openManualFromLookup}>
                Enter details by hand
              </button>
            </p>
            <div className="sl-modal__actions">
              <button
                type="button"
                className="sl-btn"
                disabled={adding}
                onClick={() => {
                  setShowAddModal(false)
                  setIdInput('')
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="sl-btn sl-btn--primary"
                disabled={adding || !idInput.trim()}
                onClick={() => void handleAddLead()}
              >
                {adding ? 'Looking up…' : 'Add lead'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detailLead && (
        <div className="sl-overlay" role="presentation" onClick={() => setDetailLead(null)}>
          <div
            className="sl-modal sl-modal--wide mc-lookup-modal client-modal"
            role="dialog"
            aria-modal
            aria-label="Lead BrokerSnapshot"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="sl-modal__head">
              <Shield size={16} className="sl-accent" aria-hidden />
              <div className="sl-modal__title">
                <h2>{leadName(detailLead)}</h2>
                <p className="sl-muted">
                  {[detailLead.mc_number, detailLead.dot_number != null ? `DOT ${detailLead.dot_number}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <GradeBadge grade={detailLead.chase_grade} />
              <button
                type="button"
                className="sl-btn sl-btn--sm"
                disabled={!isValidEmail(detailLead.contact_email)}
                onClick={() => {
                  const id = detailLead.id
                  setDetailLead(null)
                  emailLeads([id])
                }}
              >
                <Mail size={14} aria-hidden />
                Email
              </button>
              <button
                type="button"
                className="sl-btn sl-btn--sm"
                onClick={() => {
                  const lead = detailLead
                  setDetailLead(null)
                  setLeadForm({ mode: 'edit', lead })
                }}
              >
                <Pencil size={14} aria-hidden />
                Edit
              </button>
              <button
                type="button"
                className="sl-btn sl-btn--sm"
                disabled={busyId === detailLead.id || !canLookup(detailLead)}
                onClick={() => void handleRefresh(detailLead.id)}
              >
                <RotateCw size={14} aria-hidden />
                Refresh
              </button>
              <button type="button" className="sl-icon-btn" onClick={() => setDetailLead(null)} aria-label="Close">
                <X size={16} />
              </button>
            </header>
            <div className="sl-modal__scroll mc-lookup-modal__body">
              <div className="sl-why">
                <p className="sl-why__label">Why grade {detailLead.chase_grade}</p>
                <p>{detailLead.grade_why}</p>
                {detailLead.notes && (
                  <p className="sl-why__notes">
                    <strong>Notes: </strong>
                    {detailLead.notes}
                  </p>
                )}
              </div>
              {detailLead.snapshot ? (
                <BrokerSnapshotSummaryView summary={detailLead.snapshot} />
              ) : (
                <div className="sl-empty">
                  <p>No BrokerSnapshot saved on this lead. Click Refresh to look it up.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {whyLead && (
        <div className="sl-overlay" role="presentation" onClick={() => setWhyLead(null)}>
          <div className="sl-modal" role="dialog" aria-modal aria-label="Why this grade" onClick={(e) => e.stopPropagation()}>
            <div className="sl-modal__head sl-modal__head--plain">
              <div className="sl-modal__title">
                <h2>Why grade {whyLead.chase_grade}</h2>
                <p className="sl-muted">{leadName(whyLead)}</p>
              </div>
              <GradeBadge grade={whyLead.chase_grade} />
            </div>
            <p className="sl-body-text">{whyLead.grade_why}</p>
            <dl className="sl-facts">
              <div>
                <dt>Years in business</dt>
                <dd>
                  {formatYears(whyLead.grade_breakdown.years_in_business)} → {whyLead.grade_breakdown.years_grade ?? 'n/a'}
                </dd>
              </div>
              <div>
                <dt>Fleet size</dt>
                <dd>
                  {whyLead.grade_breakdown.trucks ?? '—'} trucks → {whyLead.grade_breakdown.trucks_grade ?? 'n/a'}
                </dd>
              </div>
              {whyLead.grade_breakdown.demotions.length > 0 && (
                <div className="is-warn">
                  <dt>
                    <Info size={13} aria-hidden /> Demotions
                  </dt>
                  <dd>{whyLead.grade_breakdown.demotions.join(' · ')}</dd>
                </div>
              )}
              {whyLead.grade_breakdown.forced_f_reason && (
                <div className="is-stop">
                  <dt>Hard stop</dt>
                  <dd>{whyLead.grade_breakdown.forced_f_reason}</dd>
                </div>
              )}
            </dl>
            <div className="sl-modal__actions">
              <button type="button" className="sl-btn" onClick={() => setWhyLead(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {leadForm && (
        <SalesLeadFormModal
          key={leadForm.mode === 'edit' ? leadForm.lead.id : 'new'}
          lead={leadForm.mode === 'edit' ? leadForm.lead : null}
          prefill={leadForm.mode === 'add' ? leadForm.prefill : undefined}
          saving={savingLeadForm}
          onCancel={() => setLeadForm(null)}
          onSave={(input) => void handleSaveLeadForm(input)}
        />
      )}

      {notesLead && (
        <div className="sl-overlay" role="presentation" onClick={() => !savingNotes && setNotesLead(null)}>
          <div className="sl-modal" role="dialog" aria-modal aria-label="Lead notes" onClick={(e) => e.stopPropagation()}>
            <h2>Lead notes</h2>
            <p className="sl-muted">{leadName(notesLead)}</p>
            <textarea
              autoFocus
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={6}
              placeholder="Call notes, intro source, follow-up date…"
              className="sl-input sl-textarea"
            />
            <div className="sl-modal__actions">
              <button type="button" className="sl-btn" disabled={savingNotes} onClick={() => setNotesLead(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="sl-btn sl-btn--primary"
                disabled={savingNotes}
                onClick={() => void handleSaveNotes()}
              >
                {savingNotes ? 'Saving…' : 'Save notes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
