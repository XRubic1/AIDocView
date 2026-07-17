import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, Search, X } from 'lucide-react'
import {
  findInvoicesForArRecalc,
  fixAllArRecalcIssues,
  fixArRecalcIssue,
  forceCloseInvoiceAr,
  getArRecalcPreview,
  getForceCloseArPreview,
  inspectInvoiceAr,
  listArRecalcIssues,
  type ArInvoiceInspection,
  type ArRecalcIssue,
  type ArRecalcPreview,
} from '../../services/invoiceArRecalcService'
import { formatCurrency, formatDate } from '../../utils/format'
import { useClientTheme } from '../../theme/ThemeContext'
import type { Invoice } from '../../types/invoice'
import Spinner from '../ui/Spinner'
import EmptyState from '../ui/EmptyState'

type ArRecalcPanelProps = {
  adminName: string
  /** Bumps when store data should be re-read (parent refreshKey). */
  refreshKey: number
  onFixed: () => void
  onToast: (message: string, type: 'success' | 'error') => void
}

type ConfirmState =
  | { mode: 'one'; preview: ArRecalcPreview; force?: boolean }
  | { mode: 'all'; issues: ArRecalcIssue[] }

function issueKindLabel(kind: ArRecalcIssue['kind']): string {
  if (kind === 'fully_paid_still_open') return 'Paid but still open'
  if (kind === 'short_blocks_close') return 'Short keeps A/R open'
  return 'paid_amount drift'
}

function verdictPillClass(verdict: ArInvoiceInspection['verdict']): string {
  if (verdict === 'needs_recalc') return 'status-pill status-pill--pending'
  if (verdict === 'healthy' || verdict === 'closed_ok') return 'status-pill status-pill--approved'
  if (verdict === 'awaiting_funds') return 'status-pill status-pill--hold'
  return 'status-pill'
}

function RecalcConfirmModal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer: ReactNode
  wide?: boolean
}) {
  const c = useClientTheme()
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className={`rounded-xl shadow-xl w-full max-h-[90vh] overflow-hidden flex flex-col ${
          wide ? 'max-w-2xl' : 'max-w-lg'
        }`}
        style={{ backgroundColor: c.card, boxShadow: c.shadow.cardHover }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ar-recalc-confirm-title"
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b shrink-0"
          style={{ borderColor: c.border }}
        >
          <h3
            id="ar-recalc-confirm-title"
            className="text-base font-semibold"
            style={{ color: c.primary }}
          >
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors hover:bg-slate-100"
            style={{ color: c.muted }}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1 min-h-0 space-y-4">{children}</div>
        <div
          className="flex items-center justify-end gap-2 px-5 py-4 border-t shrink-0"
          style={{ borderColor: c.border }}
        >
          {footer}
        </div>
      </div>
    </div>
  )
}

