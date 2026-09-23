import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  RotateCw,
  Target,
  StickyNote,
  Info,
  X,
  Shield,
  NotebookPen,
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

type TabId = 'leads' | 'notepad' | 'rating'

const STATUS_OPTIONS: { value: SalesLeadStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'researching', label: 'Researching' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'replied', label: 'Replied' },
  { value: 'converted', label: 'Converted' },
  { value: 'declined', label: 'Declined' },
  { value: 'skipped', label: 'Skipped' },
]

const GRADE_COLORS: Record<SalesChaseGrade, string> = {
  A: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  B: 'bg-sky-100 text-sky-800 border-sky-200',
  C: 'bg-amber-100 text-amber-900 border-amber-200',
  D: 'bg-orange-100 text-orange-900 border-orange-200',
  F: 'bg-slate-200 text-slate-700 border-slate-300',
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
  const [tab, setTab] = useState<TabId>('leads')
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
      if (showAddModal || whyLead || detailLead || notesLead) return
      e.preventDefault()
      void openAddLead()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tab, showAddModal, whyLead, detailLead, notesLead, openAddLead])

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

  return (
    <div className="client-shell-scroll h-full min-h-0 overflow-y-auto p-5">
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Sales</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Cold-outreach leads by MC or DOT — BrokerSnapshot fleet + tenure → chase grade
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadLeads()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
            {tab === 'leads' && (
              <button
                type="button"
                onClick={() => void openAddLead()}
                className="dashboard-btn-primary inline-flex items-center gap-2"
              >
                <Plus size={16} />
                Add lead
                <kbd className="ml-1 rounded border border-white/30 bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold leading-none">
                  F
                </kbd>
              </button>
            )}
            {tab === 'notepad' && (
              <button
                type="button"
                disabled={notepadImporting || notepadDotCount === 0}
                onClick={() => void handleNotepadImport()}
                className="dashboard-btn-primary inline-flex items-center gap-2"
              >
                <NotebookPen size={16} />
                {notepadImporting
                  ? `Importing ${notepadProgress?.done ?? 0}/${notepadProgress?.total ?? 0}…`
                  : `Import ${notepadDotCount} DOT${notepadDotCount === 1 ? '' : 's'}`}
              </button>
            )}
            {tab === 'rating' && (
              <button
                type="button"
                disabled={savingRating || !ratingForm}
                onClick={() => void handleSaveRating()}
                className="dashboard-btn-primary inline-flex items-center gap-2"
              >
                <Save size={16} />
                {savingRating ? 'Saving…' : 'Save rules'}
              </button>
            )}
          </div>
        </div>

        <div className="page-tabs">
          <button
            type="button"
            className={`page-tab ${tab === 'leads' ? 'page-tab--active' : ''}`}
            onClick={() => setTab('leads')}
          >
            Leads
          </button>
          <button
            type="button"
            className={`page-tab ${tab === 'notepad' ? 'page-tab--active' : ''}`}
            onClick={() => setTab('notepad')}
          >
            Notepad
          </button>
          <button
            type="button"
            className={`page-tab ${tab === 'rating' ? 'page-tab--active' : ''}`}
            onClick={() => setTab('rating')}
          >
            Rating rules
          </button>
        </div>

        {tab === 'rating' ? (
          <div className="dashboard-card p-5">
            {ratingForm ? (
              <SalesLeadRatingSettingsPanel
                settings={ratingForm}
                onChange={(patch) => setRatingForm((prev) => (prev ? { ...prev, ...patch } : prev))}
              />
            ) : (
              <div className="flex justify-center py-12">
                <Spinner />
              </div>
            )}
          </div>
        ) : tab === 'notepad' ? (
          <div className="dashboard-card space-y-4 p-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                DOT notepad
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Paste DOTs from BrokerSnapshot map, separated by commas. Example:{' '}
                <span className="font-mono text-slate-700 dark:text-slate-300">
                  2550736, 104121, 3083852
                </span>
                . Each DOT is looked up, graded, and added — duplicates are skipped.
              </p>
            </div>

            <textarea
              value={notepadText}
              onChange={(e) => setNotepadText(e.target.value)}
              disabled={notepadImporting}
              rows={10}
              placeholder="2550736, 104121, 3083852, …"
              className="client-input w-full resize-y font-mono text-sm"
            />

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>
                {notepadDotCount} unique DOT{notepadDotCount === 1 ? '' : 's'} ready
                {notepadProgress
                  ? ` · Progress ${notepadProgress.done}/${notepadProgress.total}`
                  : ''}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="dashboard-btn-secondary"
                  disabled={notepadImporting || !notepadText.trim()}
                  onClick={() => {
                    setNotepadText('')
                    setNotepadLog([])
                  }}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className="dashboard-btn-primary"
                  disabled={notepadImporting || notepadDotCount === 0}
                  onClick={() => void handleNotepadImport()}
                >
                  {notepadImporting ? 'Importing…' : `Import ${notepadDotCount} DOTs`}
                </button>
              </div>
            </div>

            {notepadProgress && (
              <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-[#1684FE] transition-all"
                  style={{
                    width: `${Math.round(
                      (notepadProgress.done / Math.max(notepadProgress.total, 1)) * 100
                    )}%`,
                  }}
                />
              </div>
            )}

            {notepadLog.length > 0 && (
              <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="dashboard-table dashboard-table--compact w-full text-xs">
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
                        <td className="tabular-nums font-medium">{item.dot}</td>
                        <td>
                          {item.status === 'added' && (
                            <span className="text-emerald-700">
                              Added · {item.lead.chase_grade}
                            </span>
                          )}
                          {item.status === 'skipped' && (
                            <span className="text-amber-700">Skipped</span>
                          )}
                          {item.status === 'error' && (
                            <span className="text-red-600">Error</span>
                          )}
                        </td>
                        <td
                          className="max-w-[28rem] truncate text-slate-500"
                          title={
                            item.status === 'added' ? item.lead.company_name || '' : item.reason
                          }
                        >
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
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {(
                [
                  ['all', 'All', summary.all],
                  ['A', 'Grade A', summary.A],
                  ['B', 'Grade B', summary.B],
                  ['C', 'Grade C', summary.C],
                  ['D', 'Grade D', summary.D],
                  ['F', 'Grade F', summary.F],
                ] as const
              ).map(([key, label, value]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setGradeFilter(key)}
                  className={`rounded-xl border px-3 py-3 text-left transition ${
                    gradeFilter === key
                      ? 'border-[#1684FE] bg-sky-50 dark:bg-sky-950/40'
                      : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800'
                  }`}
                >
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {label}
                  </div>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {value}
                  </div>
                </button>
              ))}
            </div>

            <div className="client-page-toolbar flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search company, MC, DOT, notes…"
                  className="client-input w-full pl-9"
                />
              </div>
            </div>

            {loading && leads.length === 0 ? (
              <div className="flex justify-center py-16">
                <Spinner />
              </div>
            ) : (
              <div className="dashboard-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="dashboard-table dashboard-table--compact w-full">
                    <thead>
                      <tr>
                        <th>Grade</th>
                        <th>Company</th>
                        <th>MC / DOT</th>
                        <th>Trucks</th>
                        <th>Years</th>
                        <th>Contact</th>
                        <th>Email</th>
                        <th>Status</th>
                        <th>Why ranked</th>
                        <th>Notes</th>
                        <th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={11} className="py-12 text-center text-sm text-slate-500">
                            <Target className="mx-auto mb-2 text-slate-300" size={28} />
                            No leads yet. Add a carrier MC or DOT to pull BrokerSnapshot and score
                            them.
                          </td>
                        </tr>
                      ) : (
                        filtered.map((lead) => (
                          <tr key={lead.id}>
                            <td>
                              <span
                                className={`inline-flex min-w-[1.75rem] items-center justify-center rounded border px-2 py-0.5 text-xs font-bold ${GRADE_COLORS[lead.chase_grade]}`}
                              >
                                {lead.chase_grade}
                              </span>
                            </td>
                            <td>
                              <button
                                type="button"
                                onClick={() => setDetailLead(lead)}
                                className="text-left group"
                                title="View full BrokerSnapshot"
                              >
                                <div className="font-medium text-[#1684FE] group-hover:underline">
                                  {lead.company_name || '—'}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {lead.operating_status || '—'}
                                </div>
                              </button>
                            </td>
                            <td className="tabular-nums text-xs">
                              <div>{lead.mc_number || '—'}</div>
                              <div className="text-slate-500">
                                {lead.dot_number != null ? `DOT ${lead.dot_number}` : '—'}
                              </div>
                            </td>
                            <td className="tabular-nums">
                              {lead.total_trucks ?? lead.total_power_units ?? '—'}
                            </td>
                            <td className="tabular-nums">
                              {formatYears(lead.years_in_business)}
                            </td>
                              <td>
                              <div className="text-sm">{lead.officer || '—'}</div>
                              <div className="text-xs text-slate-500">
                                {lead.contact_phone || '—'}
                              </div>
                            </td>
                            <td>
                              {lead.contact_email ? (
                                <a
                                  href={`mailto:${lead.contact_email}`}
                                  className="text-sm text-[#1684FE] hover:underline break-all"
                                  title={`Email ${lead.contact_email}`}
                                >
                                  {lead.contact_email}
                                </a>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                            </td>
                            <td>
                              <select
                                className="client-input py-1 text-xs"
                                value={lead.status}
                                disabled={busyId === lead.id}
                                onChange={(e) =>
                                  void handleStatus(lead.id, e.target.value as SalesLeadStatus)
                                }
                              >
                                {STATUS_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="max-w-[18rem]">
                              <button
                                type="button"
                                onClick={() => setWhyLead(lead)}
                                className="group flex items-start gap-1 text-left text-xs text-slate-600 hover:text-[#1684FE] dark:text-slate-300"
                                title="See full ranking explanation"
                              >
                                <Info
                                  size={14}
                                  className="mt-0.5 shrink-0 text-slate-400 group-hover:text-[#1684FE]"
                                />
                                <span className="line-clamp-2">{lead.grade_why}</span>
                              </button>
                            </td>
                            <td>
                              <button
                                type="button"
                                onClick={() => openNotes(lead)}
                                className={`inline-flex max-w-[10rem] items-center gap-1 rounded border px-2 py-1 text-xs ${
                                  lead.notes
                                    ? 'border-amber-200 bg-amber-50 text-amber-900'
                                    : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-600'
                                }`}
                                title={lead.notes || 'Add notes'}
                              >
                                <StickyNote size={12} />
                                <span className="truncate">
                                  {lead.notes ? lead.notes : 'Add'}
                                </span>
                              </button>
                            </td>
                            <td>
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  title="Re-lookup Snapshot & re-score"
                                  disabled={busyId === lead.id}
                                  onClick={() => void handleRefresh(lead.id)}
                                  className="rounded border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-600"
                                >
                                  <RotateCw size={14} />
                                </button>
                                <button
                                  type="button"
                                  title="Remove lead"
                                  disabled={busyId === lead.id}
                                  onClick={() => void handleDelete(lead.id)}
                                  className="rounded border border-slate-200 p-1.5 text-red-600 hover:bg-red-50 dark:border-slate-600"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Add lead</h2>
            <p className="mt-1 text-xs text-slate-500">
              Looks up BrokerSnapshot for trucks, years in business, authority, and insurance —
              then assigns a chase grade from your rating rules. A copied MC/DOT is pasted
              automatically when you open this.
            </p>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                  lookupBy === 'mc'
                    ? 'border-[#1684FE] bg-sky-50 text-[#1684FE]'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-600'
                }`}
                onClick={() => setLookupBy('mc')}
              >
                By MC
              </button>
              <button
                type="button"
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                  lookupBy === 'dot'
                    ? 'border-[#1684FE] bg-sky-50 text-[#1684FE]'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-600'
                }`}
                onClick={() => setLookupBy('dot')}
              >
                By DOT
              </button>
            </div>

            <label className="mt-4 block text-xs font-medium text-slate-600 dark:text-slate-300">
              {lookupBy === 'mc' ? 'MC number' : 'DOT number'}
              <input
                autoFocus
                value={idInput}
                onChange={(e) => setIdInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleAddLead()
                }}
                placeholder={lookupBy === 'mc' ? 'e.g. 123456' : 'e.g. 987654'}
                className="client-input mt-1 w-full"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="dashboard-btn-secondary"
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
                className="dashboard-btn-primary"
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3"
          role="presentation"
          onClick={() => setDetailLead(null)}
        >
          <div
            className="mc-lookup-modal client-modal flex w-full max-w-4xl max-h-[92vh] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
            role="dialog"
            aria-modal
            aria-label="Lead BrokerSnapshot"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2.5 dark:border-slate-700">
              <Shield className="h-4 w-4 shrink-0 text-[#1684FE]" />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                  {detailLead.company_name || detailLead.mc_number || `DOT ${detailLead.dot_number}`}
                </h2>
                <p className="text-xs text-slate-500">
                  Grade {detailLead.chase_grade}
                  {detailLead.mc_number ? ` · ${detailLead.mc_number}` : ''}
                  {detailLead.dot_number != null ? ` · DOT ${detailLead.dot_number}` : ''}
                </p>
              </div>
              <span
                className={`inline-flex min-w-[1.75rem] items-center justify-center rounded border px-2 py-0.5 text-xs font-bold ${GRADE_COLORS[detailLead.chase_grade]}`}
              >
                {detailLead.chase_grade}
              </span>
              <button
                type="button"
                disabled={busyId === detailLead.id}
                onClick={() => void handleRefresh(detailLead.id)}
                className="dashboard-btn-secondary inline-flex items-center gap-1.5 text-xs"
              >
                <RotateCw size={14} />
                Refresh Snapshot
              </button>
              <button
                type="button"
                onClick={() => setDetailLead(null)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="mc-lookup-modal__body min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200">
                <p className="font-semibold text-slate-900 dark:text-slate-100">Why ranked</p>
                <p className="mt-1 leading-relaxed">{detailLead.grade_why}</p>
                {detailLead.notes && (
                  <p className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-600">
                    <span className="font-semibold">Notes: </span>
                    {detailLead.notes}
                  </p>
                )}
              </div>

              {detailLead.snapshot ? (
                <BrokerSnapshotSummaryView summary={detailLead.snapshot} />
              ) : (
                <div className="py-10 text-center text-sm text-slate-500">
                  No BrokerSnapshot saved on this lead. Click Refresh Snapshot to look it up.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {whyLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Why grade {whyLead.chase_grade}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {whyLead.company_name || whyLead.mc_number || `DOT ${whyLead.dot_number}`}
                </p>
              </div>
              <span
                className={`inline-flex min-w-[1.75rem] items-center justify-center rounded border px-2 py-0.5 text-xs font-bold ${GRADE_COLORS[whyLead.chase_grade]}`}
              >
                {whyLead.chase_grade}
              </span>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
              {whyLead.grade_why}
            </p>

            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                <dt className="text-slate-500">Years in business</dt>
                <dd className="mt-1 font-medium text-slate-900 dark:text-slate-100">
                  {formatYears(whyLead.grade_breakdown.years_in_business)} →{' '}
                  {whyLead.grade_breakdown.years_grade ?? 'n/a'}
                </dd>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                <dt className="text-slate-500">Fleet size</dt>
                <dd className="mt-1 font-medium text-slate-900 dark:text-slate-100">
                  {whyLead.grade_breakdown.trucks ?? '—'} trucks →{' '}
                  {whyLead.grade_breakdown.trucks_grade ?? 'n/a'}
                </dd>
              </div>
              {whyLead.grade_breakdown.demotions.length > 0 && (
                <div className="col-span-2 rounded-lg border border-orange-200 bg-orange-50 p-3 text-orange-900">
                  <dt className="font-medium">Demotions</dt>
                  <dd className="mt-1">{whyLead.grade_breakdown.demotions.join(' · ')}</dd>
                </div>
              )}
              {whyLead.grade_breakdown.forced_f_reason && (
                <div className="col-span-2 rounded-lg border border-slate-300 bg-slate-100 p-3">
                  <dt className="font-medium text-slate-700">Hard stop</dt>
                  <dd className="mt-1 text-slate-800">{whyLead.grade_breakdown.forced_f_reason}</dd>
                </div>
              )}
            </dl>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                className="dashboard-btn-secondary"
                onClick={() => setWhyLead(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {notesLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Lead notes</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {notesLead.company_name || notesLead.mc_number || `DOT ${notesLead.dot_number}`}
            </p>
            <textarea
              autoFocus
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={6}
              placeholder="Call notes, email draft status, intro source…"
              className="client-input mt-4 w-full resize-y"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="dashboard-btn-secondary"
                disabled={savingNotes}
                onClick={() => setNotesLead(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dashboard-btn-primary"
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
