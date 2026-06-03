import { useState } from 'react'
import { AlertCircle, CheckCircle, ChevronDown, ChevronUp, FileWarning } from 'lucide-react'
import { BatchDocumentReviewResult } from '../../types/documentReview'
import { ff } from '../loadReview/factorfox/factorFoxTheme'

interface LoadAuditSummaryPanelProps {
  result: BatchDocumentReviewResult
  variant?: 'light' | 'dark'
}

/** Compact load audit — expand for full flag list. */
export default function LoadAuditSummaryPanel({ result, variant = 'light' }: LoadAuditSummaryPanelProps) {
  const [showDetails, setShowDetails] = useState(false)
  const summary = result.auditSummary
  const cross = result.crossValidation
  const dark = variant === 'dark'

  if (!summary && !cross) return null

  const status = summary?.overallStatus ?? cross?.overall ?? 'NEEDS_REVIEW'
  const statusStyle = dark
    ? status === 'APPROVED'
      ? { bg: ff.greenLight, border: ff.green, color: ff.green, Icon: CheckCircle }
      : status === 'REJECTED'
        ? { bg: ff.redLight, border: ff.red, color: ff.red, Icon: AlertCircle }
        : { bg: ff.amberLight, border: ff.amber, color: ff.amber, Icon: FileWarning }
    : status === 'APPROVED'
      ? { bg: '#E8F5E9', border: '#2E7D32', color: '#2E7D32', Icon: CheckCircle }
      : status === 'REJECTED'
        ? { bg: '#FEE2E2', border: '#991B1B', color: '#991B1B', Icon: AlertCircle }
        : { bg: '#FFF8E1', border: '#C2A558', color: '#C2A558', Icon: FileWarning }

  const StatusIcon = statusStyle.Icon
  const errors = (summary?.flags ?? cross?.flags ?? []).filter((f) => f.level === 'ERROR')
  const warnings = (summary?.flags ?? cross?.flags ?? []).filter((f) => f.level === 'WARNING')
  const infos = (summary?.flags ?? cross?.flags ?? []).filter((f) => f.level === 'INFO')

  const textPrimary = dark ? ff.text : '#113543'
  const textMuted = dark ? ff.textMuted : '#819291'
  const panelBg = dark ? ff.mainBg : '#FFFFFF'
  const sectionBorder = dark ? ff.border : '#e5e7eb'
  const gridBg = dark ? ff.bg2 : '#fafafa'
  const errBg = dark ? ff.redLight : '#FEE2E2'
  const errColor = dark ? ff.red : '#991B1B'
  const warnBg = dark ? ff.amberLight : '#FFF8E1'
  const warnColor = dark ? ff.amber : '#113543'

  const checkOk = (s: string) =>
    s === 'MATCH' ||
    s === 'CONFIRMED' ||
    s === 'COMPLETE' ||
    s === 'OVERAGE_EXPLAINED' ||
    s === 'EXPLAINED_BY_LUMPER'

  return (
    <div
      className="rounded-xl border-2 overflow-hidden"
      style={{ borderColor: statusStyle.border, backgroundColor: panelBg, boxShadow: dark ? ff.shadow : undefined }}
    >
      <div className="px-5 py-4" style={{ backgroundColor: statusStyle.bg }}>
        <div className="flex items-start gap-3">
          <StatusIcon className="w-8 h-8 flex-shrink-0" style={{ color: statusStyle.color }} />
          <div className="min-w-0 flex-1">
            <div
              className="text-lg font-bold uppercase tracking-wide"
              style={{ color: textPrimary, fontFamily: dark ? ff.fontDisplay : undefined }}
            >
              {status === 'APPROVED' ? 'Approved' : status === 'REJECTED' ? 'Rejected' : 'Needs review'}
            </div>
            <div className="text-sm mt-0.5 font-medium" style={{ color: textPrimary }}>
              Load {summary?.loadNumber ?? '—'}
              {summary?.broker ? ` · ${summary.broker}` : ''}
              {summary?.amount != null ? ` · $${summary.amount}` : ''}
            </div>
          </div>
        </div>
      </div>

      {cross && (
        <div
          className="px-5 py-3 grid grid-cols-2 sm:grid-cols-5 gap-3 text-center border-b"
          style={{ borderColor: sectionBorder, backgroundColor: gridBg }}
        >
          <CheckPill label="Rate con" ok={summary?.documentsReceived?.find((d) => d.name.includes('Rate'))?.status === 'ok'} dark={dark} />
          <CheckPill label="BOL" ok={summary?.documentsReceived?.find((d) => d.name.includes('lading'))?.status === 'ok'} dark={dark} />
          <CheckPill label="Invoice" ok={summary?.documentsReceived?.find((d) => d.name.includes('Invoice'))?.status === 'ok'} dark={dark} />
          <CheckPill label="Load #" ok={checkOk(cross.load_number.status)} dark={dark} />
          <CheckPill label="Amount" ok={checkOk(cross.amount.status)} dark={dark} />
        </div>
      )}

      {errors.length > 0 && (
        <div className="px-5 py-3 space-y-2 border-b" style={{ borderColor: sectionBorder }}>
          {errors.map((flag, i) => (
            <div key={`err-${i}`} className="text-sm rounded-lg px-3 py-2 border" style={{ backgroundColor: errBg, color: errColor, borderColor: dark ? ff.redBorder : 'transparent' }}>
              {flag.message}
            </div>
          ))}
        </div>
      )}

      {warnings.length > 0 && errors.length === 0 && (
        <div className="px-5 py-3 space-y-2 border-b" style={{ borderColor: sectionBorder }}>
          {warnings.slice(0, 2).map((flag, i) => (
            <div key={`warn-${i}`} className="text-sm rounded-lg px-3 py-2" style={{ backgroundColor: warnBg, color: warnColor }}>
              {flag.message}
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        className="w-full px-5 py-2.5 flex items-center justify-center gap-1 text-xs font-medium border-t engine-hover-surface transition-colors"
        style={{ borderColor: sectionBorder, color: textMuted, fontFamily: dark ? ff.fontMono : undefined }}
      >
        {showDetails ? (
          <>
            Hide details <ChevronUp className="w-4 h-4" />
          </>
        ) : (
          <>
            Show all checks & notes ({infos.length + warnings.length + errors.length}){' '}
            <ChevronDown className="w-4 h-4" />
          </>
        )}
      </button>

      {showDetails && (
        <div className="px-5 py-3 space-y-3 text-xs border-t" style={{ borderColor: sectionBorder, backgroundColor: dark ? ff.bg2 : undefined }}>
          {summary?.documentsReceived?.map((doc) => (
            <div key={doc.name} style={{ color: textPrimary }}>
              <span className="font-semibold">{doc.name}</span>
              {doc.detail ? <span style={{ color: textMuted }}> — {doc.detail}</span> : null}
            </div>
          ))}
          {[...warnings, ...infos].map((flag, i) => (
            <div key={`detail-${i}`} style={{ color: textMuted }}>
              [{flag.level}] {flag.message}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CheckPill({ label, ok, dark }: { label: string; ok?: boolean; dark?: boolean }) {
  const muted = dark ? ff.textMuted : '#819291'
  const okColor = dark ? ff.green : '#2E7D32'
  const pendingColor = dark ? ff.amber : '#C2A558'
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: muted, fontFamily: dark ? ff.fontMono : undefined }}>
        {label}
      </div>
      <div className="text-sm font-bold" style={{ color: ok ? okColor : pendingColor }}>
        {ok ? '✓' : '—'}
      </div>
    </div>
  )
}
