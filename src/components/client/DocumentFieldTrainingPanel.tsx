import { Check, HelpCircle, MessageSquare, RefreshCw, Scan, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useToast } from '../ui/ToastProvider'
import { reExtractFieldWithGuidance } from '../../services/documentReviewService'
import {
  DocumentReviewResult,
  ExtractedField,
  FieldRegionBox,
  PageClassification,
} from '../../types/documentReview'
import {
  AnnotatableField,
  getAiFieldRegions,
  getAnnotatableFields,
  getFieldAiExplanation,
} from '../../utils/annotatableFields'
import type { FieldConfirmation } from '../../utils/aiTrainingStore'
import FieldRegionSelector from './FieldRegionSelector'
import PageClassificationTrainer, { PageClassificationEdit } from './PageClassificationTrainer'
import { SaveTrainingButton } from './SavedTrainingLibrary'
import { ff } from '../loadReview/factorfox/factorFoxTheme'

interface DocumentFieldTrainingPanelProps {
  result: DocumentReviewResult
  pageClassifications?: PageClassification[]
  onPagesChange?: (pages: PageClassification[], edits: PageClassificationEdit[]) => void
  userOverrides: Record<string, string | number>
  userHints: Record<string, string>
  userRegions: Record<string, FieldRegionBox>
  userConfirmations: Record<string, FieldConfirmation>
  activeFieldKey: string | null
  onActiveFieldChange: (fieldKey: string) => void
  onOverrideChange: (fieldKey: string, value: string | number) => void
  onHintChange: (fieldKey: string, hint: string) => void
  onRegionChange: (fieldKey: string, region: FieldRegionBox | null) => void
  onConfirmationChange: (fieldKey: string, confirmation: FieldConfirmation | null) => void
  onFieldUpdated: (fieldKey: string, field: ExtractedField) => void
  onSaveTraining: () => void
  isTrainingSaved?: boolean
  isSaving?: boolean
  saveMessage?: string | null
  variant?: 'light' | 'dark'
  engineLayout?: boolean
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100)
  const color = confidence >= 0.7 ? '#2E7D32' : confidence >= 0.5 ? '#0891b2' : '#991B1B'
  return (
    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: `${color}18`, color }}>
      {pct}%
    </span>
  )
}

