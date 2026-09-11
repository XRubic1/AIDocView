import { ChevronLeft, ChevronRight, Sparkles, PenLine, FileStack, Check, FilePenLine, Trash2 } from 'lucide-react'
import { ReactNode } from 'react'
import { formatCurrency } from '../../utils/format'
import { useClientTheme } from '../../theme/ThemeContext'

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
  ai: 'Paperwork',
  manual: 'Typed invoices',
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
              <Check className="client-submit-docs__step-check" aria-hidden />
              <span>{step}</span>
            </li>
          ))}
        </ul>
      </div>

      <span className="client-submit-docs__option-cta">
        {ctaLabel}
        <ChevronRight className="w-4 h-4" aria-hidden />
      </span>
    </button>
  )
}

function draftModeLabel(uploadMode?: string) {
  return uploadMode === 'manual' ? 'Typed' : 'Paperwork'
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
  const c = useClientTheme()
  if (drafts.length === 0) return null

  const visibleDrafts = editing
    ? drafts.filter((d) => d.id === activeDraftBatchId).slice(0, 1)
    : drafts

  if (visibleDrafts.length === 0) return null

  return (
    <div className="client-submit-docs__draft-notice" role="status">
      {visibleDrafts.map((draft) => (
        <div key={draft.id} className="client-submit-docs__draft-row">
          <FilePenLine className="w-3.5 h-3.5 shrink-0" style={{ color: c.warning }} aria-hidden />
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
  const c = useClientTheme()
  return (
    <div className="client-submit-docs" data-onboard-target="submitPanel">
      <div className="client-submit-docs__toolbar">
        {mode === 'choose' ? (
          <button type="button" onClick={onBackToBatches} className="client-submit-docs__back">
            <ChevronLeft className="w-4 h-4" />
            All batches
          </button>
        ) : (
          <button type="button" onClick={onBackToChoose} className="client-submit-docs__back">
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
        )}

        {mode !== 'choose' && (
          <span className="client-submit-docs__step">{MODE_LABELS[mode]}</span>
        )}
      </div>

      {mode === 'choose' ? (
        <div className="client-submit-docs__choose" data-onboard-target="submitDropzone">
          <SubmitDocsDraftNotice
            drafts={draftBatches}
            onResumeDraft={onResumeDraft}
            onDeleteDraft={onDeleteDraft}
            activeDraftBatchId={activeDraftBatchId}
          />

          <div className="client-submit-docs__options">
            <MethodOption
              featured
              icon={<Sparkles className="w-5 h-5" />}
              iconClassName="client-submit-docs__option-icon--ai"
              title="Drop paperwork"
              badge="Recommended"
              description="We read load #, broker, and rate from your PDFs and photos and draft the invoices."
              steps={[
                'Drop rate cons, BOLs, and invoices (PDF, JPG, or PNG)',
                'Add every page, then process',
                'Review drafts next to the docs',
              ]}
              ctaLabel="Start with PDFs"
              onClick={onSelectAi}
            />

            <MethodOption
              icon={<PenLine className="w-5 h-5" />}
              iconClassName="client-submit-docs__option-icon--manual"
              title="Type invoices"
              description="Enter load details yourself and attach docs one invoice at a time."
              steps={['Add invoices one at a time', 'Attach supporting docs', 'Submit when ready']}
              ctaLabel="Enter manually"
              onClick={onSelectManual}
            />
          </div>

          <div className="client-submit-docs__hint">
            <FileStack className="w-3.5 h-3.5 shrink-0" style={{ color: c.mutedLight }} aria-hidden />
            <span>PDF, JPG, or PNG for paperwork · images also OK as attachments on a typed invoice</span>
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
