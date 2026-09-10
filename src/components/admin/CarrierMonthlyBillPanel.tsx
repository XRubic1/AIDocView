import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ExternalLink, Mail, Send } from 'lucide-react'
import {
  computeMonthlyBill,
  formatBillingPeriod,
  getBillForPeriod,
  getPeriodBilledInvoices,
  issueClientBill,
  markBillPaid,
  normalizePaymentUrl,
} from '../../services/arBillingService'
import { sendCarrierBillingInvoiceEmail } from '../../services/carrierBillingEmailService'
import { openAdminInvoiceWorkspace } from '../../utils/openAdminInvoiceWorkspace'
import { formatCurrency } from '../../utils/format'
import { useToast } from '../ui/ToastProvider'
import type { BillingPeriod, ComputedMonthlyBill } from '../../types/billing'
import type { Client } from '../../types/client'

interface CarrierMonthlyBillPanelProps {
  client: Client
  period: BillingPeriod
  onChanged: () => void
}

function billStatusLabel(bill: ReturnType<typeof getBillForPeriod>): string {
  if (!bill) return 'Not issued'
  if (bill.status === 'paid') return 'Paid'
  if (bill.emailed_at) return 'Sent'
  return 'Issued'
}

/**
 * Carrier monthly Credyx invoice: loads this period, optional $99, email + payment URL.
 */
