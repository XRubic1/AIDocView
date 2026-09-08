import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, Plus, FileText, CircleCheck, Info, AlertTriangle, X } from 'lucide-react'
import type { Invoice } from '../../types/invoice'
import type { Payment } from '../../types/payment'
import { formatCurrency, formatDate } from '../../utils/format'
import { useClientTheme } from '../../theme/ThemeContext'
import { getConfirmedPaymentTotal, getUnconfirmedPaymentTotal } from '../../data/mockPayments'
import {
  postClientPayment,
  postClientPaymentOnNewInvoiceAsync,
  postClientPaymentAndRequestWriteOff,
  postClientShortPayment,
  listParentPaymentCandidates,
  applyClientWriteOff,
  type PostPaymentResult,
} from '../../services/clientPaymentService'
import { isClosedInvoiceForPayment, isPostableForPayment } from '../../utils/invoiceAging'
import { canOfferWriteOffWithPostedShortfall } from '../../utils/shortPayments'
import {
  getInvoicePostStatusClass,
  getInvoicePostStatusLabel,
  listDefaultPickerInvoices,
  searchInvoicesForPostPayment,
  type PostPaymentSearchHit,
} from '../../utils/postPaymentInvoiceSearch'
import {
  AMOUNT_EPSILON,
  formatSignedInvoiceBalanceDisplay,
  getInvoiceBalanceState,
} from '../../utils/paymentVariance'
import InvoiceBalanceSummary from './InvoiceBalanceSummary'
import PaymentVarianceResolution from './PaymentVarianceResolution'
import PostPaymentPriorPayments from './PostPaymentPriorPayments'
import PostPaymentInvoiceAudit from './PostPaymentInvoiceAudit'
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

/** Closed-invoice copy shown before the user confirms posting another payment. */
function getClosedInvoiceMessage(invoice: Invoice): { title: string; detail: string } {
  if (invoice.status === 'written_off') {
    return {
      title: 'This invoice is already closed',
      detail:
        'It was written off. Confirm if you still want to post a payment — that can reopen the invoice.',
    }
  }
  if (invoice.status === 'force_closed') {
    return {
      title: 'This invoice is already closed',
      detail: 'It was force-closed. Confirm if you still want to post an over or short payment.',
    }
  }
  return {
    title: 'This invoice is already closed',
    detail: 'It is marked paid. Confirm if you still want to post an additional payment.',
  }
}

