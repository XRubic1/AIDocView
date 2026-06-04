import { DOCSORT_AI_DISCLAIMER, DOCSORT_AI_DISCLAIMER_SHORT } from '../constants/aiDisclaimer'

interface DocSortAiDisclaimerProps {
  variant?: 'banner' | 'inline' | 'compact'
}

/** AI accuracy notice — sorting, rates, and binders. */
export default function DocSortAiDisclaimer({ variant = 'banner' }: DocSortAiDisclaimerProps) {
  if (variant === 'compact') {
    return <p className="doc-sort-ai-disclaimer compact">{DOCSORT_AI_DISCLAIMER_SHORT}</p>
  }
  if (variant === 'inline') {
    return <p className="doc-sort-ai-disclaimer inline">{DOCSORT_AI_DISCLAIMER}</p>
  }
  return (
    <div className="doc-sort-ai-disclaimer banner" role="note">
      <span className="doc-sort-ai-disclaimer-label">AI notice</span>
      <p>{DOCSORT_AI_DISCLAIMER}</p>
    </div>
  )
}