export default function CarrierMonthlyBillPanel({
  client,
  period,
  onChanged,
}: CarrierMonthlyBillPanelProps) {
  const { showToast } = useToast()
  const periodKey = formatBillingPeriod(period)
  const periodLabel = new Date(period.year, period.month - 1, 1).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  const [busy, setBusy] = useState(false)
  const [includeAppFee, setIncludeAppFee] = useState(
    client.billing?.include_platform_fee !== false
  )
  const [paymentUrl, setPaymentUrl] = useState('')
  const [emailTo, setEmailTo] = useState(client.email ?? '')
  const [emailNote, setEmailNote] = useState('')

  useEffect(() => {
    const existing = getBillForPeriod(client.id, period)
    setIncludeAppFee(existing?.include_app_fee ?? client.billing?.include_platform_fee !== false)
    setPaymentUrl(existing?.payment_url ?? '')
    setEmailTo(existing?.emailed_to ?? client.email ?? '')
    setEmailNote('')
  }, [client.id, client.email, client.billing?.include_platform_fee, periodKey])

  const bill = getBillForPeriod(client.id, period)
  const billedInvoices = useMemo(
    () => getPeriodBilledInvoices(client.id, period),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client.id, periodKey]
  )

  let computed: ComputedMonthlyBill | null = null
  let computeError: string | null = null
  try {
    computed = computeMonthlyBill(client.id, period, {
      includeAppFee: bill?.include_app_fee ?? includeAppFee,
    })
  } catch (err) {
    computeError = err instanceof Error ? err.message : 'Unable to compute bill'
  }

  const lineItems = bill?.line_items ?? computed?.lineItems ?? []
  const amountDue = bill?.amount ?? computed?.total ?? 0
  const isTrial = computed?.isTrial ?? client.billing?.subscription_status === 'trial'
  const statusLabel = billStatusLabel(bill)

  const feeTermsLabel = (() => {
    const snap = bill?.fee_terms_snapshot
    if (snap?.fee_type === 'flat') return `$${Number(snap.flat_fee_amount ?? 0).toFixed(2)} flat`
    if (snap?.fee_type === 'percentage') return `${snap.fee_percentage ?? 0}%`
    return computed?.feeDisplay ?? '—'
  })()

  const handleIssue = async () => {
    setBusy(true)
    try {
      const issued = await issueClientBill(client.id, period, { includeAppFee })
      showToast(`Invoice issued — ${formatCurrency(issued.amount)}`, 'success')
      onChanged()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Issue failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleSend = async () => {
    if (!bill) {
      showToast('Issue the invoice first', 'error')
      return
    }
    const url = normalizePaymentUrl(paymentUrl)
    if (!url) {
      showToast('Enter a valid payment URL (https://…)', 'error')
      return
    }
    setBusy(true)
    try {
      const result = await sendCarrierBillingInvoiceEmail({
        client,
        bill,
        to: emailTo,
        paymentUrl: url,
        collectedVolume: computed?.collectedVolume ?? 0,
        feeTermsLabel,
        message: emailNote,
      })
      if (!result.ok) {
        showToast(result.error ?? 'Send failed', 'error')
        return
      }
      showToast(`Invoice emailed to ${emailTo.trim()}`, 'success')
      onChanged()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Send failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleMarkPaid = async () => {
    if (!bill) return
    setBusy(true)
    try {
      await markBillPaid(bill.id)
      showToast('Marked paid', 'success')
      onChanged()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col min-h-0 h-full bg-white animate-in fade-in duration-200">
      <header className="shrink-0 px-5 py-4 border-b border-slate-200">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-semibold text-slate-900 truncate">{client.name}</p>
            <p className="text-sm text-slate-500 mt-0.5">
              {periodLabel}
              {isTrial ? ' · Trial (fees waived)' : ''}
              {client.email ? ` · ${client.email}` : ''}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Amount due
            </p>
            <p className="text-2xl font-semibold tabular-nums text-slate-900 leading-tight">
              {formatCurrency(amountDue)}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">{statusLabel}</p>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <section className="px-5 py-4 border-b border-slate-100">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Loads this month
            </h2>
            <p className="text-xs text-slate-500">
              {billedInvoices.length} invoice{billedInvoices.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <table className="dashboard-table dashboard-table--compact w-full">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Broker</th>
                  <th>Credyx</th>
                  <th className="text-right">Collected</th>
                  <th className="text-right">Fee</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {billedInvoices.map((row) => (
                  <tr key={row.invoiceId}>
                    <td>
                      <p className="font-medium text-slate-900">{row.invoiceNumber}</p>
                      <p className="text-[11px] text-slate-500">
                        {row.loadNumber ? `Load ${row.loadNumber}` : '—'}
                      </p>
                    </td>
                    <td className="text-slate-700">{row.brokerName}</td>
                    <td>
                      {row.closedByCredyx ? (
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                          Closed by Credyx
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                          Paid
                        </span>
                      )}
                    </td>
                    <td className="text-right tabular-nums">{formatCurrency(row.collectedAmount)}</td>
                    <td className="text-right tabular-nums">{formatCurrency(row.fee)}</td>
                    <td className="text-right">
                      <button
                        type="button"
                        onClick={() => {
                          const win = openAdminInvoiceWorkspace(row.invoiceId)
                          if (!win) showToast('Popup blocked.', 'error')
                        }}
                        className="text-xs font-medium text-[#1684FE] hover:underline inline-flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
                {billedInvoices.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-slate-500 py-8">
                      No paid or Credyx-closed invoices in {periodLabel}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="px-5 py-4 border-b border-slate-100 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Credyx charges
          </h2>
          <label className="flex items-center gap-2.5 text-sm text-slate-800">
            <input
              type="checkbox"
              className="rounded border-slate-300"
              checked={bill?.include_app_fee ?? includeAppFee}
              disabled={Boolean(bill) || busy || isTrial}
              onChange={(e) => setIncludeAppFee(e.target.checked)}
            />
            Include $99 software fee
          </label>
          {computeError && !bill ? (
            <p className="text-sm text-red-600">{computeError}</p>
          ) : (
            <ul className="rounded-lg border border-slate-200 divide-y divide-slate-100">
              {lineItems.map((li) => (
                <li key={li.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="text-slate-700 min-w-0">{li.description}</span>
                  <span
                    className={`tabular-nums font-medium shrink-0 ${
                      li.amount < 0 ? 'text-emerald-700' : 'text-slate-900'
                    }`}
                  >
                    {formatCurrency(li.amount)}
                  </span>
                </li>
              ))}
              <li className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm bg-slate-50">
                <span className="font-semibold text-slate-900">Amount due</span>
                <span className="tabular-nums font-semibold text-slate-900">
                  {formatCurrency(amountDue)}
                </span>
              </li>
            </ul>
          )}
        </section>

        <section className="px-5 py-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Email invoice
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs">
              <span className="font-medium text-slate-600">Carrier email</span>
              <input
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                className="client-input mt-1 w-full text-sm"
                placeholder="carrier@example.com"
              />
            </label>
            <label className="block text-xs">
              <span className="font-medium text-slate-600">Payment URL</span>
              <input
                type="url"
                value={paymentUrl}
                onChange={(e) => setPaymentUrl(e.target.value)}
                className="client-input mt-1 w-full text-sm"
                placeholder="https://…"
              />
            </label>
            <label className="block text-xs sm:col-span-2">
              <span className="font-medium text-slate-600">Note (optional)</span>
              <input
                type="text"
                value={emailNote}
                onChange={(e) => setEmailNote(e.target.value)}
                className="client-input mt-1 w-full text-sm"
                placeholder="Shown in the email"
              />
            </label>
          </div>
          {bill?.emailed_at ? (
            <p className="text-xs text-slate-500">
              Last sent {bill.emailed_at.slice(0, 16).replace('T', ' ')}
              {bill.emailed_to ? ` to ${bill.emailed_to}` : ''}
              {(bill.email_send_count ?? 0) > 1 ? ` · ${bill.email_send_count} times` : ''}
            </p>
          ) : null}
        </section>
      </div>

      <footer className="shrink-0 px-5 py-3 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || Boolean(bill) || Boolean(computeError && !bill)}
          onClick={() => void handleIssue()}
          className="dashboard-btn-secondary inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          {bill ? 'Issued' : 'Issue invoice'}
        </button>
        <button
          type="button"
          disabled={busy || !bill}
          onClick={() => void handleSend()}
          className="dashboard-btn-primary inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          {bill?.emailed_at ? <Mail className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
          {bill?.emailed_at ? 'Resend' : 'Send invoice'}
        </button>
        <button
          type="button"
          disabled={busy || !bill || bill.status === 'paid'}
          onClick={() => void handleMarkPaid()}
          className="dashboard-btn-secondary inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          {bill?.status === 'paid' ? 'Paid' : 'Mark paid'}
        </button>
      </footer>
    </div>
  )
}
