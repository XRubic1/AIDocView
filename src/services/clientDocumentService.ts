import { mockClientDocuments } from '../data/mockClientDocuments'
import {
  ClientDocument,
  ClientDocumentCategory,
  ClientDocumentUploadInput,
} from '../types/clientDocument'

/** In-memory file blobs for uploads in the current session. */
const fileStore = new Map<string, File>()

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

/** Retrieve an uploaded file blob when available. */
export function getClientDocumentFile(documentId: string): File | undefined {
  return fileStore.get(documentId)
}

/** Add a document to the vault and store its file in memory. */
export function addClientDocument(
  clientId: string,
  input: ClientDocumentUploadInput
): ClientDocument {
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

  mockClientDocuments.unshift(doc)
  fileStore.set(doc.id, input.file)
  return doc
}

/** Remove a document from the vault. */
export function removeClientDocument(documentId: string): boolean {
  const index = mockClientDocuments.findIndex((d) => d.id === documentId)
  if (index === -1) return false
  mockClientDocuments.splice(index, 1)
  fileStore.delete(documentId)
  return true
}

/** Update document name or expiration reminder. */
export function updateClientDocument(
  documentId: string,
  patch: Partial<Pick<ClientDocument, 'name' | 'expires_at' | 'category'>>
): ClientDocument | undefined {
  const doc = mockClientDocuments.find((d) => d.id === documentId)
  if (!doc) return undefined
  Object.assign(doc, patch)
  return doc
}
