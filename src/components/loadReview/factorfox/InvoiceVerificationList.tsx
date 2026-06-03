import { CheckCircle2, AlertCircle, FileText, MinusCircle } from 'lucide-react'
import { BatchDocumentReviewResult } from '../../../types/documentReview'
import {
  isInvoiceAcceptedForLoad,
  MultiInvoiceResult,
} from '../../../utils/multiInvoiceValidation'
import { ff } from './factorFoxTheme'

interface InvoiceVerificationListProps {
  batchResult: BatchDocumentReviewResult
  onSelectFile?: (fileName: string) => void
  selectedFileName?: string | null
}

function statusForVerification(
  verification: MultiInvoiceResult['verifications'][0]
): { label: string; tone: 'verified' | 'issue' | 'other' } {
  const ok = isInvoiceAcceptedForLoad(verification)
  if (verification.role === 'unrelated') {
    return { label: 'No rate con in PDF', tone: 'other' }
  }
  if (ok) return { label: 'Verified', tone: 'verified' }
  if (verification.status === 'PARTIAL') return { label: 'Review', tone: 'issue' }
  return { label: 'Mismatch', tone: 'issue' }
}

/** FactorFox-style horizontal invoice cards with clear good/bad badges. */
export default function InvoiceVerificationList({
  batchResult,
  onSelectFile,
  selectedFileName,
}: InvoiceVerificationListProps) {
  const multi = batchResult.multiInvoice
  const verifications = multi?.verifications ?? []

  if (verifications.length === 0) {
    return (
      <div
        className="rounded-xl border border-dashed px-6 py-10 text-center"
        style={{ borderColor: ff.border, backgroundColor: ff.mainBg }}
      >
        <FileText className="w-10 h-10 mx-auto mb-2" style={{ color: ff.textSubtle }} />
        <p className="text-sm font-medium" style={{ color: ff.textMuted }}>
          No invoices detected yet
        </p>
        <p className="text-xs mt-1" style={{ color: ff.textSubtle }}>
          Run a review after uploading PDFs with invoice pages
        </p>
      </div>
    )
  }

  return (
    <ul className="space-y-3">
      {verifications.map((verification) => {
        const inv = verification.unit.invoice
        const invId = inv.invoice_number ?? verification.unit.fileName.replace(/\.pdf$/i, '')
        const broker = inv.broker_name ?? '—'
        const load = inv.load_number ?? '—'
        const amount = inv.amount_total != null ? `$${inv.amount_total.toLocaleString()}` : '—'
        const { label, tone } = statusForVerification(verification)
        const selected = selectedFileName === verification.unit.fileName

        const badgeStyle =
          tone === 'verified'
            ? { bg: ff.greenLight, color: ff.green, border: ff.greenBorder, Icon: CheckCircle2 }
            : tone === 'issue'
              ? { bg: ff.amberLight, color: ff.amber, border: '#fde68a', Icon: AlertCircle }
              : { bg: ff.borderLight, color: ff.textMuted, border: ff.border, Icon: MinusCircle }

        const BadgeIcon = badgeStyle.Icon

        return (
          <li key={verification.unit.id}>
            <button
              type="button"
              onClick={() => onSelectFile?.(verification.unit.fileName)}
              className="w-full text-left rounded-xl border px-4 py-4 flex items-center gap-4 transition-all hover:shadow-md"
              style={{
                backgroundColor: ff.mainBg,
                borderColor: selected ? ff.blue : ff.border,
                boxShadow: selected ? `0 0 0 2px ${ff.blueMuted}` : ff.shadow,
              }}
            >
              <div
                className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: ff.blueLight }}
              >
                <FileText className="w-5 h-5" style={{ color: ff.blue }} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-base font-bold" style={{ color: ff.text }}>
                    {invId}
                  </span>
                  <span className="text-xs" style={{ color: ff.textSubtle }}>
                    {verification.unit.fileName}
                  </span>
                </div>
                <p className="text-sm mt-0.5 truncate" style={{ color: ff.textMuted }}>
                  {broker} · Load {load}
                </p>
                {verification.excelMatch && (
                  <p className="text-xs mt-0.5" style={{ color: ff.textSubtle }}>
                    Excel: load {verification.excelMatch.row.loadNumber}
                    {verification.excelMatch.row.invoiceNumber
                      ? ` · inv ${verification.excelMatch.row.invoiceNumber}`
                      : ''}
                    {verification.excelMatch.row.amount != null
                      ? ` · $${verification.excelMatch.row.amount.toLocaleString()}`
                      : ''}
                  </p>
                )}
                {verification.notes && tone === 'issue' && (
                  <p className="text-xs mt-1.5 line-clamp-2" style={{ color: ff.amber }}>
                    {verification.notes}
                  </p>
                )}
              </div>

              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <span className="text-lg font-bold tabular-nums" style={{ color: ff.text }}>
                  {amount}
                </span>
                <span
                  className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border"
                  style={{
                    backgroundColor: badgeStyle.bg,
                    color: badgeStyle.color,
                    borderColor: badgeStyle.border,
                  }}
                >
                  <BadgeIcon className="w-3.5 h-3.5" />
                  {label}
                </span>
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