export default function DocumentFieldTrainingPanel({
  result,
  pageClassifications = [],
  onPagesChange,
  userOverrides,
  userHints,
  userRegions,
  userConfirmations,
  activeFieldKey,
  onActiveFieldChange,
  onOverrideChange,
  onHintChange,
  onRegionChange,
  onConfirmationChange,
  onFieldUpdated,
  onSaveTraining,
  isTrainingSaved = false,
  isSaving = false,
  saveMessage,
  variant = 'light',
  engineLayout = false,
}: DocumentFieldTrainingPanelProps) {
  const { showToast } = useToast()
  const dark = variant === 'dark'
  const engine = engineLayout && dark
  const border = dark ? ff.border : '#0891b2'
  const panelBg = dark ? ff.bg2 : '#FFFBF0'
  const textPrimary = dark ? ff.text : '#113543'
  const textMuted = dark ? ff.textMuted : '#64748b'
  const accent = dark ? ff.accent : '#0891b2'
  const cardBg = dark ? ff.mainBg : '#FFFFFF'
  const cardBorder = (key: string, confirmation?: string) => {
    if (activeFieldKey === key) return dark ? ff.accentBorder : '#0891b2'
    if (confirmation === 'correct') return dark ? ff.greenBorder : '#2E7D32'
    if (confirmation === 'incorrect') return dark ? ff.redBorder : '#991B1B'
    return dark ? ff.border : '#64748b'
  }
  const annotatableFields = useMemo(() => getAnnotatableFields(result), [result])
  const aiRegions = useMemo(() => getAiFieldRegions(result), [result])
  const [reExtracting, setReExtracting] = useState<string | null>(null)
  const [expandedHelp, setExpandedHelp] = useState<Record<string, boolean>>({})

  const pageImages = result.debugLog.images ?? [result.debugLog.image]
  const fieldKeys = useMemo(() => {
    const keys = annotatableFields.map((field) => field.key)
    Object.keys(aiRegions).forEach((key) => {
      if (!keys.includes(key)) keys.push(key)
    })
    return keys
  }, [annotatableFields, aiRegions])

  const getSourcePageImage = (fieldKey: string) => {
    const meta = annotatableFields.find((field) => field.key === fieldKey)
    const region = userRegions[fieldKey] ?? aiRegions[fieldKey]
    const pageNumber = region?.pageNumber ?? meta?.sourcePage ?? pageImages[0]?.pageNumber
    return pageImages.find((img) => img.pageNumber === pageNumber) ?? pageImages[0]
  }

  const handleReadFromRegion = async (fieldKey: string) => {
    const region = userRegions[fieldKey] ?? aiRegions[fieldKey]
    const hint = userHints[fieldKey]?.trim()
    if (!region && !hint) return

    setReExtracting(fieldKey)
    try {
      const pageImage = getSourcePageImage(fieldKey)
      const { field, attempt } = await reExtractFieldWithGuidance(pageImage, fieldKey, {
        region,
        userHint: hint,
      })
      onFieldUpdated(fieldKey, field)
      if (field.value !== undefined) onOverrideChange(fieldKey, field.value)
      result.debugLog.attempts.push(attempt)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not read marked region', 'error')
    } finally {
      setReExtracting(null)
    }
  }

  const hasPendingChanges =
    pageClassifications.some((page) => page.notes?.includes('User corrected')) ||
    annotatableFields.some((item) => {
      const hint = userHints[item.key]?.trim()
      const region = userRegions[item.key]
      const confirmation = userConfirmations[item.key]
      const aiValue = item.aiValue
      const effective = userOverrides[item.key] ?? aiValue
      return Boolean(
        region ||
          hint ||
          confirmation ||
          String(effective ?? '') !== String(aiValue ?? '')
      )
    })

  if (annotatableFields.length === 0 && pageClassifications.length === 0) {
    return engine ? (
      <p className="engine-correct-empty">No fields to correct on this document.</p>
    ) : null
  }

  if (engine) {
    return (
      <div className="engine-correct-split-inner">
        <div className="engine-correct-doc-pane">
          <FieldRegionSelector
            images={pageImages}
            activeFieldKey={activeFieldKey}
            regions={userRegions}
            aiRegions={aiRegions}
            onActiveFieldChange={onActiveFieldChange}
            onRegionChange={onRegionChange}
            fieldKeys={fieldKeys}
            showFieldPicker={false}
            compact
          />
        </div>
        <div className="engine-correct-fields-pane">
          {pageClassifications.length > 0 && onPagesChange && (
            <PageClassificationTrainer
              pages={pageClassifications}
              variant={dark ? 'dark' : 'light'}
              onPagesChange={onPagesChange}
            />
          )}
          <div className="engine-correct-fields-head">
            <span>Fields</span>
            <SaveTrainingButton
              onSave={onSaveTraining}
              isSaving={isSaving}
              isSaved={isTrainingSaved}
              disabled={!hasPendingChanges && !isTrainingSaved}
            />
          </div>
          {saveMessage && <p className="engine-correct-save-msg">{saveMessage}</p>}
          <div className="engine-correct-fields-scroll">
            {annotatableFields.map((item) => (
              <EngineFieldRow
                key={item.key}
                item={item}
                activeFieldKey={activeFieldKey}
                userOverrides={userOverrides}
                userHints={userHints}
                userRegions={userRegions}
                userConfirmations={userConfirmations}
                aiRegions={aiRegions}
                reExtracting={reExtracting}
                onActiveFieldChange={onActiveFieldChange}
                onOverrideChange={onOverrideChange}
                onHintChange={onHintChange}
                onConfirmationChange={onConfirmationChange}
                onReadFromRegion={handleReadFromRegion}
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border p-3 space-y-3" style={{ borderColor: border, backgroundColor: panelBg }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4" style={{ color: accent }} />
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: textPrimary, fontFamily: dark ? ff.fontMono : undefined }}>
            Mark fields · edit values · save training
          </span>
        </div>
        <SaveTrainingButton
          onSave={onSaveTraining}
          isSaving={isSaving}
          isSaved={isTrainingSaved}
          disabled={!hasPendingChanges && !isTrainingSaved}
        />
      </div>

      {saveMessage && (
        <p
          className="text-xs rounded px-2 py-1.5"
          style={{
            backgroundColor: isTrainingSaved ? (dark ? ff.greenLight : '#E8F5E9') : dark ? ff.amberLight : '#FFF8E1',
            color: textPrimary,
          }}
        >
          {saveMessage}
        </p>
      )}

      <div className="flex flex-col lg:flex-row lg:items-start gap-4 w-full">
          <div className="w-full lg:flex-1 lg:min-w-0">
            <FieldRegionSelector
              images={pageImages}
              activeFieldKey={activeFieldKey}
              regions={userRegions}
              aiRegions={aiRegions}
              onActiveFieldChange={onActiveFieldChange}
              onRegionChange={onRegionChange}
              fieldKeys={fieldKeys}
              showFieldPicker={false}
            />
          </div>

          <div className="w-full lg:w-[300px] lg:flex-shrink-0 flex flex-col lg:max-h-[min(720px,70vh)]">
            <div
              className="text-xs font-semibold uppercase tracking-wide mb-2 px-1"
              style={{ color: textMuted, fontFamily: dark ? ff.fontMono : undefined }}
            >
              Fields to correct
            </div>
            <div className="space-y-3 overflow-y-auto pr-1 flex-1">
              {annotatableFields.map((item) => {
          const { key, label, aiValue, confidence } = item
          const aiExplanation = getFieldAiExplanation(item)
          const effectiveValue = userOverrides[key] ?? aiValue
          const displayValue = userOverrides[key] !== undefined ? String(userOverrides[key]) : String(aiValue ?? '')
          const showHelp = expandedHelp[key]
          const hasRegion = Boolean(userRegions[key])
          const hasAiRegion = Boolean(aiRegions[key])
          const confirmation = userConfirmations[key]
          const isRateField = key === 'rate'

          return (
            <div
              key={key}
              className="rounded border p-2 space-y-2"
              style={{
                borderColor: cardBorder(key, confirmation),
                backgroundColor: cardBg,
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onActiveFieldChange(key)}
                  className="flex-1 min-w-0 text-left"
                >
                  <span className="text-xs font-semibold block" style={{ color: textPrimary }}>
                    {label}
                  </span>
                  <span className="flex flex-wrap items-center gap-2 mt-1">
                    {hasRegion && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: '#E8F5E9', color: '#2E7D32' }}>
                        your box
                      </span>
                    )}
                    {!hasRegion && hasAiRegion && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: '#E3F2FD', color: '#1565C0' }}>
                        AI source
                      </span>
                    )}
                    {confidence !== undefined ? (
                      <ConfidenceBadge confidence={confidence} />
                    ) : null}
                  </span>
                </button>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    title="AI got it right"
                    aria-label={`Mark ${label} as correct`}
                    onClick={() =>
                      onConfirmationChange(key, confirmation === 'correct' ? null : 'correct')
                    }
                    className="p-1.5 rounded border transition-colors"
                    style={{
                      borderColor: confirmation === 'correct' ? '#2E7D32' : '#64748b',
                      backgroundColor: confirmation === 'correct' ? '#E8F5E9' : '#FFFFFF',
                      color: confirmation === 'correct' ? '#2E7D32' : '#64748b',
                    }}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    title="AI got it wrong"
                    aria-label={`Mark ${label} as wrong`}
                    onClick={() =>
                      onConfirmationChange(key, confirmation === 'incorrect' ? null : 'incorrect')
                    }
                    className="p-1.5 rounded border transition-colors"
                    style={{
                      borderColor: confirmation === 'incorrect' ? '#991B1B' : '#64748b',
                      backgroundColor: confirmation === 'incorrect' ? '#FEE2E2' : '#FFFFFF',
                      color: confirmation === 'incorrect' ? '#991B1B' : '#64748b',
                    }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <input
                type={isRateField ? 'number' : 'text'}
                value={displayValue}
                onChange={(e) => {
                  const val = isRateField ? Number(e.target.value) : e.target.value
                  onOverrideChange(key, val)
                }}
                placeholder={`Correct ${label.toLowerCase()}...`}
                className="w-full px-2 py-1.5 text-xs border rounded focus:outline-none focus:ring-2"
                style={{ borderColor: dark ? ff.borderLight : '#64748b', color: textPrimary, backgroundColor: dark ? ff.bg3 : undefined }}
              />

              <p
                className="text-[11px] leading-snug rounded px-2 py-1.5"
                style={{ backgroundColor: dark ? ff.bg3 : '#f8f9fa', color: textMuted }}
              >
                <span className="font-medium" style={{ color: textPrimary }}>
                  Why AI chose this:{' '}
                </span>
                {aiExplanation}
              </p>

              {effectiveValue !== undefined && String(effectiveValue) !== String(aiValue ?? '') && (
                <p className="text-[11px]" style={{ color: '#2E7D32' }}>
                  Corrected from AI: {String(aiValue ?? '—')} → {String(effectiveValue)}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onActiveFieldChange(key)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded border"
                  style={{ borderColor: dark ? ff.borderLight : '#113543', color: textPrimary }}
                >
                  <Scan className="w-3 h-3" />
                  Draw box
                </button>
                <button
                  type="button"
                  onClick={() => setExpandedHelp((prev) => ({ ...prev, [key]: !prev[key] }))}
                  className="inline-flex items-center gap-1 text-[11px] font-medium"
                  style={{ color: textPrimary }}
                >
                  <HelpCircle className="w-3.5 h-3.5" style={{ color: accent }} />
                  {showHelp ? 'Hide hint' : 'Add hint'}
                </button>
                <button
                  type="button"
                  onClick={() => handleReadFromRegion(key)}
                  disabled={(!hasRegion && !hasAiRegion && !userHints[key]?.trim()) || reExtracting === key}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-white rounded disabled:opacity-50"
                  style={{ backgroundColor: dark ? ff.accent : '#113543', color: dark ? ff.onPrimary : '#fff' }}
                >
                  <RefreshCw className={`w-3 h-3 ${reExtracting === key ? 'animate-spin' : ''}`} />
                  {reExtracting === key
                    ? 'Reading...'
                    : hasRegion || hasAiRegion
                      ? 'Read boxed area'
                      : 'Send hint to AI'}
                </button>
              </div>

              {showHelp && (
                <textarea
                  value={userHints[key] ?? ''}
                  onChange={(e) => onHintChange(key, e.target.value)}
                  placeholder='Optional note, e.g. "Carrier is under the Carrier label"'
                  rows={2}
                  className="w-full px-2 py-1.5 text-xs border rounded resize-none focus:outline-none"
                  style={{ borderColor: dark ? ff.borderLight : '#64748b', backgroundColor: dark ? ff.bg3 : undefined, color: textPrimary }}
                />
              )}
            </div>
          )
              })}
            </div>
          </div>
      </div>
    </div>
  )
}

