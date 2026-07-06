import { ChevronDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DocumentReviewResult } from '../../../types/documentReview'
import { buildAiReasoningLog } from '../../../utils/buildAiReasoningLog'

interface AiReasoningDropdownProps {
  doc: DocumentReviewResult
}

/** Collapsible panel — what the AI looked at and its reasoning under Technical. */
export default function AiReasoningDropdown({ doc }: AiReasoningDropdownProps) {
  const [open, setOpen] = useState(false)
  const entries = useMemo(() => buildAiReasoningLog(doc), [doc])

  if (entries.length === 0) return null

  return (
    <div className="engine-tech-reasoning">
      <button
        type="button"
        className={`engine-tech-reasoning-toggle${open ? ' open' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <ChevronDown className="engine-tech-reasoning-chevron" aria-hidden />
        <span className="engine-tech-reasoning-title">AI reasoning</span>
        <span className="engine-tech-reasoning-count">{entries.length} steps</span>
      </button>

      {open && (
        <div className="engine-tech-reasoning-body">
          {entries.map((entry) => (
            <article
              key={entry.id}
              className={`engine-tech-reasoning-entry${entry.status ? ` ${entry.status}` : ''}`}
            >
              <header className="engine-tech-reasoning-entry-head">
                <span className="engine-tech-reasoning-step">{entry.step}</span>
                {entry.confidence != null && (
                  <span className="engine-tech-reasoning-conf">
                    {Math.round(entry.confidence * 100)}%
                  </span>
                )}
              </header>
              <p className="engine-tech-reasoning-looked">
                <span className="engine-tech-reasoning-looked-label">Looked at</span>
                {entry.lookedAt}
              </p>
              <p className="engine-tech-reasoning-thought">{entry.thought}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
