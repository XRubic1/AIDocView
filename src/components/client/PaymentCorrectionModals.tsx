import { useMemo, useState } from 'react'
import { AlertTriangle, Search, X } from 'lucide-react'
import type { Invoice } from '../../types/invoice'
import type { Payment } from '../../types/payment'
import { getConfirmedPaymentTotal } from '../../data/mockPayments'
import { formatCurrency, formatDate } from '../../utils/format'
import { useClientTheme } from '../../theme/ThemeContext'
import {
  classifyPaymentVariance,
  getInvoiceBalanceState,
} from '../../utils/paymentVariance'
import { getInvoicePostStatusLabel } from '../../utils/postPaymentInvoiceSearch'

function varianceLabel(kind: ReturnType<typeof classifyPaymentVariance>): string {
  if (kind === 'short') return 'Short paid'
  if (kind === 'over') return 'Overpaid'
  if (kind === 'full') return 'Paid in full'
  return 'Open'
}

interface ModalShellProps {
  title: string
  onClose: () => void
  children: React.ReactNode
  footer: React.ReactNode
  wide?: boolean
}

function ModalShell({ title, onClose, children, footer, wide }: ModalShellProps) {
  const c = useClientTheme()
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className={`rounded-lg shadow-xl w-full max-h-[90vh] overflow-y-auto ${wide ? 'max-w-2xl' : 'max-w-lg'}`}
        style={{ backgroundColor: c.card, boxShadow: c.shadow.cardHover }}
      >
        <div
          className="flex items-center justify-between p-4 border-b sticky top-0 z-10"
          style={{ borderColor: c.border, backgroundColor: c.card }}
        >
          <h3 className="text-base font-semibold" style={{ color: c.primary }}>
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg transition-colors hover:bg-slate-100"
            style={{ color: c.primary }}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4">{children}</div>
        <div
          className="flex justify-end gap-2 p-4 border-t sticky bottom-0"
          style={{ borderColor: c.border, backgroundColor: c.card }}
        >
          {footer}
        </div>
      </div>
    </div>
  )
}

interface TargetInvoicePickerProps {
  invoices: Invoice[]
  excludeInvoiceId: string
  selectedId: string | null
  onSelect: (invoice: Invoice) => void
}

