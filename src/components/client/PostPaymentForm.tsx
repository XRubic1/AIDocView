import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Search,
  DollarSign,
  CircleCheck,
  AlertTriangle,
  TrendingUp,
  Plus,
  FileText,
} from 'lucide-react'
import type { Invoice } from '../../types/invoice'
import { formatCurrency, formatDate } from '../../utils/format'
import { useClientTheme } from '../../theme/ThemeContext'
import { getConfirmedPaymentTotal } from '../../data/mockPayments'
import {
  postClientPayment,
  postClientPaymentOnNewInvoice,
  type PostPaymentResult,
} from '../../services/clientPaymentService'
import {
  getDefaultPostPaymentSuggestions,
  getInvoicePostStatusClass,
  getInvoicePostStatusLabel,
  searchInvoicesForPostPayment,
  type PostPaymentSearchHit,
} from '../../utils/postPaymentInvoiceSearch'

const METHOD_OPTIONS = [
  { value: 'check' as const, label: 'Check' },
  { value: 'wire' as const, label: 'Wire' },
  { value: 'ach' as const, label: 'ACH' },
  { value: 'credit_card' as const, label: 'Card' },
]

type SelectionMode = 'none' | 'existing' | 'new'

type SuggestionItem =
  | { type: 'invoice'; hit: PostPaymentSearchHit }
  | { type: 'create'; query: string }

interface PostPaymentFormProps {
  clientId: string
  clientName: string
  invoices: Invoice[]
  authorName: string
  onPosted: (result: PostPaymentResult) => void
}