/** Credyx Payment Posting — lookup + fix invoices still in aging A/R after funds settled. */
export default function ArRecalcPanel({
  adminName,
  refreshKey,
  onFixed,
  onToast,
}: ArRecalcPanelProps) {
  const c = useClientTheme()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [lookupQuery, setLookupQuery] = useState('')
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [matchChoices, setMatchChoices] = useState<Invoice[] | null>(null)
  const [inspection, setInspection] = useState<ArInvoiceInspection | null>(null)

  const issues = useMemo(() => listArRecalcIssues(), [refreshKey])

  // Keep lookup results in sync after a fix / store refresh
  useEffect(() => {
    if (!inspection) return
    const next = inspectInvoiceAr(inspection.invoice.id)
    if (next) setInspection(next)
    // Only re-inspect when the payment/invoice store refreshes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  const runLookup = (query: string) => {
    const q = query.trim()
    setLookupError(null)
    setMatchChoices(null)
    setInspection(null)

    if (!q) {
      setLookupError('Enter an invoice # or amount')
      return
    }

    const matches = findInvoicesForArRecalc(q)
    if (matches.length === 0) {
      setLookupError(`No invoice found for “${q}”`)
      return
    }
    if (matches.length > 1) {
      setMatchChoices(matches)
      return
    }

    const result = inspectInvoiceAr(matches[0].id)
    if (!result) {
      setLookupError('Could not inspect that invoice')
      return
    }
    setInspection(result)
  }

  const selectMatch = (invoiceId: string) => {
    setMatchChoices(null)
    const result = inspectInvoiceAr(invoiceId)
    if (!result) {
      setLookupError('Could not inspect that invoice')
      return
    }
    setLookupQuery(result.invoice.invoice_number)
    setInspection(result)
  }

  const handleLookupSubmit = (e: FormEvent) => {
    e.preventDefault()
    runLookup(lookupQuery)
  }

  const refreshInspection = (invoiceId: string) => {
    const result = inspectInvoiceAr(invoiceId)
    setInspection(result)
  }

  const openOneConfirm = (issue: ArRecalcIssue) => {
    setConfirm({ mode: 'one', preview: getArRecalcPreview(issue) })
  }

  const openForceCloseConfirm = (invoiceId: string) => {
    const preview = getForceCloseArPreview(invoiceId)
    if (!preview) {
      onToast('Invoice is not in open A/R', 'error')
      return
    }
    setConfirm({ mode: 'one', preview, force: true })
  }

  const openAllConfirm = () => {
    if (issues.length === 0) return
    setConfirm({ mode: 'all', issues })
  }

  const handleConfirmOne = async () => {
    if (!confirm || confirm.mode !== 'one' || busyId) return
    const invoiceId = confirm.preview.issue.invoice.id
    const invoiceNumber = confirm.preview.issue.invoice.invoice_number
    const useForce = Boolean(confirm.force)
    setBusyId(invoiceId)
    try {
      const result = useForce
        ? await forceCloseInvoiceAr(invoiceId, adminName)
        : await fixArRecalcIssue(invoiceId, adminName)
      if (result) {
        onToast(`Closed ${result.invoice_number} to paid — removed from aging A/R`, 'success')
        setConfirm(null)
        refreshInspection(invoiceId)
        onFixed()
      } else {
        onToast(`Could not recalc ${invoiceNumber}`, 'error')
      }
    } catch {
      onToast('Recalc failed — check connection and try again', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const handleConfirmAll = async () => {
    if (!confirm || confirm.mode !== 'all' || busyId) return
    setBusyId('all')
    try {
      const { fixed, failed } = await fixAllArRecalcIssues(adminName)
      if (fixed > 0) {
        onToast(
          failed > 0
            ? `Recalc fixed ${fixed} invoice(s); ${failed} failed`
            : `Recalc fixed ${fixed} invoice(s)`,
          failed > 0 ? 'error' : 'success'
        )
        setConfirm(null)
        if (inspection) refreshInspection(inspection.invoice.id)
        onFixed()
      } else {
        onToast(failed > 0 ? 'Recalc failed for all rows' : 'Nothing to fix', 'error')
      }
    } catch {
      onToast('Recalc failed — check connection and try again', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const allAgingTotal =
    confirm?.mode === 'all'
      ? confirm.issues.reduce((sum, issue) => sum + issue.invoice.amount, 0)
      : 0

  return (
    <div className="space-y-4">
      <form
        onSubmit={handleLookupSubmit}
        className="rounded-lg border px-3 py-3 space-y-2"
        style={{ borderColor: c.border, backgroundColor: c.surface }}
      >
        <p className="text-sm" style={{ color: c.secondary }}>
          Enter an invoice # (or face amount), then check payments, paid timing, and whether it is
          still in aging A/R before applying a fix.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={lookupQuery}
            onChange={(e) => setLookupQuery(e.target.value)}
            placeholder="Invoice # or amount (e.g. 666)"
            className="client-input flex-1 min-w-0"
            style={{ backgroundColor: c.card }}
            aria-label="Invoice number or amount"
          />
          <button
            type="submit"
            className="dashboard-btn-primary inline-flex items-center justify-center gap-2 shrink-0"
          >
            <Search className="w-3.5 h-3.5" />
            Check invoice
          </button>
        </div>
        {lookupError && (
          <p className="text-sm" style={{ color: c.error }}>
            {lookupError}
          </p>
        )}
      </form>

      {matchChoices && matchChoices.length > 1 && (
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: c.border }}>
          <div className="px-3 py-2 text-sm font-medium" style={{ backgroundColor: c.surface, color: c.primary }}>
            Multiple matches — select an invoice
          </div>
          <ul className="divide-y" style={{ borderColor: c.border }}>
            {matchChoices.map((inv) => (
              <li key={inv.id}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 flex items-center justify-between gap-3"
                  onClick={() => selectMatch(inv.id)}
                >
                  <span>
                    <span className="font-medium" style={{ color: c.primary }}>
                      {inv.invoice_number}
                    </span>
                    <span style={{ color: c.secondary }}>
                      {' '}
                      · {inv.client_name} · {inv.status}
                    </span>
                  </span>
                  <span className="tabular-nums font-medium" style={{ color: c.primary }}>
                    {formatCurrency(inv.amount)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {inspection && (
        <div
          className="rounded-lg border overflow-hidden space-y-0"
          style={{ borderColor: c.border, backgroundColor: c.card }}
        >
          <div
            className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 px-4 py-3 border-b"
            style={{ borderColor: c.border, backgroundColor: c.surface }}
          >
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to={`/invoices?invoice=${encodeURIComponent(inspection.invoice.id)}`}
                  className="text-base font-semibold text-teal-700 hover:underline"
                >
                  {inspection.invoice.invoice_number}
                </Link>
                <span className={verdictPillClass(inspection.verdict)}>
                  {inspection.verdictLabel}
                </span>
              </div>
              <p className="text-sm" style={{ color: c.secondary }}>
                {inspection.invoice.client_name} · {inspection.invoice.broker_name} ·{' '}
                {formatCurrency(inspection.invoice.amount)}
              </p>
            </div>
            {inspection.canRecalc && inspection.issue ? (
              <button
                type="button"
                className="dashboard-btn-primary shrink-0 self-start"
                disabled={busyId != null}
                onClick={() => openOneConfirm(inspection.issue!)}
              >
                Review &amp; fix
              </button>
            ) : inspection.canForceClose ? (
              <button
                type="button"
                className="dashboard-btn-secondary shrink-0 self-start"
                disabled={busyId != null}
                onClick={() => openForceCloseConfirm(inspection.invoice.id)}
              >
                Close to paid
              </button>
            ) : null}
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 px-4 py-3 text-sm border-b" style={{ borderColor: c.border }}>
            <div>
              <p className="text-xs" style={{ color: c.muted }}>
                Status
              </p>
              <p className="font-medium" style={{ color: c.primary }}>
                {inspection.invoice.status}
              </p>
            </div>
            <div>
              <p className="text-xs" style={{ color: c.muted }}>
                In aging A/R?
              </p>
              <p className="font-medium" style={{ color: inspection.inAgingAr ? c.warning : c.success }}>
                {inspection.inAgingAr ? 'Yes — open A/R' : 'No'}
              </p>
            </div>
            <div>
              <p className="text-xs" style={{ color: c.muted }}>
                Confirmed / paid_amount
              </p>
              <p className="font-medium tabular-nums" style={{ color: c.primary }}>
                {formatCurrency(inspection.confirmedReceived)} / {formatCurrency(inspection.paidAmount)}
              </p>
              {inspection.confirmedShortTotal > 0 && (
                <p className="text-[11px] mt-0.5" style={{ color: c.muted }}>
                  Gross {formatCurrency(inspection.grossConfirmed)} · shorts −
                  {formatCurrency(inspection.confirmedShortTotal)}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs" style={{ color: c.muted }}>
                When paid / confirmed
              </p>
              <p className="font-medium" style={{ color: c.primary }}>
                {inspection.paidAtLabel ?? '—'}
              </p>
            </div>
          </div>

          <div className="px-4 py-3 border-b space-y-2" style={{ borderColor: c.border }}>
            <h4 className="text-xs font-semibold uppercase tracking-wide" style={{ color: c.muted }}>
              Findings
            </h4>
            <ul className="space-y-1.5 text-sm" style={{ color: c.secondary }}>
              {inspection.findings.map((finding) => (
                <li key={finding} className="flex gap-2">
                  <span aria-hidden style={{ color: c.mutedLight }}>
                    •
                  </span>
                  <span>{finding}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="px-4 py-3">
            <h4
              className="text-xs font-semibold uppercase tracking-wide mb-2"
              style={{ color: c.muted }}
            >
              Payments ({inspection.payments.length})
            </h4>
            {inspection.payments.length === 0 ? (
              <p className="text-sm" style={{ color: c.mutedLight }}>
                No payment rows for this invoice.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="dashboard-table dashboard-table--compact w-full">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th className="text-right">Amount</th>
                      <th>Kind</th>
                      <th>Received</th>
                      <th>Confirmed</th>
                      <th>Posted by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inspection.payments.map(({ payment, effectiveTowardBalance }) => (
                      <tr key={payment.id}>
                        <td>
                          <span className="status-pill status-pill--compact">{payment.status}</span>
                        </td>
                        <td className="text-right tabular-nums font-medium">
                          {formatCurrency(payment.amount)}
                          {payment.status === 'confirmed' && effectiveTowardBalance !== payment.amount && (
                            <span className="block text-[10px] font-normal" style={{ color: c.muted }}>
                              net {formatCurrency(effectiveTowardBalance)}
                            </span>
                          )}
                        </td>
                        <td style={{ color: c.secondary }}>{payment.payment_kind ?? 'normal'}</td>
                        <td style={{ color: c.secondary }}>{formatDate(payment.received_date)}</td>
                        <td style={{ color: c.secondary }}>
                          {payment.client_confirmed_at
                            ? formatDate(payment.client_confirmed_at)
                            : payment.confirmed_at
                              ? formatDate(payment.confirmed_at)
                              : '—'}
                        </td>
                        <td style={{ color: c.secondary }}>
                          {payment.posted_by ?? payment.posted_source ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <div
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border px-3 py-2.5"
        style={{ borderColor: c.border, backgroundColor: c.surface }}
      >
        <p className="text-sm" style={{ color: c.secondary }}>
          Auto-detected mismatches: settled funds but still approved (in aging). Review before
          closing to paid.
        </p>
        <button
          type="button"
          className="dashboard-btn-secondary inline-flex items-center gap-2 shrink-0 self-start sm:self-auto"
          disabled={issues.length === 0 || busyId != null}
          onClick={openAllConfirm}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {`Review all${issues.length ? ` (${issues.length})` : ''}`}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="dashboard-table dashboard-table--compact w-full">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Client</th>
              <th className="text-right">Amount</th>
              <th className="text-right">Confirmed</th>
              <th className="text-right">paid_amount</th>
              <th>Issue</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {issues.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState
                    title="No A/R mismatches"
                    hint="Fully paid invoices that are still approved (in aging) will appear here. You can still look up any invoice above."
                  />
                </td>
              </tr>
            ) : (
              issues.map((issue) => {
                const inv = issue.invoice
                const rowBusy = busyId === inv.id || busyId === 'all'
                return (
                  <tr key={inv.id}>
                    <td>
                      <button
                        type="button"
                        className="font-medium text-teal-700 hover:underline"
                        onClick={() => {
                          setLookupQuery(inv.invoice_number)
                          runLookup(inv.invoice_number)
                        }}
                      >
                        {inv.invoice_number}
                      </button>
                    </td>
                    <td>{inv.client_name}</td>
                    <td className="text-right tabular-nums font-medium">
                      {formatCurrency(inv.amount)}
                    </td>
                    <td className="text-right tabular-nums">
                      {formatCurrency(issue.confirmedReceived)}
                    </td>
                    <td className="text-right tabular-nums" style={{ color: c.secondary }}>
                      {formatCurrency(issue.paidAmount)}
                    </td>
                    <td>
                      <span className="status-pill status-pill--pending text-[10px]">
                        {issueKindLabel(issue.kind)}
                      </span>
                      <p
                        className="text-xs mt-1 max-w-xs"
                        style={{ color: c.mutedLight }}
                        title={issue.message}
                      >
                        {issue.message}
                      </p>
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <button
                        type="button"
                        className="text-teal-700 hover:underline text-sm disabled:opacity-50"
                        disabled={rowBusy}
                        onClick={() => openOneConfirm(issue)}
                      >
                        Review &amp; fix
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {confirm?.mode === 'one' && (
        <RecalcConfirmModal
          title={`Recalc ${confirm.preview.issue.invoice.invoice_number}?`}
          onClose={() => {
            if (!busyId) setConfirm(null)
          }}
          footer={
            <>
              <button
                type="button"
                className="dashboard-btn-secondary"
                disabled={busyId != null}
                onClick={() => setConfirm(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dashboard-btn-primary inline-flex items-center gap-2"
                disabled={busyId != null}
                onClick={() => void handleConfirmOne()}
              >
                {busyId === confirm.preview.issue.invoice.id && (
                  <Spinner size="sm" className="text-white" />
                )}
                {busyId === confirm.preview.issue.invoice.id
                  ? 'Applying…'
                  : confirm.force
                    ? 'Confirm close → paid'
                    : 'Confirm recalc → paid'}
              </button>
            </>
          }
        >
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide" style={{ color: c.muted }}>
              Issue
            </h4>
            <p className="text-sm font-medium" style={{ color: c.primary }}>
              {confirm.preview.issueTitle}
            </p>
            <p className="text-sm" style={{ color: c.secondary }}>
              {confirm.preview.issueDetail}
            </p>
            <div className="grid grid-cols-2 gap-2 text-sm pt-1">
              <div>
                <p className="text-xs" style={{ color: c.muted }}>
                  Client
                </p>
                <p style={{ color: c.primary }}>{confirm.preview.issue.invoice.client_name}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: c.muted }}>
                  Invoice amount
                </p>
                <p className="tabular-nums" style={{ color: c.primary }}>
                  {formatCurrency(confirm.preview.issue.invoice.amount)}
                </p>
              </div>
              <div>
                <p className="text-xs" style={{ color: c.muted }}>
                  Confirmed received
                </p>
                <p className="tabular-nums" style={{ color: c.primary }}>
                  {formatCurrency(confirm.preview.issue.confirmedReceived)}
                </p>
              </div>
              <div>
                <p className="text-xs" style={{ color: c.muted }}>
                  Current paid_amount
                </p>
                <p className="tabular-nums" style={{ color: c.primary }}>
                  {formatCurrency(confirm.preview.issue.paidAmount)}
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide" style={{ color: c.muted }}>
              Changes if you confirm
            </h4>
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: c.border }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: c.surface }}>
                    <th className="text-left px-3 py-2 font-medium" style={{ color: c.secondary }}>
                      Field
                    </th>
                    <th className="text-left px-3 py-2 font-medium" style={{ color: c.secondary }}>
                      Before
                    </th>
                    <th className="text-left px-3 py-2 font-medium" style={{ color: c.secondary }}>
                      After
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {confirm.preview.changes.map((row) => (
                    <tr key={row.label} className="border-t" style={{ borderColor: c.border }}>
                      <td className="px-3 py-2" style={{ color: c.secondary }}>
                        {row.label}
                      </td>
                      <td className="px-3 py-2 tabular-nums" style={{ color: c.mutedLight }}>
                        {row.before}
                      </td>
                      <td className="px-3 py-2 tabular-nums font-medium" style={{ color: c.primary }}>
                        {row.after}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide" style={{ color: c.muted }}>
              Also affected
            </h4>
            <ul className="space-y-1.5 text-sm" style={{ color: c.secondary }}>
              {confirm.preview.effects.map((effect) => (
                <li key={effect} className="flex gap-2">
                  <span aria-hidden style={{ color: c.mutedLight }}>
                    •
                  </span>
                  <span>{effect}</span>
                </li>
              ))}
            </ul>
          </section>
        </RecalcConfirmModal>
      )}

      {confirm?.mode === 'all' && (
        <RecalcConfirmModal
          title={`Recalc ${confirm.issues.length} invoice(s)?`}
          wide
          onClose={() => {
            if (!busyId) setConfirm(null)
          }}
          footer={
            <>
              <button
                type="button"
                className="dashboard-btn-secondary"
                disabled={busyId != null}
                onClick={() => setConfirm(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dashboard-btn-primary inline-flex items-center gap-2"
                disabled={busyId != null}
                onClick={() => void handleConfirmAll()}
              >
                {busyId === 'all' && <Spinner size="sm" className="text-white" />}
                {busyId === 'all'
                  ? 'Applying…'
                  : `Confirm all → paid (${confirm.issues.length})`}
              </button>
            </>
          }
        >
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide" style={{ color: c.muted }}>
              Issue
            </h4>
            <p className="text-sm" style={{ color: c.secondary }}>
              {confirm.issues.length} invoice(s) are still approved (in aging A/R) even though
              confirmed funds or paid_amount already cover the face amount.
            </p>
            <p className="text-sm tabular-nums" style={{ color: c.primary }}>
              Total open A/R that will be removed:{' '}
              <span className="font-semibold">{formatCurrency(allAgingTotal)}</span>
            </p>
          </section>

          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide" style={{ color: c.muted }}>
              Invoices that will change
            </h4>
            <div
              className="rounded-lg border max-h-48 overflow-y-auto"
              style={{ borderColor: c.border }}
            >
              <ul className="divide-y text-sm" style={{ borderColor: c.border }}>
                {confirm.issues.map((issue) => (
                  <li
                    key={issue.invoice.id}
                    className="flex items-start justify-between gap-3 px-3 py-2"
                    style={{ borderColor: c.border }}
                  >
                    <div className="min-w-0">
                      <p className="font-medium" style={{ color: c.primary }}>
                        {issue.invoice.invoice_number}
                        <span className="font-normal" style={{ color: c.secondary }}>
                          {' '}
                          · {issue.invoice.client_name}
                        </span>
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: c.mutedLight }}>
                        {issueKindLabel(issue.kind)} · confirmed{' '}
                        {formatCurrency(issue.confirmedReceived)}
                      </p>
                    </div>
                    <p className="tabular-nums shrink-0 font-medium" style={{ color: c.primary }}>
                      {formatCurrency(issue.invoice.amount)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide" style={{ color: c.muted }}>
              For each invoice
            </h4>
            <ul className="space-y-1.5 text-sm" style={{ color: c.secondary }}>
              <li>• Status: approved → paid</li>
              <li>• paid_amount synced to confirmed/recorded received</li>
              <li>• Removed from client aging A/R</li>
              <li>• Internal note + audit log written</li>
              <li>• Client portal cache refreshed</li>
            </ul>
          </section>
        </RecalcConfirmModal>
      )}
    </div>
  )
}
