import { BatchDocumentReviewResult } from '../types/documentReview'
import { ExcelMatchResult } from '../types/loadSheet'

const STORAGE_KEY = 'aidocview-load-history-v1'

export interface SavedLoadReview {
  id: string
  loadNumber?: string
  broker?: string
  amount?: number
  overallStatus: string
  fileNames: string[]
  excelFileName?: string
  reviewedAt: string
  result: BatchDocumentReviewResult
  excelMatch?: ExcelMatchResult
}

function readHistory(): SavedLoadReview[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedLoadReview[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeHistory(entries: SavedLoadReview[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, 100)))
}

export function getLoadHistory(): SavedLoadReview[] {
  return readHistory().sort(
    (a, b) => new Date(b.reviewedAt).getTime() - new Date(a.reviewedAt).getTime()
  )
}

export function saveLoadReview(input: {
  result: BatchDocumentReviewResult
  excelMatch?: ExcelMatchResult
  excelFileName?: string
  fileNames: string[]
}): SavedLoadReview {
  const entry: SavedLoadReview = {
    id: `load-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    loadNumber:
      input.result.auditSummary?.loadNumber ??
      input.excelMatch?.row.loadNumber ??
      input.result.crossValidation?.load_number.details,
    broker: input.result.auditSummary?.broker ?? input.excelMatch?.row.broker,
    amount: input.result.auditSummary?.amount ?? input.excelMatch?.row.amount,
    overallStatus:
      input.result.auditSummary?.overallStatus ??
      input.result.crossValidation?.overall ??
      'NEEDS_REVIEW',
    fileNames: input.fileNames,
    excelFileName: input.excelFileName,
    reviewedAt: input.result.reviewedAt,
    result: input.result,
    excelMatch: input.excelMatch,
  }

  const history = readHistory()
  history.unshift(entry)
  writeHistory(history)
  return entry
}

export function deleteLoadHistoryEntry(id: string): void {
  writeHistory(readHistory().filter((entry) => entry.id !== id))
}

export function clearLoadHistory(): void {
  localStorage.removeItem(STORAGE_KEY)
}
