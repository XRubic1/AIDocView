import type { Client } from '../types/client'
import type { Invoice } from '../types/invoice'
import type { ClientDocument } from '../types/clientDocument'
import { mockInvoices } from '../data/mockInvoices'
import { getClientDocuments, getClientDocumentTypeLabel } from '../services/clientDocumentService'

/** Vault document types used as bank verification for brokers. */
export const BANK_PROOF_DOCUMENT_TYPES = ['voided_check', 'bank_letter'] as const

export type BankProofDocumentType = (typeof BANK_PROOF_DOCUMENT_TYPES)[number]

/** Fixed broker-packet payment pointer (no bank numbers in email body). */
export const DEFAULT_BROKER_PACKET_REMITTANCE_MESSAGE =
  'All payments must be sent to the carrier per the remit-to on the attached invoice. Send remittance advice to billing@credyx.net and ops@credyx.net. Credyx does not change payment instructions by email alone.'

/** Email note when carrier remittance changed vs prior invoice (no account numbers). */
export const REMITTANCE_CHANGE_NOTE_TEXT =
  'Note: this carrier’s remittance info was recently updated — please verify before processing payment.'

/** Normalize remittance fields for change detection. */
export function buildRemittanceFingerprint(
  source: Pick<Client, 'remittance_info' | 'bank_name' | 'account_number' | 'routing_number'> | null | undefined
): string {
  const parts = [
    source?.remittance_info,
    source?.bank_name,
    source?.routing_number,
    source?.account_number,
  ].map((v) => (v ?? '').trim().toLowerCase().replace(/\s+/g, ' '))
  return parts.join('|')
}

/** Human-readable remit-to block for invoice PDFs. */
export function buildInvoiceRemittanceInfo(client: Client | null | undefined): string {
  const lines: string[] = []
  const custom = client?.remittance_info?.trim()
  if (custom) {
    lines.push(custom)
  } else {
    lines.push(
      'All payments should be sent to the carrier listed above. Please include the invoice number on all payments.'
    )
  }
  return lines.join('\n')
}

/** Format remittance_updated_at for invoice banner. */
export function formatRemittanceUpdatedLabel(isoDate: string | undefined): string {
  if (!isoDate) return new Date().toISOString().slice(0, 10)
  return isoDate.slice(0, 10)
}

/** HTML banner for invoice PDF when remittance changed. */
export function buildRemittanceUpdatedBannerHtml(updatedAt: string | undefined): string {
  const dateLabel = formatRemittanceUpdatedLabel(updatedAt)
  return `<div class="inv-remittance-updated" style="margin:8px 0 10px 0;padding:8px 10px;border:1px solid #f59e0b;background:#fffbeb;font-size:12px;color:#78350f;"><strong>Remittance updated as of ${dateLabel}</strong> — please verify remit-to details before processing payment.</div>`
}

/** HTML note injected into broker emails when remittance changed. */
export function buildRemittanceChangeNoteHtml(changed: boolean): string {
  if (!changed) return ''
  return `<p style="margin:12px 0 0 0;padding:12px 14px;background:#fff7ed;border:1px solid #fb923c;border-radius:8px;font-size:13px;line-height:1.45;color:#9a3412;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">${REMITTANCE_CHANGE_NOTE_TEXT}</p>`
}

/** Whether a vault doc is a bank proof type. */
export function isBankProofDocumentType(documentType: string): boolean {
  return (BANK_PROOF_DOCUMENT_TYPES as readonly string[]).includes(documentType)
}

/**
 * Default-selected vault doc IDs for a send: latest voided check and/or bank letter.
 * Other broker vault docs stay available but unchecked.
 */
export function defaultSelectedVaultDocIds(clientId: string): string[] {
  const vault = getClientDocuments(clientId).filter(
    (d) => d.category === 'broker' && d.approval_status === 'approved'
  )
  const selected: string[] = []
  for (const type of BANK_PROOF_DOCUMENT_TYPES) {
    const match = vault.find((d) => d.document_type === type)
    if (match) selected.push(match.id)
  }
  return selected
}

/** True when selection includes at least one bank proof (or none exist in vault). */
export function selectionHasBankProof(
  selectedVaultIds: string[],
  clientId: string
): boolean {
  const vault = getClientDocuments(clientId)
  const bankProofInVault = vault.filter(
    (d) =>
      d.category === 'broker' &&
      d.approval_status === 'approved' &&
      isBankProofDocumentType(d.document_type)
  )
  if (bankProofInVault.length === 0) return false
  return bankProofInVault.some((d) => selectedVaultIds.includes(d.id))
}

/** Label for picker rows. */
export function formatVaultDocPickerLabel(doc: ClientDocument): string {
  const typeLabel = getClientDocumentTypeLabel(doc.category, doc.document_type)
  return `${doc.name || doc.file_name} (${typeLabel})`
}

/**
 * Find the most recent prior invoice for the same carrier that already has a remittance snapshot.
 */
export function findPriorRemittanceSnapshot(
  clientId: string,
  excludeInvoiceId?: string
): string | undefined {
  const priors = mockInvoices
    .filter(
      (inv) =>
        inv.client_id === clientId &&
        inv.id !== excludeInvoiceId &&
        Boolean(inv.remittance_snapshot)
    )
    .sort((a, b) => {
      const aTime = new Date(a.updated_at || a.created_at || a.invoice_date).getTime()
      const bTime = new Date(b.updated_at || b.created_at || b.invoice_date).getTime()
      return bTime - aTime
    })
  return priors[0]?.remittance_snapshot
}

/** Detect remittance change vs prior invoice snapshot for this carrier. */
export function detectRemittanceChanged(
  client: Client | null | undefined,
  invoice: Pick<Invoice, 'id' | 'client_id' | 'remittance_snapshot'>
): { fingerprint: string; changed: boolean } {
  const fingerprint = buildRemittanceFingerprint(client)
  const prior = findPriorRemittanceSnapshot(invoice.client_id, invoice.id)
  if (!prior) {
    // First snapshotted invoice — treat as changed only if client flagged an update date
    // and current fingerprint is non-empty, or if invoice already had a different snapshot.
    if (invoice.remittance_snapshot && invoice.remittance_snapshot !== fingerprint) {
      return { fingerprint, changed: true }
    }
    return { fingerprint, changed: false }
  }
  return { fingerprint, changed: prior !== fingerprint }
}

/** Distinct brokers that have invoices for this carrier. */
export function listBrokersWorkedWithCarrier(clientId: string): Array<{
  broker_id: string
  broker_name: string
}> {
  const map = new Map<string, string>()
  for (const inv of mockInvoices) {
    if (inv.client_id !== clientId) continue
    const id = inv.broker_id?.trim()
    if (!id) continue
    if (!map.has(id)) map.set(id, inv.broker_name || id)
  }
  return Array.from(map.entries()).map(([broker_id, broker_name]) => ({
    broker_id,
    broker_name,
  }))
}

/** Whether remittance/bank fields differ between two snapshots. */
export function remittanceFieldsChanged(
  before: Pick<Client, 'remittance_info' | 'bank_name' | 'account_number' | 'routing_number'> | null | undefined,
  after: Pick<Client, 'remittance_info' | 'bank_name' | 'account_number' | 'routing_number'> | null | undefined
): boolean {
  return buildRemittanceFingerprint(before) !== buildRemittanceFingerprint(after)
}
