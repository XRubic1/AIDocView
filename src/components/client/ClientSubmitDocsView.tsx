import { ChevronLeft, ChevronRight, Sparkles, PenLine, Upload, FileStack, Check, FilePenLine, Trash2 } from 'lucide-react'
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
  onDeleteDraft?: (batchId: string) => void
  activeDraftBatchId?: string | null
  children?: ReactNode
}

const MODE_LABELS: Record<Exclude<SubmitDocsMode, 'choose'>, string> = {
  ai: 'AI upload',
  manual: 'Manual batch',
}

interface MethodOptionProps {
  featured?: boolean
  wip?: boolean
  icon: ReactNode
  iconClassName?: string
  title: string
  badge?: string
  badgeVariant?: 'recommended' | 'wip'
  description: string
  steps: string[]
  ctaLabel?: string
  onClick: () => void
}

function MethodOption({
  featured,
  wip,
  icon,
  iconClassName,
  title,
  badge,
  badgeVariant = 'recommended',
  description,
  steps,
  ctaLabel = 'Get started',
  onClick,
}: MethodOptionProps) {
  return (
    <button
      type="button"
      className={`client-submit-docs__option${featured ? ' client-submit-docs__option--featured' : ''}${wip ? ' client-submit-docs__option--wip' : ''}`}
      onClick={onClick}
    >
      <div className="client-submit-docs__option-top">
        <div className={`client-submit-docs__option-icon${iconClassName ? ` ${iconClassName}` : ''}`}>
          {icon}
        </div>
        {badge && (
          <span
            className={`client-submit-docs__option-badge${badgeVariant === 'wip' ? ' client-submit-docs__option-badge--wip' : ''}`}
          >
            {badge}
          </span>
        )}
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
        {ctaLabel}
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
  onDeleteDraft,
  activeDraftBatchId,
  editing = false,
}: {
  drafts: SubmitDocsDraftBatch[]
  onResumeDraft?: (batchId: string) => void
  onDeleteDraft?: (batchId: string) => void
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
            <div className="client-submit-docs__draft-row-actions">
              <button
                type="button"
                className="client-submit-docs__draft-row-btn"
                onClick={() => onResumeDraft?.(draft.id)}
              >
                Continue
              </button>
              {onDeleteDraft && (
                <button
                  type="button"
                  className="client-submit-docs__draft-row-delete"
                  onClick={() => onDeleteDraft(draft.id)}
                  title="Delete draft"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
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
  onDeleteDraft,
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
            onDeleteDraft={onDeleteDraft}
            activeDraftBatchId={activeDraftBatchId}
          />

          <div className="client-submit-docs__options">
            <MethodOption
              featured
              icon={<PenLine className="w-6 h-6" />}
              iconClassName="client-submit-docs__option-icon--manual"
              title="Manual batch"
              badge="Recommended"
              description="Enter invoice details yourself and attach documents for each load. Best for day-to-day submissions."
              steps={['Add invoices one at a time', 'Attach supporting docs', 'Submit when ready']}
              onClick={onSelectManual}
            />

            <MethodOption
              wip
              icon={<Sparkles className="w-6 h-6" />}
              iconClassName="client-submit-docs__option-icon--ai"
              title="AI upload"
              badge="WIP"
              badgeVariant="wip"
              description="Bulk PDF sorting and auto-drafted invoices. This workflow is still in preview — use manual batch for production loads."
              steps={['Drop rate cons & BOLs', 'Review drafted invoices', 'Submit batch to Credyx']}
              ctaLabel="Try preview"
              onClick={onSelectAi}
            />
          </div>

          <div className="client-submit-docs__hint">
            <FileStack className="w-4 h-4 shrink-0" style={{ color: c.mutedLight }} />
            <span>
              Recommended: manual batch · AI upload is work in progress · PDF or images for manual
              attachments
            </span>
          </div>
        </div>
      ) : (
        <div className="client-submit-docs__content">
          {mode !== 'manual' && (
            <SubmitDocsDraftNotice
              drafts={draftBatches}
              onResumeDraft={onResumeDraft}
              activeDraftBatchId={activeDraftBatchId}
              editing
            />
          )}
          {children}
        </div>
      )}
    </div>
  )
}
