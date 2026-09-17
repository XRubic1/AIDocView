import { Loader2, Check, X, AlertTriangle } from 'lucide-react'
import type { AiReviewLiveCheck, AiReviewLiveExtract } from '../../services/credyx/batchAiReviewService'
import { CHECK_LABELS } from '../../utils/reviewMessages'
import { formatCurrency } from '../../utils/format'

const EXTRACT_SLOTS: Array<{ key: keyof AiReviewLiveExtract; label: string }> = [
  { key: 'loadNumber', label: 'Load' },
  { key: 'amount', label: 'Amount' },
  { key: 'brokerName', label: 'Broker' },
  { key: 'brokerDomain', label: 'Broker domain' },
  { key: 'carrierName', label: 'Carrier' },
  { key: 'pickup', label: 'Pick' },
  { key: 'destinations', label: 'Del' },
]

export const PENDING_AI_CHECKS: AiReviewLiveCheck[] = [
  { id: 'req_load', label: CHECK_LABELS.loadNumber, status: 'pending' },
  { id: 'req_broker', label: CHECK_LABELS.broker, status: 'pending' },
  { id: 'req_amount', label: CHECK_LABELS.amount, status: 'pending' },
  { id: 'req_bol', label: CHECK_LABELS.bol, status: 'pending' },
  { id: 'req_stops', label: CHECK_LABELS.multiStop, status: 'pending' },
  { id: 'req_carrier', label: CHECK_LABELS.carrier, status: 'pending' },
  { id: 'req_page_count', label: CHECK_LABELS.pageCount, status: 'pending' },
]

function formatExtractValue(key: keyof AiReviewLiveExtract, extract: AiReviewLiveExtract): string {
  if (key === 'amount') {
    const amount = extract.amount
    return amount != null && Number.isFinite(amount) ? formatCurrency(amount) : ''
  }
  const value = extract[key]
  return typeof value === 'string' ? value : ''
}

/** Loading + progressive extract rows while Rerun AI / batch review is in flight. */
export function AiReviewExtractProgressList({
  extracting,
  extract,
}: {
  extracting: boolean
  extract?: AiReviewLiveExtract | null
}) {
  if (!extracting && !extract) return null

  return (
    <section className="client-ai-verify__outcome" style={{ marginBottom: 8 }}>
      <div className="client-ai-verify__outcome-head">
        <h4 className="client-ai-verify__outcome-title">Extracted from paperwork</h4>
        {extracting ? (
          <span className="client-ai-verify__live-hint">
            <Loader2 className="w-3 h-3 animate-spin" />
            Extracting…
          </span>
        ) : null}
      </div>
      <ul className="client-ai-verify__checks">
        {EXTRACT_SLOTS.map(({ key, label }) => {
          const value = extract ? formatExtractValue(key, extract) : ''
          const ready = Boolean(value)
          return (
            <li
              key={key}
              className={`client-ai-verify__check${ready ? ' is-ok' : extracting ? ' is-pending' : ''}`}
            >
              {ready ? (
                <Check className="w-3 h-3 shrink-0" />
              ) : extracting ? (
                <Loader2 className="w-3 h-3 shrink-0 animate-spin" />
              ) : (
                <span className="client-ai-verify__check-dot" />
              )}
              <span className="client-ai-verify__check-label">
                {ready ? `${label} ${value}` : label}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Loading + progressive check rows for AI review outcome. */
export function AiReviewChecksProgressList({
  extracting,
  checks,
}: {
  extracting: boolean
  checks?: AiReviewLiveCheck[] | null
}) {
  const rows = checks?.length ? checks : extracting ? PENDING_AI_CHECKS : []
  if (rows.length === 0) return null

  const settled = rows.filter((r) => r.status !== 'pending')
  const passCount = settled.filter((r) => r.status === 'ok').length

  return (
    <section className="client-ai-verify__outcome">
      <div className="client-ai-verify__outcome-head">
        <h4 className="client-ai-verify__outcome-title">AI review outcome</h4>
        {extracting ? (
          <span className="client-ai-verify__live-hint">
            <Loader2 className="w-3 h-3 animate-spin" />
            Checking…
          </span>
        ) : null}
      </div>
      <p className="client-ai-verify__outcome-headline">
        {extracting && settled.length < rows.length
          ? `Checked ${settled.length}/${rows.length}…`
          : `${passCount}/${rows.length || 7} checks passed`}
      </p>
      <ul className="client-ai-verify__checks">
        {rows.map((row) => {
          const pending = row.status === 'pending'
          const ok = row.status === 'ok'
          return (
            <li
              key={row.id}
              className={`client-ai-verify__check${
                pending ? ' is-pending' : ok ? ' is-ok' : ' is-fail'
              }`}
            >
              {pending ? (
                <Loader2 className="w-3 h-3 shrink-0 animate-spin" />
              ) : ok ? (
                <Check className="w-3 h-3 shrink-0" />
              ) : (
                <X className="w-3 h-3 shrink-0" />
              )}
              <span className="client-ai-verify__check-label">{row.label}</span>
              {!pending && !ok && row.status === 'warning' && (
                <AlertTriangle className="w-3 h-3 shrink-0 opacity-70" />
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
