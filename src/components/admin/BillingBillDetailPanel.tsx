import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Mail,
  Percent,
  Send,
  Trash2,
} from 'lucide-react'
import {
  computeMonthlyBill,
  formatBillingPeriod,
  getBillForPeriod,
  getBillHistoryEvents,
  getClientBills,
  getPeriodBilledInvoices,
  issueClientBill,
  markBillPaid,
  normalizePaymentUrl,
} from '../../services/arBillingService'
import { sendCarrierBillingInvoiceEmail } from '../../services/carrierBillingEmailService'
import {
  getClientInvoicesForCredit,
  getReimbursementLedger,
  recordManualBillingCredit,
  suggestInvoiceFeeCredit,
  voidBillingCredit,
} from '../../services/reimbursementAccountService'
import {
  approveBillingFeeClawback,
  listBillingFeeClawbackSuggestions,
} from '../../services/billingClawbackService'
import { openAdminInvoiceWorkspace } from '../../utils/openAdminInvoiceWorkspace'
import { openBillingInvoiceWorkspace } from '../../utils/openBillingInvoiceWorkspace'
import { formatCurrency } from '../../utils/format'
import { useToast } from '../ui/ToastProvider'
import type { BillingPeriod, ComputedMonthlyBill } from '../../types/billing'
import type { Client } from '../../types/client'
import type { ReimbursementCreditType } from '../../types/reimbursement'

interface BillingBillDetailPanelProps {
  client: Client
  period: BillingPeriod
  onChanged: () => void
}

type WorkflowStep = 'preview' | 'issued' | 'emailed' | 'paid'
type WorkspaceTab = 'invoice' | 'history' | 'credits'

function resolveWorkflowStep(
  hasBill: boolean,
  status: string | undefined,
  emailedAt: string | undefined
): WorkflowStep {
  if (!hasBill) return 'preview'
  if (status === 'paid') return 'paid'
  if (emailedAt) return 'emailed'
  return 'issued'
}

function creditTypeLabel(type: ReimbursementCreditType): string {
  if (type === 'short_payment') return 'Short-pay credit'
  if (type === 'invoice_fee_reimbursement') return 'Invoice fee reimbursement'
  if (type === 'reversal_fee_reimbursement') return 'Reversal fee reimbursement'
  return 'Billing discount'
}