interface EngineFieldRowProps {
  item: AnnotatableField
  activeFieldKey: string | null
  userOverrides: Record<string, string | number>
  userHints: Record<string, string>
  userRegions: Record<string, FieldRegionBox>
  userConfirmations: Record<string, FieldConfirmation>
  aiRegions: Record<string, FieldRegionBox>
  reExtracting: string | null
  onActiveFieldChange: (key: string) => void
  onOverrideChange: (key: string, value: string | number) => void
  onHintChange: (key: string, hint: string) => void
  onConfirmationChange: (key: string, c: FieldConfirmation | null) => void
  onReadFromRegion: (key: string) => void
}

/** Compact field row for engine Correct AI panel. */
function EngineFieldRow({
  item,
  activeFieldKey,
  userOverrides,
  userHints,
  userRegions,
  userConfirmations,
  aiRegions,
  reExtracting,
  onActiveFieldChange,
  onOverrideChange,
  onHintChange,
  onConfirmationChange,
  onReadFromRegion,
}: EngineFieldRowProps) {
  const { key, label, aiValue } = item
  const displayValue =
    userOverrides[key] !== undefined ? String(userOverrides[key]) : String(aiValue ?? '')
  const active = activeFieldKey === key
  const confirmation = userConfirmations[key]
  const hasRegion = Boolean(userRegions[key] || aiRegions[key])

  const hint = userHints[key] ?? ''
  const showHint = active || hint.length > 0

  return (
    <div className={`engine-correct-field ${active ? 'active' : ''}`}>
      <div className="engine-correct-field-row">
        <button
          type="button"
          className="engine-correct-field-label"
          onClick={() => onActiveFieldChange(key)}
          title={label}
        >
          {label.length > 10 ? `${label.slice(0, 9)}…` : label}
          {hasRegion ? <span className="engine-correct-tag">▣</span> : null}
        </button>
        <input
          type="text"
          className="engine-correct-field-input"
          value={displayValue}
          onChange={(e) => onOverrideChange(key, e.target.value)}
          onFocus={() => onActiveFieldChange(key)}
          placeholder="Value"
        />
        <div className="engine-correct-field-actions">
          <button
            type="button"
            className={confirmation === 'correct' ? 'on' : ''}
            title="AI correct"
            onClick={() => onConfirmationChange(key, confirmation === 'correct' ? null : 'correct')}
          >
            ✓
          </button>
          <button
            type="button"
            className={confirmation === 'incorrect' ? 'on bad' : ''}
            title="AI wrong"
            onClick={() => onConfirmationChange(key, confirmation === 'incorrect' ? null : 'incorrect')}
          >
            ✗
          </button>
          <button
            type="button"
            className="read"
            onClick={() => onReadFromRegion(key)}
            disabled={reExtracting === key}
            title="Re-read region"
          >
            {reExtracting === key ? '…' : '↻'}
          </button>
        </div>
      </div>
      {showHint && (
        <input
          type="text"
          className="engine-correct-hint-input"
          value={hint}
          onChange={(e) => onHintChange(key, e.target.value)}
          onFocus={() => onActiveFieldChange(key)}
          placeholder="Hint"
        />
      )}
    </div>
  )
}

/** @deprecated Use DocumentFieldTrainingPanel */
export { DocumentFieldTrainingPanel as RateConFieldEditor }
