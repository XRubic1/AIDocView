import { CheckCircle2, Shield, XCircle } from 'lucide-react'
import { BatchDocumentReviewResult } from '../../../types/documentReview'
import {
  bolAuditMeetsDeliveryRequirements,
  isSingleDeliveryLoad,
} from '../../../utils/bolAuditSanitizer'
import { ff } from './factorFoxTheme'

interface VerificationChecksGridProps {
  result: BatchDocumentReviewResult
}

function CheckRow({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      {ok ? (
        <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: ff.green }} />
      ) : (
        <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: ff.amber }} />
      )}
      <div>
        <div className="text-sm font-medium" style={{ color: ff.text }}>
          {label}
        </div>
        {detail ? (
          <div className="text-xs mt-0.5" style={{ color: ff.textMuted }}>
            {detail}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** FactorFox "Fraud Checks" style verification summary. */
export default function VerificationChecksGrid({ result }: VerificationChecksGridProps) {
  const cross = result.crossValidation
  const summary = result.auditSummary
  if (!cross) return null

  const checkOk = (s: string) =>
    s === 'MATCH' ||
    s === 'CONFIRMED' ||
    s === 'COMPLETE' ||
    s === 'OVERAGE_EXPLAINED' ||
    s === 'EXPLAINED_BY_LUMPER'

  const multiLoad = result.multiInvoice?.multiLoadUpload ?? false

  const errors = (summary?.flags ?? cross.flags).filter((f) => {
    if (f.level !== 'ERROR') return false
    if (!multiLoad) return true
    return f.field.startsWith('packet_') || f.field.startsWith('invoice_')
  })

  const rateConDoc = result.documents.find((doc) => doc.extraction.rateConParse)
  const singleDelivery = isSingleDeliveryLoad(rateConDoc?.extraction.rateConParse)
  const bolOk = multiLoad
    ? result.documents.every((doc) => {
        const docBol = doc.extraction.bolAudit
        if (!docBol) return true
        return bolAuditMeetsDeliveryRequirements(docBol, doc.extraction.rateConParse)
      })
    : bolAuditMeetsDeliveryRequirements(
        result.documents.find((doc) => doc.extraction.bolAudit)?.extraction.bolAudit,
        rateConDoc?.extraction.rateConParse
      )

  const sampleBol = result.documents.find((d) => d.extraction.bolAudit)?.extraction.bolAudit
  const receiverOk =
    sampleBol?.signatures.receiver === 'PRESENT' ||
    sampleBol?.signatures.receiver === 'PASS_BY_RULE'

  const bolDetail = multiLoad
    ? result.documents
        .map((doc) => {
          const docBol = doc.extraction.bolAudit
          if (!docBol) return `${doc.fileName}: no BOL`
          const ok = bolAuditMeetsDeliveryRequirements(docBol, doc.extraction.rateConParse)
          const receiver =
            docBol.signatures.receiver === 'PRESENT' ||
            docBol.signatures.receiver === 'PASS_BY_RULE'
            ? 'receiver signed'
            : 'receiver missing'
          return `${doc.fileName}: ${ok ? `OK (${receiver})` : `needs review (${receiver})`}`
        })
        .join(' · ')
    : sampleBol
      ? [
          sampleBol.destination_match === 'PASS' ? 'Destination OK' : sampleBol.destination_notes,
          receiverOk
            ? singleDelivery
              ? 'Receiver signed (any BOL page)'
              : 'Receiver signed'
            : 'Receiver signature missing',
        ]
          .filter(Boolean)
          .join(' · ')
      : 'No BOL audit'

  const rows = [
    {
      label: multiLoad ? 'Load numbers (per PDF)' : 'Load number matches rate con',
      ok: checkOk(cross.load_number.status),
      detail: cross.load_number.details,
    },
    {
      label: multiLoad ? 'Brokers (per PDF)' : 'Broker matches documents',
      ok: checkOk(cross.broker.status),
      detail: cross.broker.details,
    },
    {
      label: multiLoad ? 'Amounts (per PDF)' : 'Invoice amount vs rate con',
      ok: checkOk(cross.amount.status),
      detail: cross.amount.details,
    },
    {
      label: 'Lumper / unloading reconciliation',
      ok:
        cross.amount.status === 'EXPLAINED_BY_LUMPER' ||
        !cross.flags.some((f) => f.field.includes('missing_lumper') || f.field.includes('amount_lumper')),
      detail:
        cross.flags.find((f) => f.field.includes('amount_lumper'))?.message ??
        cross.flags.find((f) => f.field.includes('missing_lumper'))?.message ??
        'No lumper discrepancy detected.',
    },
    {
      label: 'BOL signed & destination',
      ok: bolOk,
      detail: bolDetail,
    },
    {
      label: 'BOL reference numbers',
      ok: !cross.flags.some((f) => f.field === 'bol_reference_partial'),
      detail:
        cross.flags.find((f) => f.field === 'bol_reference_partial')?.message ??
        'Rate con reference numbers found on BOL.',
    },
    {
      label: 'BOL signature authenticity',
      ok: !cross.flags.some((f) => f.field === 'bol_signature_authenticity'),
      detail:
        cross.flags.find((f) => f.field === 'bol_signature_authenticity')?.message ??
        'No suspected fake signatures on the bill of lading.',
    },
    {
      label: 'Multi-stop BOL coverage',
      ok: checkOk(cross.multi_stop_coverage.status),
      detail: cross.multi_stop_coverage.details,
    },
    {
      label: 'Carrier confirmed',
      ok: checkOk(cross.carrier.status),
      detail: cross.carrier.details,
    },
  ]

  return (
    <div
      className="rounded-xl border p-5"
      style={{ backgroundColor: ff.mainBg, borderColor: ff.border, boxShadow: ff.shadow }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-4 h-4" style={{ color: ff.blue }} />
        <span
          className="text-xs font-bold uppercase tracking-wider"
          style={{ color: ff.textMuted }}
        >
          Verification checks
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
        {rows.map((row) => (
          <CheckRow key={row.label} label={row.label} ok={row.ok} detail={row.detail} />
        ))}
      </div>

      {errors.length > 0 && (
        <div
          className="mt-4 pt-4 border-t space-y-2"
          style={{ borderColor: ff.borderLight }}
        >
          {errors.map((flag, i) => (
            <p key={i} className="text-sm" style={{ color: ff.red }}>
              {flag.message}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
