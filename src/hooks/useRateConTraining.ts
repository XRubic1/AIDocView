import { useCallback, useState } from 'react'
import { getAnnotatableFields } from '../utils/annotatableFields'
import { DocumentReviewResult, ExtractedField, FieldRegionBox, PageClassification } from '../types/documentReview'
import {
  buildTrainingFields,
  confirmationsFromTraining,
  getSavedTrainingForFile,
  hintsFromTraining,
  overridesFromTraining,
  regionsFromTraining,
  saveDocumentTraining,
  type FieldConfirmation,
} from '../utils/aiTrainingStore'

/** Manages overrides, hints, region boxes, and persisted training for a document. */
export function useDocumentFieldTraining(documentId: string, fileName: string) {
  const [userOverrides, setUserOverrides] = useState<Record<string, string | number>>({})
  const [userHints, setUserHints] = useState<Record<string, string>>({})
  const [userRegions, setUserRegions] = useState<Record<string, FieldRegionBox>>({})
  const [userConfirmations, setUserConfirmations] = useState<Record<string, FieldConfirmation>>({})
  const [pageClassifications, setPageClassificationsState] = useState<PageClassification[]>([])
  const [activeFieldKey, setActiveFieldKey] = useState<string | null>(null)
  const [isTrainingSaved, setIsTrainingSaved] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const loadSavedForFile = useCallback(() => {
    const saved = getSavedTrainingForFile(fileName)
    if (!saved) return
    setUserOverrides(overridesFromTraining(saved))
    setUserHints(hintsFromTraining(saved))
    setUserRegions(regionsFromTraining(saved))
    setUserConfirmations(confirmationsFromTraining(saved))
    if (saved.pageClassifications?.length) {
      setPageClassificationsState(saved.pageClassifications)
    }
    setIsTrainingSaved(true)
    setSaveMessage('Loaded your previously saved training for this file.')
  }, [fileName])

  const markDirty = useCallback(() => {
    setIsTrainingSaved(false)
    setSaveMessage(null)
  }, [])

  const setPageClassifications = useCallback(
    (pages: PageClassification[]) => {
      setPageClassificationsState(pages)
      markDirty()
    },
    [markDirty]
  )

  const handleOverrideChange = useCallback(
    (fieldKey: string, value: string | number) => {
      setUserOverrides((prev) => ({ ...prev, [fieldKey]: value }))
      markDirty()
    },
    [markDirty]
  )

  const handleHintChange = useCallback(
    (fieldKey: string, hint: string) => {
      setUserHints((prev) => ({ ...prev, [fieldKey]: hint }))
      markDirty()
    },
    [markDirty]
  )

  const handleRegionChange = useCallback(
    (fieldKey: string, region: FieldRegionBox | null) => {
      setUserRegions((prev) => {
        const next = { ...prev }
        if (region) next[fieldKey] = region
        else delete next[fieldKey]
        return next
      })
      markDirty()
    },
    [markDirty]
  )

  const handleConfirmationChange = useCallback(
    (fieldKey: string, confirmation: FieldConfirmation | null) => {
      setUserConfirmations((prev) => {
        const next = { ...prev }
        if (confirmation) next[fieldKey] = confirmation
        else delete next[fieldKey]
        return next
      })
      markDirty()
    },
    [markDirty]
  )

  const saveTraining = useCallback(
    (aiResult: DocumentReviewResult) => {
      const annotatable = getAnnotatableFields(aiResult)
      const pagesToSave =
        pageClassifications.length > 0
          ? pageClassifications
          : aiResult.extraction.pageClassifications ?? []
      const hasPageCorrections = pagesToSave.some((page) => page.notes?.includes('User corrected'))

      if (annotatable.length === 0 && !hasPageCorrections) {
        setSaveMessage('No fields or page corrections to save.')
        return
      }

      const fieldMap = Object.fromEntries(
        annotatable.map((field) => [
          field.key,
          {
            value: field.aiValue,
            sourcePage: field.sourcePage,
            labelHint: field.labelHint,
            reasoning: field.reasoning,
          },
        ])
      )

      setIsSaving(true)
      try {
        const fields = buildTrainingFields(fieldMap, userOverrides, userHints, userRegions, userConfirmations)
        const pagesToSave =
          pageClassifications.length > 0
            ? pageClassifications
            : aiResult.extraction.pageClassifications
        const hasPageCorrections = pagesToSave?.some((page) => page.notes?.includes('User corrected'))

        if (fields.length === 0 && !hasPageCorrections) {
          setSaveMessage('Confirm a field, fix a page type, draw a box, or add a hint before saving.')
          setIsSaving(false)
          return
        }

        saveDocumentTraining({
          fileName,
          documentId,
          documentType: aiResult.extraction.documentType,
          broker: aiResult.extraction.rateConFields?.broker?.value,
          fields,
          pageClassifications: pagesToSave,
        })

        setIsTrainingSaved(true)
        const pageCount = hasPageCorrections ? pagesToSave?.length ?? 0 : 0
        setSaveMessage(
          pageCount > 0 && fields.length > 0
            ? `Saved ${fields.length} field(s) and page classification training.`
            : pageCount > 0
              ? 'Saved page classification training.'
              : `Saved ${fields.length} training item(s) including marked regions.`
        )
      } catch (error) {
        setSaveMessage(error instanceof Error ? error.message : 'Could not save training.')
      } finally {
        setIsSaving(false)
      }
    },
    [documentId, fileName, pageClassifications, userConfirmations, userHints, userOverrides, userRegions]
  )

  return {
    userOverrides,
    userHints,
    userRegions,
    userConfirmations,
    pageClassifications,
    setPageClassifications,
    activeFieldKey,
    setActiveFieldKey,
    isTrainingSaved,
    isSaving,
    saveMessage,
    loadSavedForFile,
    handleOverrideChange,
    handleHintChange,
    handleRegionChange,
    handleConfirmationChange,
    saveTraining,
  }
}