function TargetInvoicePicker({
  invoices,
  excludeInvoiceId,
  selectedId,
  onSelect,
}: TargetInvoicePickerProps) {
  const c = useClientTheme()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return invoices
      .filter((inv) => inv.id !== excludeInvoiceId)
      .filter((inv) => {
        if (!q) return true
        return (
          inv.invoice_number.toLowerCase().includes(q) ||
          inv.broker_name.toLowerCase().includes(q) ||
          inv.load_number?.toLowerCase().includes(q)
        )
      })
      .slice(0, 50)
  }, [invoices, excludeInvoiceId, query])

  return (
    <div>
      <label className="client-label" htmlFor="move-target-search">
        Target invoice
      </label>
      <div className="relative mt-1 mb-2">
        <Search
          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
          style={{ color: c.secondary }}
        />
        <input
          id="move-target-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search invoice, broker, load…"
          className="client-input pl-8 w-full"
          style={{ backgroundColor: c.card, height: 36, fontSize: 13 }}
        />
      </div>
      <div
        className="max-h-48 overflow-y-auto rounded-lg border divide-y"
        style={{ borderColor: c.border }}
      >
        {filtered.length === 0 ? (
          <p className="text-sm p-3" style={{ color: c.mutedLight }}>
            No eligible invoices found
          </p>
        ) : (
          filtered.map((invoice) => {
            const received = getConfirmedPaymentTotal(invoice.id)
            const balance = getInvoiceBalanceState(invoice.amount, received)
            const isSelected = selectedId === invoice.id
            return (
              <button
                key={invoice.id}
                type="button"
                onClick={() => onSelect(invoice)}
                className={`w-full text-left p-2.5 transition-colors hover:bg-slate-50 ${
                  isSelected ? 'bg-blue-50/80' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold" style={{ color: c.primary }}>
                    {invoice.invoice_number}
                  </span>
                  <span className="text-xs tabular-nums" style={{ color: c.secondary }}>
                    {formatCurrency(invoice.amount)}
                  </span>
                </div>
                <p className="text-xs mt-0.5 truncate" style={{ color: c.secondary }}>
                  {invoice.broker_name}
                  {invoice.load_number ? ` · Load ${invoice.load_number}` : ''}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: c.mutedLight }}>
                  {getInvoicePostStatusLabel(invoice, received)} · {balance.label}{' '}
                  {formatCurrency(Math.abs(balance.signedBalance))}
                </p>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

export interface MoveFundsModalProps {
  payment: Payment
  sourceInvoice: Invoice | undefined
  postableInvoices: Invoice[]
  targetInvoiceId: string | null
  reason: string
  onTargetChange: (invoiceId: string) => void
  onReasonChange: (reason: string) => void
  onClose: () => void
  onConfirm: () => void
}

export function MoveFundsModal({
  payment,
  sourceInvoice,
  postableInvoices,
  targetInvoiceId,
  reason,
  onTargetChange,
  onReasonChange,
  onClose,
  onConfirm,
}: MoveFundsModalProps) {
  const c = useClientTheme()

  const preview = useMemo(() => {
    if (!targetInvoiceId || !sourceInvoice) return null
    const targetInv = postableInvoices.find((inv) => inv.id === targetInvoiceId)
    if (!targetInv) return null
    const sourceConfirmed = getConfirmedPaymentTotal(sourceInvoice.id)
    const sourceAfter = Math.max(0, sourceConfirmed - payment.amount)
    const targetConfirmed = getConfirmedPaymentTotal(targetInv.id)
    const targetAfter = targetConfirmed + payment.amount
    return {
      sourceInv: sourceInvoice,
      targetInv,
      sourceBalance: getInvoiceBalanceState(sourceInvoice.amount, sourceAfter),
      targetVariance: classifyPaymentVariance(targetInv.amount, targetAfter),
      targetAfter,
    }
  }, [targetInvoiceId, sourceInvoice, postableInvoices, payment.amount])

  return (
    <ModalShell
      title={`Move funds — ${payment.invoice_number}`}
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className="dashboard-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="dashboard-btn-primary"
            disabled={!targetInvoiceId || !reason.trim()}
            onClick={onConfirm}
          >
            Move funds
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
            Source: {payment.invoice_number} — {formatCurrency(payment.amount)}
          </p>
          <p className="text-xs mt-1" style={{ color: c.mutedLight }}>
            {payment.broker_name}
            {payment.load_number ? ` · Load ${payment.load_number}` : ''}
            {payment.payment_reference ? ` · Ref ${payment.payment_reference}` : ''}
          </p>
          <p className="text-xs mt-1" style={{ color: c.secondary }}>
            Payment date {formatDate(payment.payment_date)}
          </p>
        </div>

        <TargetInvoicePicker
          invoices={postableInvoices}
          excludeInvoiceId={payment.invoice_id}
          selectedId={targetInvoiceId}
          onSelect={(inv) => onTargetChange(inv.id)}
        />

        <div>
          <label className="client-label" htmlFor="move-reason">
            Reason <span className="text-red-600">*</span>
          </label>
          <textarea
            id="move-reason"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            rows={2}
            className="client-input w-full mt-1"
            placeholder="Due to…"
          />
        </div>

        {preview && (
          <div
            className="rounded-lg border p-3 text-sm space-y-2"
            style={{ borderColor: c.warning, backgroundColor: c.stat.amber }}
          >
            <p className="font-medium flex items-center gap-1.5" style={{ color: c.primary }}>
              <AlertTriangle className="w-4 h-4" />
              Consequence preview
            </p>
            <p style={{ color: c.secondary }}>
              <strong>{preview.sourceInv.invoice_number}</strong> reopens as unpaid (
              {formatCurrency(preview.sourceBalance.signedBalance)} outstanding)
            </p>
            <p style={{ color: c.secondary }}>
              <strong>{preview.targetInv.invoice_number}</strong> becomes{' '}
              {varianceLabel(preview.targetVariance).toLowerCase()} (
              {formatCurrency(preview.targetAfter)} received of {formatCurrency(preview.targetInv.amount)})
            </p>
          </div>
        )}
      </div>
    </ModalShell>
  )
}

export interface UnprocessPaymentModalProps {
  payment: Payment
  sourceInvoice: Invoice | undefined
  reason: string
  onReasonChange: (reason: string) => void
  onClose: () => void
  onConfirm: () => void
}

export function UnprocessPaymentModal({
  payment,
  sourceInvoice,
  reason,
  onReasonChange,
  onClose,
  onConfirm,
}: UnprocessPaymentModalProps) {
  const c = useClientTheme()

  const preview = useMemo(() => {
    if (!sourceInvoice) return null
    const confirmed = getConfirmedPaymentTotal(sourceInvoice.id)
    const after = Math.max(0, confirmed - payment.amount)
    return {
      invoice: sourceInvoice,
      balance: getInvoiceBalanceState(sourceInvoice.amount, after),
    }
  }, [sourceInvoice, payment.amount])

  return (
    <ModalShell
      title={`Unprocess payment — ${payment.invoice_number}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="dashboard-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="dashboard-btn-primary"
            style={{ backgroundColor: c.error }}
            disabled={!reason.trim()}
            onClick={onConfirm}
          >
            Unprocess payment
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
            {formatCurrency(payment.amount)} on {payment.invoice_number}
          </p>
          <p className="text-xs mt-1" style={{ color: c.mutedLight }}>
            {payment.broker_name}
            {payment.load_number ? ` · Load ${payment.load_number}` : ''}
          </p>
        </div>

        <p className="text-sm" style={{ color: c.secondary }}>
          This reverses the payment and reopens the invoice. The action cannot be undone.
        </p>

        <div>
          <label className="client-label" htmlFor="unprocess-reason">
            Reason <span className="text-red-600">*</span>
          </label>
          <textarea
            id="unprocess-reason"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            rows={2}
            className="client-input w-full mt-1"
            placeholder="Due to…"
          />
        </div>

        {preview && (
          <div
            className="rounded-lg border p-3 text-sm"
            style={{ borderColor: c.warning, backgroundColor: c.stat.amber }}
          >
            <p className="font-medium flex items-center gap-1.5" style={{ color: c.primary }}>
              <AlertTriangle className="w-4 h-4" />
              Invoice {preview.invoice.invoice_number} returns to unpaid with{' '}
              {formatCurrency(preview.balance.signedBalance)} outstanding; aging resumes.
            </p>
          </div>
        )}
      </div>
    </ModalShell>
  )
}
