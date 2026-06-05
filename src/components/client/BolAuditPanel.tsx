import { BolAudit } from '../../types/documentPipeline'
import {
  bolAuditHasSignatureConcern,
  bolAuditHasUnclearSignatureAuthenticity,
} from '../../utils/bolAuditSanitizer'
import { ff } from '../loadReview/factorfox/factorFoxTheme'

interface BolAuditPanelProps {
  audit: BolAudit
  variant?: 'light' | 'dark'
}

/** Prompt 3 — BOL audit results. */
export default function BolAuditPanel({ audit, variant = 'light' }: BolAuditPanelProps) {
  const dark = variant === 'dark'
  const border = dark ? ff.border : '#64748b'
  const panelBg = dark ? ff.bg2 : '#f8f9fa'
  const textPrimary = dark ? ff.text : '#113543'
  const textMuted = dark ? ff.textMuted : '#64748b'
  const passColor = dark ? ff.green : '#2E7D32'
  const failColor = dark ? ff.red : '#991B1B'
  const warnColor = dark ? ff.amber : '#0891b2'

  return (
    <div className="rounded border p-2 text-xs space-y-2 mt-2" style={{ borderColor: border, backgroundColor: panelBg }}>
      <div className="font-semibold uppercase tracking-wide" style={{ color: textPrimary, fontFamily: dark ? ff.fontDisplay : undefined }}>
        BOL audit
      </div>
      <div className="grid grid-cols-2 gap-2">
        <AuditRow label="Destination" value={audit.destination_match} dark={dark} />
        <AuditRow label="Legibility" value={audit.legibility} dark={dark} />
        <AuditRow label="Pages" value={audit.page_count} dark={dark} />
        <AuditRow label="Overall" value={audit.overall} dark={dark} />
      </div>
      <div className="grid grid-cols-2 gap-1 pt-1 border-t" style={{ borderColor: border }}>
        <span style={{ color: textMuted }}>Carrier sig</span>
        <span style={{ color: textPrimary }}>{audit.signatures.carrier}</span>
        <span style={{ color: textMuted }}>Shipper sig</span>
        <span style={{ color: textPrimary }}>{audit.signatures.shipper}</span>
        <span style={{ color: textMuted }}>Receiver sig</span>
        <span style={{ color: textPrimary }}>{audit.signatures.receiver}</span>
        <span style={{ color: textMuted }}>Receiver date</span>
        <span style={{ color: textPrimary }}>{audit.signatures.receiver_date}</span>
        {(audit.signatures.receiver_authenticity &&
          audit.signatures.receiver_authenticity !== 'NONE') ||
        (audit.signatures.shipper_authenticity &&
          audit.signatures.shipper_authenticity !== 'NONE') ||
        (audit.signatures.carrier_authenticity &&
          audit.signatures.carrier_authenticity !== 'NONE') ? (
          <>
            <span style={{ color: textMuted }}>Receiver authenticity</span>
            <AuthenticityCell value={audit.signatures.receiver_authenticity} dark={dark} />
            <span style={{ color: textMuted }}>Shipper authenticity</span>
            <AuthenticityCell value={audit.signatures.shipper_authenticity} dark={dark} />
            <span style={{ color: textMuted }}>Carrier authenticity</span>
            <AuthenticityCell value={audit.signatures.carrier_authenticity} dark={dark} />
          </>
        ) : null}
      </div>
      {audit.signatures.rule_applied && (
        <p className="text-[11px] rounded px-2 py-1 border" style={{ backgroundColor: dark ? ff.greenLight : '#E8F5E9', color: passColor, borderColor: dark ? ff.greenBorder : 'transparent' }}>
          Rule: {audit.signatures.rule_applied}
        </p>
      )}
      {(bolAuditHasSignatureConcern(audit) || bolAuditHasUnclearSignatureAuthenticity(audit)) && (
        <div className="rounded border px-2 py-1.5" style={{ borderColor: dark ? ff.redBorder : '#fecaca', backgroundColor: dark ? ff.redLight : '#fef2f2' }}>
          <p className="text-[11px] font-semibold" style={{ color: failColor }}>
            Signature authenticity
          </p>
          <p className="text-[11px]" style={{ color: textPrimary }}>
            Receiver: {audit.signatures.receiver_authenticity ?? 'NONE'} · Shipper:{' '}
            {audit.signatures.shipper_authenticity ?? 'NONE'} · Carrier:{' '}
            {audit.signatures.carrier_authenticity ?? 'NONE'}
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: dark ? ff.red : '#7f1d1d' }}>
            {bolAuditHasSignatureConcern(audit)
              ? 'At least one signature may be forged, stamped, or digitally placed — verify before approving.'
              : 'Signature authenticity is unclear on one or more roles — manual review recommended.'}
          </p>
        </div>
      )}
      {audit.delivery_exceptions && (
        <div className="rounded border px-2 py-1.5" style={{ borderColor: dark ? ff.amberBorder : '#fde68a', backgroundColor: dark ? ff.amberLight : '#fffbeb' }}>
          <p className="text-[11px] font-semibold" style={{ color: warnColor }}>
            Delivery exceptions
          </p>
          <p className="text-[11px]" style={{ color: textPrimary }}>
            Damages: {audit.delivery_exceptions.damages} · Shortage: {audit.delivery_exceptions.shortage} · Protest:{' '}
            {audit.delivery_exceptions.protest}
          </p>
          {audit.delivery_exceptions.notes && (
            <p className="text-[11px] mt-0.5" style={{ color: dark ? ff.amber : '#78350f' }}>
              {audit.delivery_exceptions.notes}
            </p>
          )}
        </div>
      )}
      {audit.flags.length > 0 && (
        <ul className="list-disc pl-4 space-y-0.5" style={{ color: failColor }}>
          {audit.flags.map((flag) => (
            <li key={flag}>{flag}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function AuthenticityCell({ value, dark }: { value?: string; dark?: boolean }) {
  const noted = value === 'NOTED'
  const unclear = value === 'UNCLEAR'
  const text = value && value !== 'NONE' ? value : '—'
  const failColor = dark ? ff.red : '#991B1B'
  const warnColor = dark ? ff.amber : '#0891b2'
  const textPrimary = dark ? ff.text : '#113543'
  return (
    <span
      className="font-medium"
      style={{ color: noted ? failColor : unclear ? warnColor : textPrimary }}
    >
      {text}
    </span>
  )
}

function AuditRow({ label, value, dark }: { label: string; value: string; dark?: boolean }) {
  const pass = value === 'PASS' || value === 'APPROVED'
  const fail = value === 'FAIL' || value === 'INCOMPLETE' || value === 'REJECTED'
  const passColor = dark ? ff.green : '#2E7D32'
  const failColor = dark ? ff.red : '#991B1B'
  const warnColor = dark ? ff.amber : '#0891b2'
  const textMuted = dark ? ff.textMuted : '#64748b'
  return (
    <div>
      <span style={{ color: textMuted }}>{label}: </span>
      <span
        className="font-medium"
        style={{ color: pass ? passColor : fail ? failColor : warnColor }}
      >
        {value}
      </span>
    </div>
  )
}
