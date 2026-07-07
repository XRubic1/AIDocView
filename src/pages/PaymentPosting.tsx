import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Search,
  Plus,
  X,
  CircleCheck,
  AlertTriangle,
  ArrowRightLeft,
  Undo2,
  FileText,
  Info,
} from 'lucide-react'
import AdminLayout from '../components/AdminLayout'
import { mockPayments, getConfirmedPaymentTotal } from '../data/mockPayments'
import { getInvoiceById, mockInvoices } from '../data/mockInvoices'
import type { Payment } from '../types/payment'
import type { Invoice } from '../types/invoice'
import {
  listPendingPayments,
  confirmClientPayment,
  rejectClientPayment,
  postAdminPayment,
  createAdHocInvoiceForPayment,
} from '../services/clientPaymentService'
import { listPendingWriteOffs, approveWriteOff, denyWriteOff } from '../services/writeOffApprovalService'
import { movePaymentFunds, unprocessPayment } from '../services/paymentCorrectionService'
import { formatCurrency, formatDate } from '../utils/format'
import { useToast } from '../components/ui/ToastProvider'
import { useAuth } from '../context/AuthContext'
import { getAdminUserDisplayName } from '../config/adminNav'
import { useClientTheme } from '../theme/ThemeContext'
import { isPostableForPayment } from '../utils/invoiceAging'
import {
  classifyPaymentVariance,
  getInvoiceBalanceState,
  type PaymentVarianceKind,
} from '../utils/paymentVariance'
import {
  getInvoicePostStatusClass,
  getInvoicePostStatusLabel,
  listDefaultPickerInvoices,
  searchInvoicesForPostPayment,
  type PostPaymentSearchHit,
} from '../utils/postPaymentInvoiceSearch'
import InvoiceBalanceSummary from '../components/client/InvoiceBalanceSummary'
import Spinner from '../components/ui/Spinner'
import EmptyState from '../components/ui/EmptyState'

type Tab = 'pending' | 'writeoffs' | 'corrections' | 'post'

const METHOD_OPTIONS = [
  { value: 'check' as const, label: 'Check' },
  { value: 'wire' as const, label: 'Wire' },
  { value: 'ach' as const, label: 'ACH' },
  { value: 'credit_card' as const, label: 'Card' },
]

function varianceLabel(kind: PaymentVarianceKind | null): string {
  if (kind === 'short') return 'Short pay'
  if (kind === 'over') return 'Overpayment'
  if (kind === 'full') return 'Paid in full'
  return '—'
}

function variancePillClass(kind: PaymentVarianceKind | null): string {
  if (kind === 'short') return 'status-pill status-pill--pending'
  if (kind === 'over') return 'status-pill status-pill--overdue'
  if (kind === 'full') return 'status-pill status-pill--approved'
  return 'status-pill'
}

/** Preview how confirming a pending payment would affect the invoice. */
function getPendingVariancePreview(payment: Payment) {
  const invoice = getInvoiceById(payment.invoice_id)
  if (!invoice) return null
  const confirmed = getConfirmedPaymentTotal(invoice.id)
  const projected = confirmed + payment.amount
  const variance = classifyPaymentVariance(invoice.amount, projected)
  const balance = getInvoiceBalanceState(invoice.amount, projected)
  return { invoice, confirmed, projected, variance, balance }
}

interface ModalShellProps {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}

