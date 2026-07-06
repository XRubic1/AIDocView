import { getSupabase, isSupabaseConfigured } from '../lib/supabase'
import { mockClientDocuments } from '../data/mockClientDocuments'
import {
  deleteClientDocumentFromDb,
  downloadClientDocumentFile,
  persistClientDocument,
  uploadClientDocumentFile,
} from './supabase/tenantPersist'
import {
  ClientDocument,
  ClientDocumentCategory,
  ClientDocumentUploadInput,
} from '../types/clientDocument'

/** In-memory file blobs for uploads in the current session. */
const fileStore = new Map<string, File>()
const storagePathByDocId = new Map<string, string>()

export const CLIENT_DOCUMENT_TYPE_OPTIONS: Record<
  ClientDocumentCategory,
  { value: string; label: string }[]
> = {
  broker: [
    { value: 'noa', label: 'Notice of Assignment (NOA)' },
    { value: 'letter_of_release', label: 'Letter of Release' },
    { value: 'broker_authorization', label: 'Broker Authorization' },
    { value: 'broker_packet', label: 'Broker Packet / Cover Sheet' },
    { value: 'other_broker', label: 'Other Broker Document' },
  ],
  compliance: [
    { value: 'w9', label: 'W-9 Tax Form' },
    { value: 'coi', label: 'Certificate of Insurance (COI)' },
    { value: 'mc_authority', label: 'MC Authority' },
    { value: 'dot_registration', label: 'DOT Registration' },
    { value: 'other_compliance', label: 'Other Compliance Document' },
  ],
  other: [
    { value: 'general', label: 'General Document' },
    { value: 'other', label: 'Other' },
  ],
}

export const CLIENT_DOCUMENT_CATEGORY_LABELS: Record<ClientDocumentCategory, string> = {
  broker: 'Broker docs',
  compliance: 'Compliance',
  other: 'Other',
}

/** Resolve a friendly label for a stored document type value. */
export function getClientDocumentTypeLabel(
  category: ClientDocumentCategory,
  documentType: string
): string {
  const match = CLIENT_DOCUMENT_TYPE_OPTIONS[category]?.find((o) => o.value === documentType)
  return match?.label || documentType
}

/** List vault documents for a client. */
export function getClientDocuments(clientId: string): ClientDocument[] {
  return mockClientDocuments
    .filter((doc) => doc.client_id === clientId)
    .sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())
}

/** Retrieve an uploaded file blob when available (session cache or Supabase storage). */
export async function getClientDocumentFile(documentId: string): Promise<File | undefined> {
  const cached = fileStore.get(documentId)
  if (cached) return cached

  const doc = mockClientDocuments.find((d) => d.id === documentId)
  const storagePath = storagePathByDocId.get(documentId)
  if (!doc || !storagePath || !isSupabaseConfigured()) return undefined

  const file = await downloadClientDocumentFile(storagePath, doc.file_name, doc.mime_type)
  if (file) fileStore.set(documentId, file)
  return file ?? undefined
}

/** Synchronous session-only file lookup. */
export function getClientDocumentFileSync(documentId: string): File | undefined {
  return fileStore.get(documentId)
}

/** Add a document to the vault; uploads to Supabase storage when configured. */
export async function addClientDocument(
  clientId: string,
  input: ClientDocumentUploadInput
): Promise<ClientDocument> {
  const doc: ClientDocument = {
    id: `cdoc-${Date.now()}`,
    client_id: clientId,
    name: input.name.trim() || input.file.name,
    file_name: input.file.name,
    category: input.category,
    document_type: input.document_type,
    notes: input.notes?.trim() || undefined,
    size: input.file.size,
    mime_type: input.file.type || 'application/octet-stream',
    uploaded_at: new Date().toISOString(),
    uploaded_by: input.uploaded_by,
    expires_at: input.expires_at || undefined,
  }

  let storagePath: string | null = null
  if (isSupabaseConfigured()) {
    storagePath = await uploadClientDocumentFile(clientId, doc.id, input.file)
    storagePathByDocId.set(doc.id, storagePath)
  }

  mockClientDocuments.unshift(doc)
  fileStore.set(doc.id, input.file)
  await persistClientDocument(doc, storagePath).catch(console.error)
  return doc
}

/** Remove a document from the vault. */
export async function removeClientDocument(documentId: string): Promise<boolean> {
  const doc = mockClientDocuments.find((d) => d.id === documentId)
  const index = mockClientDocuments.findIndex((d) => d.id === documentId)
  if (index === -1) return false
  mockClientDocuments.splice(index, 1)
  fileStore.delete(documentId)

  const storagePath = storagePathByDocId.get(documentId)
  if (storagePath && isSupabaseConfigured()) {
    const supabase = getSupabase()
    await supabase?.storage.from('client-documents').remove([storagePath])
    storagePathByDocId.delete(documentId)
  }

  if (doc) {
    await deleteClientDocumentFromDb(documentId, doc.client_id).catch(console.error)
  }
  return true
}

/** Update document name or expiration reminder. */
export async function updateClientDocument(
  documentId: string,
  patch: Partial<Pick<ClientDocument, 'name' | 'expires_at' | 'category'>>
): Promise<ClientDocument | undefined> {
  const doc = mockClientDocuments.find((d) => d.id === documentId)
  if (!doc) return undefined
  Object.assign(doc, patch)
  const storagePath = storagePathByDocId.get(documentId) ?? null
  await persistClientDocument(doc, storagePath).catch(console.error)
  return doc
}

/** Register storage paths after hydration from Supabase. */
export function registerClientDocumentStoragePath(documentId: string, path: string): void {
  storagePathByDocId.set(documentId, path)
}
