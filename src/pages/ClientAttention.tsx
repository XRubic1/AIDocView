import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, FileUp } from 'lucide-react'
import { useClientDemoSnapshot } from '../hooks/useClientDemoSnapshot'
import { useClientTheme } from '../theme/ThemeContext'
import { mapClientVisibleInvoices, isClientVisibleHold } from '../utils/clientInvoiceView'
import { isReceiptDisputeHold } from '../services/paymentReceiptConfirmationService'
import { formatCurrency } from '../utils/format'
import InvoiceDetailPanel from '../components/client/InvoiceDetailPanel'
import ClientInvoicesTabs from '../components/client/ClientInvoicesTabs'
import ClientAttentionInvoiceCard from '../components/client/ClientAttentionInvoiceCard'
import { useCompactDetailViewport } from '../hooks/useIsMobileViewport'
import PageLoader from '../components/ui/PageLoader'
import type { Invoice } from '../types/invoice'

function matchesInvoiceRef(invoice: Invoice, ref: string): boolean {
  const needle = ref.trim().replace(/^#/, '')
  if (!needle) return false
  return (
    invoice.id === needle ||
    String(invoice.invoice_number).trim().replace(/^#/, '') === needle
  )
}

/** Paperwork holds only — receipt disputes stay on payments. */
function needsPaperwork(invoice: Invoice): boolean {
  return isClientVisibleHold(invoice) && !isReceiptDisputeHold(invoice)
}

/**
 * Signed-in page for document-issue emails: invoices that need paperwork,
 * with a direct upload action for the load called out in the email.
 */
export default function ClientAttention() {
  const c = useClientTheme()
  const compact = useCompactDetailViewport()
  const [searchParams, setSearchParams] = useSearchParams()
  const [refreshKey, setInvoicesRefreshKey] = useState(0)
  const { invoices: rawInvoices, payments, clientName, isInitialLoad } =
    useClientDemoSnapshot(refreshKey)
  const invoices = useMemo(() => mapClientVisibleInvoices(rawInvoices), [rawInvoices])

  const emailRef = searchParams.get('invoice')?.trim() ?? ''
  const wantUpload = searchParams.get('upload') === '1'

  const paperworkHolds = useMemo(
    () => invoices.filter(needsPaperwork),
    [invoices]
  )

  const linkedInvoice = useMemo(() => {
    if (!emailRef) return null
    return invoices.find((inv) => matchesInvoiceRef(inv, emailRef)) ?? null
  }, [emailRef, invoices])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [autoOpenUpload, setAutoOpenUpload] = useState(wantUpload)

  const selected = useMemo(() => {
    if (selectedId) {
      return invoices.find((inv) => inv.id === selectedId) ?? linkedInvoice ?? paperworkHolds[0] ?? null
    }
    // Mobile: list first unless the visit came from a paperwork email.
    if (compact && !wantUpload && !emailRef) return null
    return linkedInvoice ?? paperworkHolds[0] ?? null
  }, [selectedId, invoices, linkedInvoice, paperworkHolds, compact, wantUpload, emailRef])

  const openInvoice = useCallback(
    (invoice: Invoice, upload: boolean) => {
      setSelectedId(invoice.id)
      setAutoOpenUpload(upload)
      const next = new URLSearchParams(searchParams)
      next.set('invoice', invoice.invoice_number || invoice.id)
      if (upload) next.set('upload', '1')
      else next.delete('upload')
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams]
  )

  const closeDetail = useCallback(() => {
    setSelectedId(null)
    setAutoOpenUpload(false)
    const next = new URLSearchParams(searchParams)
    next.delete('upload')
    if (compact) next.delete('invoice')
    setSearchParams(next, { replace: true })
  }, [compact, searchParams, setSearchParams])

  const list = paperworkHolds
  const holdCount = paperworkHolds.length
  const holdAmount = paperworkHolds.reduce((sum, inv) => sum + inv.amount, 0)
  const hasHolds = holdCount > 0
  const showMobileDetail = compact && Boolean(selected)

  if (isInitialLoad) {
    return <PageLoader message="Loading invoices…" fullScreen={false} />
  }

  const detailPanel = selected ? (
    <InvoiceDetailPanel
      variant={compact ? 'mobile' : 'sidebar'}
      invoice={selected}
      clientName={clientName}
      navigationInvoices={list}
      onClose={closeDetail}
      onNavigateInvoice={(invoice) => openInvoice(invoice, false)}
      onInvoiceUpdated={() => setInvoicesRefreshKey((k) => k + 1)}
      enableClientActions
      payments={payments}
      autoOpenUpload={autoOpenUpload}
      onAutoOpenUploadConsumed={() => setAutoOpenUpload(false)}
    />
  ) : null

  if (showMobileDetail && detailPanel) {
    return (
      <div className="client-invoices-page client-attention-page overflow-hidden flex flex-col min-h-0 h-full">
        {detailPanel}
      </div>
    )
  }

  return (
    <div className="client-invoices-page client-attention-page overflow-hidden flex flex-col min-h-0 h-full">
      <div
        className="client-page-toolbar flex items-center px-4 py-2 border-b shrink-0"
        style={{ borderColor: c.border, backgroundColor: c.card }}
      >
        <ClientInvoicesTabs />
      </div>

      {!hasHolds ? (
        <div className="client-attention-empty">
          <div className="client-attention-empty__icon" aria-hidden>
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <p className="client-attention-empty__title">Nothing needs documents right now</p>
          <p className="client-attention-empty__help">
            When Credyx asks for paperwork on a hold, those invoices will show up here.
          </p>
        </div>
      ) : (
        <div
          className={`client-attention-page__body flex-1 min-h-0 ${
            compact ? 'flex flex-col' : 'client-attention-page__split'
          }`}
        >
          <div className="client-attention-page__list">
            <div className="client-attention-page__list-head">
              <h2 className="client-attention-page__list-title">Documents needed</h2>
              <p className="client-attention-page__list-meta tabular-nums">
                {holdCount} {holdCount === 1 ? 'invoice' : 'invoices'}
                <span aria-hidden> · </span>
                {formatCurrency(holdAmount)}
              </p>
            </div>
            {list.map((inv, index) => {
              const fromEmail = Boolean(
                wantUpload && emailRef && matchesInvoiceRef(inv, emailRef)
              )
              return (
                <ClientAttentionInvoiceCard
                  key={inv.id}
                  invoice={inv}
                  index={index}
                  selected={!compact && selected?.id === inv.id}
                  fromEmail={fromEmail}
                  onClick={() => openInvoice(inv, fromEmail)}
                />
              )
            })}
          </div>

          {!compact ? (
            <div className="client-attention-page__detail">
              {detailPanel ?? (
                <div className="client-attention-page__detail-empty">
                  <FileUp className="w-5 h-5" aria-hidden />
                  <p>Select an invoice to upload documents.</p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