/** Full-screen post payment — search by invoice #, then post against that invoice. */
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
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('none')
  const [selected, setSelected] = useState<Invoice | null>(null)
  /** Additional payment vs short correction — used on closed invoices with no open balance. */
  const [closedPostKind, setClosedPostKind] = useState<'over' | 'short'>('over')
  /** Closed invoices require an explicit continue before the payment form is enabled. */
  const [closedContinueConfirmed, setClosedContinueConfirmed] = useState(false)

  const [newInvoiceNumber, setNewInvoiceNumber] = useState('')
  const [newBrokerName, setNewBrokerName] = useState('')
  const [newLoadNumber, setNewLoadNumber] = useState('')

  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(today)
  const [receivedDate, setReceivedDate] = useState(today)
  const [paymentMethod, setPaymentMethod] = useState<'check' | 'wire' | 'ach' | 'credit_card'>('ach')
  const [paymentReference, setPaymentReference] = useState('')
  const [notes, setNotes] = useState('')
  const [writeOffRemaining, setWriteOffRemaining] = useState(false)
  const [writeOffNote, setWriteOffNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [lastResult, setLastResult] = useState<PostPaymentResult | null>(null)

  const getReceived = useCallback((invoiceId: string) => getConfirmedPaymentTotal(invoiceId), [])

  const invoiceList = useMemo((): PostPaymentSearchHit[] => {
    const q = filterQuery.trim()
    if (q) {
      return searchInvoicesForPostPayment(invoices, q, 100)
    }
    return listDefaultPickerInvoices(invoices, getReceived, false, 200)
  }, [invoices, filterQuery, getReceived])

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
  const pendingConfirmation = selected ? getUnconfirmedPaymentTotal(selected.id) : 0
  const amountNum = parseFloat(amount)
  const remainingOpen = selected ? Math.max(0, selected.amount - priorReceived) : 0
  const isClosedSelected = !!selected && isClosedInvoiceForPayment(selected)
  const needsClosedConfirmation = isClosedSelected && !closedContinueConfirmed
  const isClosedBalanceSettled = isClosedSelected && remainingOpen <= AMOUNT_EPSILON
  const parentCandidates = selected ? listParentPaymentCandidates(selected.id) : []
  const canPostShortOnClosed = isClosedBalanceSettled && parentCandidates.length > 0
  const projectedReceived =
    selected && Number.isFinite(amountNum) && amountNum > 0
      ? isClosedBalanceSettled && closedPostKind === 'short'
        ? priorReceived - amountNum
        : priorReceived + amountNum
      : priorReceived
  const shortfallAfterPost =
    selected && Number.isFinite(amountNum) && amountNum > 0
      ? Math.max(0, selected.amount - projectedReceived)
      : 0
  const createsShortfall = shortfallAfterPost >= AMOUNT_EPSILON
  const canOfferWriteOff =
    selectionMode === 'existing' &&
    !!selected &&
    !needsClosedConfirmation &&
    capabilities.canRequestWriteOff &&
    createsShortfall &&
    canOfferWriteOffWithPostedShortfall(selected, payments, shortfallAfterPost)

  const selectedInvoicePayments = useMemo(() => {
    if (!selected) return []
    return payments.filter((payment) => payment.invoice_id === selected.id)
  }, [payments, selected])

  // Keep the selected invoice in sync after a post refreshes the snapshot.
  useEffect(() => {
    if (!selected) return
    const fresh = invoices.find((invoice) => invoice.id === selected.id)
    if (!fresh) return
    if (
      fresh.status !== selected.status ||
      fresh.paid_amount !== selected.paid_amount ||
      fresh.notes_history !== selected.notes_history
    ) {
      setSelected(fresh)
    }
  }, [invoices, selected])

  const selectInvoice = useCallback((invoice: Invoice) => {
    if (!isPostableForPayment(invoice)) {
      setError(
        `Invoice ${invoice.invoice_number} cannot receive payments (write-off still pending).`
      )
      return
    }
    const already = getConfirmedPaymentTotal(invoice.id)
    const balance = Math.max(0, invoice.amount - already)
    const closed = isClosedInvoiceForPayment(invoice)
    setSelected(invoice)
    setSelectionMode('existing')
    setError(null)
    setLastResult(null)
    setWriteOffRemaining(false)
    setWriteOffNote('')
    setClosedPostKind('over')
    setClosedContinueConfirmed(!closed)
    if (balance > AMOUNT_EPSILON) {
      setAmount(balance.toFixed(2))
    } else {
      setAmount('')
    }
    requestAnimationFrame(() => {
      if (closed) return
      amountRef.current?.focus()
    })
  }, [])

  const startCreateNew = useCallback(
    (query?: string) => {
      setSelected(null)
      setSelectionMode('new')
      setNewInvoiceNumber(query?.trim() ?? filterQuery.trim())
      setNewBrokerName('')
      setNewLoadNumber('')
      setClosedContinueConfirmed(false)
      setError(null)
      setLastResult(null)
      requestAnimationFrame(() => {
        document.getElementById('new-invoice-number')?.focus()
      })
    },
    [filterQuery]
  )

  const closePanel = () => {
    setSelectionMode('none')
    setSelected(null)
    setNewInvoiceNumber('')
    setNewBrokerName('')
    setNewLoadNumber('')
    setAmount('')
    setPaymentReference('')
    setNotes('')
    setWriteOffRemaining(false)
    setWriteOffNote('')
    setClosedPostKind('over')
    setClosedContinueConfirmed(false)
    setError(null)
    setLastResult(null)
  }

  /** Stay on the posted invoice and keep the search query in the field. */
  const stayOnPostedInvoice = (result: PostPaymentResult) => {
    const invoice = result.invoice
    setSelected(invoice)
    setSelectionMode('existing')
    setAmount('')
    setPaymentReference('')
    setNotes('')
    setWriteOffRemaining(false)
    setWriteOffNote('')
    setClosedPostKind('over')
    setClosedContinueConfirmed(true)
    setError(null)
    setLastResult(result.variance === 'full' ? null : result)
    setNewInvoiceNumber('')
    setNewBrokerName('')
    setNewLoadNumber('')
  }

  const applySearchSelection = () => {
    const q = filterQuery.trim().toLowerCase()
    if (!q) return
    const exactHits = invoiceList.filter(
      (hit) => hit.invoice.invoice_number.toLowerCase() === q && hit.isPostable
    )
    if (exactHits.length === 1) {
      selectInvoice(exactHits[0].invoice)
      return
    }
    if (invoiceList.length === 1 && invoiceList[0].isPostable) {
      selectInvoice(invoiceList[0].invoice)
    }
  }

  const paymentFormEnabled =
    selectionMode === 'new' || (selectionMode === 'existing' && !!selected && !needsClosedConfirmation)

  const canSubmit =
    paymentFormEnabled &&
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

    if (writeOffRemaining && canOfferWriteOff && !writeOffNote.trim()) {
      setError('Add a note explaining why the remaining balance is uncollectable.')
      return
    }

    setIsSubmitting(true)
    setError(null)
    setLastResult(null)

    try {
      let result: PostPaymentResult | undefined

      if (selectionMode === 'existing' && selected) {
        const postingShortOnClosed =
          isClosedBalanceSettled && closedPostKind === 'short' && canPostShortOnClosed
        const parentPayment = parentCandidates[0]

        if (postingShortOnClosed) {
          if (!parentPayment) {
            setError('No confirmed payment to apply a short correction against.')
            return
          }
          result = postClientShortPayment(
            {
              invoiceId: selected.id,
              amount: amountNum,
              paymentDate,
              receivedDate,
              paymentMethod,
              paymentReference: paymentReference.trim() || undefined,
              notes: notes.trim() || undefined,
              parentPaymentId: parentPayment.id,
            },
            authorName,
            capabilities
          )
          if (!result) {
            setError('Could not post short payment. Amount cannot exceed received to date.')
            return
          }
          if (writeOffRemaining && canOfferWriteOff) {
            const writtenOff = applyClientWriteOff(
              selected.id,
              authorName,
              writeOffNote.trim(),
              { canRequestWriteOff: capabilities.canRequestWriteOff }
            )
            if (!writtenOff) {
              setError('Short payment posted, but the write-off could not be applied.')
              onPosted(result)
              return
            }
            result = { ...result, invoice: writtenOff, variance: 'short' }
            onPosted(result)
            stayOnPostedInvoice(result)
            return
          }
        } else if (writeOffRemaining && canOfferWriteOff) {
          result = postClientPaymentAndRequestWriteOff(
            selected.id,
            authorName,
            {
              amountReceived: amountNum,
              optionalNote: notes.trim() || undefined,
              paymentDate,
              receivedDate,
              paymentMethod,
              paymentReference: paymentReference.trim() || undefined,
              writeOffNote: writeOffNote.trim(),
            },
            {
              canPostPayment: capabilities.canPostPayment,
              canRequestWriteOff: capabilities.canRequestWriteOff,
            }
          )
          if (!result) {
            setError('Could not post payment and write off the remaining balance.')
            return
          }
          onPosted(result)
          stayOnPostedInvoice(result)
          return
        } else {
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
              'Could not post payment. Invoice may still be awaiting write-off approval.'
            )
            return
          }
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
        onPosted(result)
        stayOnPostedInvoice(result)
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

  const panelOpen = selectionMode !== 'none'
  const closedCopy = selected && isClosedSelected ? getClosedInvoiceMessage(selected) : null

  return (
    <section className="post-payment-workspace post-payment-workspace--split" aria-label="Post payment">
      <div className={`post-payment-split ${panelOpen ? 'post-payment-split--open' : ''}`}>
        <div className="post-payment-list-pane">
          <div className="post-payment-search">
            <label className="client-label" htmlFor="post-invoice-search">
              Search invoice
            </label>
            <div className="post-payment-search__row">
              <div className="post-payment-search__field">
                <Search
                  className="post-payment-search__icon"
                  style={{ color: c.secondary }}
                  aria-hidden
                />
                <input
                  ref={filterRef}
                  id="post-invoice-search"
                  type="search"
                  placeholder="Invoice #, load #, broker…"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      applySearchSelection()
                    }
                  }}
                  className="client-input post-payment-search__input"
                  style={inputStyle}
                  autoComplete="off"
                />
              </div>
              {filterQuery.trim() ? (
                <button
                  type="button"
                  className="dashboard-btn-secondary dashboard-btn-compact"
                  onClick={() => setFilterQuery('')}
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>

          <div className="post-payment-list" role="listbox" aria-label="Invoices">
            {invoiceList.length === 0 && !showCreateNew ? (
              <div className="post-payment-list__empty" style={{ color: c.secondary }}>
                <FileText className="w-7 h-7 mb-2 opacity-40" />
                <p className="text-sm font-medium" style={{ color: c.primary }}>
                  {filterQuery.trim() ? 'No invoices match your search' : 'No open invoices'}
                </p>
                <p className="text-xs mt-1">
                  {filterQuery.trim()
                    ? 'Try a different invoice number, or create a new invoice.'
                    : 'Search by invoice number to find a closed invoice.'}
                </p>
              </div>
            ) : null}

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
                  className={`post-payment-list__row ${isSelected ? 'post-payment-list__row--selected' : ''} ${!isPostable ? 'post-payment-list__row--disabled' : ''}`}
                  onClick={() => selectInvoice(invoice)}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="post-payment-list__num">{invoice.invoice_number}</span>
                      <span className={getInvoicePostStatusClass(invoice, received, pending)}>
                        {getInvoicePostStatusLabel(invoice, received, pending)}
                      </span>
                    </div>
                    <p className="post-payment-list__meta">
                      {invoice.broker_name}
                      {invoice.load_number ? ` · ${invoice.load_number}` : ''}
                    </p>
                  </div>
                  <span className={`post-payment-list__balance financial-nums post-payment-picker__balance--${balance.tone}`}>
                    {formatSignedInvoiceBalanceDisplay(balance)}
                  </span>
                </button>
              )
            })}

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
          </div>

          {capabilities.canCreateAdHocInvoice && (
            <button
              type="button"
              className="post-payment-picker__create post-payment-picker__create--secondary post-payment-list__create"
              onClick={() => startCreateNew()}
            >
              <Plus className="w-4 h-4 shrink-0" style={{ color: c.info }} />
              <span>Create new invoice + payment</span>
            </button>
          )}
        </div>

        <div className="post-payment-detail-pane" aria-hidden={!panelOpen}>
          <div className="post-payment-detail-pane__inner">
      {selectionMode === 'existing' && selected && (
        <div className="post-payment-detail-scroll">
          <div className="post-payment-workspace__main">
            <div className="post-payment-selected-head">
              <div className="min-w-0">
                <p className="post-payment-selected-head__num">{selected.invoice_number}</p>
                <p className="post-payment-selected-head__meta" style={{ color: c.secondary }}>
                  {selected.broker_name}
                  {selected.load_number ? ` · Load ${selected.load_number}` : ''}
                  {' · Due '}
                  {formatDate(selected.expected_payment_date)}
                </p>
              </div>
              <button
                type="button"
                className="post-payment-selected-head__clear"
                onClick={closePanel}
                aria-label="Close payment panel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {closedCopy && needsClosedConfirmation && (
              <div
                className="post-payment-closed-banner"
                role="status"
                style={{
                  borderColor: `${c.warning}66`,
                  backgroundColor: c.stat?.amber ?? '#fef3c7',
                }}
              >
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: c.warning }} />
                <div className="min-w-0 flex-1">
                  <p className="post-payment-closed-banner__title" style={{ color: c.primary }}>
                    {closedCopy.title}
                  </p>
                  <p className="post-payment-closed-banner__detail" style={{ color: c.secondary }}>
                    {closedCopy.detail}
                  </p>
                  <div className="post-payment-closed-banner__actions">
                    <button
                      type="button"
                      className="dashboard-btn-primary dashboard-btn-compact"
                      onClick={() => {
                        setClosedContinueConfirmed(true)
                        requestAnimationFrame(() => amountRef.current?.focus())
                      }}
                    >
                      Continue with payment
                    </button>
                    <button
                      type="button"
                      className="dashboard-btn-secondary dashboard-btn-compact"
                      onClick={closePanel}
                    >
                      Search another invoice
                    </button>
                  </div>
                </div>
              </div>
            )}

            <InvoiceBalanceSummary
              invoiceNumber={selected.invoice_number}
              brokerName={selected.broker_name}
              loadNumber={selected.load_number}
              invoiceAmount={selected.amount}
              receivedToDate={priorReceived}
              pendingConfirmation={pendingConfirmation}
              amountApplying={
                paymentFormEnabled &&
                !(isClosedBalanceSettled && closedPostKind === 'short') &&
                Number.isFinite(amountNum)
                  ? amountNum
                  : 0
              }
              shortCorrectionApplying={
                paymentFormEnabled && isClosedBalanceSettled && closedPostKind === 'short' && Number.isFinite(amountNum)
                  ? amountNum
                  : 0
              }
              clientView
              hideIdentity
              writtenOff={selected.status === 'written_off'}
            />

            {paymentFormEnabled && isClosedBalanceSettled && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Payment type">
                <button
                  type="button"
                  className={`batch-filter-pill batch-filter-pill--sm ${
                    closedPostKind === 'over' ? 'batch-filter-pill--active' : ''
                  }`}
                  onClick={() => {
                    setClosedPostKind('over')
                    setWriteOffRemaining(false)
                    setWriteOffNote('')
                  }}
                >
                  Over / additional
                </button>
                <button
                  type="button"
                  className={`batch-filter-pill batch-filter-pill--sm ${
                    closedPostKind === 'short' ? 'batch-filter-pill--active' : ''
                  }`}
                  disabled={!canPostShortOnClosed}
                  onClick={() => {
                    setClosedPostKind('short')
                    setWriteOffRemaining(false)
                    setWriteOffNote('')
                  }}
                >
                  Short payment
                </button>
              </div>
            )}

            {paymentFormEnabled ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void handleSubmit()
                }}
              >
                <fieldset className="post-payment-entry__fieldset" disabled={isSubmitting}>
                  <legend className="sr-only">Payment information</legend>

                  <div className="post-payment-entry__fields">
                    <div className="post-payment-entry__field post-payment-entry__field--amount">
                      <label className="client-label" htmlFor="post-amount">
                        {isClosedBalanceSettled && closedPostKind === 'short'
                          ? 'Short payment amount'
                          : 'Amount received'}
                      </label>
                      <input
                        ref={amountRef}
                        id="post-amount"
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={amount}
                        onChange={(e) => {
                          setAmount(e.target.value)
                          const next = parseFloat(e.target.value)
                          if (!Number.isFinite(next) || next <= 0 || !selected) {
                            setWriteOffRemaining(false)
                            setWriteOffNote('')
                            return
                          }
                          const projected =
                            isClosedBalanceSettled && closedPostKind === 'short'
                              ? priorReceived - next
                              : priorReceived + next
                          if (selected.amount - projected < AMOUNT_EPSILON) {
                            setWriteOffRemaining(false)
                            setWriteOffNote('')
                          }
                        }}
                        className="client-input w-full financial-nums post-payment-entry__amount-input"
                        style={{ ...inputStyle, fontWeight: 700 }}
                        placeholder="0.00"
                        required
                      />
                      {isClosedBalanceSettled && closedPostKind === 'short' && (
                        <p className="text-xs mt-1" style={{ color: c.secondary }}>
                          Reduces received to date. Max {formatCurrency(priorReceived)}.
                        </p>
                      )}
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
                        {createsShortfall ? 'Reason for short payment' : 'Note'}
                      </label>
                      <input
                        id="post-notes"
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder={
                          createsShortfall
                            ? 'e.g. Broker deducted detention, lumper, or rate adjustment'
                            : 'Detention, lumper, partial pay…'
                        }
                        className="client-input w-full"
                        style={inputStyle}
                      />
                    </div>

                    {canOfferWriteOff && (
                      <div
                        className="post-payment-entry__field post-payment-entry__field--wide rounded-lg border px-3 py-3 space-y-2"
                        style={{ borderColor: c.border, backgroundColor: c.stat?.red ?? '#FEF2F2' }}
                      >
                        <label className="flex items-start gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={writeOffRemaining}
                            onChange={(e) => {
                              setWriteOffRemaining(e.target.checked)
                              if (!e.target.checked) setWriteOffNote('')
                              setError(null)
                            }}
                          />
                          <span className="text-sm" style={{ color: c.primary }}>
                            Mark remaining <strong>{formatCurrency(shortfallAfterPost)}</strong> as
                            write-off
                          </span>
                        </label>
                        {!writeOffRemaining && (
                          <p className="text-xs leading-relaxed" style={{ color: c.secondary }}>
                            Leave unchecked to keep {formatCurrency(shortfallAfterPost)} in open A/R.
                            The invoice will continue to age until it is written off.
                          </p>
                        )}
                        {writeOffRemaining && (
                          <>
                            <p className="text-xs leading-relaxed" style={{ color: c.error }}>
                              The remaining balance will be written off and will not stay in open A/R.
                            </p>
                            <label className="client-label" htmlFor="post-writeoff-note">
                              Why is this uncollectable? (required)
                            </label>
                            <textarea
                              id="post-writeoff-note"
                              value={writeOffNote}
                              onChange={(e) => setWriteOffNote(e.target.value)}
                              placeholder="e.g. Broker refused detention — accepting short pay."
                              rows={3}
                              className="client-input w-full"
                              style={inputStyle}
                            />
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {error && (
                    <p className="post-payment-entry__error" role="alert" style={{ color: c.error }}>
                      {error}
                    </p>
                  )}

                  <div className="post-payment-entry__actions">
                    <button
                      type="submit"
                      disabled={
                        isSubmitting ||
                        !canSubmit ||
                        (writeOffRemaining && canOfferWriteOff && !writeOffNote.trim())
                      }
                      className="dashboard-btn-primary post-payment-entry__submit"
                    >
                      <CircleCheck className="w-4 h-4" />
                      {isSubmitting
                        ? 'Posting…'
                        : writeOffRemaining && canOfferWriteOff
                          ? 'Post & write off'
                          : isClosedBalanceSettled && closedPostKind === 'short'
                            ? 'Post short payment'
                            : 'Post payment'}
                    </button>
                  </div>
                </fieldset>
              </form>
            ) : (
              <p className="text-sm" style={{ color: c.secondary }}>
                Review the balance and history below, then confirm if you want to continue posting
                to this closed invoice.
              </p>
            )}
          </div>

          <aside className="post-payment-workspace__aside">
            <PostPaymentPriorPayments payments={selectedInvoicePayments} />
            <PostPaymentInvoiceAudit invoice={selected} payments={selectedInvoicePayments} />
          </aside>
        </div>
      )}

      {selectionMode === 'new' && (
        <form
          className="post-payment-workspace__new"
          onSubmit={(e) => {
            e.preventDefault()
            void handleSubmit()
          }}
        >
          <div className="post-payment-entry__new-invoice">
            <div className="post-payment-selected-head">
              <p className="text-sm font-semibold" style={{ color: c.primary }}>
                New invoice + payment
              </p>
              <button
                type="button"
                className="post-payment-selected-head__clear"
                onClick={closePanel}
                aria-label="Close payment panel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
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

          <fieldset className="post-payment-entry__fieldset" disabled={isSubmitting}>
            <legend className="sr-only">Payment information</legend>
            <div className="post-payment-entry__fields">
              <div className="post-payment-entry__field post-payment-entry__field--amount">
                <label className="client-label" htmlFor="post-amount-new">
                  Amount received
                </label>
                <input
                  id="post-amount-new"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="client-input w-full financial-nums post-payment-entry__amount-input"
                  style={{ ...inputStyle, fontWeight: 700 }}
                  placeholder="0.00"
                  required
                />
              </div>
              <div className="post-payment-entry__field">
                <label className="client-label" htmlFor="post-method-new">
                  Method
                </label>
                <select
                  id="post-method-new"
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
                <label className="client-label" htmlFor="post-reference-new">
                  Reference #
                </label>
                <input
                  id="post-reference-new"
                  type="text"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="Check #, wire ref…"
                  className="client-input w-full"
                  style={inputStyle}
                />
              </div>
              <div className="post-payment-entry__field">
                <label className="client-label" htmlFor="post-payment-date-new">
                  Payment date
                </label>
                <input
                  id="post-payment-date-new"
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="client-input w-full"
                  style={inputStyle}
                  required
                />
              </div>
              <div className="post-payment-entry__field">
                <label className="client-label" htmlFor="post-received-date-new">
                  Received date
                </label>
                <input
                  id="post-received-date-new"
                  type="date"
                  value={receivedDate}
                  onChange={(e) => setReceivedDate(e.target.value)}
                  className="client-input w-full"
                  style={inputStyle}
                  required
                />
              </div>
              <div className="post-payment-entry__field post-payment-entry__field--wide">
                <label className="client-label" htmlFor="post-notes-new">
                  Note
                </label>
                <input
                  id="post-notes-new"
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="client-input w-full"
                  style={inputStyle}
                />
              </div>
            </div>
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
                {isSubmitting ? 'Posting…' : 'Create invoice & post payment'}
              </button>
            </div>
          </fieldset>
        </form>
      )}

      {lastResult && lastResult.variance !== 'full' && (
        <PaymentVarianceResolution
          result={lastResult}
          payments={payments}
          authorName={authorName}
          onResolved={() => {
            setLastResult(null)
          }}
          onDismiss={() => setLastResult(null)}
        />
      )}
          </div>
        </div>
      </div>
    </section>
  )
}