export function mergeFieldUpdate(
  aiResult: DocumentReviewResult,
  fieldKey: string,
  field: ExtractedField
): DocumentReviewResult {
  if (aiResult.extraction.rateConFields && fieldKey in aiResult.extraction.rateConFields) {
    const extraction = {
      ...aiResult.extraction,
      rateConFields: {
        ...aiResult.extraction.rateConFields,
        [fieldKey]: field,
      },
    }

    if (fieldKey === 'rate') {
      const rateNum =
        typeof field.value === 'number'
          ? field.value
          : Number(String(field.value ?? '').replace(/[$,\s]/g, ''))
      if (!Number.isNaN(rateNum) && extraction.rateConParse) {
        extraction.rateConParse = { ...extraction.rateConParse, rate_total: rateNum }
        extraction.rate = rateNum
      }
    }

    return { ...aiResult, extraction }
  }

  const extraction = { ...aiResult.extraction }
  const value = field.value
  const fieldMeta = {
    reasoning: field.reasoning,
    labelHint: field.labelHint,
    confidence: field.confidence,
    sourcePage: field.sourcePage,
    sourceRegion: field.sourceRegion,
  }

  switch (fieldKey) {
    case 'bol_shipFrom':
      extraction.shipFrom = value !== undefined ? String(value) : extraction.shipFrom
      extraction.origin = extraction.shipFrom
      break
    case 'bol_shipTo':
      extraction.shipTo = value !== undefined ? String(value) : extraction.shipTo
      extraction.destination = extraction.shipTo
      break
    case 'bol_receiverSignature':
      extraction.hasReceiverSignature =
        String(value).toLowerCase() === 'yes' || String(value).toLowerCase() === 'true'
      break
    case 'bol_receivingDate':
      extraction.receivingDate = value !== undefined ? String(value) : extraction.receivingDate
      break
    case 'bol_loadNumber':
      extraction.loadNumber = value !== undefined ? String(value) : extraction.loadNumber
      break
    default:
      break
  }

  if (fieldKey.startsWith('bol_')) {
    extraction.bolFieldMeta = {
      ...extraction.bolFieldMeta,
      [fieldKey]: {
        ...extraction.bolFieldMeta?.[fieldKey],
        ...fieldMeta,
      },
    }
  }

  return { ...aiResult, extraction }
}

/** @deprecated Use useDocumentFieldTraining */
export const useRateConTraining = useDocumentFieldTraining

/** @deprecated Use mergeFieldUpdate */
export function mergeRateConFieldUpdate(
  aiResult: DocumentReviewResult,
  fieldKey: string,
  field: ExtractedField
) {
  return mergeFieldUpdate(aiResult, fieldKey, field)
}
