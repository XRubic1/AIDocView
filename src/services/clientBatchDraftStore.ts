import type {
  AiDraftSnapshot,
  ClientBatchDraftRecord,
  ManualDraftSnapshot,
} from '../types/clientBatchDraft'

const DB_NAME = 'credyx-client-batch-drafts'
const DB_VERSION = 1
const META_STORE = 'draft-meta'
const FILE_STORE = 'draft-files'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error ?? new Error('Could not open draft storage'))
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'batchId' })
      }
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        db.createObjectStore(FILE_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Draft storage transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('Draft storage transaction aborted'))
  })
}

async function putFile(key: string, file: File): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(FILE_STORE, 'readwrite')
  tx.objectStore(FILE_STORE).put(file, key)
  await txDone(tx)
  db.close()
}

async function getFile(key: string): Promise<File | null> {
  const db = await openDb()
  const tx = db.transaction(FILE_STORE, 'readonly')
  const request = tx.objectStore(FILE_STORE).get(key)
  const file = await new Promise<File | undefined>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as File | undefined)
    request.onerror = () => reject(request.error)
  })
  await txDone(tx)
  db.close()
  return file ?? null
}

async function deleteFilesWithPrefix(prefix: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(FILE_STORE, 'readwrite')
  const store = tx.objectStore(FILE_STORE)
  const request = store.getAllKeys()
  const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  keys.forEach((key) => {
    if (String(key).startsWith(prefix)) {
      store.delete(key)
    }
  })
  await txDone(tx)
  db.close()
}

/** Persist draft metadata and associated files. */
export async function saveDraftRecord(
  record: ClientBatchDraftRecord,
  files: Map<string, File>
): Promise<void> {
  await deleteFilesWithPrefix(`${record.batchId}::`)
  for (const [key, file] of files.entries()) {
    await putFile(key, file)
  }

  const db = await openDb()
  const tx = db.transaction(META_STORE, 'readwrite')
  tx.objectStore(META_STORE).put(record)
  await txDone(tx)
  db.close()
}

export async function loadDraftRecord(batchId: string): Promise<ClientBatchDraftRecord | null> {
  const db = await openDb()
  const tx = db.transaction(META_STORE, 'readonly')
  const request = tx.objectStore(META_STORE).get(batchId)
  const record = await new Promise<ClientBatchDraftRecord | undefined>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as ClientBatchDraftRecord | undefined)
    request.onerror = () => reject(request.error)
  })
  await txDone(tx)
  db.close()
  return record ?? null
}

export async function loadDraftFile(key: string): Promise<File | null> {
  return getFile(key)
}

export async function deleteDraftRecord(batchId: string): Promise<void> {
  await deleteFilesWithPrefix(`${batchId}::`)
  const db = await openDb()
  const tx = db.transaction(META_STORE, 'readwrite')
  tx.objectStore(META_STORE).delete(batchId)
  await txDone(tx)
  db.close()
}

export async function listDraftRecordsForClient(clientId: string): Promise<ClientBatchDraftRecord[]> {
  const db = await openDb()
  const tx = db.transaction(META_STORE, 'readonly')
  const request = tx.objectStore(META_STORE).getAll()
  const records = await new Promise<ClientBatchDraftRecord[]>((resolve, reject) => {
    request.onsuccess = () => resolve((request.result as ClientBatchDraftRecord[]) ?? [])
    request.onerror = () => reject(request.error)
  })
  await txDone(tx)
  db.close()
  return records.filter((record) => record.clientId === clientId)
}

export function draftFileKey(batchId: string, suffix: string): string {
  return `${batchId}::${suffix}`
}

export type { AiDraftSnapshot, ManualDraftSnapshot }
