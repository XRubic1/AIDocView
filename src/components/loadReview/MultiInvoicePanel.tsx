import { isInvoiceAcceptedForLoad, MultiInvoiceResult } from '../../utils/multiInvoiceValidation'

interface MultiInvoicePanelProps {
  multiInvoice?: MultiInvoiceResult
}

/** Compact per-invoice list — only show when multiple invoices or primary has issues. */
export default function MultiInvoicePanel({ multiInvoice }: MultiInvoicePanelProps) {
  if (!multiInvoice || multiInvoice.invoiceCount === 0) return null

  const primaryCount = multiInvoice.primaryAcceptedCount
  const primaryTotal = multiInvoice.verifications.filter((v) => v.appliesToPrimaryLoad).length
  const hasPrimaryIssue = multiInvoice.primaryLoadIncomplete

  if (!multiInvoice.multiLoadUpload && primaryCount === primaryTotal && !hasPrimaryIssue) {
    return null
  }

  return (
    <div className="rounded-lg border px-4 py-3" style={{ borderColor: '#819291', backgroundColor: '#FFFFFF' }}>
      <div className="text-sm font-semibold mb-2" style={{ color: '#113543' }}>
        Invoices
        {multiInvoice.multiLoadUpload
          ? ` — ${primaryCount} for load ${multiInvoice.primaryLoadNumber}`
          : ` — ${primaryCount}/${multiInvoice.invoiceCount} match`}
      </div>
      <ul className="space-y-1.5">
        {multiInvoice.verifications.map((verification) => {
          const inv = verification.unit.invoice
          const ok = isInvoiceAcceptedForLoad(verification)
          const muted = !verification.appliesToPrimaryLoad
          return (
            <li
              key={verification.unit.id}
              className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs"
              style={{ color: muted ? '#819291' : '#113543' }}
            >
              <span className="font-medium">{verification.unit.fileName}</span>
              <span>
                {inv.load_number ?? '—'} · ${inv.amount_total ?? '—'}
              </span>
              <span
                className="font-semibold"
                style={{ color: ok ? '#2E7D32' : muted ? '#819291' : '#991B1B' }}
              >
                {muted ? (ok ? 'other load OK' : 'other load') : ok ? 'OK' : 'issue'}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
