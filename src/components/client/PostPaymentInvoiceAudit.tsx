import { useMemo } from 'react'
import type { Invoice } from '../../types/invoice'
import type { Payment } from '../../types/payment'
import { buildClientPaymentAuditTimeline } from '../../utils/clientPaymentAuditTimeline'
import { useClientTheme } from '../../theme/ThemeContext'
import { InvoiceActivityNoteList } from './InvoiceActivityNoteList'

interface PostPaymentInvoiceAuditProps {
  invoice: Invoice
  payments: Payment[]
}

/**
 * Read-only activity / notes feed for the invoice being paid.
 * Inputs: invoice + its payments. Output: timeline entries newest first.
 */
export default function PostPaymentInvoiceAudit({
  invoice,
  payments,
}: PostPaymentInvoiceAuditProps) {
  const c = useClientTheme()
  const entries = useMemo(
    () => buildClientPaymentAuditTimeline(invoice, payments),
    [invoice, payments]
  )

  return (
    <section className="post-payment-context-card" aria-labelledby="post-payment-audit-heading">
      <h3 id="post-payment-audit-heading" className="post-payment-context-card__title">
        Audit
        {entries.length > 0 ? (
          <span className="post-payment-context-card__count">{entries.length}</span>
        ) : null}
      </h3>
      <div className="post-payment-audit-scroll">
        <InvoiceActivityNoteList
          entries={entries}
          emptyMessage="No activity recorded for this invoice yet."
          emptyColor={c.mutedLight}
        />
      </div>
    </section>
  )
}
