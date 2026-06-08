import { ChevronLeft, ChevronRight, Sparkles, PenLine, Upload, FileStack, Check, FilePenLine } from 'lucide-react'
import { ReactNode } from 'react'
import { formatCurrency } from '../../utils/format'
import { clientTheme as c } from '../../theme/clientTheme'

export type SubmitDocsMode = 'choose' | 'ai' | 'manual'

export interface SubmitDocsDraftBatch {
  id: string
  batch_number: string
  upload_mode?: string
  total_invoices: number
  total_amount: number
}

interface ClientSubmitDocsViewProps {
  mode: SubmitDocsMode
  onBackToBatches: () => void
  onBackToChoose: () => void
  onSelectAi: () => void
  onSelectManual: () => void
  draftBatches?: SubmitDocsDraftBatch[]
  onResumeDraft?: (batchId: string) => void
  activeDraftBatchId?: string | null
  children?: ReactNode
}

const MODE_LABELS: Record<Exclude<SubmitDocsMode, 'choose'>, string> = {
  ai: 'AI upload',
  manual: 'Manual batch',
}

interface MethodOptionProps {
  featured?: boolean
  icon: ReactNode
  iconClassName?: string
  title: string
  badge?: string
  description: string
  steps: string[]
  onClick: () => void
}

function MethodOption({
  featured,
  icon,
  iconClassName,
  title,
  badge,
  description,
  steps,
  onClick,
}: MethodOptionProps) {
  return (
    <button
      type="button"
      className={`client-submit-docs__option${featured ? ' client-submit-docs__option--featured' : ''}`}
      onClick={onClick}
    >
      <div className="client-submit-docs__option-top">
        <div className={`client-submit-docs__option-icon${iconClassName ? ` ${iconClassName}` : ''}`}>
          {icon}
        </div>
        {badge && <span className="client-submit-docs__option-badge">{badge}</span>}
      </div>

      <div className="client-submit-docs__option-body">
        <h2 className="client-submit-docs__option-title">{title}</h2>
        <p className="client-submit-docs__option-desc">{description}</p>

        <ul className="client-submit-docs__option-steps">
          {steps.map((step) => (
            <li key={step}>
              <Check className="client-submit-docs__step-check" />
              <span>{step}</span>
            </li>
          ))}
        </ul>
      </div>

      <span className="client-submit-docs__option-cta">
        Get started
        <ChevronRight className="w-4 h-4" />
      </span>
    </button>
  )
}

function draftModeLabel(uploadMode?: string) {
  return uploadMode === 'manual' ? 'Manual' : 'AI'
}

function draftSummary(draft: SubmitDocsDraftBatch) {
  return `${draftModeLabel(draft.upload_mode)} · ${draft.total_invoices} inv · ${formatCurrency(draft.total_amount)}`
}

/** Compact notice for saved draft batches. */
function SubmitDocsDraftNotice({
  drafts,
  onResumeDraft,
  activeDraftBatchId,
  editing = false,
}: {
  drafts: SubmitDocsDraftBatch[]
  onResumeDraft?: (batchId: string) => void
  activeDraftBatchId?: string | null
  editing?: boolean
}) {
  if (drafts.length === 0) return null

  const visibleDrafts = editing
    ? drafts.filter((d) => d.id === activeDraftBatchId).slice(0, 1)
    : drafts

  if (visibleDrafts.length === 0) return null

  return (
    <div className="client-submit-docs__draft-notice" role="status">
      {visibleDrafts.map((draft) => (
        <div key={draft.id} className="client-submit-docs__draft-row">
          <FilePenLine className="w-3.5 h-3.5 shrink-0" style={{ color: c.warning }} />
          <div className="client-submit-docs__draft-row-text">
            <span className="client-submit-docs__draft-row-label">
              {editing ? 'Draft saved' : 'Unfinished draft'}
            </span>
            <span className="client-submit-docs__draft-row-meta">
              {draft.batch_number} · {draftSummary(draft)}
            </span>
          </div>
          {!editing && (
            <button
              type="button"
              className="client-submit-docs__draft-row-btn"
              onClick={() => onResumeDraft?.(draft.id)}
            >
              Continue
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

/** Full-width submit documents flow — method picker + nested upload steps. */
export default function ClientSubmitDocsView({
  mode,
  onBackToBatches,
  onBackToChoose,
  onSelectAi,
  onSelectManual,
  draftBatches = [],
  onResumeDraft,
  activeDraftBatchId,
  children,
}: ClientSubmitDocsViewProps) {
  return (
    <div className="client-submit-docs">
      <div className="client-submit-docs__toolbar">
        {mode === 'choose' ? (
          <button type="button" onClick={onBackToBatches} className="client-submit-docs__back">
            <ChevronLeft className="w-4 h-4" />
            All batches
          </button>
        ) : (
          <button type="button" onClick={onBackToChoose} className="client-submit-docs__back">
            <ChevronLeft className="w-4 h-4" />
            Choose method
          </button>
        )}

        {mode !== 'choose' && (
          <span className="client-submit-docs__step">{MODE_LABELS[mode]}</span>
        )}
      </div>

      {mode === 'choose' ? (
        <div className="client-submit-docs__choose">
          <div className="client-submit-docs__intro">
            <div className="client-submit-docs__intro-icon">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h1 className="client-submit-docs__title">Submit documents</h1>
              <p className="client-submit-docs__subtitle">
                Send rate cons, BOLs, and invoices to Credyx for review. Pick the workflow that fits
                your team.
              </p>
            </div>
          </div>

          <SubmitDocsDraftNotice
            drafts={draftBatches}
            onResumeDraft={onResumeDraft}
            activeDraftBatchId={activeDraftBatchId}
          />

          <div className="client-submit-docs__options">
            <MethodOption
              featured
              icon={<Sparkles className="w-6 h-6" />}
              iconClassName="client-submit-docs__option-icon--ai"
              title="AI upload"
              badge="Recommended"
              description="Upload PDFs in bulk. We sort by load, draft invoices, and you confirm each before submitting."
              steps={['Drop rate cons & BOLs', 'Review drafted invoices', 'Submit batch to Credyx']}
              onClick={onSelectAi}
            />

            <MethodOption
              icon={<PenLine className="w-6 h-6" />}
              iconClassName="client-submit-docs__option-icon--manual"
              title="Manual batch"
              description="Enter invoice details yourself and attach documents for each load."
              steps={['Add invoices one at a time', 'Attach supporting docs', 'Submit when ready']}
              onClick={onSelectManual}
            />
          </div>

          <div className="client-submit-docs__hint">
            <FileStack className="w-4 h-4 shrink-0" style={{ color: c.mutedLight }} />
            <span>Accepted formats: PDF for AI upload · PDF or images for manual attachments</span>
          </div>
        </div>
      ) : (
        <div className="client-submit-docs__content">
          <SubmitDocsDraftNotice
            drafts={draftBatches}
            onResumeDraft={onResumeDraft}
            activeDraftBatchId={activeDraftBatchId}
            editing
          />
          {children}
        </div>
      )}
    </div>
  )
}
