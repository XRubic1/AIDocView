import { DocumentType, FieldRegionBox, PageClassification, UserFieldCorrection } from '../types/documentReview'

const STORAGE_KEY = 'credyx-ai-document-training-v2'

/** Persisted training record for one reviewed document. */
export interface SavedDocumentTraining {
  id: string
  fileName: string
  documentId?: string
  documentType: DocumentType
  broker?: string
  fields: UserFieldCorrection[]
  pageClassifications?: PageClassification[]
  savedAt: string
  updatedAt: string
}

function readStore(): SavedDocumentTraining[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedDocumentTraining[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeStore(records: SavedDocumentTraining[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

/** All saved training records, newest first. */
export function getAllSavedTraining(): SavedDocumentTraining[] {
  return readStore().sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
}

/** Find the latest saved training for a file name. */
export function getSavedTrainingForFile(fileName: string): SavedDocumentTraining | undefined {
  return getAllSavedTraining().find((record) => record.fileName === fileName)
}

/** Save or update training for a document. */
export function saveDocumentTraining(input: {
  fileName: string
  documentId?: string
  documentType: DocumentType
  broker?: string
  fields: UserFieldCorrection[]
  pageClassifications?: PageClassification[]
}): SavedDocumentTraining {
  const now = new Date().toISOString()
  const existing = readStore()
  const matchIndex = existing.findIndex(
    (record) =>
      (input.documentId && record.documentId === input.documentId) ||
      record.fileName === input.fileName
  )

  const record: SavedDocumentTraining = {
    id:
      matchIndex >= 0
        ? existing[matchIndex].id
        : `training-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    fileName: input.fileName,
    documentId: input.documentId,
    documentType: input.documentType,
    broker: input.broker,
    fields: input.fields,
    pageClassifications: input.pageClassifications,
    savedAt: matchIndex >= 0 ? existing[matchIndex].savedAt : now,
    updatedAt: now,
  }

  if (matchIndex >= 0) {
    existing[matchIndex] = record
  } else {
    existing.unshift(record)
  }

  writeStore(existing)
  return record
}

/** Remove one saved training record. */
export function deleteSavedTraining(id: string): void {
  writeStore(readStore().filter((record) => record.id !== id))
}

/** Export all training as JSON for ML pipelines. */
export function exportTrainingAsJson(): string {
  return JSON.stringify(getAllSavedTraining(), null, 2)
}

/** Download training JSON as a file. */
export function downloadTrainingExport(): void {
  const blob = new Blob([exportTrainingAsJson()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `credyx-ai-training-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

/** Build field overrides map from a saved training record. */
export function overridesFromTraining(
  record: SavedDocumentTraining
): Record<string, string | number> {
  const overrides: Record<string, string | number> = {}
  record.fields.forEach((field) => {
    overrides[field.fieldKey] = field.correctedValue
  })
  return overrides
}

/** Build hints map from a saved training record. */
export function hintsFromTraining(record: SavedDocumentTraining): Record<string, string> {
  const hints: Record<string, string> = {}
  record.fields.forEach((field) => {
    if (field.userHint) hints[field.fieldKey] = field.userHint
  })
  return hints
}

/** Build region boxes from a saved training record. */
export function regionsFromTraining(record: SavedDocumentTraining): Record<string, FieldRegionBox> {
  const regions: Record<string, FieldRegionBox> = {}
  record.fields.forEach((field) => {
    if (field.region) regions[field.fieldKey] = field.region
  })
  return regions
}

export type FieldConfirmation = 'correct' | 'incorrect'

/** Build per-field AI correct/incorrect marks from a saved training record. */
export function confirmationsFromTraining(
  record: SavedDocumentTraining
): Record<string, FieldConfirmation> {
  const confirmations: Record<string, FieldConfirmation> = {}
  record.fields.forEach((field) => {
    if (field.aiCorrect === true) confirmations[field.fieldKey] = 'correct'
    else if (field.aiCorrect === false) confirmations[field.fieldKey] = 'incorrect'
  })
  return confirmations
}

/** Merge AI values into correction entries for save. */
export function buildTrainingFields(
  annotatableFields: Record<string, { value?: string | number | boolean; labelHint?: string; reasoning?: string; sourcePage?: number } | undefined>,
  overrides: Record<string, string | number>,
  hints: Record<string, string>,
  regions: Record<string, FieldRegionBox>,
  confirmations: Record<string, FieldConfirmation> = {}
): UserFieldCorrection[] {
  const keys = new Set([
    ...Object.keys(annotatableFields),
    ...Object.keys(overrides),
    ...Object.keys(hints),
    ...Object.keys(regions),
    ...Object.keys(confirmations),
  ])

  const fields: UserFieldCorrection[] = []
  keys.forEach((fieldKey) => {
    const aiField = annotatableFields[fieldKey]
    const aiValue = aiField?.value
    const correctedValue = overrides[fieldKey]
    const userHint = hints[fieldKey]
    const region = regions[fieldKey]
    const confirmation = confirmations[fieldKey]

    const hasCorrection =
      correctedValue !== undefined &&
      correctedValue !== '' &&
      String(correctedValue) !== String(aiValue ?? '')
    const hasHint = Boolean(userHint?.trim())
    const hasRegion = Boolean(region)
    const hasConfirmation = confirmation !== undefined

    if (!hasCorrection && !hasHint && !hasRegion && !hasConfirmation) return

    const normalizedAiValue =
      typeof aiValue === 'boolean' ? (aiValue ? 'Yes' : 'No') : aiValue
    const normalizedCorrectedValue =
      correctedValue ??
      normalizedAiValue ??
      ''

    fields.push({
      fieldKey,
      aiValue: normalizedAiValue,
      correctedValue: normalizedCorrectedValue,
      aiCorrect:
        confirmation === 'correct' ? true : confirmation === 'incorrect' ? false : undefined,
      userHint: userHint?.trim() || undefined,
      labelHint: aiField?.labelHint,
      reasoning: aiField?.reasoning,
      sourcePage: aiField?.sourcePage ?? region?.pageNumber,
      region,
      correctedAt: new Date().toISOString(),
    })
  })

  return fields
}

export function getTrainingCount(): number {
  return readStore().length
}
