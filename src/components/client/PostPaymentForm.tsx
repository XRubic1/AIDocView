import { useCallback, useMemo, useRef, useState } from 'react'
import { Search, Plus, FileText, CircleCheck, Info } from 'lucide-react'
import type { Invoice } from '../../types/invoice'
import type { Payment } from '../../types/payment'
import { formatDate } from '../../utils/format'
import { useClientTheme } from '../../theme/ThemeContext'
import { getConfirmedPaymentTotal, getUnconfirmedPaymentTotal } from '../../data/mockPayments'
import {
  postClientPayment,
  postClientPaymentOnNewInvoiceAsync,
  type PostPaymentResult,
} from '../../services/clientPaymentService'
import { isPostableForPayment } from '../../utils/invoiceAging'
import {
  getInvoicePostStatusClass,
  getInvoicePostStatusLabel,
  listDefaultPickerInvoices,
  searchInvoicesForPostPayment,
  type PostPaymentSearchHit,
} from '../../utils/postPaymentInvoiceSearch'
import {
  formatSignedInvoiceBalanceDisplay,
  getInvoiceBalanceState,
} from '../../utils/paymentVariance'
import InvoiceBalanceSummary from './InvoiceBalanceSummary'
import PaymentVarianceResolution from './PaymentVarianceResolution'
import { useClientCapabilities } from '../../hooks/useClientCapabilities'

const METHOD_OPTIONS = [
  { value: 'check' as const, label: 'Check' },
  { value: 'wire' as const, label: 'Wire' },
  { value: 'ach' as const, label: 'ACH' },
  { value: 'credit_card' as const, label: 'Card' },
]

type SelectionMode = 'none' | 'existing' | 'new'

interface PostPaymentFormProps {
  clientId: string
  clientName: string
  invoices: Invoice[]
  payments: Payment[]
  authorName: string
  onPosted: (result: PostPaymentResult) => void
}

