import { LoadCheckStatus } from '../../../utils/loadReviewSummary'
import { CheckCircle2, XCircle, AlertCircle, FileText } from 'lucide-react'
import { ff } from './factorFoxTheme'

export interface CompactCheckRow {
  id: string
  label: string
  status: LoadCheckStatus
  summary: string
  detail?: string
}

function CheckIcon({ status }: { status: LoadCheckStatus }) {
  if (status === 'ok') return <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: ff.green }} />
  if (status === 'issue') return <XCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: ff.red }} />
  if (status === 'warning') return <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: ff.amber }} />
  if (status === 'missing') return <XCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: ff.textMuted }} />
  return <FileText className="w-3.5 h-3.5 flex-shrink-0" style={{ color: ff.textSubtle }} />
}

/** Shared compact check list — Summary and Technical use the same rows. */
export default function LoadReviewChecksList({
  checks,
  title = 'Review checks',
}: {
  checks: CompactCheckRow[]
  title?: string
}) {
  if (checks.length === 0) return null

  return (
    <section>
      <h3 className="text-sm font-bold uppercase tracking-wide mb-2" style={{ color: ff.text, fontFamily: ff.fontDisplay }}>
        {title}
      </h3>
      <ul className="space-y-1">
        {checks.map((row) => (
          <li
            key={row.id}
            className="flex items-start gap-2 text-xs rounded border px-2.5 py-1.5"
            style={{ borderColor: ff.border, backgroundColor: ff.bg2 }}
          >
            <CheckIcon status={row.status} />
            <div className="min-w-0 flex-1">
              <span className="font-semibold" style={{ color: ff.text }}>
                {row.label}
              </span>
              <span style={{ color: ff.textMuted }}> · {row.summary}</span>
              {row.detail ? (
                <p className="mt-0.5" style={{ color: ff.textSubtle, fontFamily: ff.fontMono }}>
                  {row.detail}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
