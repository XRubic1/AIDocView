/** In-memory Doc Splitter / intake action log for admin batch debugging. */

export type BatchDocActionType =
  | 'hydrate'
  | 'page_split'
  | 'unpack'
  | 'skip_split'
  | 'dedupe'
  | 'strip_parent'
  | 'mark'
  | 'unmark'
  | 'sort_docs'
  | 'ai_sort'
  | 'continue'
  | 'note'

export type BatchDocAction = {
  id: string
  at: string
  type: BatchDocActionType
  title: string
  detail?: string
  docId?: string
  fileName?: string
}

const MAX_PER_BATCH = 500
const logs = new Map<string, BatchDocAction[]>()

function newId(): string {
  return `docact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Append one doc action for a batch (newest last). */
export function logBatchDocAction(
  batchId: string,
  entry: Omit<BatchDocAction, 'id' | 'at'> & { at?: string }
): BatchDocAction {
  const row: BatchDocAction = {
    id: newId(),
    at: entry.at ?? new Date().toISOString(),
    type: entry.type,
    title: entry.title,
    detail: entry.detail,
    docId: entry.docId,
    fileName: entry.fileName,
  }
  const list = logs.get(batchId) ?? []
  list.push(row)
  if (list.length > MAX_PER_BATCH) {
    logs.set(batchId, list.slice(-MAX_PER_BATCH))
  } else {
    logs.set(batchId, list)
  }
  return row
}

/** All actions for a batch (oldest first). */
export function getBatchDocActions(batchId: string): BatchDocAction[] {
  return [...(logs.get(batchId) ?? [])]
}

/** Clear actions (e.g. when deleting a batch). */
export function clearBatchDocActions(batchId: string): void {
  logs.delete(batchId)
}