import { useMemo } from 'react'
import { BatchDocumentReviewResult, DocumentReviewResult } from '../../../types/documentReview'
import { buildExtractionLog, LogLine } from '../../../utils/buildExtractionLog'
import TechnicalRulesPanel from './TechnicalRulesPanel'

interface TechnicalLogPaneProps {
  doc: DocumentReviewResult
  batchResult?: BatchDocumentReviewResult | null
  excelFileName?: string | null
  /** Nested under Summary tab — fills remaining panel height. */
  embedded?: boolean
  rulesRefreshKey?: number
  onRulesChanged?: () => void
}

function groupLines(lines: LogLine[]): {
  meta: LogLine[]
  rules: LogLine[]
  classify: LogLine[]
  extract: LogLine[]
  checks: LogLine[]
  excel: LogLine[]
  footer: LogLine[]
} {
  const meta: LogLine[] = []
  const rules: LogLine[] = []
  const classify: LogLine[] = []
  const extract: LogLine[] = []
  const checks: LogLine[] = []
  const excel: LogLine[] = []
  const footer: LogLine[] = []

  for (const line of lines) {
    if (line.kind === 'rule') rules.push(line)
    else if (line.kind === 'classify') classify.push(line)
    else if (line.kind === 'extract') extract.push(line)
    else if (line.kind === 'check' || line.kind === 'warn') checks.push(line)
    else if (line.kind === 'excel') excel.push(line)
    else if (line.kind === 'ok' || line.kind === 'err') footer.push(line)
    else meta.push(line)
  }

  return { meta, rules, classify, extract, checks, excel, footer }
}

function LogColumn({ title, lines }: { title: string; lines: LogLine[] }) {
  if (lines.length === 0) return null
  return (
    <div className="engine-tech-col">
      <div className="engine-tech-col-head">{title}</div>
      <ul className="engine-tech-lines">
        {lines.map((line, i) => (
          <li
            key={`${line.label}-${i}`}
            className={`engine-tech-line ${line.kind} ${line.status ?? ''}`}
          >
            <span className="engine-tech-lbl">{line.label}</span>
            <span className="engine-tech-val">{line.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Technical pipeline log — full tab or embedded under Summary. */
export default function TechnicalLogPane({
  doc,
  batchResult,
  excelFileName,
  embedded = false,
  rulesRefreshKey = 0,
  onRulesChanged,
}: TechnicalLogPaneProps) {
  const lines = useMemo(
    () => buildExtractionLog(doc, batchResult, excelFileName),
    [doc, batchResult, excelFileName, rulesRefreshKey]
  )
  const groups = useMemo(() => groupLines(lines), [lines])
  const verdict = groups.footer[0]

  const colCount =
    3 +
    (groups.excel.length > 0 || excelFileName ? 1 : 0) +
    (groups.rules.length > 0 ? 1 : 0)

  return (
    <div className={`engine-tech-panel${embedded ? ' engine-tech-panel--embedded' : ''}`}>
      <div className="engine-tech-bar">
        {groups.meta.map((m, i) => (
          <span key={i} className="engine-tech-bar-item">
            {m.label}: <strong>{m.value}</strong>
          </span>
        ))}
        {verdict && (
          <span className={`engine-tech-verdict ${verdict.status ?? ''}`}>{verdict.value}</span>
        )}
      </div>

      <TechnicalRulesPanel refreshKey={rulesRefreshKey} onRulesChanged={onRulesChanged} />

      <div
        className="engine-tech-grid"
        style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
      >
        {groups.rules.length > 0 && <LogColumn title="Rules" lines={groups.rules} />}
        <LogColumn title="Classify" lines={groups.classify} />
        <LogColumn title="Extract" lines={groups.extract} />
        <LogColumn title="Checks" lines={groups.checks} />
        {(groups.excel.length > 0 || excelFileName) && (
          <LogColumn
            title="Excel"
            lines={
              groups.excel.length > 0
                ? groups.excel
                : [{ kind: 'meta', label: 'sheet', value: excelFileName ?? '—' }]
            }
          />
        )}
      </div>

      {doc.extraction.confidence != null && (
        <div className="engine-tech-foot">
          Overall confidence {Math.round(doc.extraction.confidence * 100)}%
          {doc.debugLog.attempts.length > 0 && ` · ${doc.debugLog.attempts.length} AI calls`}
        </div>
      )}
    </div>
  )
}