/** Full billing invoice body for the popup workspace. */
export default function BillingBillDetailPanel({
  client,
  period,
  onChanged,
}: BillingBillDetailPanelProps) {
  const { showToast } = useToast()
  const periodKey = formatBillingPeriod(period)
  const periodLabel = new Date(period.year, period.month - 1, 1).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<WorkspaceTab>('invoice')
  const [creditAmount, setCreditAmount] = useState('')
  const [creditReason, setCreditReason] = useState('')
  const [creditNote, setCreditNote] = useState('')
  const [creditInvoiceId, setCreditInvoiceId] = useState('')
  const [creditKind, setCreditKind] = useState<'invoice_fee_reimbursement' | 'manual_discount'>(
    'invoice_fee_reimbursement'
  )
  const [showReimbursedClawbacks, setShowReimbursedClawbacks] = useState(false)
  const [selectedClawbackIds, setSelectedClawbackIds] = useState<string[]>([])
  const [includeAppFee, setIncludeAppFee] = useState(
    client.billing?.include_platform_fee !== false
  )
  const [paymentUrl, setPaymentUrl] = useState('')
  const [emailTo, setEmailTo] = useState(client.email ?? '')
  const [emailNote, setEmailNote] = useState('')

  useEffect(() => {
    setTab('invoice')
    setCreditAmount('')
    setCreditReason('')
    setCreditNote('')
    setCreditInvoiceId('')
    setShowReimbursedClawbacks(false)
    setSelectedClawbackIds([])
    setIncludeAppFee(
      getBillForPeriod(client.id, period)?.include_app_fee ??
        client.billing?.include_platform_fee !== false
    )
    setPaymentUrl(getBillForPeriod(client.id, period)?.payment_url ?? '')
    setEmailTo(getBillForPeriod(client.id, period)?.emailed_to ?? client.email ?? '')
    setEmailNote('')
  }, [client.id, periodKey])

  const bill = getBillForPeriod(client.id, period)
  const allBills = getClientBills(client.id)
  const ledger = getReimbursementLedger(client.id)
  const invoices = getClientInvoicesForCredit(client.id)
  const clawbacks = useMemo(
    () => listBillingFeeClawbackSuggestions(client.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client.id, client.reimbursement_balance, ledger.length, allBills.length]
  )
  const pendingClawbacks = clawbacks.filter((c) => !c.reimbursed)
  const reimbursedClawbacks = clawbacks.filter((c) => c.reimbursed)
  const historyEvents = useMemo(
    () => (bill ? getBillHistoryEvents(bill) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bill?.id, bill?.status, bill?.paid_at, bill?.emailed_at, bill?.email_send_count, bill?.amount]
  )
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

  // Issued bills keep stored line items; drafts use live computation.
  const lineItems = bill?.line_items ?? computed?.lineItems ?? []
  const amountDue = bill?.amount ?? computed?.total ?? 0
  const isTrial = computed?.isTrial ?? client.billing?.subscription_status === 'trial'
  const creditOnAccount = client.reimbursement_balance ?? computed?.reimbursementBalance ?? 0
  const step = resolveWorkflowStep(Boolean(bill), bill?.status, bill?.emailed_at)
  const activeWouldCharge = computed?.grossSubtotal ?? 0

  /** Keep fee summary aligned with what the line items / issued bill actually used. */
  const feeTermsLabel = (() => {
    const snap = bill?.fee_terms_snapshot
    if (snap?.fee_type === 'flat') {
      return `$${Number(snap.flat_fee_amount ?? 0).toFixed(2)} flat`
    }
    if (snap?.fee_type === 'percentage') {
      return `${snap.fee_percentage ?? 0}%`
    }
    for (const li of lineItems) {
      const pct = li.description.match(/([\d.]+)%/)
      if (pct && /fee/i.test(li.description)) return `${pct[1]}%`
      const flat = li.description.match(/\$([\d.]+)\s*(?:flat|×)/i)
      if (flat && /fee/i.test(li.description)) return `$${flat[1]} flat`
    }
    return computed?.feeDisplay ?? '—'
  })()

  const steps: { key: WorkflowStep; label: string; hint: string }[] = [
    { key: 'preview', label: 'Review', hint: 'Loads + line items' },
    { key: 'issued', label: 'Issue', hint: 'Lock the invoice' },
    { key: 'emailed', label: 'Email', hint: 'Send payment link' },
    { key: 'paid', label: 'Paid', hint: 'Confirm funds' },
  ]
  const stepIndex = steps.findIndex((s) => s.key === step)

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

  const handleSendInvoice = async () => {
    if (!bill) return
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
      if (result.ok) {
        showToast(
          bill.emailed_at ? `Invoice re-sent to ${emailTo.trim()}` : `Invoice sent to ${emailTo.trim()}`,
          'success'
        )
        onChanged()
      } else {
        showToast(result.error ?? 'Send failed', 'error')
      }
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
      showToast('Invoice marked paid', 'success')
      onChanged()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleInvoicePick = (invoiceId: string) => {
    setCreditInvoiceId(invoiceId)
    if (!invoiceId) return
    const suggested = suggestInvoiceFeeCredit(client.id, invoiceId)
    if (suggested > 0) setCreditAmount(String(suggested))
  }

  const handleAddCredit = async () => {
    const amount = Number(creditAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('Enter a credit amount greater than zero', 'error')
      return
    }
    if (!creditReason.trim()) {
      showToast('Add a short reason for the credit', 'error')
      return
    }

    setBusy(true)
    try {
      const selected = invoices.find((inv) => inv.id === creditInvoiceId)
      await recordManualBillingCredit({
        clientId: client.id,
        amount,
        creditType: creditKind,
        reason: creditReason,
        note: creditNote || undefined,
        invoiceId: creditInvoiceId || undefined,
        invoiceNumber: selected?.invoice_number,
        createdBy: 'admin',
      })
      showToast(
        `${formatCurrency(amount)} credit added — deducted on the next issued invoice (never below $0)`,
        'success'
      )
      setCreditAmount('')
      setCreditReason('')
      setCreditNote('')
      setCreditInvoiceId('')
      onChanged()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not add credit', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleVoidCredit = async (entryId: string) => {
    if (!window.confirm('Void this credit? It will be removed from the client account balance.')) {
      return
    }
    setBusy(true)
    try {
      await voidBillingCredit(entryId, { voidedBy: 'admin' })
      showToast('Credit voided', 'success')
      onChanged()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not void credit', 'error')
    } finally {
      setBusy(false)
    }
  }

  const toggleClawback = (id: string) => {
    setSelectedClawbackIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const handleApproveSelectedClawbacks = async () => {
    if (selectedClawbackIds.length === 0) {
      showToast('Select at least one reversed invoice to reimburse', 'info')
      return
    }
    setBusy(true)
    try {
      let total = 0
      for (const id of selectedClawbackIds) {
        const entry = await approveBillingFeeClawback(id, { createdBy: 'admin' })
        total += entry.fee_credit_amount
      }
      showToast(
        `Reimbursed ${formatCurrency(total)} to account — applied on the next issued invoice`,
        'success'
      )
      setSelectedClawbackIds([])
      onChanged()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not reimburse', 'error')
    } finally {
      setBusy(false)
    }
  }

  const openCarrierInvoice = (invoiceId: string) => {
    const win = openAdminInvoiceWorkspace(invoiceId)
    if (!win) showToast('Popup blocked. Allow popups to view the invoice.', 'error')
  }

  const openBillingPeriod = (periodStr: string) => {
    const win = openBillingInvoiceWorkspace(client.id, periodStr)
    if (!win) showToast('Popup blocked. Allow popups to view the invoice.', 'error')
  }

  return (
    <div className="flex flex-col min-h-0 h-full overflow-hidden text-sm text-slate-800">
      {/* Compact chrome: workflow + tabs in one band */}
      <div className="shrink-0 px-4 py-2 border-b border-slate-200 bg-slate-50 space-y-2">
        <ol className="flex items-stretch gap-1.5">
          {steps.map((s, idx) => {
            const done = idx < stepIndex || step === 'paid'
            const active = s.key === step
            return (
              <li key={s.key} className="flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    setTab('invoice')
                    requestAnimationFrame(() => {
                      document.getElementById('billing-issue-actions')?.scrollIntoView({
                        block: 'nearest',
                        behavior: 'smooth',
                      })
                    })
                  }}
                  className={`w-full text-left rounded border px-2.5 py-1.5 transition-colors ${
                    active
                      ? 'border-slate-900 bg-white'
                      : done
                        ? 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100'
                        : 'border-slate-200 bg-white/80 hover:bg-white'
                  }`}
                >
                  <p
                    className={`text-xs font-semibold leading-tight truncate ${
                      active ? 'text-slate-900' : done ? 'text-emerald-800' : 'text-slate-500'
                    }`}
                  >
                    <span className="tabular-nums text-slate-400 mr-1">{idx + 1}</span>
                    {s.label}
                  </p>
                  <p className="text-[11px] text-slate-500 leading-tight truncate mt-0.5">{s.hint}</p>
                </button>
              </li>
            )
          })}
        </ol>

        <div className="flex items-center gap-1" role="tablist" aria-label="Invoice sections">
          {(
            [
              ['invoice', 'Invoice'],
              ['history', 'Payment history'],
              ['credits', 'Discount / credit'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors ${
                tab === id
                  ? 'border-slate-900 bg-white text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-white/80'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Invoice tab: fill viewport — metrics + table + sticky action, no page scroll */}
      {tab === 'invoice' ? (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="shrink-0 px-4 pt-3 space-y-2.5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-px rounded-lg border border-slate-200 overflow-hidden bg-slate-200">
              {(
                [
                  { label: 'Amount due', value: formatCurrency(amountDue), tone: 'text-slate-900' },
                  {
                    label: 'Collected',
                    value: computed ? formatCurrency(computed.collectedVolume) : '—',
                    tone: 'text-slate-900',
                  },
                  { label: 'Fee terms', value: feeTermsLabel, tone: 'text-slate-900' },
                  {
                    label: 'Credit on account',
                    value: formatCurrency(creditOnAccount),
                    tone: 'text-emerald-700',
                  },
                ] as const
              ).map((stat) => (
                <div key={stat.label} className="bg-white px-3 py-2 min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold truncate">
                    {stat.label}
                  </p>
                  <p className={`text-base font-semibold tabular-nums leading-snug mt-0.5 truncate ${stat.tone}`}>
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>

            {isTrial ? (
              <p className="rounded border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs text-sky-950 leading-snug">
                <strong>Trial</strong> — fees waived (due $0). Active billing would be about{' '}
                <strong>{formatCurrency(activeWouldCharge)}</strong> before credits. Set subscription
                to <strong>active</strong> on the client to start charging.
              </p>
            ) : null}
          </div>

          <div className="flex-1 min-h-0 px-4 py-2.5 overflow-hidden flex flex-col gap-2.5">
            {computeError && !bill ? (
              <p className="text-sm text-red-600">{computeError}</p>
            ) : (
              <>
                <div className="min-h-0 flex-1 border border-slate-200 rounded-lg overflow-auto">
                  <table className="dashboard-table dashboard-table--compact w-full">
                    <thead className="sticky top-0 z-[1] bg-slate-50">
                      <tr>
                        <th>Load / invoice</th>
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
                          <td className="text-sm text-slate-700">{row.brokerName}</td>
                          <td>
                            {row.closedByCredyx ? (
                              <span className="status-pill status-pill--closed">Closed by Credyx</span>
                            ) : (
                              <span className="status-pill status-pill--paid">Paid</span>
                            )}
                          </td>
                          <td className="text-right tabular-nums text-sm">
                            {formatCurrency(row.collectedAmount)}
                          </td>
                          <td className="text-right tabular-nums text-sm">
                            {formatCurrency(row.fee)}
                          </td>
                          <td className="text-right">
                            <button
                              type="button"
                              onClick={() => openCarrierInvoice(row.invoiceId)}
                              className="dashboard-btn-secondary dashboard-btn-compact inline-flex items-center gap-1"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Open
                            </button>
                          </td>
                        </tr>
                      ))}
                      {billedInvoices.length === 0 && (
                        <tr>
                          <td colSpan={6} className="text-center text-slate-500 py-6">
                            No paid or Credyx-closed invoices in {periodLabel}.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="shrink-0 max-h-[32%] border border-slate-200 rounded-lg overflow-auto">
                  <table className="dashboard-table dashboard-table--compact w-full">
                    <thead className="sticky top-0 z-[1] bg-slate-50">
                      <tr>
                        <th>Line item</th>
                        <th className="text-right w-28">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((li) => (
                        <tr key={li.id}>
                          <td className="text-sm">{li.description}</td>
                          <td
                            className={`text-right tabular-nums text-sm font-medium ${
                              li.amount < 0 ? 'text-emerald-700' : ''
                            }`}
                          >
                            {formatCurrency(li.amount)}
                          </td>
                        </tr>
                      ))}
                      {lineItems.length === 0 && (
                        <tr>
                          <td colSpan={2} className="text-center text-slate-500 py-4">
                            No line items for this period.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot className="sticky bottom-0 bg-white">
                      <tr>
                        <td className="font-semibold text-sm">Amount due</td>
                        <td className="text-right tabular-nums font-semibold text-sm">
                          {formatCurrency(amountDue)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </div>

          <div
            id="billing-issue-actions"
            className="shrink-0 px-4 py-2.5 border-t border-slate-200 bg-white space-y-2.5"
          >
            <label className="flex items-center gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={bill?.include_app_fee ?? includeAppFee}
                disabled={Boolean(bill) || busy || isTrial}
                onChange={(e) => setIncludeAppFee(e.target.checked)}
              />
              Include $99 software fee
              {isTrial ? (
                <span className="text-xs text-slate-500">waived on trial</span>
              ) : bill ? (
                <span className="text-xs text-slate-500">locked on issue</span>
              ) : null}
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <label className="block text-xs">
                <span className="font-medium text-slate-600 uppercase tracking-wide">Send to</span>
                <input
                  type="email"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  className="client-input mt-1 w-full text-sm"
                  placeholder="carrier@example.com"
                />
              </label>
              <label className="block text-xs">
                <span className="font-medium text-slate-600 uppercase tracking-wide">
                  Payment URL
                </span>
                <input
                  type="url"
                  value={paymentUrl}
                  onChange={(e) => setPaymentUrl(e.target.value)}
                  className="client-input mt-1 w-full text-sm"
                  placeholder="https://pay.example.com/invoice"
                />
              </label>
              <label className="block text-xs md:col-span-2">
                <span className="font-medium text-slate-600 uppercase tracking-wide">
                  Note (optional)
                </span>
                <input
                  type="text"
                  value={emailNote}
                  onChange={(e) => setEmailNote(e.target.value)}
                  className="client-input mt-1 w-full text-sm"
                  placeholder="Shown in the email above the pay button"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy || Boolean(bill) || (!computed && !bill) || Boolean(computeError && !bill)}
                onClick={() => void handleIssue()}
                className="dashboard-btn-primary inline-flex items-center gap-1.5"
              >
                <CreditCard className="w-3.5 h-3.5" />
                {bill ? `Issued ${periodLabel}` : `Issue invoice for ${periodLabel}`}
              </button>
              <button
                type="button"
                disabled={busy || !bill}
                title={!bill ? 'Issue the invoice first' : undefined}
                onClick={() => void handleSendInvoice()}
                className="dashboard-btn-primary inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {bill?.emailed_at ? (
                  <Mail className="w-3.5 h-3.5" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                {bill?.emailed_at ? 'Resend invoice' : 'Send invoice'}
              </button>
              <button
                type="button"
                disabled={busy || !bill || bill.status === 'paid'}
                title={!bill ? 'Issue the invoice first' : undefined}
                onClick={() => void handleMarkPaid()}
                className="dashboard-btn-secondary inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {bill?.status === 'paid' ? 'Paid' : 'Mark payment received'}
              </button>
              {bill?.emailed_at ? (
                <span className="text-xs text-slate-500">
                  Last sent {bill.emailed_at.slice(0, 10)}
                  {bill.emailed_to ? ` · ${bill.emailed_to}` : ''}
                  {(bill.email_send_count ?? 0) > 1 ? ` · ${bill.email_send_count}×` : ''}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {tab === 'history' && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="min-w-0">
                <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  This invoice
                </h3>
                {historyEvents.length === 0 ? (
                  <p className="text-sm text-slate-500 rounded-lg border border-dashed border-slate-200 px-3 py-3">
                    No payment activity yet — issue the invoice to start the timeline.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {historyEvents.map((ev) => (
                      <li
                        key={ev.id}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-medium text-slate-900">{ev.label}</span>
                          <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
                            {ev.at.slice(0, 10)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">
                          {ev.detail ?? ''}
                          {ev.amount != null ? ` · ${formatCurrency(ev.amount)}` : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="min-w-0">
                <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  Client invoices
                </h3>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="dashboard-table dashboard-table--compact w-full">
                    <thead>
                      <tr>
                        <th>Period</th>
                        <th>Status</th>
                        <th className="text-right">Amount</th>
                        <th>Paid</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {allBills.map((b) => (
                        <tr key={b.id} className={b.period === periodKey ? 'bg-slate-50' : undefined}>
                          <td className="tabular-nums">{b.period}</td>
                          <td className="capitalize">{b.status}</td>
                          <td className="text-right tabular-nums">{formatCurrency(b.amount)}</td>
                          <td className="text-slate-500">{b.paid_at?.slice(0, 10) ?? '—'}</td>
                          <td className="text-right">
                            <button
                              type="button"
                              onClick={() => openBillingPeriod(b.period)}
                              className="dashboard-btn-secondary dashboard-btn-compact inline-flex items-center gap-1"
                              disabled={b.period === periodKey}
                              title={
                                b.period === periodKey
                                  ? 'Already viewing this invoice'
                                  : `View ${b.period} invoice`
                              }
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                      {allBills.length === 0 && (
                        <tr>
                          <td colSpan={5} className="text-center text-slate-500 py-4">
                            No invoices issued yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {tab === 'credits' && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
              <section className="space-y-2.5 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Reversal reimbursements
                  </h3>
                  {reimbursedClawbacks.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setShowReimbursedClawbacks((v) => !v)}
                      className="text-xs font-medium text-slate-600 underline-offset-2 hover:underline"
                    >
                      {showReimbursedClawbacks
                        ? 'Hide reimbursed'
                        : `Show reimbursed (${reimbursedClawbacks.length})`}
                    </button>
                  ) : null}
                </div>

                <p className="text-xs text-slate-600 leading-snug">
                  Reversals after the Credyx bill was issued appear here. Fee uses the rate locked on
                  that bill.
                </p>

                {pendingClawbacks.length === 0 ? (
                  <p className="text-sm text-slate-500 rounded-lg border border-dashed border-slate-200 px-3 py-3">
                    No pending reversal reimbursements.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {pendingClawbacks.map((item) => {
                      const checked = selectedClawbackIds.includes(item.id)
                      return (
                        <li
                          key={item.id}
                          className={`rounded-lg border px-3 py-2 ${
                            checked ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white'
                          }`}
                        >
                          <label className="flex items-start gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={checked}
                              onChange={() => toggleClawback(item.id)}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <p className="text-sm font-medium text-slate-900">
                                  {item.invoiceNumber}
                                  {item.loadNumber ? ` · Load ${item.loadNumber}` : ''}
                                </p>
                                <span className="tabular-nums text-sm font-semibold text-emerald-700">
                                  −{formatCurrency(item.feeCreditAmount)}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5">
                                Collected {formatCurrency(item.paymentAmount)} · billed{' '}
                                {item.billedPeriod} at {item.billedFeeLabel} · reversed{' '}
                                {item.reversedAt.slice(0, 10)}
                                {item.reversalType ? ` (${item.reversalType})` : ''}
                              </p>
                              <p className="text-xs text-slate-600 mt-1 leading-snug line-clamp-3">
                                {item.systemNote}
                              </p>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault()
                                  openCarrierInvoice(item.invoiceId)
                                }}
                                className="mt-1.5 dashboard-btn-secondary dashboard-btn-compact inline-flex items-center gap-1"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                View invoice
                              </button>
                            </div>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                )}

                {pendingClawbacks.length > 0 ? (
                  <button
                    type="button"
                    disabled={busy || selectedClawbackIds.length === 0}
                    onClick={() => void handleApproveSelectedClawbacks()}
                    className="dashboard-btn-primary inline-flex items-center gap-1.5"
                  >
                    <Percent className="w-3.5 h-3.5" />
                    Reimburse selected
                    {selectedClawbackIds.length > 0 ? ` (${selectedClawbackIds.length})` : ''}
                  </button>
                ) : null}

                {showReimbursedClawbacks && reimbursedClawbacks.length > 0 ? (
                  <ul className="space-y-1.5 pt-2 border-t border-slate-100">
                    {reimbursedClawbacks.map((item) => (
                      <li
                        key={item.id}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 opacity-80"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-sm font-medium text-slate-800">
                            {item.invoiceNumber}
                            <span className="ml-2 text-[11px] font-normal text-emerald-700">
                              Reimbursed
                            </span>
                          </p>
                          <span className="tabular-nums text-sm text-slate-600">
                            −{formatCurrency(item.feeCreditAmount)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{item.systemNote}</p>
                        <button
                          type="button"
                          onClick={() => openCarrierInvoice(item.invoiceId)}
                          className="mt-1.5 dashboard-btn-secondary dashboard-btn-compact inline-flex items-center gap-1"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          View invoice
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>

              <section className="space-y-2.5 min-w-0">
                <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Manual discount / credit
                </h3>
                <p className="text-xs text-slate-600 leading-snug">
                  Goodwill or fee reimbursements outside automatic reversal suggestions. Pending
                  credits can be voided; applied credits cannot.
                </p>

                <div className="rounded-lg border border-slate-200 p-3 space-y-2.5">
                  <label className="block text-xs">
                    <span className="font-medium text-slate-600 uppercase tracking-wide">Type</span>
                    <select
                      value={creditKind}
                      onChange={(e) =>
                        setCreditKind(
                          e.target.value as 'invoice_fee_reimbursement' | 'manual_discount'
                        )
                      }
                      className="client-input mt-1 w-full text-sm"
                    >
                      <option value="invoice_fee_reimbursement">Invoice fee reimbursement</option>
                      <option value="manual_discount">Manual discount / goodwill</option>
                    </select>
                  </label>

                  <label className="block text-xs">
                    <span className="font-medium text-slate-600 uppercase tracking-wide">
                      Link invoice (optional)
                    </span>
                    <div className="flex gap-2 mt-1">
                      <select
                        value={creditInvoiceId}
                        onChange={(e) => handleInvoicePick(e.target.value)}
                        className="client-input flex-1 text-sm"
                      >
                        <option value="">No linked invoice</option>
                        {invoices.map((inv) => (
                          <option key={inv.id} value={inv.id}>
                            {inv.invoice_number} · {formatCurrency(inv.amount)} · {inv.status}
                          </option>
                        ))}
                      </select>
                      {creditInvoiceId ? (
                        <button
                          type="button"
                          onClick={() => openCarrierInvoice(creditInvoiceId)}
                          className="dashboard-btn-secondary dashboard-btn-compact inline-flex items-center gap-1 shrink-0"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          View
                        </button>
                      ) : null}
                    </div>
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <label className="block text-xs">
                      <span className="font-medium text-slate-600 uppercase tracking-wide">
                        Amount ($)
                      </span>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={creditAmount}
                        onChange={(e) => setCreditAmount(e.target.value)}
                        className="client-input mt-1 w-full text-sm tabular-nums"
                        placeholder="5.00"
                      />
                    </label>
                    <label className="block text-xs">
                      <span className="font-medium text-slate-600 uppercase tracking-wide">Reason</span>
                      <input
                        type="text"
                        value={creditReason}
                        onChange={(e) => setCreditReason(e.target.value)}
                        className="client-input mt-1 w-full text-sm"
                        placeholder="Fee on unclosed invoice"
                      />
                    </label>
                  </div>

                  <label className="block text-xs">
                    <span className="font-medium text-slate-600 uppercase tracking-wide">
                      Internal note
                    </span>
                    <textarea
                      value={creditNote}
                      onChange={(e) => setCreditNote(e.target.value)}
                      rows={2}
                      className="client-input mt-1 w-full text-sm"
                    />
                  </label>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleAddCredit()}
                    className="dashboard-btn-secondary w-full inline-flex items-center justify-center gap-1.5"
                  >
                    <Percent className="w-3.5 h-3.5" />
                    Add credit to account
                  </button>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Credit ledger
                    </h3>
                    <span className="text-xs text-emerald-700 tabular-nums font-medium">
                      On account {formatCurrency(creditOnAccount)}
                    </span>
                  </div>

                  {ledger.length === 0 ? (
                    <p className="text-sm text-slate-500 rounded-lg border border-dashed border-slate-200 px-3 py-3">
                      No credits yet.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {ledger.map((entry) => (
                        <li
                          key={entry.id}
                          className={`rounded-lg border px-3 py-2 ${
                            entry.status === 'voided'
                              ? 'border-slate-200 bg-slate-50 opacity-70'
                              : 'border-slate-200 bg-white'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-900">
                                {creditTypeLabel(entry.credit_type)}
                                {entry.invoice_number ? ` · ${entry.invoice_number}` : ''}
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {entry.reason || '—'} · {entry.status}
                                {entry.voided_at ? ` · voided ${entry.voided_at.slice(0, 10)}` : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span
                                className={`tabular-nums text-sm font-medium ${
                                  entry.status === 'voided'
                                    ? 'text-slate-400 line-through'
                                    : 'text-emerald-700'
                                }`}
                              >
                                −{formatCurrency(entry.fee_credit_amount)}
                              </span>
                              {entry.invoice_id ? (
                                <button
                                  type="button"
                                  onClick={() => openCarrierInvoice(entry.invoice_id!)}
                                  className="dashboard-btn-secondary dashboard-btn-compact inline-flex items-center gap-1"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  View
                                </button>
                              ) : null}
                              {entry.status === 'pending' ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void handleVoidCredit(entry.id)}
                                  className="dashboard-btn-secondary dashboard-btn-compact inline-flex items-center gap-1 text-red-700 border-red-200 hover:bg-red-50"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Void
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
