import { useEffect, useMemo, useState } from 'react'
import { Bug, Copy, Loader2, RefreshCw, X } from 'lucide-react'
import { useClientTheme, useTheme } from '../../theme/ThemeContext'
import { formatCurrency, formatDateTime } from '../../utils/format'
import {
  buildBatchDebugSnapshot,
  type BatchDebugSeverity,
  type BatchDebugSnapshot,
} from '../../utils/batchDebugSnapshot'
import { fetchBatchProcessingJobsForDebug } from '../../services/credyx/batchDebugService'
import { getAdminBatchStatusBadge } from './adminBatchStatus'
import { useToast } from '../ui/ToastProvider'

interface BatchDebugPanelProps {
  batchId: string
  onClose: () => void
}

type DebugTab = 'timeline' | 'jobs' | 'invoices' | 'documents' | 'doc_ops' | 'audit' | 'raw'

function severityClass(severity: BatchDebugSeverity): string {
  switch (severity) {
    case 'error':
      return 'batch-debug-dot--error'
    case 'warning':
      return 'batch-debug-dot--warning'
    case 'success':
      return 'batch-debug-dot--success'
    default:
      return 'batch-debug-dot--info'
  }
}

/** Admin batch lifecycle debugger — timeline, jobs, invoices, docs, audit. */
export default function BatchDebugPanel({ batchId, onClose }: BatchDebugPanelProps) {
  const c = useClientTheme()
  const { resolvedTheme } = useTheme()
  const { showToast } = useToast()
  const [tab, setTab] = useState<DebugTab>('timeline')
  const [jobsLoading, setJobsLoading] = useState(true)
  const [jobsError, setJobsError] = useState<string | null>(null)
  const [jobs, setJobs] = useState<Awaited<ReturnType<typeof fetchBatchProcessingJobsForDebug>>>([])
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    setJobsLoading(true)
    setJobsError(null)
    void (async () => {
      try {
        const rows = await fetchBatchProcessingJobsForDebug(batchId)
        if (!cancelled) setJobs(rows)
      } catch (err) {
        if (!cancelled) {
          setJobs([])
          setJobsError(err instanceof Error ? err.message : 'Could not load processing jobs')
        }
      } finally {
        if (!cancelled) setJobsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [batchId, reloadKey])

  const snapshot: BatchDebugSnapshot | null = useMemo(
    () => buildBatchDebugSnapshot(batchId, jobs),
    [batchId, jobs, reloadKey]
  )

  const copyJson = async () => {
    if (!snapshot) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2))
      showToast('Debug snapshot copied', 'success')
    } catch {
      showToast('Could not copy to clipboard', 'error')
    }
  }

  const tabs: Array<{ id: DebugTab; label: string; count?: number }> = [
    { id: 'timeline', label: 'Timeline', count: snapshot?.timeline.length },
    { id: 'jobs', label: 'Jobs', count: snapshot?.jobs.length },
    { id: 'invoices', label: 'Invoices', count: snapshot?.invoices.length },
    { id: 'documents', label: 'Docs', count: snapshot?.documents.length },
    { id: 'doc_ops', label: 'Doc ops', count: snapshot?.docActions.length },
    { id: 'audit', label: 'Audit', count: snapshot?.auditLogs.length },
    { id: 'raw', label: 'Raw' },
  ]

  return (
    <div
      className="fixed inset-0 z-[60] flex items-stretch justify-center p-0 sm:p-4"
      style={{
        backgroundColor:
          resolvedTheme === 'dark' ? 'rgba(0,0,0,0.55)' : 'rgba(15,23,42,0.35)',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-debug-title"
      onClick={onClose}
    >
      <div
        className="batch-debug-panel dashboard-card relative flex flex-col w-full max-w-5xl sm:my-4 sm:rounded-2xl overflow-hidden shadow-2xl"
        style={{ maxHeight: '100vh', backgroundColor: c.card }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="flex-shrink-0 flex items-start justify-between gap-3 px-5 py-4 border-b"
          style={{ borderColor: c.border }}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Bug className="w-4 h-4 shrink-0" style={{ color: c.accent }} aria-hidden />
              <h2
                id="batch-debug-title"
                className="text-lg font-semibold truncate"
                style={{ color: c.primary }}
              >
                Batch debugging
              </h2>
            </div>
            {snapshot ? (
              <p className="text-sm truncate" style={{ color: c.secondary }}>
                {snapshot.batchNumber} · {snapshot.clientName}
              </p>
            ) : (
              <p className="text-sm" style={{ color: c.secondary }}>
                Batch not found in local store
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              className="client-header-icon-btn p-2 rounded-lg"
              style={{ color: c.muted }}
              title="Refresh"
              onClick={() => setReloadKey((k) => k + 1)}
            >
              <RefreshCw className={`w-4 h-4${jobsLoading ? ' animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              className="client-header-icon-btn p-2 rounded-lg"
              style={{ color: c.muted }}
              title="Copy JSON"
              onClick={() => void copyJson()}
              disabled={!snapshot}
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="client-header-icon-btn p-2 rounded-lg"
              style={{ color: c.muted }}
              aria-label="Close"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {snapshot && (
          <div
            className="flex-shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-2 px-5 py-3 border-b text-xs"
            style={{ borderColor: c.border, color: c.secondary }}
          >
            <div>
              <div className="uppercase tracking-wide opacity-70 mb-1">Status</div>
              {getAdminBatchStatusBadge(snapshot.overview.status)}
            </div>
            <div>
              <div className="uppercase tracking-wide opacity-70 mb-1">Sort</div>
              <div style={{ color: c.primary }}>
                {snapshot.overview.sort_status || '—'}
                {snapshot.overview.needs_doc_split ? ' · needs split' : ''}
              </div>
            </div>
            <div>
              <div className="uppercase tracking-wide opacity-70 mb-1">Queue</div>
              <div style={{ color: c.primary }}>
                {snapshot.overview.display_bucket} → {snapshot.overview.workflow_stage}
              </div>
            </div>
            <div>
              <div className="uppercase tracking-wide opacity-70 mb-1">AI review</div>
              <div style={{ color: c.primary }}>
                {snapshot.overview.ai_review_label || '—'}
              </div>
            </div>
            <div>
              <div className="uppercase tracking-wide opacity-70 mb-1">Submitted</div>
              <div style={{ color: c.primary }}>
                {formatDateTime(snapshot.overview.submitted_at)}
              </div>
            </div>
            <div>
              <div className="uppercase tracking-wide opacity-70 mb-1">Mode</div>
              <div style={{ color: c.primary }}>
                {snapshot.overview.upload_mode || '—'}
              </div>
            </div>
            <div>
              <div className="uppercase tracking-wide opacity-70 mb-1">Totals</div>
              <div style={{ color: c.primary }}>
                {snapshot.overview.total_invoices} inv ·{' '}
                {formatCurrency(snapshot.overview.total_amount)}
              </div>
            </div>
            <div>
              <div className="uppercase tracking-wide opacity-70 mb-1">Unmatched</div>
              <div style={{ color: c.primary }}>
                {snapshot.overview.unmatched_doc_count} doc(s)
                {snapshot.overview.in_use
                  ? ` · in use${snapshot.overview.in_use_by ? ` by ${snapshot.overview.in_use_by}` : ''}`
                  : ''}
              </div>
            </div>
          </div>
        )}

        <nav
          className="flex-shrink-0 flex gap-1 px-4 pt-3 overflow-x-auto"
          style={{ borderColor: c.border }}
          aria-label="Debug sections"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`batch-debug-tab${tab === t.id ? ' is-active' : ''}`}
              style={{
                color: tab === t.id ? c.primary : c.secondary,
                borderColor: tab === t.id ? c.accent : 'transparent',
              }}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {typeof t.count === 'number' ? (
                <span className="opacity-60 ml-1 tabular-nums">{t.count}</span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          {!snapshot ? (
            <p style={{ color: c.secondary }}>No batch data available for this id.</p>
          ) : tab === 'timeline' ? (
            <ol className="batch-debug-timeline">
              {snapshot.timeline.length === 0 ? (
                <li style={{ color: c.secondary }}>No timeline events yet.</li>
              ) : (
                snapshot.timeline.map((ev) => (
                  <li key={ev.id} className="batch-debug-timeline__item">
                    <span className={`batch-debug-dot ${severityClass(ev.severity)}`} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="font-medium text-sm" style={{ color: c.primary }}>
                          {ev.title}
                        </span>
                        <span className="text-xs tabular-nums" style={{ color: c.muted }}>
                          {ev.at ? formatDateTime(ev.at) : '—'}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide" style={{ color: c.muted }}>
                          {ev.source}
                        </span>
                      </div>
                      {ev.detail ? (
                        <p className="text-xs mt-0.5 whitespace-pre-wrap" style={{ color: c.secondary }}>
                          {ev.detail}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))
              )}
            </ol>
          ) : tab === 'jobs' ? (
            <div className="space-y-3">
              {jobsLoading ? (
                <p className="flex items-center gap-2 text-sm" style={{ color: c.secondary }}>
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading processing jobs…
                </p>
              ) : null}
              {jobsError ? (
                <p className="text-sm" style={{ color: '#dc2626' }}>
                  {jobsError}
                </p>
              ) : null}
              {!jobsLoading && snapshot.jobs.length === 0 ? (
                <p className="text-sm" style={{ color: c.secondary }}>
                  No batch_processing_jobs rows for this batch.
                </p>
              ) : (
                snapshot.jobs.map((job) => (
                  <article
                    key={job.id}
                    className="rounded-lg border p-3 text-sm"
                    style={{ borderColor: c.border, backgroundColor: c.card }}
                  >
                    <div className="flex flex-wrap gap-x-3 gap-y-1 font-medium" style={{ color: c.primary }}>
                      <span>{job.kind}</span>
                      <span className="status-pill status-pill--review">{job.status}</span>
                      <span className="text-xs font-normal" style={{ color: c.muted }}>
                        {job.id}
                      </span>
                    </div>
                    <dl className="batch-debug-fields mt-2">
                      <div>
                        <dt>Attempts</dt>
                        <dd>
                          {job.attempts}/{job.max_attempts}
                        </dd>
                      </div>
                      <div>
                        <dt>Created</dt>
                        <dd>{job.created_at ? formatDateTime(job.created_at) : '—'}</dd>
                      </div>
                      <div>
                        <dt>Started</dt>
                        <dd>{job.started_at ? formatDateTime(job.started_at) : '—'}</dd>
                      </div>
                      <div>
                        <dt>Finished</dt>
                        <dd>{job.finished_at ? formatDateTime(job.finished_at) : '—'}</dd>
                      </div>
                      <div>
                        <dt>Locked by</dt>
                        <dd>{job.locked_by || '—'}</dd>
                      </div>
                    </dl>
                    {job.last_error ? (
                      <pre
                        className="mt-2 text-xs whitespace-pre-wrap rounded-md p-2 overflow-x-auto"
                        style={{ backgroundColor: 'rgba(220,38,38,0.08)', color: '#b91c1c' }}
                      >
                        {job.last_error}
                      </pre>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          ) : tab === 'invoices' ? (
            <div className="overflow-x-auto">
              {snapshot.invoices.length === 0 ? (
                <p className="text-sm" style={{ color: c.secondary }}>
                  No invoices on this batch yet.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: c.muted, borderColor: c.border }}>
                      <th className="text-left font-medium py-2 pr-3">Invoice</th>
                      <th className="text-left font-medium py-2 pr-3">Status</th>
                      <th className="text-left font-medium py-2 pr-3">AI</th>
                      <th className="text-right font-medium py-2 pr-3">Amount</th>
                      <th className="text-left font-medium py-2 pr-3">Broker</th>
                      <th className="text-left font-medium py-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.invoices.map((inv) => (
                      <tr key={inv.id} style={{ borderColor: c.border }} className="border-t">
                        <td className="py-2 pr-3" style={{ color: c.primary }}>
                          <div className="font-medium">{inv.invoice_number}</div>
                          <div className="text-xs" style={{ color: c.muted }}>
                            {inv.load_number ? `Load ${inv.load_number}` : inv.id.slice(0, 8)}
                            {inv.ppw_sent ? ' · PPW sent' : ''}
                            {inv.doc_count ? ` · ${inv.doc_count} docs` : ''}
                          </div>
                        </td>
                        <td className="py-2 pr-3" style={{ color: c.secondary }}>
                          {inv.status}
                        </td>
                        <td className="py-2 pr-3" style={{ color: c.secondary }}>
                          {inv.ai_review_status || '—'}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums" style={{ color: c.primary }}>
                          {formatCurrency(inv.amount)}
                        </td>
                        <td className="py-2 pr-3" style={{ color: c.secondary }}>
                          {inv.broker_name || '—'}
                        </td>
                        <td className="py-2" style={{ color: c.secondary }}>
                          {inv.hold_reason || (inv.note_count ? `${inv.note_count} note(s)` : '—')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : tab === 'documents' ? (
            <div className="space-y-2">
              {snapshot.documents.length === 0 ? (
                <p className="text-sm" style={{ color: c.secondary }}>
                  No DocSort fingerprint catalog on this batch.
                </p>
              ) : (
                snapshot.documents.map((doc) => (
                  <div
                    key={doc.docId}
                    className="rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: c.border }}
                  >
                    <div className="font-medium" style={{ color: c.primary }}>
                      {doc.fileName}
                      {doc.needsSplitPages ? (
                        <span className="ml-2 text-xs font-normal" style={{ color: '#d97706' }}>
                          combined PDF
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: c.secondary }}>
                      {doc.kind}
                      {doc.loadNumbers.length ? ` · ${doc.loadNumbers.join(', ')}` : ''}
                      {doc.broker ? ` · ${doc.broker}` : ''}
                      {doc.invoiceNumber ? ` · Inv ${doc.invoiceNumber}` : ''}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : tab === 'doc_ops' ? (
            <ol className="batch-debug-timeline">
              {!snapshot.docActions.length ? (
                <li className="text-sm" style={{ color: c.secondary }}>
                  No Doc Splitter actions yet. Open Doc Splitter and split/mark pages to
                  record what happens to each file.
                </li>
              ) : (
                snapshot.docActions.map((ev) => (
                  <li key={ev.id} className="batch-debug-timeline__item">
                    <span
                      className={`batch-debug-dot ${
                        ev.type === 'page_split' || ev.type === 'unpack'
                          ? 'batch-debug-dot--success'
                          : ev.type === 'skip_split' || ev.type === 'dedupe'
                            ? 'batch-debug-dot--warning'
                            : 'batch-debug-dot--info'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="font-medium text-sm" style={{ color: c.primary }}>
                          {ev.title}
                        </span>
                        <span className="text-xs tabular-nums" style={{ color: c.muted }}>
                          {formatDateTime(ev.at)}
                        </span>
                        <span
                          className="text-[10px] uppercase tracking-wide"
                          style={{ color: c.muted }}
                        >
                          {ev.type}
                        </span>
                      </div>
                      {(ev.fileName || ev.detail) && (
                        <p className="text-xs mt-0.5" style={{ color: c.secondary }}>
                          {[ev.fileName, ev.detail].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      {ev.docId ? (
                        <p className="text-[11px] mt-0.5 font-mono" style={{ color: c.muted }}>
                          {ev.docId}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))
              )}
            </ol>
          ) : tab === 'audit' ? (
            <ul className="space-y-2">
              {snapshot.auditLogs.length === 0 ? (
                <li className="text-sm" style={{ color: c.secondary }}>
                  No audit log entries linked to this batch yet.
                </li>
              ) : (
                snapshot.auditLogs.map((log) => (
                  <li
                    key={log.id}
                    className="rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: c.border }}
                  >
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                      <span className="font-medium" style={{ color: c.primary }}>
                        {log.action}
                      </span>
                      <span className="text-xs" style={{ color: c.muted }}>
                        {formatDateTime(log.timestamp)}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: c.secondary }}>
                      {log.description}
                    </p>
                    <p className="text-[11px] mt-0.5" style={{ color: c.muted }}>
                      {log.user_name} · {log.entity_type}
                      {log.entity_id ? ` · ${log.entity_id}` : ''}
                    </p>
                  </li>
                ))
              )}
            </ul>
          ) : (
            <pre
              className="text-xs whitespace-pre-wrap rounded-lg p-3 overflow-x-auto"
              style={{
                backgroundColor: resolvedTheme === 'dark' ? 'rgba(0,0,0,0.35)' : 'rgba(15,23,42,0.04)',
                color: c.primary,
              }}
            >
              {JSON.stringify(
                {
                  overview: snapshot.overview,
                  rawBatch: snapshot.rawBatch,
                  jobs: snapshot.jobs,
                  invoices: snapshot.invoices,
                  documents: snapshot.documents,
                  docActions: snapshot.docActions,
                  timeline: snapshot.timeline,
                  auditLogs: snapshot.auditLogs,
                },
                null,
                2
              )}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
