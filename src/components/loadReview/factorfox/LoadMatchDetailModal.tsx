import { useEffect, useMemo } from 'react'
import { CheckCircle2, FileText, X, XCircle, AlertCircle, Bug, GraduationCap } from 'lucide-react'
import { BatchDocumentReviewResult, DocumentReviewResult } from '../../../types/documentReview'
import { buildLoadDetailView, FieldMatchTone } from '../../../utils/loadDetailView'
import { ff } from './factorFoxTheme'

interface LoadMatchDetailModalProps {
  doc: DocumentReviewResult | null
  batchResult: BatchDocumentReviewResult | null
  onClose: () => void
  onViewDocuments: () => void
  onViewDebug?: () => void
  onTeachAi?: () => void
}

function MatchDot({ tone }: { tone: FieldMatchTone }) {
  const color =
    tone === 'match'
      ? ff.green
      : tone === 'mismatch'
        ? ff.red
        : tone === 'warning'
          ? ff.amber
          : ff.textSubtle
  return (
    <span
      className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
      style={{ backgroundColor: color }}
      aria-hidden
    />
  )
}

function FieldCard({
  label,
  value,
  match,
  subtext,
}: {
  label: string
  value: string
  match: FieldMatchTone
  subtext?: string
}) {
  return (
    <div
      className="rounded-lg border px-3 py-2.5"
      style={{ borderColor: ff.borderLight, backgroundColor: ff.canvasBg }}
    >
      <div className="flex items-start gap-2">
        <MatchDot tone={match} />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: ff.textMuted }}>
            {label}
          </div>
          <div className="text-sm font-medium mt-0.5 break-words" style={{ color: ff.text }}>
            {value}
          </div>
          {subtext ? (
            <p className="text-xs mt-1 leading-snug" style={{ color: ff.textSubtle }}>
              {subtext}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** Clean popup: matched load fields, signatures, and verification summary. */
export default function LoadMatchDetailModal({
  doc,
  batchResult,
  onClose,
  onViewDocuments,
  onViewDebug,
  onTeachAi,
}: LoadMatchDetailModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const view = useMemo(() => {
    if (!doc || !batchResult) return null
    return buildLoadDetailView(doc, batchResult)
  }, [doc, batchResult])

  if (!doc || !view) return null

  const statusColors =
    view.statusLabel === 'Verified'
      ? { bg: ff.greenLight, color: ff.green, Icon: CheckCircle2 }
      : view.statusLabel === 'Rejected'
        ? { bg: ff.redLight, color: ff.red, Icon: XCircle }
        : view.statusTone === 'issue'
          ? { bg: ff.amberLight, color: ff.amber, Icon: AlertCircle }
          : { bg: ff.borderLight, color: ff.textMuted, Icon: FileText }

  const StatusIcon = statusColors.Icon

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: ff.overlay }}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl"
        style={{ backgroundColor: ff.mainBg }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 px-5 pt-5 pb-4 border-b" style={{ borderColor: ff.borderLight }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-bold tracking-tight truncate" style={{ color: ff.text }}>
                {view.title}
              </h2>
              <p className="text-sm mt-0.5 truncate" style={{ color: ff.textMuted }}>
                {view.fileName}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg engine-hover-surface transition-colors flex-shrink-0"
              aria-label="Close"
            >
              <X className="w-5 h-5" style={{ color: ff.textMuted }} />
            </button>
          </div>
          <span
            className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ backgroundColor: statusColors.bg, color: statusColors.color }}
          >
            <StatusIcon className="w-3.5 h-3.5" />
            {view.statusLabel}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {view.statusReasons.length > 0 && (
            <div
              className="rounded-lg border px-3 py-2.5 space-y-1"
              style={{
                backgroundColor: view.statusTone === 'issue' ? ff.redLight : ff.amberLight,
                borderColor: view.statusTone === 'issue' ? ff.redBorder : ff.amberBorder,
              }}
            >
              <p
                className="text-xs font-bold uppercase tracking-wide"
                style={{ color: view.statusTone === 'issue' ? ff.red : ff.amber }}
              >
                {view.statusLabel === 'Rejected' ? 'Rejection reason' : 'Notes'}
              </p>
              <ul className="space-y-1">
                {view.statusReasons.map((reason, i) => (
                  <li key={i} className="text-xs leading-relaxed" style={{ color: ff.text }}>
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: ff.textMuted }}>
              Matched information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {view.fields.map((field) => (
                <FieldCard key={field.label} {...field} />
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: ff.textMuted }}>
              Signatures
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {view.signatures.map((sig) => (
                <div
                  key={sig.label}
                  className="rounded-lg border px-3 py-2"
                  style={{ borderColor: ff.borderLight }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium" style={{ color: ff.textMuted }}>
                      {sig.label}
                    </span>
                    <span
                      className="text-xs font-semibold inline-flex items-center gap-1"
                      style={{ color: sig.ok ? ff.green : ff.amber }}
                    >
                      {sig.ok ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5" />
                      )}
                      {sig.status}
                    </span>
                  </div>
                  {sig.subtext && (
                    <p className="text-[10px] mt-1" style={{ color: ff.amber }}>
                      {sig.subtext}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>

          {view.verificationSummary.rows.length > 0 && (
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: ff.textMuted }}>
                Verification
              </h3>
              <ul className="space-y-2">
                {view.verificationSummary.rows.map((row) => (
                  <li
                    key={row.label}
                    className="flex items-start gap-2 text-sm"
                    style={{ color: ff.text }}
                  >
                    {row.ok ? (
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: ff.green }} />
                    ) : (
                      <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: ff.amber }} />
                    )}
                    <div>
                      <span className="font-medium">{row.label}</span>
                      {row.detail ? (
                        <p className="text-xs mt-0.5" style={{ color: ff.textMuted }}>
                          {row.detail}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
              {view.verificationSummary.errors.length > 0 && (
                <div className="mt-3 space-y-1">
                  {view.verificationSummary.errors.map((flag, i) => (
                    <p key={i} className="text-xs" style={{ color: ff.red }}>
                      {flag.message}
                    </p>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        <div
          className="flex-shrink-0 flex flex-col gap-2 px-5 py-4 border-t"
          style={{ borderColor: ff.borderLight, backgroundColor: ff.canvasBg }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={onViewDocuments}
              className="inline-flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold rounded-lg transition-opacity hover:opacity-90 engine-btn-primary"
              style={{ backgroundColor: ff.accent, color: ff.onPrimary }}
            >
              <FileText className="w-4 h-4" />
              View documents
            </button>
            {onTeachAi && (
              <button
                type="button"
                onClick={onTeachAi}
                className="inline-flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold rounded-lg border transition-colors engine-hover-surface"
                style={{ borderColor: ff.borderLight, color: ff.text }}
              >
                <GraduationCap className="w-4 h-4" style={{ color: ff.accent }} />
                Teach AI
              </button>
            )}
            {onViewDebug && (
              <button
                type="button"
                onClick={onViewDebug}
                className="inline-flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold rounded-lg border transition-colors engine-hover-surface"
                style={{ borderColor: ff.borderLight, color: ff.text }}
              >
                <Bug className="w-4 h-4" style={{ color: ff.textMuted }} />
                Debug logs
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-2 text-sm font-medium rounded-lg border"
            style={{ borderColor: ff.border, color: ff.textMuted }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
