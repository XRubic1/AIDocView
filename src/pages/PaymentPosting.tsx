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
  ShieldCheck,
} from 'lucide-react'
import AdminLayout from '../components/AdminLayout'
import {
  mockPayments,
  getConfirmedPaymentTotal,
  getUnconfirmedPaymentTotal,
  getUnconfirmedShortPaymentTotal,
} from '../data/mockPayments'
import { getInvoiceById, mockInvoices } from '../data/mockInvoices'
import type { Payment, ShortPayReason } from '../types/payment'
import type { Invoice } from '../types/invoice'
import {
  listPendingPayments,
  confirmClientPayment,
  rejectClientPayment,
  postAdminPaymentAsync,
  postAdminShortPayment,
  listParentPaymentCandidates,
  createAdHocInvoiceForPaymentAsync,
} from '../services/clientPaymentService'
import {
  getPaymentReceiptDisputeLabel,
  listAwaitingReceiptPayments,
  listReceiptDisputedPayments,
  resolvePaymentReceiptDispute,
  type ResolveReceiptDisputeOutcome,
} from '../services/paymentReceiptConfirmationService'
import { getReceiptConfirmationDaysLeft } from '../utils/paymentStatus'
import { getAllClients, getClientById } from '../services/clientRegistry'
import { listPendingWriteOffs, approveWriteOff, denyWriteOff } from '../services/writeOffApprovalService'
import { movePaymentFunds, unprocessPayment } from '../services/paymentCorrectionService'
import { listArRecalcIssues } from '../services/invoiceArRecalcService'
import ArRecalcPanel from '../components/admin/ArRecalcPanel'
import { formatCurrency, formatDate } from '../utils/format'
import { useToast } from '../components/ui/ToastProvider'
import { useAuth } from '../context/AuthContext'
import { useAdminCapabilities } from '../hooks/useAdminCapabilities'
import { useTenantDataRevision } from '../hooks/useTenantDataRevision'
import { getAdminUserDisplayName } from '../config/adminNav'
import { useClientTheme } from '../theme/ThemeContext'
import { isAdminPostableForPayment } from '../utils/invoiceAging'
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