function ModalShell({ title, onClose, children, footer, wide }: ModalShellProps) {
  const c = useClientTheme()
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className={`rounded-xl shadow-xl w-full max-h-[90vh] overflow-hidden flex flex-col ${
          wide ? 'max-w-3xl' : 'max-w-lg'
        }`}
        style={{ backgroundColor: c.card, boxShadow: c.shadow.cardHover }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-modal-title"
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b shrink-0"
          style={{ borderColor: c.border }}
        >
          <h3 id="admin-modal-title" className="text-base font-semibold" style={{ color: c.primary }}>
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
        <div className="p-5 overflow-y-auto flex-1 min-h-0">{children}</div>
        {footer ? (
          <div
            className="px-5 py-4 border-t shrink-0 flex justify-end gap-2"
            style={{ borderColor: c.border }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}

interface InvoiceSearchPickerProps {
  invoices: Invoice[]
  excludeInvoiceId?: string
  selectedId: string | null
  onSelect: (invoice: Invoice) => void
  label?: string
}

/** Searchable invoice picker for corrections and admin posting. */
function InvoiceSearchPicker({
  invoices,
  excludeInvoiceId,
  selectedId,
  onSelect,
  label = 'Search invoice',
}: InvoiceSearchPickerProps) {
  const c = useClientTheme()
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const getReceived = useCallback((invoiceId: string) => getConfirmedPaymentTotal(invoiceId), [])

  const hits = useMemo((): PostPaymentSearchHit[] => {
    const scoped = excludeInvoiceId
      ? invoices.filter((inv) => inv.id !== excludeInvoiceId)
      : invoices
    const q = query.trim()
    if (q) return searchInvoicesForPostPayment(scoped, q, 50)
    return listDefaultPickerInvoices(scoped, getReceived, showAll, 100)
  }, [invoices, excludeInvoiceId, query, showAll, getReceived])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="client-label" htmlFor="invoice-picker-search">
          {label}
        </label>
        <label className="flex items-center gap-1.5 text-xs" style={{ color: c.secondary }}>
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />
          Show all
        </label>
      </div>
      <div className="relative">
        <Search
          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4"
          style={{ color: c.mutedLight }}
        />
        <input
          id="invoice-picker-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Invoice #, load #, broker, amount…"
          className="client-input w-full pl-9"
          autoComplete="off"
        />
      </div>
      <div
        className="max-h-48 overflow-y-auto rounded-lg border divide-y"
        style={{ borderColor: c.border }}
        role="listbox"
        aria-label="Invoice search results"
      >
        {hits.length === 0 ? (
          <p className="p-3 text-sm text-center" style={{ color: c.mutedLight }}>
            No invoices match.
          </p>
        ) : (
          hits.map(({ invoice, isPostable }) => {
            const received = getConfirmedPaymentTotal(invoice.id)
            const balance = getInvoiceBalanceState(invoice.amount, received)
            const isSelected = selectedId === invoice.id
            return (
              <button
                key={invoice.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={!isPostable}
                onClick={() => onSelect(invoice)}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                  isSelected ? 'bg-teal-50' : 'hover:bg-slate-50'
                } ${!isPostable ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold tabular-nums">{invoice.invoice_number}</span>
                    <span className={getInvoicePostStatusClass(invoice, received)}>
                      {getInvoicePostStatusLabel(invoice, received)}
                    </span>
                  </div>
                  <p className="text-xs truncate" style={{ color: c.secondary }}>
                    {invoice.client_name} · {invoice.broker_name}
                    {invoice.load_number ? ` · ${invoice.load_number}` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0 tabular-nums">
                  <div className="font-medium">{formatCurrency(invoice.amount)}</div>
                  <div className="text-xs" style={{ color: c.mutedLight }}>
                    {balance.tone === 'zero' ? 'Paid' : formatCurrency(balance.signedBalance)}
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

export default function PaymentPosting() {
  const c = useClientTheme()
  const { showToast } = useToast()
  const { resolved } = useAuth()
  const adminName = getAdminUserDisplayName(resolved.user?.email ?? null)

  const [tab, setTab] = useState<Tab>('pending')
  const [refreshKey, setRefreshKey] = useState(0)
  const bump = () => setRefreshKey((k) => k + 1)

  const pending = useMemo(() => listPendingPayments(), [refreshKey])
  const writeOffs = useMemo(() => listPendingWriteOffs(), [refreshKey])
  const confirmed = useMemo(
    () => mockPayments.filter((p) => p.status === 'confirmed'),
    [refreshKey]
  )
  const allInvoices = useMemo(() => [...mockInvoices], [refreshKey])

  // Pending payment modals
  const [confirmTarget, setConfirmTarget] = useState<Payment | null>(null)
  const [rejectTarget, setRejectTarget] = useState<Payment | null>(null)
  const [confirmMethod, setConfirmMethod] = useState<Payment['payment_method']>('check')
  const [confirmReference, setConfirmReference] = useState('')
  const [confirmReceivedDate, setConfirmReceivedDate] = useState(
    () => new Date().toISOString().split('T')[0]
  )
  const [rejectReason, setRejectReason] = useState('')

  // Write-off modals
  const [approveTarget, setApproveTarget] = useState<Invoice | null>(null)
  const [denyTarget, setDenyTarget] = useState<Invoice | null>(null)
  const [approveNote, setApproveNote] = useState('')
  const [denyInternal, setDenyInternal] = useState('')
  const [denyClientNote, setDenyClientNote] = useState(
    'Balance reviewed — this load remains collectible.'
  )

  // Correction modals
  const [moveTarget, setMoveTarget] = useState<Payment | null>(null)
  const [unprocessTarget, setUnprocessTarget] = useState<Payment | null>(null)
  const [moveTargetInvoiceId, setMoveTargetInvoiceId] = useState<string | null>(null)
  const [moveReason, setMoveReason] = useState('')
  const [unprocessReason, setUnprocessReason] = useState('')
  const [mutationBusy, setMutationBusy] = useState<string | null>(null)

  const confirmPreview = confirmTarget ? getPendingVariancePreview(confirmTarget) : null

  const movePreview = useMemo(() => {
    if (!moveTarget || !moveTargetInvoiceId) return null
    const sourceInv = getInvoiceById(moveTarget.invoice_id)
    const targetInv = getInvoiceById(moveTargetInvoiceId)
    if (!sourceInv || !targetInv) return null
    const sourceConfirmed = getConfirmedPaymentTotal(sourceInv.id)
    const sourceAfter = Math.max(0, sourceConfirmed - moveTarget.amount)
    const targetConfirmed = getConfirmedPaymentTotal(targetInv.id)
    const targetAfter = targetConfirmed + moveTarget.amount
    return {
      sourceInv,
      targetInv,
      sourceAfter,
      targetAfter,
      sourceBalance: getInvoiceBalanceState(sourceInv.amount, sourceAfter),
      targetBalance: getInvoiceBalanceState(targetInv.amount, targetAfter),
      targetVariance: classifyPaymentVariance(targetInv.amount, targetAfter),
    }
  }, [moveTarget, moveTargetInvoiceId])

  const unprocessPreview = useMemo(() => {
    if (!unprocessTarget) return null
    const invoice = getInvoiceById(unprocessTarget.invoice_id)
    if (!invoice) return null
    const confirmed = getConfirmedPaymentTotal(invoice.id)
    const after = Math.max(0, confirmed - unprocessTarget.amount)
    return {
      invoice,
      after,
      balance: getInvoiceBalanceState(invoice.amount, after),
    }
  }, [unprocessTarget])

  const handleConfirmSubmit = async () => {
    if (!confirmTarget || mutationBusy) return
    setMutationBusy('confirm')
    try {
      const result = confirmClientPayment(
        {
          paymentId: confirmTarget.id,
          paymentMethod: confirmMethod,
          paymentReference: confirmReference.trim() || undefined,
          receivedDate: confirmReceivedDate,
        },
        adminName
      )
      if (result) {
        showToast(
          `Confirmed ${formatCurrency(result.payment.amount)} on ${result.invoice.invoice_number}`,
          'success'
        )
        setConfirmTarget(null)
        bump()
      } else {
        showToast('Could not confirm payment', 'error')
      }
    } finally {
      setMutationBusy(null)
    }
  }

  const handleRejectSubmit = async () => {
    if (!rejectTarget || !rejectReason.trim() || mutationBusy) return
    setMutationBusy('reject')
    try {
      const payment = rejectClientPayment(rejectTarget.id, adminName, {
        reason: rejectReason.trim(),
      })
      if (payment) {
        showToast('Payment rejected', 'success')
        setRejectTarget(null)
        setRejectReason('')
        bump()
      } else {
        showToast('Could not reject payment', 'error')
      }
    } finally {
      setMutationBusy(null)
    }
  }

  const handleApproveSubmit = async () => {
    if (!approveTarget || mutationBusy) return
    setMutationBusy('approve')
    try {
      const updated = await approveWriteOff(
        approveTarget.id,
        adminName,
        approveNote.trim() || undefined
      )
      if (updated) {
        showToast(`Write-off approved for ${updated.invoice_number}`, 'success')
        setApproveTarget(null)
        setApproveNote('')
        bump()
      } else {
        showToast('Could not approve write-off', 'error')
      }
    } finally {
      setMutationBusy(null)
    }
  }

  const handleDenySubmit = async () => {
    if (!denyTarget || !denyInternal.trim() || mutationBusy) return
    setMutationBusy('deny')
    try {
      const updated = await denyWriteOff(denyTarget.id, adminName, {
        internalNote: denyInternal.trim(),
        clientNote: denyClientNote.trim() || undefined,
      })
      if (updated) {
        showToast(`Write-off denied for ${updated.invoice_number}`, 'success')
        setDenyTarget(null)
        setDenyInternal('')
        bump()
      } else {
        showToast('Could not deny write-off', 'error')
      }
    } finally {
      setMutationBusy(null)
    }
  }

  const handleMoveSubmit = async () => {
    if (!moveTarget || !moveTargetInvoiceId || !moveReason.trim() || mutationBusy) return
    setMutationBusy('move')
    try {
      const result = movePaymentFunds(
        moveTarget.id,
        moveTargetInvoiceId,
        adminName,
        moveReason.trim()
      )
      if (result) {
        showToast('Funds moved', 'success')
        setMoveTarget(null)
        setMoveTargetInvoiceId(null)
        setMoveReason('')
        bump()
      } else {
        showToast('Could not move funds — check target invoice eligibility', 'error')
      }
    } finally {
      setMutationBusy(null)
    }
  }

  const handleUnprocessSubmit = async () => {
    if (!unprocessTarget || !unprocessReason.trim() || mutationBusy) return
    setMutationBusy('unprocess')
    try {
      const payment = unprocessPayment(unprocessTarget.id, adminName, unprocessReason.trim())
      if (payment) {
        showToast('Payment unprocessed', 'success')
        setUnprocessTarget(null)
        setUnprocessReason('')
        bump()
      } else {
        showToast('Could not unprocess payment', 'error')
      }
    } finally {
      setMutationBusy(null)
    }
  }

  const tabItems: { id: Tab; label: string; count?: number }[] = [
    { id: 'pending', label: 'Pending payments', count: pending.length },
    { id: 'writeoffs', label: 'Write-offs', count: writeOffs.length },
    { id: 'corrections', label: 'Corrections' },
    { id: 'post', label: 'Post payment' },
  ]

  return (
    <AdminLayout flushMain>
      <div className="admin-payment-posting-page overflow-hidden flex flex-col min-h-0 h-full">
        <div
          className="client-page-tabs-bar shrink-0 px-4 py-2 border-b"
          style={{ borderColor: c.border, backgroundColor: c.card }}
        >
          <div className="page-tabs flex flex-wrap gap-1">
            {tabItems.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`page-tab ${tab === t.id ? 'page-tab--active' : ''}`}
              >
                {t.label}
                {t.count != null && t.count > 0 ? ` (${t.count})` : ''}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {tab === 'pending' && (
            <div className="client-table-scroll overflow-x-auto">
              <table className="dashboard-table dashboard-table--compact w-full">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Client</th>
                    <th>Broker</th>
                    <th className="text-right">Amount</th>
                    <th>Method</th>
                    <th>Reported</th>
                    <th>Variance preview</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.length === 0 ? (
                    <tr>
                      <td colSpan={8}>
                        <EmptyState title="No pending payments" hint="Client-reported payments appear here for review." />
                      </td>
                    </tr>
                  ) : (
                    pending.map((p) => {
                      const preview = getPendingVariancePreview(p)
                      const invoice = preview?.invoice
                      return (
                        <tr key={p.id}>
                          <td>
                            {invoice ? (
                              <Link
                                to={`/invoice-search?invoice=${encodeURIComponent(invoice.invoice_number)}`}
                                className="font-medium text-teal-700 hover:underline"
                              >
                                {p.invoice_number}
                              </Link>
                            ) : (
                              p.invoice_number
                            )}
                          </td>
                          <td>{invoice?.client_name ?? '—'}</td>
                          <td>{p.broker_name}</td>
                          <td className="text-right tabular-nums font-medium">
                            {formatCurrency(p.amount)}
                          </td>
                          <td>{METHOD_OPTIONS.find((m) => m.value === p.payment_method)?.label ?? p.payment_method}</td>
                          <td>{formatDate(p.received_date)}</td>
                          <td>
                            {preview ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={variancePillClass(preview.variance)}>
                                  {varianceLabel(preview.variance)}
                                </span>
                                <span className="text-xs tabular-nums" style={{ color: c.mutedLight }}>
                                  {formatCurrency(preview.confirmed)} → {formatCurrency(preview.projected)} /{' '}
                                  {formatCurrency(preview.invoice.amount)}
                                </span>
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="text-right whitespace-nowrap">
                            <button
                              type="button"
                              className="text-teal-700 hover:underline text-sm mr-3"
                              onClick={() => {
                                setConfirmTarget(p)
                                setConfirmMethod(p.payment_method)
                                setConfirmReference(p.payment_reference ?? '')
                                setConfirmReceivedDate(p.received_date)
                              }}
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              className="text-red-600 hover:underline text-sm"
                              onClick={() => {
                                setRejectTarget(p)
                                setRejectReason('')
                              }}
                            >
                              Reject
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'writeoffs' && (
            <div className="client-table-scroll overflow-x-auto">
              <table className="dashboard-table dashboard-table--compact w-full">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Client</th>
                    <th className="text-right">Shortfall</th>
                    <th>Client note</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {writeOffs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-10" style={{ color: c.mutedLight }}>
                        No pending write-offs
                      </td>
                    </tr>
                  ) : (
                    writeOffs.map((inv) => (
                      <tr key={inv.id}>
                        <td className="font-medium">{inv.invoice_number}</td>
                        <td>{inv.client_name}</td>
                        <td className="text-right tabular-nums">
                          {formatCurrency(inv.write_off_request?.shortfall ?? 0)}
                        </td>
                        <td className="max-w-xs truncate">{inv.write_off_request?.client_note}</td>
                        <td className="text-right whitespace-nowrap">
                          <button
                            type="button"
                            className="text-teal-700 hover:underline text-sm mr-3"
                            onClick={() => {
                              setApproveTarget(inv)
                              setApproveNote('')
                            }}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="text-red-600 hover:underline text-sm"
                            onClick={() => {
                              setDenyTarget(inv)
                              setDenyInternal('')
                            }}
                          >
                            Deny
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'corrections' && (
            <div className="client-table-scroll overflow-x-auto">
              <table className="dashboard-table dashboard-table--compact w-full">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Client</th>
                    <th className="text-right">Amount</th>
                    <th>Method</th>
                    <th>Received</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {confirmed.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-10" style={{ color: c.mutedLight }}>
                        No confirmed payments to correct
                      </td>
                    </tr>
                  ) : (
                    confirmed.map((p) => {
                      const inv = getInvoiceById(p.invoice_id)
                      return (
                        <tr key={p.id}>
                          <td className="font-medium">{p.invoice_number}</td>
                          <td>{inv?.client_name ?? '—'}</td>
                          <td className="text-right tabular-nums">{formatCurrency(p.amount)}</td>
                          <td>{METHOD_OPTIONS.find((m) => m.value === p.payment_method)?.label ?? p.payment_method}</td>
                          <td>{formatDate(p.received_date)}</td>
                          <td className="text-right whitespace-nowrap">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-amber-700 hover:underline text-sm mr-3"
                              onClick={() => {
                                setMoveTarget(p)
                                setMoveTargetInvoiceId(null)
                                setMoveReason('')
                              }}
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                              Move funds
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-red-600 hover:underline text-sm"
                              onClick={() => {
                                setUnprocessTarget(p)
                                setUnprocessReason('')
                              }}
                            >
                              <Undo2 className="w-3.5 h-3.5" />
                              Unprocess
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'post' && (
            <AdminRemittancePostForm
              invoices={allInvoices}
              adminName={adminName}
              onPosted={() => {
                showToast('Payment posted', 'success')
                bump()
              }}
              onError={(msg) => showToast(msg, 'error')}
            />
          )}
        </div>
      </div>

      {confirmTarget && (
        <ModalShell
          title={`Confirm payment — ${confirmTarget.invoice_number}`}
          onClose={() => setConfirmTarget(null)}
          footer={
            <>
              <button type="button" className="dashboard-btn-secondary" onClick={() => setConfirmTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="dashboard-btn-primary inline-flex items-center gap-2"
                disabled={mutationBusy === 'confirm'}
                onClick={() => void handleConfirmSubmit()}
              >
                {mutationBusy === 'confirm' && <Spinner size="sm" className="text-white" />}
                {mutationBusy === 'confirm' ? 'Confirming…' : 'Confirm payment'}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span style={{ color: c.secondary }}>Amount</span>
                <p className="font-semibold tabular-nums">{formatCurrency(confirmTarget.amount)}</p>
              </div>
              <div>
                <span style={{ color: c.secondary }}>Broker</span>
                <p>{confirmTarget.broker_name}</p>
              </div>
            </div>

            {confirmPreview && (
              <div
                className="rounded-lg border p-3 text-sm space-y-1"
                style={{ borderColor: c.border, backgroundColor: c.stat.slate }}
              >
                <p className="font-medium flex items-center gap-1.5" style={{ color: c.primary }}>
                  <Info className="w-4 h-4" />
                  Variance preview
                </p>
                <p style={{ color: c.secondary }}>
                  Confirmed {formatCurrency(confirmPreview.confirmed)} + pending{' '}
                  {formatCurrency(confirmTarget.amount)} = {formatCurrency(confirmPreview.projected)} of{' '}
                  {formatCurrency(confirmPreview.invoice.amount)}
                </p>
                <span className={variancePillClass(confirmPreview.variance)}>
                  {varianceLabel(confirmPreview.variance)}
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="client-label" htmlFor="confirm-method">
                  Method
                </label>
                <select
                  id="confirm-method"
                  value={confirmMethod}
                  onChange={(e) => setConfirmMethod(e.target.value as Payment['payment_method'])}
                  className="client-input w-full"
                >
                  {METHOD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="client-label" htmlFor="confirm-received">
                  Received date
                </label>
                <input
                  id="confirm-received"
                  type="date"
                  value={confirmReceivedDate}
                  onChange={(e) => setConfirmReceivedDate(e.target.value)}
                  className="client-input w-full"
                />
              </div>
              <div className="col-span-2">
                <label className="client-label" htmlFor="confirm-reference">
                  Reference #
                </label>
                <input
                  id="confirm-reference"
                  type="text"
                  value={confirmReference}
                  onChange={(e) => setConfirmReference(e.target.value)}
                  className="client-input w-full"
                  placeholder="Check #, wire ref…"
                />
              </div>
            </div>
          </div>
        </ModalShell>
      )}

      {rejectTarget && (
        <ModalShell
          title={`Reject payment — ${rejectTarget.invoice_number}`}
          onClose={() => setRejectTarget(null)}
          footer={
            <>
              <button type="button" className="dashboard-btn-secondary" onClick={() => setRejectTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="dashboard-btn-primary inline-flex items-center gap-2"
                style={{ backgroundColor: c.error }}
                disabled={!rejectReason.trim() || mutationBusy === 'reject'}
                onClick={() => void handleRejectSubmit()}
              >
                {mutationBusy === 'reject' && <Spinner size="sm" className="text-white" />}
                {mutationBusy === 'reject' ? 'Rejecting…' : 'Reject payment'}
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-sm" style={{ color: c.secondary }}>
              Rejecting {formatCurrency(rejectTarget.amount)} reported on {rejectTarget.invoice_number}.
              This reason is visible to the client.
            </p>
            <div>
              <label className="client-label" htmlFor="reject-reason">
                Rejection reason <span className="text-red-600">*</span>
              </label>
              <textarea
                id="reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                className="client-input w-full"
                placeholder="e.g. No matching remittance received"
              />
            </div>
          </div>
        </ModalShell>
      )}

      {approveTarget && (
        <ModalShell
          title={`Approve write-off — ${approveTarget.invoice_number}`}
          onClose={() => setApproveTarget(null)}
          footer={
            <>
              <button type="button" className="dashboard-btn-secondary" onClick={() => setApproveTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="dashboard-btn-primary inline-flex items-center gap-2"
                disabled={mutationBusy === 'approve'}
                onClick={() => void handleApproveSubmit()}
              >
                {mutationBusy === 'approve' && <Spinner size="sm" className="text-white" />}
                {mutationBusy === 'approve' ? 'Approving…' : 'Approve write-off'}
              </button>
            </>
          }
        >
          <div className="space-y-3 text-sm">
            <p style={{ color: c.secondary }}>
              Shortfall: {formatCurrency(approveTarget.write_off_request?.shortfall ?? 0)} on{' '}
              {approveTarget.client_name}
            </p>
            {approveTarget.write_off_request?.client_note && (
              <p className="italic" style={{ color: c.mutedLight }}>
                Client: {approveTarget.write_off_request.client_note}
              </p>
            )}
            <div>
              <label className="client-label" htmlFor="approve-note">
                Internal note <span className="font-normal opacity-70">(optional)</span>
              </label>
              <textarea
                id="approve-note"
                value={approveNote}
                onChange={(e) => setApproveNote(e.target.value)}
                rows={2}
                className="client-input w-full"
              />
            </div>
          </div>
        </ModalShell>
      )}

      {denyTarget && (
        <ModalShell
          title={`Deny write-off — ${denyTarget.invoice_number}`}
          onClose={() => setDenyTarget(null)}
          footer={
            <>
              <button type="button" className="dashboard-btn-secondary" onClick={() => setDenyTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="dashboard-btn-primary inline-flex items-center gap-2"
                style={{ backgroundColor: c.error }}
                disabled={!denyInternal.trim() || mutationBusy === 'deny'}
                onClick={() => void handleDenySubmit()}
              >
                {mutationBusy === 'deny' && <Spinner size="sm" className="text-white" />}
                {mutationBusy === 'deny' ? 'Denying…' : 'Deny write-off'}
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <div>
              <label className="client-label" htmlFor="deny-internal">
                Internal reason <span className="text-red-600">*</span>
              </label>
              <textarea
                id="deny-internal"
                value={denyInternal}
                onChange={(e) => setDenyInternal(e.target.value)}
                rows={2}
                className="client-input w-full"
              />
            </div>
            <div>
              <label className="client-label" htmlFor="deny-client">
                Client-visible note
              </label>
              <textarea
                id="deny-client"
                value={denyClientNote}
                onChange={(e) => setDenyClientNote(e.target.value)}
                rows={2}
                className="client-input w-full"
              />
            </div>
          </div>
        </ModalShell>
      )}

      {moveTarget && (
        <ModalShell
          title={`Move funds — ${moveTarget.invoice_number}`}
          wide
          onClose={() => setMoveTarget(null)}
          footer={
            <>
              <button type="button" className="dashboard-btn-secondary" onClick={() => setMoveTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="dashboard-btn-primary inline-flex items-center gap-2"
                disabled={!moveTargetInvoiceId || !moveReason.trim() || mutationBusy === 'move'}
                onClick={() => void handleMoveSubmit()}
              >
                {mutationBusy === 'move' && <Spinner size="sm" className="text-white" />}
                {mutationBusy === 'move' ? 'Moving…' : 'Move funds'}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div
              className="rounded-lg border p-3 text-sm"
              style={{ borderColor: c.border, backgroundColor: c.stat.slate }}
            >
              <p className="font-medium" style={{ color: c.primary }}>
                Source: {moveTarget.invoice_number} — {formatCurrency(moveTarget.amount)}
              </p>
              <p className="text-xs mt-1" style={{ color: c.mutedLight }}>
                {moveTarget.broker_name}
                {moveTarget.load_number ? ` · Load ${moveTarget.load_number}` : ''}
              </p>
            </div>

            <InvoiceSearchPicker
              invoices={allInvoices}
              excludeInvoiceId={moveTarget.invoice_id}
              selectedId={moveTargetInvoiceId}
              onSelect={(inv) => setMoveTargetInvoiceId(inv.id)}
              label="Target invoice"
            />

            <div>
              <label className="client-label" htmlFor="move-reason">
                Reason <span className="text-red-600">*</span>
              </label>
              <textarea
                id="move-reason"
                value={moveReason}
                onChange={(e) => setMoveReason(e.target.value)}
                rows={2}
                className="client-input w-full"
                placeholder="Due to…"
              />
            </div>

            {movePreview && (
              <div
                className="rounded-lg border p-3 text-sm space-y-2"
                style={{ borderColor: c.warning, backgroundColor: c.stat.amber }}
              >
                <p className="font-medium flex items-center gap-1.5" style={{ color: c.primary }}>
                  <AlertTriangle className="w-4 h-4" />
                  Consequence preview
                </p>
                <p>
                  <strong>{movePreview.sourceInv.invoice_number}</strong> reopens with{' '}
                  {formatCurrency(movePreview.sourceBalance.signedBalance)} outstanding
                </p>
                <p>
                  <strong>{movePreview.targetInv.invoice_number}</strong> becomes{' '}
                  {varianceLabel(movePreview.targetVariance).toLowerCase()} (
                  {formatCurrency(movePreview.targetAfter)} received of{' '}
                  {formatCurrency(movePreview.targetInv.amount)})
                </p>
              </div>
            )}
          </div>
        </ModalShell>
      )}

      {unprocessTarget && (
        <ModalShell
          title={`Unprocess payment — ${unprocessTarget.invoice_number}`}
          onClose={() => setUnprocessTarget(null)}
          footer={
            <>
              <button type="button" className="dashboard-btn-secondary" onClick={() => setUnprocessTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="dashboard-btn-primary inline-flex items-center gap-2"
                style={{ backgroundColor: c.error }}
                disabled={!unprocessReason.trim() || mutationBusy === 'unprocess'}
                onClick={() => void handleUnprocessSubmit()}
              >
                {mutationBusy === 'unprocess' && <Spinner size="sm" className="text-white" />}
                {mutationBusy === 'unprocess' ? 'Unprocessing…' : 'Unprocess payment'}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-sm" style={{ color: c.secondary }}>
              Reverse {formatCurrency(unprocessTarget.amount)} on {unprocessTarget.invoice_number}. This
              cannot be undone.
            </p>
            <div>
              <label className="client-label" htmlFor="unprocess-reason">
                Reason <span className="text-red-600">*</span>
              </label>
              <textarea
                id="unprocess-reason"
                value={unprocessReason}
                onChange={(e) => setUnprocessReason(e.target.value)}
                rows={2}
                className="client-input w-full"
                placeholder="Due to…"
              />
            </div>
            {unprocessPreview && (
              <div
                className="rounded-lg border p-3 text-sm"
                style={{ borderColor: c.warning, backgroundColor: c.stat.amber }}
              >
                <p className="font-medium flex items-center gap-1.5" style={{ color: c.primary }}>
                  <AlertTriangle className="w-4 h-4" />
                  Invoice {unprocessPreview.invoice.invoice_number} returns to unpaid with{' '}
                  {formatCurrency(unprocessPreview.balance.signedBalance)} outstanding; aging resumes.
                </p>
              </div>
            )}
          </div>
        </ModalShell>
      )}
    </AdminLayout>
  )
}

type SelectionMode = 'none' | 'existing' | 'new'

interface AdminRemittancePostFormProps {
  invoices: Invoice[]
  adminName: string
  onPosted: () => void
  onError: (message: string) => void
}

/** Admin remittance posting — confirmed payments applied immediately. */
function AdminRemittancePostForm({
  invoices,
  adminName,
  onPosted,
  onError,
}: AdminRemittancePostFormProps) {
  const c = useClientTheme()
  const today = new Date().toISOString().split('T')[0]
  const filterRef = useRef<HTMLInputElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)

  const [filterQuery, setFilterQuery] = useState('')
  const [showAllInvoices, setShowAllInvoices] = useState(false)
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('none')
  const [selected, setSelected] = useState<Invoice | null>(null)
  const [newInvoiceNumber, setNewInvoiceNumber] = useState('')
  const [newBrokerName, setNewBrokerName] = useState('')
  const [newClientName, setNewClientName] = useState('')
  const [newClientId, setNewClientId] = useState('')
  const [newLoadNumber, setNewLoadNumber] = useState('')
  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(today)
  const [receivedDate, setReceivedDate] = useState(today)
  const [paymentMethod, setPaymentMethod] = useState<Payment['payment_method']>('check')
  const [paymentReference, setPaymentReference] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const getReceived = useCallback((invoiceId: string) => getConfirmedPaymentTotal(invoiceId), [])

  const invoiceList = useMemo((): PostPaymentSearchHit[] => {
    const q = filterQuery.trim()
    if (q) return searchInvoicesForPostPayment(invoices, q, 100)
    return listDefaultPickerInvoices(invoices, getReceived, showAllInvoices)
  }, [invoices, filterQuery, showAllInvoices, getReceived])

  const exactInvoiceMatch = useMemo(() => {
    const q = filterQuery.trim().toLowerCase()
    if (!q) return false
    return invoices.some((inv) => inv.invoice_number.toLowerCase() === q)
  }, [invoices, filterQuery])

  const showCreateNew =
    filterQuery.trim().length >= 2 && !exactInvoiceMatch && selectionMode !== 'new'

  const priorReceived = selected ? getConfirmedPaymentTotal(selected.id) : 0
  const amountNum = parseFloat(amount)

  const selectInvoice = useCallback((invoice: Invoice) => {
    if (!isPostableForPayment(invoice)) {
      onError(`Invoice ${invoice.invoice_number} cannot receive payments.`)
      return
    }
    const already = getConfirmedPaymentTotal(invoice.id)
    const balance = Math.max(0, invoice.amount - already)
    setSelected(invoice)
    setSelectionMode('existing')
    setFilterQuery('')
    if (balance > 0) setAmount(balance.toFixed(2))
    else setAmount('')
    requestAnimationFrame(() => amountRef.current?.focus())
  }, [onError])

  const startCreateNew = useCallback((query?: string) => {
    setSelected(null)
    setSelectionMode('new')
    setNewInvoiceNumber(query?.trim() ?? filterQuery.trim())
    setNewBrokerName('')
    setNewClientName('')
    setNewClientId('')
    setNewLoadNumber('')
    requestAnimationFrame(() => {
      document.getElementById('admin-new-invoice-number')?.focus()
    })
  }, [filterQuery])

  const resetForm = () => {
    setFilterQuery('')
    setSelectionMode('none')
    setSelected(null)
    setNewInvoiceNumber('')
    setNewBrokerName('')
    setNewClientName('')
    setNewClientId('')
    setNewLoadNumber('')
    setAmount('')
    setPaymentReference('')
    setNotes('')
    setPaymentDate(today)
    setReceivedDate(today)
    setPaymentMethod('check')
    filterRef.current?.focus()
  }

  const canSubmit =
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    paymentDate &&
    receivedDate &&
    ((selectionMode === 'existing' && selected) ||
      (selectionMode === 'new' &&
        newInvoiceNumber.trim() &&
        newBrokerName.trim() &&
        newClientName.trim()))

  const handleSubmit = async () => {
    if (!canSubmit) {
      onError('Select an invoice and enter a valid amount.')
      return
    }
    setIsSubmitting(true)
    try {
      let invoiceId = selected?.id

      if (selectionMode === 'new') {
        const created = createAdHocInvoiceForPayment(
          {
            clientId: newClientId.trim() || `client-adhoc-${Date.now()}`,
            clientName: newClientName.trim(),
            invoiceNumber: newInvoiceNumber.trim(),
            brokerName: newBrokerName.trim(),
            amount: amountNum,
            loadNumber: newLoadNumber.trim() || undefined,
          },
          adminName
        )
        invoiceId = created.id
      }

      if (!invoiceId) {
        onError('No invoice selected.')
        return
      }

      const result = postAdminPayment(
        {
          invoiceId,
          amount: amountNum,
          paymentDate,
          receivedDate,
          paymentMethod,
          paymentReference: paymentReference.trim() || undefined,
          notes: notes.trim() || undefined,
        },
        adminName
      )

      if (!result) {
        onError('Could not post payment. Invoice may not be eligible.')
        return
      }

      onPosted()
      resetForm()
      if (selectionMode === 'existing' && selected) {
        setSelected(selected)
        setSelectionMode('existing')
        setNewBrokerName(selected.broker_name)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="post-payment-workspace" aria-label="Post remittance">
      <form
        className="post-payment-workspace__form"
        onSubmit={(e) => {
          e.preventDefault()
          void handleSubmit()
        }}
      >
        <header className="post-payment-workspace__header">
          <h2 className="post-payment-workspace__title">Post remittance</h2>
          <p className="post-payment-workspace__subtitle">
            Credyx-posted payments are confirmed immediately and applied to the invoice
          </p>
        </header>

        <div className="post-payment-workspace__panels">
          <aside className="post-payment-picker" aria-labelledby="admin-post-picker-heading">
            <div className="post-payment-picker__head">
              <h3 id="admin-post-picker-heading" className="post-payment-panel__step">
                <span className="post-payment-panel__step-num">1</span>
                Select invoice
              </h3>
            </div>
            <div className="post-payment-picker__filter-row">
              <label className="client-label" htmlFor="admin-post-invoice-filter">
                Filter invoices
              </label>
              <label className="post-payment-picker__show-all">
                <input
                  type="checkbox"
                  checked={showAllInvoices}
                  onChange={(e) => setShowAllInvoices(e.target.checked)}
                />
                <span>Show all invoices</span>
              </label>
            </div>
            <div className="post-payment-picker__filter">
              <Search className="post-payment-picker__filter-icon" style={{ color: c.secondary }} aria-hidden />
              <input
                ref={filterRef}
                id="admin-post-invoice-filter"
                type="search"
                placeholder="Invoice #, load #, broker, amount…"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="client-input post-payment-picker__filter-input"
                autoComplete="off"
              />
            </div>
            <div className="post-payment-picker__list" role="listbox">
              {invoiceList.map(({ invoice, isPostable }) => {
                const received = getConfirmedPaymentTotal(invoice.id)
                const balance = getInvoiceBalanceState(invoice.amount, received)
                const isSelected = selected?.id === invoice.id && selectionMode === 'existing'
                return (
                  <button
                    key={invoice.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={!isPostable}
                    className={`post-payment-picker__row ${isSelected ? 'post-payment-picker__row--selected' : ''} ${!isPostable ? 'post-payment-picker__row--disabled' : ''}`}
                    onClick={() => selectInvoice(invoice)}
                  >
                    <div className="post-payment-picker__row-main">
                      <div className="post-payment-picker__row-top">
                        <span className="post-payment-picker__inv-num">{invoice.invoice_number}</span>
                        <span className={getInvoicePostStatusClass(invoice, received)}>
                          {getInvoicePostStatusLabel(invoice, received)}
                        </span>
                      </div>
                      <p className="post-payment-picker__row-meta">
                        {invoice.client_name} · {invoice.broker_name}
                        {invoice.load_number ? ` · ${invoice.load_number}` : ''}
                      </p>
                    </div>
                    <div className="post-payment-picker__row-amounts">
                      <span className="post-payment-picker__total financial-nums">
                        {formatCurrency(invoice.amount)}
                      </span>
                      <span className={`post-payment-picker__balance post-payment-picker__balance--${balance.tone}`}>
                        {formatCurrency(balance.signedBalance)}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
            {showCreateNew && (
              <button
                type="button"
                className="post-payment-picker__create"
                onClick={() => startCreateNew(filterQuery.trim())}
              >
                <Plus className="w-4 h-4 shrink-0" style={{ color: c.warning }} />
                <span>Create invoice &ldquo;{filterQuery.trim()}&rdquo; for unmatched remittance</span>
              </button>
            )}
            <button
              type="button"
              className="post-payment-picker__create post-payment-picker__create--secondary"
              onClick={() => startCreateNew()}
            >
              <Plus className="w-4 h-4 shrink-0" style={{ color: c.info }} />
              <span>New ad-hoc invoice + payment</span>
            </button>
          </aside>

          <div className="post-payment-entry">
            <h3 className="post-payment-panel__step">
              <span className="post-payment-panel__step-num">2</span>
              Payment details
            </h3>

            {selectionMode === 'none' && (
              <div className="post-payment-entry__placeholder" style={{ color: c.secondary }}>
                <FileText className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm font-medium" style={{ color: c.primary }}>
                  Select an invoice or create one for an unmatched remittance
                </p>
              </div>
            )}

            {selectionMode === 'existing' && selected && (
              <InvoiceBalanceSummary
                invoiceNumber={selected.invoice_number}
                brokerName={selected.broker_name}
                loadNumber={selected.load_number}
                invoiceAmount={selected.amount}
                receivedToDate={priorReceived}
                amountApplying={Number.isFinite(amountNum) ? amountNum : 0}
              />
            )}

            {selectionMode === 'new' && (
              <div className="post-payment-entry__new-invoice space-y-3">
                <p className="text-sm font-semibold" style={{ color: c.primary }}>
                  Unmatched remittance — new invoice
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="client-label" htmlFor="admin-new-invoice-number">
                      Invoice #
                    </label>
                    <input
                      id="admin-new-invoice-number"
                      type="text"
                      value={newInvoiceNumber}
                      onChange={(e) => setNewInvoiceNumber(e.target.value)}
                      className="client-input w-full"
                      required
                    />
                  </div>
                  <div>
                    <label className="client-label" htmlFor="admin-new-broker">
                      Broker
                    </label>
                    <input
                      id="admin-new-broker"
                      type="text"
                      value={newBrokerName}
                      onChange={(e) => setNewBrokerName(e.target.value)}
                      className="client-input w-full"
                      required
                    />
                  </div>
                  <div>
                    <label className="client-label" htmlFor="admin-new-client">
                      Client name
                    </label>
                    <input
                      id="admin-new-client"
                      type="text"
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      className="client-input w-full"
                      required
                    />
                  </div>
                  <div>
                    <label className="client-label" htmlFor="admin-new-load">
                      Load # <span className="font-normal opacity-70">(optional)</span>
                    </label>
                    <input
                      id="admin-new-load"
                      type="text"
                      value={newLoadNumber}
                      onChange={(e) => setNewLoadNumber(e.target.value)}
                      className="client-input w-full"
                    />
                  </div>
                </div>
              </div>
            )}

            {selectionMode !== 'none' && (
              <fieldset className="post-payment-entry__fieldset mt-4" disabled={isSubmitting}>
                <div className="post-payment-entry__fields">
                  <div className="post-payment-entry__field post-payment-entry__field--amount">
                    <label className="client-label" htmlFor="admin-post-amount">
                      Amount
                    </label>
                    <input
                      ref={amountRef}
                      id="admin-post-amount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="client-input w-full financial-nums"
                      required
                    />
                  </div>
                  <div className="post-payment-entry__field">
                    <label className="client-label" htmlFor="admin-post-method">
                      Method
                    </label>
                    <select
                      id="admin-post-method"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as Payment['payment_method'])}
                      className="client-input w-full"
                    >
                      {METHOD_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="post-payment-entry__field">
                    <label className="client-label" htmlFor="admin-post-reference">
                      Reference #
                    </label>
                    <input
                      id="admin-post-reference"
                      type="text"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      className="client-input w-full"
                    />
                  </div>
                  <div className="post-payment-entry__field">
                    <label className="client-label" htmlFor="admin-post-payment-date">
                      Payment date
                    </label>
                    <input
                      id="admin-post-payment-date"
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="client-input w-full"
                      required
                    />
                  </div>
                  <div className="post-payment-entry__field">
                    <label className="client-label" htmlFor="admin-post-received-date">
                      Received date
                    </label>
                    <input
                      id="admin-post-received-date"
                      type="date"
                      value={receivedDate}
                      onChange={(e) => setReceivedDate(e.target.value)}
                      className="client-input w-full"
                      required
                    />
                  </div>
                  <div className="post-payment-entry__field post-payment-entry__field--wide">
                    <label className="client-label" htmlFor="admin-post-notes">
                      Note
                    </label>
                    <input
                      id="admin-post-notes"
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="client-input w-full"
                    />
                  </div>
                </div>
                <div className="post-payment-entry__actions mt-4">
                  <button type="submit" disabled={isSubmitting || !canSubmit} className="dashboard-btn-primary">
                    <CircleCheck className="w-4 h-4" />
                    {isSubmitting ? 'Posting…' : 'Post confirmed payment'}
                  </button>
                  <button type="button" onClick={resetForm} className="dashboard-btn-secondary" disabled={isSubmitting}>
                    Clear
                  </button>
                </div>
              </fieldset>
            )}
          </div>
        </div>
      </form>
    </section>
  )
}
