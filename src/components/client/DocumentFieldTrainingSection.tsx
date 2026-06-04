import { useEffect } from 'react'
import DocumentFieldTrainingPanel from './DocumentFieldTrainingPanel'
import { mergeFieldUpdate, useDocumentFieldTraining } from '../../hooks/useRateConTraining'
import { DocumentReviewResult, ExtractedField, PageClassification } from '../../types/documentReview'
import { getAnnotatableFields } from '../../utils/annotatableFields'
import { applyPageClassificationCorrections } from '../../utils/applyPageClassificationCorrections'
import type { PageClassificationEdit } from './PageClassificationTrainer'

interface DocumentFieldTrainingSectionProps {
  documentId: string
  fileName: string
  aiResult: DocumentReviewResult
  onAiResultChange: (result: DocumentReviewResult) => void
  onTrainingSaved?: () => void
  variant?: 'light' | 'dark'
  /** Workbench split layout — fills panel height without outer scroll. */
  engineLayout?: boolean
}

/** Field training UI with region drawing, hints, and local persistence. */
export default function DocumentFieldTrainingSection({
  documentId,
  fileName,
  aiResult,
  onAiResultChange,
  onTrainingSaved,
  variant = 'light',
  engineLayout = false,
}: DocumentFieldTrainingSectionProps) {
  const training = useDocumentFieldTraining(documentId, fileName)

  useEffect(() => {
    training.loadSavedForFile()
  }, [fileName])

  const annotatable = getAnnotatableFields(aiResult)
  const pageClassifications = aiResult.extraction.pageClassifications ?? []

  const handlePagesChange = (pages: PageClassification[], _edits: PageClassificationEdit[]) => {
    training.setPageClassifications(pages)
    onAiResultChange(applyPageClassificationCorrections(aiResult, pages))
  }

  if (annotatable.length === 0 && pageClassifications.length === 0) return null

  const handleFieldUpdated = (fieldKey: string, field: ExtractedField) => {
    onAiResultChange(mergeFieldUpdate(aiResult, fieldKey, field))
    if (field.value !== undefined) training.handleOverrideChange(fieldKey, field.value)
  }

  return (
    <DocumentFieldTrainingPanel
      result={aiResult}
      pageClassifications={pageClassifications}
      onPagesChange={handlePagesChange}
      userOverrides={training.userOverrides}
      userHints={training.userHints}
      userRegions={training.userRegions}
      userConfirmations={training.userConfirmations}
      activeFieldKey={training.activeFieldKey}
      onActiveFieldChange={training.setActiveFieldKey}
      onOverrideChange={training.handleOverrideChange}
      onHintChange={training.handleHintChange}
      onRegionChange={training.handleRegionChange}
      onConfirmationChange={training.handleConfirmationChange}
      onFieldUpdated={handleFieldUpdated}
      onSaveTraining={() => {
        training.saveTraining(aiResult)
        onTrainingSaved?.()
      }}
      isTrainingSaved={training.isTrainingSaved}
      isSaving={training.isSaving}
      saveMessage={training.saveMessage}
      variant={variant}
      engineLayout={engineLayout}
    />
  )
}

/** @deprecated Use DocumentFieldTrainingSection */
export { DocumentFieldTrainingSection as RateConTrainingSection }