type Tab =
  | 'pending'
  | 'awaiting'
  | 'receipt_disputes'
  | 'writeoffs'
  | 'recalc'
  | 'corrections'
  | 'post'
  | 'post_short'

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
  return 'â€”'
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
  const getPending = useCallback((invoiceId: string) => getUnconfirmedPaymentTotal(invoiceId), [])

  const hits = useMemo((): PostPaymentSearchHit[] => {
    const scoped = excludeInvoiceId
      ? invoices.filter((inv) => inv.id !== excludeInvoiceId)
      : invoices
    const q = query.trim()
    if (q) return searchInvoicesForPostPayment(scoped, q, 50, getPending, { mode: 'admin' })
    return listDefaultPickerInvoices(scoped, getReceived, showAll, 100, getPending, { mode: 'admin' })
  }, [invoices, excludeInvoiceId, query, showAll, getReceived, getPending])

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
          placeholder="Invoice #, load #, broker, amountâ€¦"
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
            const pending = getUnconfirmedPaymentTotal(invoice.id)
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
                    <span className={getInvoicePostStatusClass(invoice, received, pending)}>
                      {getInvoicePostStatusLabel(invoice, received, pending)}
                    </span>
                  </div>
                  <p className="text-xs truncate" style={{ color: c.secondary }}>
                    {invoice.client_name} Â· {invoice.broker_name}
                    {invoice.load_number ? ` Â· ${invoice.load_number}` : ''}
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
  const { capabilities: adminCapabilities } = useAdminCapabilities()
  const adminName = getAdminUserDisplayName(resolved.user?.email ?? null)

  const [tab, setTab] = useState<Tab>('pending')
  const [refreshKey, setRefreshKey] = useState(0)
  const tenantRevision = useTenantDataRevision()
  const dataRevision = refreshKey + tenantRevision
  const bump = () => setRefreshKey((k) => k + 1)

  const pending = useMemo(() => listPendingPayments(), [dataRevision])
  const awaitingReceipt = useMemo(() => listAwaitingReceiptPayments(), [dataRevision])
  const receiptDisputes = useMemo(() => listReceiptDisputedPayments(), [dataRevision])
  const writeOffs = useMemo(() => listPendingWriteOffs(), [dataRevision])
  const arRecalcIssues = useMemo(() => listArRecalcIssues(), [dataRevision])
  const confirmed = useMemo(
    () => mockPayments.filter((p) => p.status === 'confirmed'),
    [dataRevision]
  )
  const allInvoices = useMemo(() => [...mockInvoices], [dataRevision])

  // Pending payment modals
  const [confirmTarget, setConfirmTarget] = useState<Payment | null>(null)
  const [rejectTarget, setRejectTarget] = useState<Payment | null>(null)
  const [confirmMethod, setConfirmMethod] = useState<Payment['payment_method']>('check')
  const [confirmReference, setConfirmReference] = useState('')
  const [confirmReceivedDate, setConfirmReceivedDate] = useState(
    () => new Date().toISOString().split('T')[0]
  )
  const [rejectReason, setRejectReason] = useState('')

  // Receipt dispute resolution (managed clients)
  const [resolveTarget, setResolveTarget] = useState<Payment | null>(null)
  const [resolveResponse, setResolveResponse] = useState('')
  const [resolveAmount, setResolveAmount] = useState('')
  const [resolveOutcome, setResolveOutcome] = useState<ResolveReceiptDisputeOutcome>('confirm')

  // Write-off modals
  const [approveTarget, setApproveTarget] = useState<Invoice | null>(null)
  const [denyTarget, setDenyTarget] = useState<Invoice | null>(null)
  const [approveNote, setApproveNote] = useState('')
  const [denyInternal, setDenyInternal] = useState('')
  const [denyClientNote, setDenyClientNote] = useState(
    'Balance reviewed â€” this load remains collectible.'
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
        showToast('Could not move funds â€” check target invoice eligibility', 'error')
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

  const handleResolveReceiptDispute = async () => {
    if (!resolveTarget || !resolveResponse.trim()) return

    const adjustedAmount =
      resolveOutcome === 'confirm' ? parseFloat(resolveAmount) : undefined
    if (
      resolveOutcome === 'confirm' &&
      (!Number.isFinite(adjustedAmount) || (adjustedAmount ?? 0) <= 0)
    ) {
      showToast('Enter a valid payment amount', 'error')
      return
    }

    setMutationBusy(resolveTarget.id)
    try {
      const result = resolvePaymentReceiptDispute(
        resolveTarget.id,
        adminName,
        resolveResponse.trim(),
        resolveOutcome,
        resolveOutcome === 'confirm' ? { adjustedAmount } : undefined
      )
      if (result) {
        showToast(
          resolveOutcome === 'confirm'
            ? 'Dispute resolved â€” sent back for client confirmation'
            : 'Dispute resolved â€” payment rejected',
          'success'
        )
        setResolveTarget(null)
        setResolveResponse('')
        setResolveAmount('')
        bump()
      } else {
        showToast('Could not resolve dispute', 'error')
      }
    } finally {
      setMutationBusy(null)
    }
  }

  const tabItems: { id: Tab; label: string; count?: number }[] = [
    { id: 'pending', label: 'Pending payments', count: pending.length },
    { id: 'awaiting', label: 'Awaiting confirmation', count: awaitingReceipt.length },
    { id: 'receipt_disputes', label: 'Receipt disputes', count: receiptDisputes.length },
    { id: 'writeoffs', label: 'Write-offs', count: writeOffs.length },
    { id: 'recalc', label: 'Recalc', count: arRecalcIssues.length },
    { id: 'corrections', label: 'Corrections' },
    { id: 'post', label: 'Post payment' },
    { id: 'post_short', label: 'Post short payment' },
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
            <div className="overflow-x-auto">
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
                                to={`/invoices?invoice=${encodeURIComponent(invoice.id)}`}
                                className="font-medium text-teal-700 hover:underline"
                              >
                                {p.invoice_number}
                              </Link>
                            ) : (
                              p.invoice_number
                            )}
                          </td>
                          <td>{invoice?.client_name ?? 'â€”'}</td>
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
                                  {formatCurrency(preview.confirmed)} â†’ {formatCurrency(preview.projected)} /{' '}
                                  {formatCurrency(preview.invoice.amount)}
                                </span>
                              </div>
                            ) : (
                              'â€”'
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

          {tab === 'awaiting' && (
            <div className="overflow-x-auto">
              <p className="text-sm mb-3" style={{ color: c.mutedLight }}>
                Payments you posted for managed clients, awaiting their receipt confirmation. These
                auto-confirm after the 30-day window.
              </p>
              <table className="dashboard-table dashboard-table--compact w-full">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Client</th>
                    <th>Broker</th>
                    <th className="text-right">Amount</th>
                    <th>Method</th>
                    <th>Posted</th>
                    <th>Confirm by</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {awaitingReceipt.length === 0 ? (
                    <tr>
                      <td colSpan={8}>
                        <EmptyState
                          title="No payments awaiting confirmation"
                          hint="Payments you post for managed clients appear here until confirmed."
                        />
                      </td>
                    </tr>
                  ) : (
                    awaitingReceipt.map((p) => {
                      const inv = getInvoiceById(p.invoice_id)
                      const daysLeft = getReceiptConfirmationDaysLeft(p)
                      return (
                        <tr key={p.id}>
                          <td>
                            {inv ? (
                              <Link
                                to={`/invoices?invoice=${encodeURIComponent(inv.id)}`}
                                className="font-medium text-teal-700 hover:underline"
                              >
                                {p.invoice_number}
                              </Link>
                            ) : (
                              p.invoice_number
                            )}
                          </td>
                          <td>{inv?.client_name ?? 'â€”'}</td>
                          <td>{p.broker_name}</td>
                          <td className="text-right tabular-nums font-medium">
                            {formatCurrency(p.amount)}
                          </td>
                          <td>{METHOD_OPTIONS.find((m) => m.value === p.payment_method)?.label ?? p.payment_method}</td>
                          <td>{formatDate(p.received_date)}</td>
                          <td>
                            {p.client_confirmation_deadline
                              ? formatDate(p.client_confirmation_deadline.split('T')[0])
                              : 'â€”'}
                          </td>
                          <td>
                            <span className="status-pill status-pill--pending">
                              {daysLeft != null ? `${daysLeft}d left` : 'Awaiting'}
                            </span>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'receipt_disputes' && (
            <div className="overflow-x-auto">
              <p className="text-sm mb-3" style={{ color: c.mutedLight }}>
                Managed clients disputed Credyx-posted payments. Upholding a posting sends it back
                for client confirmation; rejecting reverses the payment.
              </p>
              <table className="dashboard-table dashboard-table--compact w-full">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Client</th>
                    <th className="text-right">Amount</th>
                    <th>Reason</th>
                    <th>Disputed</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {receiptDisputes.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <EmptyState
                          title="No receipt disputes"
                          hint="When managed clients dispute posted payments, they appear here."
                        />
                      </td>
                    </tr>
                  ) : (
                    receiptDisputes.map((p) => {
                      const inv = getInvoiceById(p.invoice_id)
                      return (
                        <tr key={p.id}>
                          <td className="font-medium">{p.invoice_number}</td>
                          <td>{inv?.client_name ?? 'â€”'}</td>
                          <td className="text-right tabular-nums font-medium">
                            {formatCurrency(p.amount)}
                          </td>
                          <td>
                            {p.dispute ? getPaymentReceiptDisputeLabel(p.dispute.reason) : 'â€”'}
                          </td>
                          <td>{p.dispute ? formatDate(p.dispute.created_at.split('T')[0]) : 'â€”'}</td>
                          <td className="text-right">
                            <button
                              type="button"
                              className="dashboard-btn-primary !h-8 !px-3 !text-xs"
                              onClick={() => {
                                setResolveTarget(p)
                                setResolveResponse('')
                                setResolveAmount(p.amount.toFixed(2))
                                setResolveOutcome('confirm')
                              }}
                            >
                              Resolve
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
            <div className="overflow-x-auto">
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

          {tab === 'recalc' && (
            <ArRecalcPanel
              adminName={adminName}
              refreshKey={dataRevision}
              onFixed={bump}
              onToast={showToast}
            />
          )}

          {tab === 'corrections' && (
            <div className="overflow-x-auto">
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
                          <td>{inv?.client_name ?? 'â€”'}</td>
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
              canForceConfirmPayment={adminCapabilities.canForceConfirmPayment}
              onPosted={() => {
                showToast('Payment posted', 'success')
                bump()
              }}
              onForceConfirmed={() => {
                showToast('Payment force-confirmed — Credyx closed invoice', 'success')
                bump()
              }}
              onError={(msg) => showToast(msg, 'error')}
            />
          )}

          {tab === 'post_short' && (
            <AdminShortPaymentPostForm
              invoices={allInvoices}
              adminName={adminName}
              canForceConfirmPayment={adminCapabilities.canForceConfirmPayment}
              onPosted={() => {
                showToast('Short payment posted', 'success')
                bump()
              }}
              onForceConfirmed={() => {
                showToast('Short payment force-confirmed by Credyx', 'success')
                bump()
              }}
              onError={(msg) => showToast(msg, 'error')}
            />
          )}
        </div>
      </div>

      {confirmTarget && (
        <ModalShell
          title={`Confirm payment â€” ${confirmTarget.invoice_number}`}
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
                {mutationBusy === 'confirm' ? 'Confirmingâ€¦' : 'Confirm payment'}
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
                  placeholder="Check #, wire refâ€¦"
                />
              </div>
            </div>
          </div>
        </ModalShell>
      )}

      {rejectTarget && (
        <ModalShell
          title={`Reject payment â€” ${rejectTarget.invoice_number}`}
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
                {mutationBusy === 'reject' ? 'Rejectingâ€¦' : 'Reject payment'}
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

      {resolveTarget && (
        <ModalShell
          title={`Resolve receipt dispute â€” ${resolveTarget.invoice_number}`}
          onClose={() => setResolveTarget(null)}
          footer={
            <>
              <button type="button" className="dashboard-btn-secondary" onClick={() => setResolveTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="dashboard-btn-primary inline-flex items-center gap-2"
                disabled={!resolveResponse.trim() || mutationBusy === resolveTarget.id}
                onClick={() => void handleResolveReceiptDispute()}
              >
                {mutationBusy === resolveTarget.id && <Spinner size="sm" className="text-white" />}
                {mutationBusy === resolveTarget.id ? 'Savingâ€¦' : 'Resolve dispute'}
              </button>
            </>
          }
        >
          <div className="space-y-4 text-sm">
            <p style={{ color: c.secondary }}>
              {formatCurrency(resolveTarget.amount)} on {resolveTarget.invoice_number} â€” funds on hold.
            </p>
            {resolveTarget.dispute && (
              <div
                className="rounded-lg p-3"
                style={{ backgroundColor: c.surface, color: c.primary }}
              >
                <p className="font-medium">{getPaymentReceiptDisputeLabel(resolveTarget.dispute.reason)}</p>
                <p className="mt-1">{resolveTarget.dispute.description}</p>
              </div>
            )}
            <div>
              <label className="client-label">Resolution</label>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 mt-1">
                <label className="inline-flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    checked={resolveOutcome === 'confirm'}
                    onChange={() => setResolveOutcome('confirm')}
                  />
                  Uphold posting â€” client must confirm again
                </label>
                <label className="inline-flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    checked={resolveOutcome === 'reject'}
                    onChange={() => setResolveOutcome('reject')}
                  />
                  Reject payment (client was correct)
                </label>
              </div>
            </div>
            {resolveOutcome === 'confirm' && (
              <div>
                <label className="client-label" htmlFor="resolve-amount">
                  Posted amount <span className="text-red-600">*</span>
                </label>
                <input
                  id="resolve-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={resolveAmount}
                  onChange={(e) => setResolveAmount(e.target.value)}
                  className="client-input w-full financial-nums"
                  placeholder="0.00"
                />
                <p className="text-xs mt-1" style={{ color: c.mutedLight }}>
                  Adjust if the remittance amount was wrong. The client will confirm or dispute this
                  amount.
                </p>
              </div>
            )}
            <div>
              <label className="client-label" htmlFor="resolve-response">
                Response to client <span className="text-red-600">*</span>
              </label>
              <textarea
                id="resolve-response"
                value={resolveResponse}
                onChange={(e) => setResolveResponse(e.target.value)}
                rows={3}
                className="client-input w-full"
                placeholder="Explain the resolutionâ€¦"
              />
            </div>
          </div>
        </ModalShell>
      )}

      {approveTarget && (
        <ModalShell
          title={`Approve write-off â€” ${approveTarget.invoice_number}`}
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
                {mutationBusy === 'approve' ? 'Approvingâ€¦' : 'Approve write-off'}
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
          title={`Deny write-off â€” ${denyTarget.invoice_number}`}
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
                {mutationBusy === 'deny' ? 'Denyingâ€¦' : 'Deny write-off'}
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
          title={`Move funds â€” ${moveTarget.invoice_number}`}
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
                {mutationBusy === 'move' ? 'Movingâ€¦' : 'Move funds'}
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
                Source: {moveTarget.invoice_number} â€” {formatCurrency(moveTarget.amount)}
              </p>
              <p className="text-xs mt-1" style={{ color: c.mutedLight }}>
                {moveTarget.broker_name}
                {moveTarget.load_number ? ` Â· Load ${moveTarget.load_number}` : ''}
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
                placeholder="Due toâ€¦"
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
          title={`Unprocess payment â€” ${unprocessTarget.invoice_number}`}
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
                {mutationBusy === 'unprocess' ? 'Unprocessingâ€¦' : 'Unprocess payment'}
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
                placeholder="Due toâ€¦"
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
  canForceConfirmPayment: boolean
  onPosted: () => void
  onForceConfirmed: () => void
  onError: (message: string) => void
}

/** Admin remittance posting â€” confirmed payments applied immediately. */
function AdminRemittancePostForm({
  invoices,
  adminName,
  canForceConfirmPayment,
  onPosted,
  onForceConfirmed,
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
  const getPending = useCallback((invoiceId: string) => getUnconfirmedPaymentTotal(invoiceId), [])

  // Real clients only â€” ad-hoc invoices must reference a valid client (FK to clients table).
  const clientOptions = useMemo(
    () => getAllClients().sort((a, b) => a.name.localeCompare(b.name)),
    []
  )

  const invoiceList = useMemo((): PostPaymentSearchHit[] => {
    const q = filterQuery.trim()
    const pickerOptions = { mode: 'admin' as const }
    if (q) return searchInvoicesForPostPayment(invoices, q, 100, getPending, pickerOptions)
    return listDefaultPickerInvoices(invoices, getReceived, showAllInvoices, 200, getPending, pickerOptions)
  }, [invoices, filterQuery, showAllInvoices, getReceived, getPending])

  const exactInvoiceMatch = useMemo(() => {
    const q = filterQuery.trim().toLowerCase()
    if (!q) return false
    return invoices.some((inv) => inv.invoice_number.toLowerCase() === q)
  }, [invoices, filterQuery])

  const showCreateNew =
    filterQuery.trim().length >= 2 && !exactInvoiceMatch && selectionMode !== 'new'

  const priorReceived = selected ? getConfirmedPaymentTotal(selected.id) : 0
  const pendingConfirmation = selected ? getUnconfirmedPaymentTotal(selected.id) : 0
  const amountNum = parseFloat(amount)
  const isManagedClient =
    selectionMode === 'existing' && selected
      ? getClientById(selected.client_id)?.service_tier === 'managed'
      : selectionMode === 'new' && newClientId.trim()
        ? getClientById(newClientId.trim())?.service_tier === 'managed'
        : false
  const showForceConfirm = canForceConfirmPayment && isManagedClient

  const selectInvoice = useCallback((invoice: Invoice) => {
    if (!isAdminPostableForPayment(invoice)) {
      onError(`Invoice ${invoice.invoice_number} cannot receive payments.`)
      return
    }
    const already = getConfirmedPaymentTotal(invoice.id)
    const pending = getUnconfirmedPaymentTotal(invoice.id)
    const balance = Math.max(0, invoice.amount - already - pending)
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
        newClientId.trim() &&
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
        if (!newClientId.trim()) {
          onError('Select a client for the new invoice.')
          return
        }
        const created = await createAdHocInvoiceForPaymentAsync(
          {
            clientId: newClientId.trim(),
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

      const result = await postAdminPaymentAsync(
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
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not save payment.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleForceConfirm = async () => {
    if (!canSubmit) {
      onError('Select an invoice and enter a valid amount.')
      return
    }
    if (
      !window.confirm(
        'Force confirm skips the client receipt window and closes the invoice as Credyx. Continue?'
      )
    ) {
      return
    }
    setIsSubmitting(true)
    try {
      let invoiceId = selected?.id

      if (selectionMode === 'new') {
        if (!newClientId.trim()) {
          onError('Select a client for the new invoice.')
          return
        }
        const created = await createAdHocInvoiceForPaymentAsync(
          {
            clientId: newClientId.trim(),
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

      const result = await postAdminPaymentAsync(
        {
          invoiceId,
          amount: amountNum,
          paymentDate,
          receivedDate,
          paymentMethod,
          paymentReference: paymentReference.trim() || undefined,
          notes: notes.trim() || undefined,
        },
        adminName,
        { forceConfirm: true }
      )

      if (!result) {
        onError('Could not force confirm payment. Invoice may not be eligible.')
        return
      }

      onForceConfirmed()
      resetForm()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not force confirm payment.')
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
            Self-service payments apply immediately; managed-client payments await client receipt
            confirmation (30 days)
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
                placeholder="Invoice #, load #, broker, amountâ€¦"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="client-input post-payment-picker__filter-input"
                autoComplete="off"
              />
            </div>
            <div className="post-payment-picker__list" role="listbox">
              {invoiceList.map(({ invoice, isPostable }) => {
                const received = getConfirmedPaymentTotal(invoice.id)
                const pending = getUnconfirmedPaymentTotal(invoice.id)
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
                        <span className={getInvoicePostStatusClass(invoice, received, pending)}>
                          {getInvoicePostStatusLabel(invoice, received, pending)}
                        </span>
                      </div>
                      <p className="post-payment-picker__row-meta">
                        {invoice.client_name} Â· {invoice.broker_name}
                        {invoice.load_number ? ` Â· ${invoice.load_number}` : ''}
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
                pendingConfirmation={pendingConfirmation}
                amountApplying={Number.isFinite(amountNum) ? amountNum : 0}
                applyingAsPending={isManagedClient}
              />
            )}

            {selectionMode === 'new' && (
              <div className="post-payment-entry__new-invoice space-y-3">
                <p className="text-sm font-semibold" style={{ color: c.primary }}>
                  Unmatched remittance â€” new invoice
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
                      Client
                    </label>
                    <select
                      id="admin-new-client"
                      value={newClientId}
                      onChange={(e) => {
                        const client = clientOptions.find((cl) => cl.id === e.target.value)
                        setNewClientId(e.target.value)
                        setNewClientName(client?.name ?? '')
                      }}
                      className="client-input w-full"
                      required
                    >
                      <option value="">Select a clientâ€¦</option>
                      {clientOptions.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                          {client.service_tier === 'managed' ? ' (Managed)' : ''}
                        </option>
                      ))}
                    </select>
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
                    {isSubmitting ? 'Postingâ€¦' : 'Post payment'}
                  </button>
                  {showForceConfirm && (
                    <button
                      type="button"
                      disabled={isSubmitting || !canSubmit}
                      className="dashboard-btn-secondary post-payment-entry__force-confirm"
                      onClick={() => void handleForceConfirm()}
                      title="Skip client receipt confirmation — Credyx closes the invoice"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      Force confirm
                    </button>
                  )}
                  <button type="button" onClick={resetForm} className="dashboard-btn-secondary" disabled={isSubmitting}>
                    Clear
                  </button>
                </div>
                {showForceConfirm && (
                  <p className="post-payment-entry__force-hint text-xs mt-2" style={{ color: c.secondary }}>
                    Force confirm is for dedicated Credyx users — payment is confirmed immediately and the
                    client sees that Credyx closed the invoice.
                  </p>
                )}
              </fieldset>
            )}
          </div>
        </div>
      </form>
    </section>
  )
}

interface AdminShortPaymentPostFormProps {
  invoices: Invoice[]
  adminName: string
  canForceConfirmPayment: boolean
  onPosted: () => void
  onForceConfirmed: () => void
  onError: (message: string) => void
}

const SHORT_PAY_REASON_OPTIONS: { value: ShortPayReason; label: string; hint: string }[] = [
  {
    value: 'wrong_amount',
    label: 'Wrong amount posted',
    hint: 'Reduces received total when the original payment was posted for the wrong amount.',
  },
  {
    value: 'chargeback',
    label: 'Broker chargeback',
    hint: 'Reduces received total when a broker requests a chargeback or clawback.',
  },
]

/** Admin short payment â€” correction or chargeback linked to an existing payment. */
function AdminShortPaymentPostForm({
  invoices,
  adminName,
  canForceConfirmPayment,
  onPosted,
  onForceConfirmed,
  onError,
}: AdminShortPaymentPostFormProps) {
  const c = useClientTheme()
  const today = new Date().toISOString().split('T')[0]
  const filterRef = useRef<HTMLInputElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)

  const [filterQuery, setFilterQuery] = useState('')
  const [showAllInvoices, setShowAllInvoices] = useState(false)
  const [selected, setSelected] = useState<Invoice | null>(null)
  const [parentPaymentId, setParentPaymentId] = useState('')
  const [shortPayReason, setShortPayReason] = useState<ShortPayReason>('wrong_amount')
  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(today)
  const [receivedDate, setReceivedDate] = useState(today)
  const [paymentMethod, setPaymentMethod] = useState<Payment['payment_method']>('check')
  const [paymentReference, setPaymentReference] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const getReceived = useCallback((invoiceId: string) => getConfirmedPaymentTotal(invoiceId), [])
  const getPending = useCallback((invoiceId: string) => getUnconfirmedPaymentTotal(invoiceId), [])

  const invoiceList = useMemo((): PostPaymentSearchHit[] => {
    const q = filterQuery.trim()
    const pickerOptions = { mode: 'admin' as const }
    if (q) return searchInvoicesForPostPayment(invoices, q, 100, getPending, pickerOptions)
    return listDefaultPickerInvoices(invoices, getReceived, showAllInvoices, 200, getPending, pickerOptions)
  }, [invoices, filterQuery, showAllInvoices, getReceived, getPending])

  const parentCandidates = useMemo(
    () => (selected ? listParentPaymentCandidates(selected.id) : []),
    [selected]
  )

  const selectedParent = parentCandidates.find((p) => p.id === parentPaymentId)
  const amountNum = parseFloat(amount)
  const priorReceived = selected ? getConfirmedPaymentTotal(selected.id) : 0
  const pendingConfirmation = selected ? getUnconfirmedPaymentTotal(selected.id) : 0
  const pendingShortCorrection = selected ? getUnconfirmedShortPaymentTotal(selected.id) : 0
  const isManagedClient =
    selected != null && getClientById(selected.client_id)?.service_tier === 'managed'
  const showForceConfirm = canForceConfirmPayment && isManagedClient

  const selectInvoice = useCallback(
    (invoice: Invoice) => {
      if (!isAdminPostableForPayment(invoice)) {
        onError(`Invoice ${invoice.invoice_number} cannot receive payment corrections.`)
        return
      }
      const parents = listParentPaymentCandidates(invoice.id)
      if (parents.length === 0) {
        onError(`Invoice ${invoice.invoice_number} has no confirmed payments to correct.`)
        return
      }
      setSelected(invoice)
      setParentPaymentId(parents[0]?.id ?? '')
      setFilterQuery('')
      setAmount('')
      requestAnimationFrame(() => amountRef.current?.focus())
    },
    [onError]
  )

  const resetForm = () => {
    setFilterQuery('')
    setSelected(null)
    setParentPaymentId('')
    setShortPayReason('wrong_amount')
    setAmount('')
    setPaymentReference('')
    setNotes('')
    setPaymentDate(today)
    setReceivedDate(today)
    setPaymentMethod('check')
    filterRef.current?.focus()
  }

  const canSubmit =
    selected &&
    parentPaymentId &&
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    paymentDate &&
    receivedDate

  const handleSubmit = async () => {
    if (!canSubmit || !selected) {
      onError('Select an invoice, parent payment, and valid amount.')
      return
    }
    if (amountNum > priorReceived + 0.01) {
      onError('Short payment cannot exceed confirmed received total on this invoice.')
      return
    }
    setIsSubmitting(true)
    try {
      const result = postAdminShortPayment(
        {
          invoiceId: selected.id,
          parentPaymentId,
          shortPayReason,
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
        onError('Could not post short payment. Check invoice, parent payment, and amount.')
        return
      }

      onPosted()
      resetForm()
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleForceConfirm = async () => {
    if (!canSubmit || !selected) {
      onError('Select an invoice, parent payment, and valid amount.')
      return
    }
    if (amountNum > priorReceived + 0.01) {
      onError('Short payment cannot exceed confirmed received total on this invoice.')
      return
    }
    if (
      !window.confirm(
        'Force confirm applies the short correction immediately as Credyx — the client will not need to confirm. Continue?'
      )
    ) {
      return
    }
    setIsSubmitting(true)
    try {
      const result = postAdminShortPayment(
        {
          invoiceId: selected.id,
          parentPaymentId,
          shortPayReason,
          amount: amountNum,
          paymentDate,
          receivedDate,
          paymentMethod,
          paymentReference: paymentReference.trim() || undefined,
          notes: notes.trim() || undefined,
        },
        adminName,
        { forceConfirm: true }
      )

      if (!result) {
        onError('Could not force confirm short payment.')
        return
      }

      onForceConfirmed()
      resetForm()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="post-payment-workspace" aria-label="Post short payment">
      <form
        className="post-payment-workspace__form"
        onSubmit={(e) => {
          e.preventDefault()
          void handleSubmit()
        }}
      >
        <header className="post-payment-workspace__header">
          <h2 className="post-payment-workspace__title">Post short payment</h2>
          <p className="post-payment-workspace__subtitle">
            Record a correction when an amount was posted incorrectly, or when a broker requests a
            chargeback. Short payments appear as child rows under the original payment on the client
            portal.
          </p>
        </header>

        <div className="post-payment-workspace__panels">
          <aside className="post-payment-picker" aria-labelledby="admin-short-picker-heading">
            <div className="post-payment-picker__head">
              <h3 id="admin-short-picker-heading" className="post-payment-panel__step">
                <span className="post-payment-panel__step-num">1</span>
                Select invoice
              </h3>
            </div>
            <div className="post-payment-picker__filter-row">
              <label className="client-label" htmlFor="admin-short-invoice-filter">
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
              <Search
                className="post-payment-picker__filter-icon"
                style={{ color: c.secondary }}
                aria-hidden
              />
              <input
                ref={filterRef}
                id="admin-short-invoice-filter"
                type="search"
                placeholder="Invoice #, load #, broker, amountâ€¦"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="client-input post-payment-picker__filter-input"
              />
            </div>
            <div className="post-payment-picker__list" role="listbox" aria-label="Invoices">
              {invoiceList.length === 0 ? (
                <p className="post-payment-picker__empty">No matching invoices</p>
              ) : (
                invoiceList.map(({ invoice, isPostable }) => {
                  const received = getConfirmedPaymentTotal(invoice.id)
                  const pending = getUnconfirmedPaymentTotal(invoice.id)
                  const parents = listParentPaymentCandidates(invoice.id)
                  const disabled = !isPostable || parents.length === 0
                  const isSelected = selected?.id === invoice.id
                  return (
                    <button
                      key={invoice.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      disabled={disabled}
                      className={`post-payment-picker__row ${isSelected ? 'post-payment-picker__row--selected' : ''} ${disabled ? 'post-payment-picker__row--disabled' : ''}`}
                      onClick={() => selectInvoice(invoice)}
                    >
                      <div className="post-payment-picker__row-main">
                        <div className="post-payment-picker__row-top">
                          <span className="post-payment-picker__inv-num">{invoice.invoice_number}</span>
                          {parents.length === 0 ? (
                            <span className="text-xs text-red-600">No confirmed payments</span>
                          ) : (
                            <span className="text-xs opacity-70">
                              {parents.length} payment{parents.length === 1 ? '' : 's'}
                            </span>
                          )}
                        </div>
                        <p className="post-payment-picker__row-meta">
                          {invoice.client_name} Â· {invoice.broker_name}
                          {invoice.load_number ? ` Â· ${invoice.load_number}` : ''}
                        </p>
                      </div>
                      <div className="post-payment-picker__row-amounts">
                        <span className="post-payment-picker__total financial-nums">
                          {formatCurrency(invoice.amount)}
                        </span>
                        {received > 0 && (
                          <span className="post-payment-picker__balance opacity-70">
                            {formatCurrency(received)} received
                          </span>
                        )}
                        {pending > 0 && (
                          <span className="text-amber-700 text-xs">{formatCurrency(pending)} pending</span>
                        )}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </aside>

          <div className="post-payment-entry">
            {selected ? (
              <>
                <div className="post-payment-entry__summary mb-4">
                  <h3 className="post-payment-panel__step">
                    <span className="post-payment-panel__step-num">2</span>
                    Payment correction
                  </h3>
                </div>

                <InvoiceBalanceSummary
                  invoiceNumber={selected.invoice_number}
                  brokerName={selected.broker_name}
                  loadNumber={selected.load_number}
                  invoiceAmount={selected.amount}
                  receivedToDate={priorReceived}
                  pendingConfirmation={pendingConfirmation}
                  pendingShortCorrection={pendingShortCorrection}
                  shortCorrectionApplying={Number.isFinite(amountNum) ? amountNum : 0}
                  shortCorrectionAwaitingConfirm={isManagedClient}
                />

                {selectedParent && (
                  <p className="text-xs mt-2" style={{ color: c.secondary }}>
                    Linked to parent payment of {formatCurrency(selectedParent.amount)} on{' '}
                    {formatDate(selectedParent.received_date)}
                  </p>
                )}

                <fieldset className="post-payment-entry__fieldset mt-4" disabled={isSubmitting}>
                  <div className="post-payment-entry__fields">
                    <div className="post-payment-entry__field post-payment-entry__field--wide">
                      <label className="client-label" htmlFor="admin-short-parent">
                        Parent payment
                      </label>
                      <select
                        id="admin-short-parent"
                        value={parentPaymentId}
                        onChange={(e) => setParentPaymentId(e.target.value)}
                        className="client-input w-full"
                        required
                      >
                        {parentCandidates.map((payment) => (
                          <option key={payment.id} value={payment.id}>
                            {formatCurrency(payment.amount)} Â· {formatDate(payment.received_date)} Â·{' '}
                            {METHOD_OPTIONS.find((m) => m.value === payment.payment_method)?.label ??
                              payment.payment_method}
                            {payment.payment_reference ? ` Â· ${payment.payment_reference}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="post-payment-entry__field post-payment-entry__field--wide">
                      <label className="client-label" htmlFor="admin-short-reason">
                        Reason
                      </label>
                      <select
                        id="admin-short-reason"
                        value={shortPayReason}
                        onChange={(e) => setShortPayReason(e.target.value as ShortPayReason)}
                        className="client-input w-full"
                      >
                        {SHORT_PAY_REASON_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs mt-1" style={{ color: c.secondary }}>
                        {SHORT_PAY_REASON_OPTIONS.find((o) => o.value === shortPayReason)?.hint}
                      </p>
                    </div>

                    <div className="post-payment-entry__field post-payment-entry__field--amount">
                      <label className="client-label" htmlFor="admin-short-amount">
                        Amount
                      </label>
                      <input
                        ref={amountRef}
                        id="admin-short-amount"
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
                      <label className="client-label" htmlFor="admin-short-method">
                        Method
                      </label>
                      <select
                        id="admin-short-method"
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
                      <label className="client-label" htmlFor="admin-short-reference">
                        Reference #
                      </label>
                      <input
                        id="admin-short-reference"
                        type="text"
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                        className="client-input w-full"
                      />
                    </div>

                    <div className="post-payment-entry__field">
                      <label className="client-label" htmlFor="admin-short-payment-date">
                        Payment date
                      </label>
                      <input
                        id="admin-short-payment-date"
                        type="date"
                        value={paymentDate}
                        onChange={(e) => setPaymentDate(e.target.value)}
                        className="client-input w-full"
                        required
                      />
                    </div>

                    <div className="post-payment-entry__field">
                      <label className="client-label" htmlFor="admin-short-received-date">
                        Received date
                      </label>
                      <input
                        id="admin-short-received-date"
                        type="date"
                        value={receivedDate}
                        onChange={(e) => setReceivedDate(e.target.value)}
                        className="client-input w-full"
                        required
                      />
                    </div>

                    <div className="post-payment-entry__field post-payment-entry__field--wide">
                      <label className="client-label" htmlFor="admin-short-notes">
                        Note
                      </label>
                      <input
                        id="admin-short-notes"
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="client-input w-full"
                        placeholder={
                          shortPayReason === 'chargeback'
                            ? 'e.g. Broker requested chargeback on overposted remittance'
                            : 'e.g. Original post was short by this amount'
                        }
                      />
                    </div>
                  </div>

                  <div className="post-payment-entry__actions mt-4">
                    <button
                      type="submit"
                      disabled={isSubmitting || !canSubmit}
                      className="dashboard-btn-primary"
                    >
                      <CircleCheck className="w-4 h-4" />
                      {isSubmitting ? 'Postingâ€¦' : 'Post short payment'}
                    </button>
                    {showForceConfirm && (
                      <button
                        type="button"
                        disabled={isSubmitting || !canSubmit}
                        className="dashboard-btn-secondary post-payment-entry__force-confirm"
                        onClick={() => void handleForceConfirm()}
                        title="Apply correction immediately as Credyx"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        Force confirm
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={resetForm}
                      className="dashboard-btn-secondary"
                      disabled={isSubmitting}
                    >
                      Clear
                    </button>
                  </div>
                  {showForceConfirm && (
                    <p className="post-payment-entry__force-hint text-xs mt-2" style={{ color: c.secondary }}>
                      Force confirm applies the correction immediately — the client sees that Credyx updated
                      the invoice.
                    </p>
                  )}
                </fieldset>
              </>
            ) : (
              <div className="post-payment-entry__placeholder flex flex-col items-center justify-center h-full min-h-[280px] text-center px-6">
                <FileText className="w-10 h-10 mb-3 opacity-40" style={{ color: c.secondary }} />
                <p className="font-medium" style={{ color: c.primary }}>
                  Select an invoice with a confirmed payment
                </p>
                <p className="text-sm mt-1 max-w-md" style={{ color: c.secondary }}>
                  Short payments correct a prior post â€” wrong amount or broker chargeback â€” and
                  nest under that payment on the client payment history.
                </p>
              </div>
            )}
          </div>
        </div>
      </form>
    </section>
  )
}