/** Post payment — search invoice combobox with create-if-missing flow. */
export default function PostPaymentForm({
  clientId,
  clientName,
  invoices,
  authorName,
  onPosted,
}: PostPaymentFormProps) {
  const c = useClientTheme()
  const today = new Date().toISOString().split('T')[0]
  const searchRef = useRef<HTMLInputElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)
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
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const searchHits = useMemo(() => {
    const q = searchQuery.trim()
    if (!q) return getDefaultPostPaymentSuggestions(invoices)
    return searchInvoicesForPostPayment(invoices, q)
  }, [invoices, searchQuery])

  const exactInvoiceMatch = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return false
    return invoices.some((inv) => inv.invoice_number.toLowerCase() === q)
  }, [invoices, searchQuery])

  const suggestionItems = useMemo((): SuggestionItem[] => {
    const items: SuggestionItem[] = searchHits.map((hit) => ({ type: 'invoice', hit }))
    const q = searchQuery.trim()
    if (q.length >= 2 && !exactInvoiceMatch) {
      items.push({ type: 'create', query: q })
    }
    return items
  }, [searchHits, searchQuery, exactInvoiceMatch])

  useEffect(() => {
    if (!dropdownOpen) return
    setHighlightIndex(0)
  }, [searchQuery, dropdownOpen, suggestionItems.length])

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        dropdownRef.current?.contains(target) ||
        searchRef.current?.contains(target)
      ) {
        return
      }
      setDropdownOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  const priorReceived = selected ? getConfirmedPaymentTotal(selected.id) : 0
  const amountNum = parseFloat(amount)
  const invoiceAmount =
    selectionMode === 'new'
      ? amountNum
      : selected
        ? selected.amount
        : 0

  const projectedTotal =
    selectionMode !== 'none' && Number.isFinite(amountNum)
      ? selectionMode === 'existing'
        ? priorReceived + amountNum
        : amountNum
      : 0

  const variance =
    selectionMode !== 'none' && selected && Number.isFinite(amountNum) && invoiceAmount > 0
      ? projectedTotal < invoiceAmount - 0.01
        ? 'short'
        : projectedTotal > invoiceAmount + 0.01
          ? 'over'
          : 'full'
      : selectionMode === 'new' && Number.isFinite(amountNum) && amountNum > 0
        ? 'full'
        : null

  const fillFromInvoice = useCallback((invoice: Invoice) => {
    const already = getConfirmedPaymentTotal(invoice.id)
    const balance = Math.max(0, invoice.amount - already)
    setSelected(invoice)
    setSelectionMode('existing')
    setSearchQuery(invoice.invoice_number)
    setAmount(balance > 0 ? balance.toFixed(2) : invoice.amount.toFixed(2))
    setDropdownOpen(false)
    setError(null)
    setSuccessMessage(null)
    requestAnimationFrame(() => amountRef.current?.focus())
  }, [])

  const fillCreateNew = useCallback((query: string) => {
    setSelected(null)
    setSelectionMode('new')
    setNewInvoiceNumber(query.trim())
    setNewBrokerName('')
    setNewLoadNumber('')
    setSearchQuery(query.trim())
    setDropdownOpen(false)
    setError(null)
    setSuccessMessage(null)
    requestAnimationFrame(() => amountRef.current?.focus())
  }, [])

  const selectSuggestion = useCallback(
    (item: SuggestionItem) => {
      if (item.type === 'invoice') {
        if (!item.hit.isPostable) {
          setError(
            `Invoice ${item.hit.invoice.invoice_number} is ${getInvoicePostStatusLabel(item.hit.invoice).toLowerCase()} — choose an open invoice or create a new one.`
          )
          return
        }
        fillFromInvoice(item.hit.invoice)
        return
      }
      fillCreateNew(item.query)
    },
    [fillFromInvoice, fillCreateNew]
  )

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!dropdownOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      setDropdownOpen(true)
      return
    }

    if (!dropdownOpen || suggestionItems.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlightIndex((index) => Math.min(index + 1, suggestionItems.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      const item = suggestionItems[highlightIndex] ?? suggestionItems[0]
      if (item) selectSuggestion(item)
    } else if (event.key === 'Escape') {
      setDropdownOpen(false)
    }
  }

  const resetForm = () => {
    setSearchQuery('')
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
    setDropdownOpen(false)
    searchRef.current?.focus()
  }

  const handleSubmit = async () => {
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError('Enter a valid payment amount.')
      return
    }
    if (!paymentDate || !receivedDate) {
      setError('Payment and received dates are required.')
      return
    }

    setIsSubmitting(true)
    setError(null)
    setSuccessMessage(null)

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
          authorName
        )
        if (!result) {
          setError('Could not post payment. Invoice may no longer be open.')
          return
        }
      } else if (selectionMode === 'new') {
        if (!newInvoiceNumber.trim()) {
          setError('Enter an invoice number for the new invoice.')
          return
        }
        if (!newBrokerName.trim()) {
          setError('Enter the broker name for the new invoice.')
          return
        }
        result = postClientPaymentOnNewInvoice(
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
      } else {
        setError('Search for an invoice and select it, or create a new one.')
        return
      }

      const varianceLabel =
        result.variance === 'short'
          ? 'Short payment — review in Pay variances.'
          : result.variance === 'over'
            ? 'Overpayment — review in Pay variances.'
            : 'Paid in full.'

      setSuccessMessage(
        `Posted ${formatCurrency(amountNum)} to ${result.invoice.invoice_number}. ${varianceLabel}`
      )
      onPosted(result)
      resetForm()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputStyle = {
    backgroundColor: c.card,
    height: 34,
    paddingTop: 6,
    paddingBottom: 6,
    fontSize: 13,
  } as const

  const showDropdown = dropdownOpen && suggestionItems.length > 0

  return (
    <div className="client-post-payment flex-1 min-h-0 overflow-y-auto">
      <div className="client-post-payment__workspace max-w-2xl mx-auto p-4 space-y-4">
        <div>
          <h2 className="text-sm font-semibold mb-1" style={{ color: c.primary }}>
            Post payment to invoice
          </h2>
          <p className="text-xs" style={{ color: c.secondary }}>
            Search by invoice #, load #, broker, or amount. Use arrow keys and Tab to select a
            match, or create a new invoice if it is not in the system.
          </p>
        </div>

        <div className="client-post-payment__search relative">
          <label className="client-label" htmlFor="post-invoice-search">
            Find invoice
          </label>
          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
              style={{ color: c.secondary }}
            />
            <input
              ref={searchRef}
              id="post-invoice-search"
              type="text"
              role="combobox"
              aria-expanded={showDropdown}
              aria-autocomplete="list"
              aria-controls="post-invoice-suggestions"
              placeholder="Invoice #, load #, broker, or amount…"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setDropdownOpen(true)
                if (selectionMode !== 'none') {
                  setSelectionMode('none')
                  setSelected(null)
                }
              }}
              onFocus={() => setDropdownOpen(true)}
              onKeyDown={handleSearchKeyDown}
              className="client-input pl-8 w-full"
              style={inputStyle}
              autoComplete="off"
            />
          </div>

          {showDropdown && (
            <div
              ref={dropdownRef}
              id="post-invoice-suggestions"
              role="listbox"
              className="client-post-payment__suggestions absolute z-20 left-0 right-0 mt-1 rounded-lg border shadow-lg overflow-hidden"
              style={{ borderColor: c.border, backgroundColor: c.card }}
            >
              {!searchQuery.trim() && (
                <p
                  className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide border-b"
                  style={{ color: c.mutedLight, borderColor: c.border }}
                >
                  Open invoices
                </p>
              )}
              {suggestionItems.map((item, index) => {
                const isHighlighted = index === highlightIndex
                if (item.type === 'create') {
                  return (
                    <button
                      key="create-new"
                      type="button"
                      role="option"
                      aria-selected={isHighlighted}
                      className={`client-post-payment__suggestion w-full text-left px-3 py-2.5 flex items-center gap-2 border-b last:border-b-0 transition-colors ${
                        isHighlighted ? 'client-post-payment__suggestion--active' : ''
                      }`}
                      style={{
                        borderColor: c.border,
                        backgroundColor: isHighlighted ? c.stat.blue : 'transparent',
                      }}
                      onMouseEnter={() => setHighlightIndex(index)}
                      onClick={() => selectSuggestion(item)}
                    >
                      <Plus className="w-4 h-4 shrink-0" style={{ color: c.info }} />
                      <span className="text-sm font-medium" style={{ color: c.primary }}>
                        Create invoice &ldquo;{item.query}&rdquo; and post payment
                      </span>
                    </button>
                  )
                }

                const { invoice, isPostable } = item.hit
                const received = getConfirmedPaymentTotal(invoice.id)
                const balance = Math.max(0, invoice.amount - received)

                return (
                  <button
                    key={invoice.id}
                    type="button"
                    role="option"
                    aria-selected={isHighlighted}
                    disabled={!isPostable}
                    className={`client-post-payment__suggestion w-full text-left px-3 py-2.5 border-b last:border-b-0 transition-colors ${
                      isHighlighted ? 'client-post-payment__suggestion--active' : ''
                    } ${!isPostable ? 'opacity-60' : ''}`}
                    style={{
                      borderColor: c.border,
                      backgroundColor: isHighlighted ? c.stat.blue : 'transparent',
                    }}
                    onMouseEnter={() => setHighlightIndex(index)}
                    onClick={() => selectSuggestion(item)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold" style={{ color: c.primary }}>
                            {invoice.invoice_number}
                          </span>
                          <span className={getInvoicePostStatusClass(invoice)}>
                            {getInvoicePostStatusLabel(invoice)}
                          </span>
                        </div>
                        <p className="text-[11px] truncate mt-0.5" style={{ color: c.secondary }}>
                          {invoice.broker_name}
                          {invoice.load_number ? ` · Load ${invoice.load_number}` : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold tabular-nums" style={{ color: c.primary }}>
                          {formatCurrency(invoice.amount)}
                        </p>
                        {isPostable && received > 0 && (
                          <p className="text-[10px] tabular-nums" style={{ color: c.mutedLight }}>
                            {formatCurrency(balance)} left
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {selectionMode === 'none' && (
          <div
            className="rounded-lg px-4 py-8 text-center border border-dashed"
            style={{ borderColor: c.border, backgroundColor: c.stat.slate }}
          >
            <DollarSign className="w-8 h-8 mx-auto mb-2" style={{ color: c.mutedLight }} />
            <p className="text-sm font-medium" style={{ color: c.primary }}>
              Search and select an invoice
            </p>
            <p className="text-xs mt-1 max-w-sm mx-auto" style={{ color: c.secondary }}>
              Tab on a suggestion to fill payment details. If the invoice is not listed, choose
              create new at the bottom of the results.
            </p>
          </div>
        )}

        {selectionMode === 'existing' && selected && (
          <div
            className="rounded-lg px-3 py-2.5 flex flex-wrap items-baseline justify-between gap-2 border"
            style={{ borderColor: c.border, backgroundColor: c.stat.slate }}
          >
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-bold" style={{ color: c.primary }}>
                  {selected.invoice_number}
                </p>
                <span className={getInvoicePostStatusClass(selected)}>
                  {getInvoicePostStatusLabel(selected)}
                </span>
              </div>
              <p className="text-xs mt-0.5" style={{ color: c.secondary }}>
                {selected.broker_name}
                {selected.load_number ? ` · Load ${selected.load_number}` : ''}
                {' · Due '}
                {formatDate(selected.expected_payment_date)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wide" style={{ color: c.mutedLight }}>
                Invoice amount
              </p>
              <p className="text-lg font-bold tabular-nums" style={{ color: c.primary }}>
                {formatCurrency(selected.amount)}
              </p>
              {priorReceived > 0 && (
                <p className="text-[10px] tabular-nums" style={{ color: c.mutedLight }}>
                  {formatCurrency(priorReceived)} received
                </p>
              )}
            </div>
          </div>
        )}

        {selectionMode === 'new' && (
          <div
            className="rounded-lg px-3 py-3 space-y-3 border"
            style={{ borderColor: c.border, backgroundColor: c.stat.amber }}
          >
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 shrink-0" style={{ color: c.warning }} />
              <p className="text-sm font-semibold" style={{ color: c.primary }}>
                New invoice will be created
              </p>
            </div>
            <p className="text-xs" style={{ color: c.secondary }}>
              This payment is not matched to an existing invoice. A new open invoice will be created
              for the payment amount, then the payment will be posted against it.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                />
              </div>
              <div className="sm:col-span-2">
                <label className="client-label" htmlFor="new-load-number">
                  Load # (optional)
                </label>
                <input
                  id="new-load-number"
                  type="text"
                  value={newLoadNumber}
                  onChange={(e) => setNewLoadNumber(e.target.value)}
                  placeholder="Load number"
                  className="client-input w-full"
                  style={inputStyle}
                />
              </div>
            </div>
          </div>
        )}

        {selectionMode !== 'none' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="client-label" htmlFor="post-amount">
                  Amount received
                </label>
                <input
                  ref={amountRef}
                  id="post-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="client-input w-full tabular-nums"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="client-label" htmlFor="post-method">
                  Method
                </label>
                <select
                  id="post-method"
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(e.target.value as typeof paymentMethod)
                  }
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
              <div>
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
                />
              </div>
              <div>
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
                />
              </div>
              <div className="sm:col-span-2">
                <label className="client-label" htmlFor="post-reference">
                  Reference (optional)
                </label>
                <input
                  id="post-reference"
                  type="text"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="Check #, wire ref, ACH trace…"
                  className="client-input w-full"
                  style={inputStyle}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="client-label" htmlFor="post-notes">
                  Note (optional)
                </label>
                <textarea
                  id="post-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Detention included, partial pay, etc."
                  rows={2}
                  className="client-input w-full"
                />
              </div>
            </div>

            {variance && Number.isFinite(amountNum) && selectionMode === 'existing' && selected && (
              <div
                className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
                style={{
                  backgroundColor:
                    variance === 'full'
                      ? c.stat.green
                      : variance === 'short'
                        ? c.stat.amber
                        : c.stat.blue,
                  color: variance === 'short' ? c.warning : variance === 'over' ? c.info : c.success,
                }}
              >
                {variance === 'short' ? (
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                ) : variance === 'over' ? (
                  <TrendingUp className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <CircleCheck className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>
                  {variance === 'full' &&
                    `Total received will be ${formatCurrency(projectedTotal)} — pays invoice in full.`}
                  {variance === 'short' &&
                    `Total ${formatCurrency(projectedTotal)} — short by ${formatCurrency(selected.amount - projectedTotal)} after this post.`}
                  {variance === 'over' &&
                    `Total ${formatCurrency(projectedTotal)} — over by ${formatCurrency(projectedTotal - selected.amount)} after this post.`}
                </span>
              </div>
            )}

            {error && (
              <p className="text-sm" style={{ color: c.error }}>
                {error}
              </p>
            )}
            {successMessage && (
              <p className="text-sm" style={{ color: c.success }}>
                {successMessage}
              </p>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="dashboard-btn-primary"
                style={{ height: 36, fontSize: 13 }}
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
                onClick={resetForm}
                className="dashboard-btn-secondary"
                style={{ height: 36, fontSize: 13 }}
                disabled={isSubmitting}
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