/** Split-panel post payment — invoice picker + tab-friendly payment fields. */
export default function PostPaymentForm({
  clientId,
  clientName,
  invoices,
  payments,
  authorName,
  onPosted,
}: PostPaymentFormProps) {
  const c = useClientTheme()
  const { capabilities } = useClientCapabilities()
  const today = new Date().toISOString().split('T')[0]
  const filterRef = useRef<HTMLInputElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)

  const [filterQuery, setFilterQuery] = useState('')
  const [showAllInvoices, setShowAllInvoices] = useState(false)
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('none')
  const [selected, setSelected] = useState<Invoice | null>(null)

  const [newInvoiceNumber, setNewInvoiceNumber] = useState('')
  const [newBrokerName, setNewBrokerName] = useState('')
  const [newLoadNumber, setNewLoadNumber] = useState('')

  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(today)
  const [receivedDate, setReceivedDate] = useState(today)
  const [paymentMethod, setPaymentMethod] = useState<'check' | 'wire' | 'ach' | 'credit_card'>('ach')
  const [paymentReference, setPaymentReference] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [lastResult, setLastResult] = useState<PostPaymentResult | null>(null)

  const getReceived = useCallback((invoiceId: string) => getConfirmedPaymentTotal(invoiceId), [])
  const getPending = useCallback((invoiceId: string) => getUnconfirmedPaymentTotal(invoiceId), [])

  const invoiceList = useMemo((): PostPaymentSearchHit[] => {
    const q = filterQuery.trim()
    if (q) {
      return searchInvoicesForPostPayment(invoices, q, 100, getPending)
    }
    return listDefaultPickerInvoices(invoices, getReceived, showAllInvoices, 200, getPending)
  }, [invoices, filterQuery, showAllInvoices, getReceived, getPending])

  const exactInvoiceMatch = useMemo(() => {
    const q = filterQuery.trim().toLowerCase()
    if (!q) return false
    return invoices.some((inv) => inv.invoice_number.toLowerCase() === q)
  }, [invoices, filterQuery])

  const showCreateNew =
    capabilities.canCreateAdHocInvoice &&
    filterQuery.trim().length >= 2 &&
    !exactInvoiceMatch &&
    selectionMode !== 'new'

  const priorReceived = selected ? getConfirmedPaymentTotal(selected.id) : 0
  const amountNum = parseFloat(amount)

  const selectInvoice = useCallback((invoice: Invoice) => {
    if (!isPostableForPayment(invoice)) {
      setError(
        `Invoice ${invoice.invoice_number} cannot receive payments (force closed or write-off pending).`
      )
      return
    }
    const already = getConfirmedPaymentTotal(invoice.id)
    const balance = Math.max(0, invoice.amount - already)
    const paidInFull = already >= invoice.amount - 0.01
    setSelected(invoice)
    setSelectionMode('existing')
    setFilterQuery('')
    setError(null)
    setLastResult(null)
    if (balance > 0) {
      setAmount(balance.toFixed(2))
    } else if (paidInFull) {
      setAmount('')
    } else {
      setAmount(invoice.amount.toFixed(2))
    }
    requestAnimationFrame(() => amountRef.current?.focus())
  }, [])

  const startCreateNew = useCallback((query?: string) => {
    setSelected(null)
    setSelectionMode('new')
    setNewInvoiceNumber(query?.trim() ?? filterQuery.trim())
    setNewBrokerName('')
    setNewLoadNumber('')
    setError(null)
    setLastResult(null)
    requestAnimationFrame(() => {
      document.getElementById('new-invoice-number')?.focus()
    })
  }, [filterQuery])

  const resetForm = () => {
    setFilterQuery('')
    setSelectionMode('none')
    setSelected(null)
    setNewInvoiceNumber('')
    setNewBrokerName('')
    setNewLoadNumber('')
    setAmount('')
    setPaymentReference('')
    setNotes('')
    setPaymentDate(today)
    setReceivedDate(today)
    setPaymentMethod('ach')
    setError(null)
    setLastResult(null)
    filterRef.current?.focus()
  }

  const canSubmit =
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    paymentDate &&
    receivedDate &&
    ((selectionMode === 'existing' && selected) ||
      (selectionMode === 'new' && newInvoiceNumber.trim() && newBrokerName.trim()))

  const handleSubmit = async () => {
    if (!canSubmit) {
      setError('Select an invoice (or create one) and enter a valid amount.')
      return
    }

    setIsSubmitting(true)
    setError(null)
    setLastResult(null)

    try {
      let result: PostPaymentResult | undefined

      if (selectionMode === 'existing' && selected) {
        result = postClientPayment(
          {
            invoiceId: selected.id,
            amount: amountNum,
            paymentDate,
            receivedDate,
            paymentMethod,
            paymentReference: paymentReference.trim() || undefined,
            notes: notes.trim() || undefined,
          },
          authorName,
          capabilities
        )
        if (!result) {
          setError(
            'Could not post payment. Invoice may be force-closed or still awaiting write-off approval.'
          )
          return
        }
      } else if (selectionMode === 'new') {
        result = await postClientPaymentOnNewInvoiceAsync(
          {
            clientId,
            clientName,
            invoiceNumber: newInvoiceNumber.trim(),
            brokerName: newBrokerName.trim(),
            amount: amountNum,
            loadNumber: newLoadNumber.trim() || undefined,
          },
          {
            amount: amountNum,
            paymentDate,
            receivedDate,
            paymentMethod,
            paymentReference: paymentReference.trim() || undefined,
            notes: notes.trim() || undefined,
          },
          authorName
        )
        if (!result) {
          setError('Could not create invoice and post payment.')
          return
        }
      }

      if (result) {
        setLastResult(result)
        onPosted(result)
        if (result.variance === 'full') {
          resetForm()
        } else {
          setAmount('')
          setPaymentReference('')
          setNotes('')
        }
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputStyle = {
    backgroundColor: c.card,
    height: 38,
    paddingTop: 8,
    paddingBottom: 8,
    fontSize: 14,
  } as const

  if (!capabilities.canPostPayment) {
    return (
      <section className="post-payment-workspace" aria-label="Post payment">
        <div
          className="rounded-xl border p-6 flex gap-4 items-start"
          style={{ borderColor: c.border, backgroundColor: c.stat.slate }}
        >
          <Info className="w-5 h-5 shrink-0 mt-0.5" style={{ color: c.info }} />
          <div>
            <h2 className="text-sm font-semibold mb-1" style={{ color: c.primary }}>
              Payments posted by Credyx
            </h2>
            <p className="text-sm" style={{ color: c.secondary }}>
              Your account is on the Managed plan. Remittances sent to Credyx are posted on your
              behalf — you can view payment history but cannot report payments here. Contact Credyx
              if you believe a remittance was missed.
            </p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="post-payment-workspace" aria-label="Post payment">
      <form
        className="post-payment-workspace__form"
        onSubmit={(e) => {
          e.preventDefault()
          void handleSubmit()
        }}
      >
        <header className="post-payment-workspace__header">
          <h2 className="post-payment-workspace__title">Post payment</h2>
          <p className="post-payment-workspace__subtitle">
            Select an invoice on the left, tab through payment fields on the right
          </p>
        </header>

        <div className="post-payment-workspace__panels">
          {/* Invoice picker — always visible list, not a dropdown */}
          <aside className="post-payment-picker" aria-labelledby="post-payment-picker-heading">
            <div className="post-payment-picker__head">
              <h3 id="post-payment-picker-heading" className="post-payment-panel__step">
                <span className="post-payment-panel__step-num">1</span>
                Select invoice
              </h3>
              <p className="post-payment-picker__hint">
                {filterQuery.trim()
                  ? `${invoiceList.length} match${invoiceList.length === 1 ? '' : 'es'}`
                  : showAllInvoices
                    ? `${invoiceList.length} total`
                    : `${invoiceList.length} open`}
              </p>
            </div>

            <div className="post-payment-picker__filter-row">
              <label className="client-label" htmlFor="post-invoice-filter">
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
                id="post-invoice-filter"
                type="search"
                placeholder="Invoice #, load #, broker, amount…"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="client-input post-payment-picker__filter-input"
                style={inputStyle}
                autoComplete="off"
              />
            </div>

            <div
              className="post-payment-picker__list"
              role="listbox"
              aria-label="Invoices available for payment"
            >
              {invoiceList.length === 0 && !showCreateNew && (
                <p className="post-payment-picker__empty" style={{ color: c.secondary }}>
                  {filterQuery.trim()
                    ? 'No invoices match your search.'
                    : showAllInvoices
                      ? 'No invoices found.'
                      : 'No open invoices — search by invoice # or check “Show all invoices”.'}
                </p>
              )}

              {invoiceList.map(({ invoice, isPostable }) => {
                const received = getConfirmedPaymentTotal(invoice.id)
                const pending = getUnconfirmedPaymentTotal(invoice.id)
                const balance = getInvoiceBalanceState(invoice.amount, received)
                const isSelected = selected?.id === invoice.id && selectionMode === 'existing'
                const balanceClass = `post-payment-picker__total post-payment-picker__balance post-payment-picker__balance--${balance.tone}`

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
                        {invoice.broker_name}
                        {invoice.load_number ? ` · ${invoice.load_number}` : ''}
                      </p>
                    </div>
                    <div className="post-payment-picker__row-amounts">
                      <span className={`${balanceClass} financial-nums`}>
                        {formatSignedInvoiceBalanceDisplay(balance)}
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
                <span>
                  No match — create invoice &ldquo;{filterQuery.trim()}&rdquo; and post payment
                </span>
              </button>
            )}

            {capabilities.canCreateAdHocInvoice && (
              <button
                type="button"
                className="post-payment-picker__create post-payment-picker__create--secondary"
                onClick={() => startCreateNew()}
              >
                <Plus className="w-4 h-4 shrink-0" style={{ color: c.info }} />
                <span>Create new invoice + payment</span>
              </button>
            )}
          </aside>

          {/* Payment entry */}
          <div className="post-payment-entry" aria-labelledby="post-payment-entry-heading">
            <h3 id="post-payment-entry-heading" className="post-payment-panel__step">
              <span className="post-payment-panel__step-num">2</span>
              Payment details
            </h3>

            {selectionMode === 'none' && (
              <div className="post-payment-entry__placeholder" style={{ color: c.secondary }}>
                <FileText className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm font-medium" style={{ color: c.primary }}>
                  Select an invoice from the list
                </p>
                <p className="text-xs mt-1">Or create a new invoice if the load isn&apos;t in the system yet.</p>
              </div>
            )}

            {selectionMode === 'existing' && selected && (
              <>
                {selected.status === 'written_off' && (
                  <p
                    className="text-xs mb-2 px-2.5 py-2 rounded border"
                    style={{
                      color: c.primary,
                      borderColor: c.border,
                      backgroundColor: c.stat?.amber ?? '#fef3c7',
                    }}
                  >
                    This invoice is written off. Posting a payment or short correction will reopen it
                    and clear the write-off.
                  </p>
                )}
                <InvoiceBalanceSummary
                  invoiceNumber={selected.invoice_number}
                  brokerName={selected.broker_name}
                  loadNumber={selected.load_number}
                  invoiceAmount={selected.amount}
                  receivedToDate={priorReceived}
                  amountApplying={Number.isFinite(amountNum) ? amountNum : 0}
                  writtenOff={selected.status === 'written_off'}
                />
              </>
            )}

            {selectionMode === 'new' && (
              <div className="post-payment-entry__new-invoice">
                <p className="text-sm font-semibold mb-3" style={{ color: c.primary }}>
                  New invoice + payment
                </p>
                <div className="post-payment-entry__fields post-payment-entry__fields--3">
                  <div>
                    <label className="client-label" htmlFor="new-invoice-number">
                      Invoice #
                    </label>
                    <input
                      id="new-invoice-number"
                      type="text"
                      value={newInvoiceNumber}
                      onChange={(e) => setNewInvoiceNumber(e.target.value)}
                      className="client-input w-full"
                      style={inputStyle}
                      required
                    />
                  </div>
                  <div>
                    <label className="client-label" htmlFor="new-broker-name">
                      Broker
                    </label>
                    <input
                      id="new-broker-name"
                      type="text"
                      value={newBrokerName}
                      onChange={(e) => setNewBrokerName(e.target.value)}
                      placeholder="Broker name"
                      className="client-input w-full"
                      style={inputStyle}
                      required
                    />
                  </div>
                  <div>
                    <label className="client-label" htmlFor="new-load-number">
                      Load # <span className="font-normal opacity-70">(optional)</span>
                    </label>
                    <input
                      id="new-load-number"
                      type="text"
                      value={newLoadNumber}
                      onChange={(e) => setNewLoadNumber(e.target.value)}
                      className="client-input w-full"
                      style={inputStyle}
                    />
                  </div>
                </div>
              </div>
            )}

            {selectionMode !== 'none' && (
              <fieldset className="post-payment-entry__fieldset" disabled={isSubmitting}>
                <legend className="sr-only">Payment information</legend>

                <div className="post-payment-entry__fields">
                  <div className="post-payment-entry__field post-payment-entry__field--amount">
                    <label className="client-label" htmlFor="post-amount">
                      Amount received
                    </label>
                    <input
                      ref={amountRef}
                      id="post-amount"
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="client-input w-full financial-nums post-payment-entry__amount-input"
                      style={{ ...inputStyle, fontSize: 18, fontWeight: 700 }}
                      placeholder="0.00"
                      required
                    />
                  </div>

                  <div className="post-payment-entry__field">
                    <label className="client-label" htmlFor="post-method">
                      Method
                    </label>
                    <select
                      id="post-method"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
                      className="client-input w-full"
                      style={inputStyle}
                    >
                      {METHOD_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="post-payment-entry__field">
                    <label className="client-label" htmlFor="post-reference">
                      Reference #
                    </label>
                    <input
                      id="post-reference"
                      type="text"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder="Check #, wire ref…"
                      className="client-input w-full"
                      style={inputStyle}
                    />
                  </div>

                  <div className="post-payment-entry__field">
                    <label className="client-label" htmlFor="post-payment-date">
                      Payment date
                    </label>
                    <input
                      id="post-payment-date"
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="client-input w-full"
                      style={inputStyle}
                      required
                    />
                  </div>

                  <div className="post-payment-entry__field">
                    <label className="client-label" htmlFor="post-received-date">
                      Received date
                    </label>
                    <input
                      id="post-received-date"
                      type="date"
                      value={receivedDate}
                      onChange={(e) => setReceivedDate(e.target.value)}
                      className="client-input w-full"
                      style={inputStyle}
                      required
                    />
                  </div>

                  <div className="post-payment-entry__field post-payment-entry__field--wide">
                    <label className="client-label" htmlFor="post-notes">
                      Note
                    </label>
                    <input
                      id="post-notes"
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Detention, lumper, partial pay…"
                      className="client-input w-full"
                      style={inputStyle}
                    />
                  </div>
                </div>

                {selectionMode === 'existing' && selected && (
                  <p className="post-payment-entry__due text-xs" style={{ color: c.mutedLight }}>
                    Due {formatDate(selected.expected_payment_date)}
                  </p>
                )}

                {error && (
                  <p className="post-payment-entry__error" role="alert" style={{ color: c.error }}>
                    {error}
                  </p>
                )}

                <div className="post-payment-entry__actions">
                  <button
                    type="submit"
                    disabled={isSubmitting || !canSubmit}
                    className="dashboard-btn-primary post-payment-entry__submit"
                  >
                    <CircleCheck className="w-4 h-4" />
                    {isSubmitting
                      ? 'Posting…'
                      : selectionMode === 'new'
                        ? 'Create invoice & post payment'
                        : 'Post payment'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      resetForm()
                      setLastResult(null)
                    }}
                    className="dashboard-btn-secondary dashboard-btn-compact"
                    disabled={isSubmitting}
                  >
                    Clear
                  </button>
                </div>
              </fieldset>
            )}
          </div>
        </div>

        {lastResult && lastResult.variance !== 'full' && (
          <PaymentVarianceResolution
            result={lastResult}
            payments={payments}
            authorName={authorName}
            onResolved={() => {
              setLastResult(null)
              resetForm()
            }}
            onDismiss={() => setLastResult(null)}
          />
        )}
      </form>
    </section>
  )
}
