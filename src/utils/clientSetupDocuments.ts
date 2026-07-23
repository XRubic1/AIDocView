import { getClientDocuments, getDocumentTypeLabelAny } from '../services/clientDocumentService'
import type { Client } from '../types/client'
import type { ClientDocument, ClientDocumentApprovalStatus } from '../types/clientDocument'

/** Always-required compliance types for carrier setup with Credyx. */
export const REQUIRED_COMPLIANCE_DOC_TYPES = [
  'w9',
  'coi',
  'mc_authority',
  'dot_registration',
] as const

/** Bank proof — either type satisfies the requirement. */
export const BANK_PROOF_SETUP_TYPES = ['voided_check', 'bank_letter'] as const

export const NOA_DOC_TYPE = 'noa'

export type SetupDocRequirementKey =
  | (typeof REQUIRED_COMPLIANCE_DOC_TYPES)[number]
  | 'bank_proof'
  | typeof NOA_DOC_TYPE

export type SetupChecklistItemStatus = 'missing' | ClientDocumentApprovalStatus

export interface SetupChecklistItem {
  key: SetupDocRequirementKey
  /** Primary document_type to match, or 'bank_proof' for either/or. */
  documentTypes: string[]
  label: string
  status: SetupChecklistItemStatus
  /** Best matching vault doc for this requirement, if any. */
  document?: ClientDocument
}

export class ClientSetupIncompleteError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ClientSetupIncompleteError'
  }
}

/** Labels for setup requirement keys. */
export function getSetupRequirementLabel(key: SetupDocRequirementKey): string {
  if (key === 'bank_proof') return 'Voided check or bank letter'
  return getDocumentTypeLabelAny(key)
}

/**
 * Required vault document types for a carrier to start sending invoices.
 * Factoring clients must also have an approved NOA.
 */
export function getRequiredSetupTypes(client: Pick<Client, 'factoring'> | null | undefined): {
  keys: SetupDocRequirementKey[]
  items: { key: SetupDocRequirementKey; documentTypes: string[]; label: string }[]
} {
  const items: { key: SetupDocRequirementKey; documentTypes: string[]; label: string }[] = [
    ...REQUIRED_COMPLIANCE_DOC_TYPES.map((type) => ({
      key: type as SetupDocRequirementKey,
      documentTypes: [type],
      label: getDocumentTypeLabelAny(type),
    })),
    {
      key: 'bank_proof',
      documentTypes: [...BANK_PROOF_SETUP_TYPES],
      label: getSetupRequirementLabel('bank_proof'),
    },
  ]

  if (client?.factoring) {
    items.push({
      key: NOA_DOC_TYPE,
      documentTypes: [NOA_DOC_TYPE],
      label: getDocumentTypeLabelAny(NOA_DOC_TYPE),
    })
  }

  return { keys: items.map((i) => i.key), items }
}

/** Pick the most relevant doc for a requirement (prefer approved > pending > rejected). */
function pickBestDoc(docs: ClientDocument[], types: string[]): ClientDocument | undefined {
  const matches = docs.filter((d) => types.includes(d.document_type))
  if (matches.length === 0) return undefined

  const rank = (status: ClientDocumentApprovalStatus): number => {
    if (status === 'approved') return 0
    if (status === 'pending') return 1
    return 2
  }

  return [...matches].sort((a, b) => {
    const statusDiff = rank(a.approval_status) - rank(b.approval_status)
    if (statusDiff !== 0) return statusDiff
    return new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
  })[0]
}

/** Build per-requirement checklist for a client's vault. */
export function getSetupChecklist(
  clientId: string,
  client: Pick<Client, 'factoring'> | null | undefined
): SetupChecklistItem[] {
  const docs = getClientDocuments(clientId)
  const { items } = getRequiredSetupTypes(client)

  return items.map((item) => {
    const document = pickBestDoc(docs, item.documentTypes)
    const status: SetupChecklistItemStatus = document
      ? document.approval_status
      : 'missing'

    return {
      key: item.key,
      documentTypes: item.documentTypes,
      label: item.label,
      status,
      document,
    }
  })
}

/** True when every required setup type has an approved vault document. */
export function isClientSetupComplete(
  clientId: string,
  client: Pick<Client, 'factoring'> | null | undefined
): boolean {
  const checklist = getSetupChecklist(clientId, client)
  return checklist.every((item) => item.status === 'approved')
}

/** Throw when client-initiated invoice intake must be blocked. */
export function assertClientSetupComplete(
  clientId: string,
  client: Pick<Client, 'factoring'> | null | undefined
): void {
  if (isClientSetupComplete(clientId, client)) return

  const checklist = getSetupChecklist(clientId, client)
  const pending = checklist.filter((i) => i.status === 'pending').map((i) => i.label)
  const missing = checklist.filter((i) => i.status === 'missing' || i.status === 'rejected').map((i) => i.label)

  const parts: string[] = []
  if (missing.length) parts.push(`Missing or rejected: ${missing.join(', ')}`)
  if (pending.length) parts.push(`Awaiting Credyx approval: ${pending.join(', ')}`)

  throw new ClientSetupIncompleteError(
    parts.length
      ? `Complete your Document Vault setup before sending invoices. ${parts.join('. ')}.`
      : 'Complete your Document Vault setup before sending invoices.'
  )
}

/** Count clients that have at least one pending vault document. */
export function countClientsWithPendingVaultDocs(clientIds: string[]): number {
  let count = 0
  for (const clientId of clientIds) {
    const hasPending = getClientDocuments(clientId).some((d) => d.approval_status === 'pending')
    if (hasPending) count += 1
  }
  return count
}

/** Clients with incomplete setup (any required item not approved). */
export function isClientSetupIncomplete(
  clientId: string,
  client: Pick<Client, 'factoring'> | null | undefined
): boolean {
  return !isClientSetupComplete(clientId, client)
}
