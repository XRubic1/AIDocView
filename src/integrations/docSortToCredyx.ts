import { mockBrokers } from '../data/mockBrokers'
import { getNextClientInvoiceNumber, loadClientInvoiceNumbers } from '../utils/clientInvoiceNumbers'
import { resolveDueDatesFromBroker } from '../utils/invoiceDueDate'
import {
  matchBrokerByName,
  resolveOrCreateBroker,
  type BrokerResolveResult,
} from '../utils/brokerResolve'
import type { CredyxInvoiceDraft } from '../types/credyxBatch'
import type { Invoice } from '../types/invoice'
import { buildInvoiceDraftFromGroup } from '../products/docSort/services/docSortInvoice'
import { generateInvoicePDFFile, type InvoicePDFInput } from '../utils/generateInvoicePDF'
import type { DocSortLoadGroup, DocSortFingerprint } from '../products/docSort/types'
import { invoiceFieldsFromLoadGroup } from '../products/docSort/utils/formatRate'
import { getClientById } from '../services/clientRegistry'

export type { BrokerResolveResult }
export { matchBrokerByName, resolveOrCreateBroker }

/**
 * @deprecated Prefer matchBrokerByName (carriers) or resolveOrCreateBroker (admin).
 * Kept as an alias to resolveOrCreateBroker for admin/legacy call sites.
 */
export function resolveBrokerId(brokerName: string): BrokerResolveResult {
  return resolveOrCreateBroker(brokerName)
}

function isoDateFromUs(usDate: string): string {
  const parts = usDate.split('/')
  if (parts.length === 3) {
    const [m, d, y] = parts
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return new Date().toISOString().split('T')[0]
}

function collectDocIds(group: DocSortLoadGroup): string[] {
  return [...group.rateCons, ...group.bols, ...(group.others ?? [])].map((fp) => fp.docId)
}

/** Prefer the Credyx account / batch carrier over AI-extracted paperwork names. */
function systemCarrierName(clientId: string, clientName?: string | null): string {
  const fromArg = clientName?.trim()
  if (fromArg) return fromArg
  return getClientById(clientId)?.name?.trim() || 'Carrier'
}

/** Build client-editable draft from a matched DocSort load group. */
export async function buildCredyxDraftFromGroup(
  group: DocSortLoadGroup,
  clientId: string,
  usedInvoiceNumbers: string[] = [],
  clientName?: string
): Promise<CredyxInvoiceDraft> {
  const pdfInput = buildInvoiceDraftFromGroup(group)
  const invoice_number = getNextClientInvoiceNumber(clientId, usedInvoiceNumbers)
  const carrier = systemCarrierName(clientId, clientName)
  const invoicePdf = await generateInvoicePDFFile({
    ...pdfInput,
    invoiceNumber: invoice_number,
    // Always print the submitting account — never the AI paperwork carrier.
    carrierName: carrier,
    clientName: carrier,
  })
  // Carrier path: match only — unknown names stay pending for Credyx to link.
  // Prefer email domain from the rate con when the printed name is a division (e.g. Werner Logistics).
  const fields = invoiceFieldsFromLoadGroup(group)
  const broker = matchBrokerByName(pdfInput.brokerName || '', fields.emailDomain)
  const amount = pdfInput.invoiceAmount ?? 0
  const load_number = pdfInput.loadNumber?.trim() || group.label
  const brokerName = broker.broker_name || pdfInput.brokerName?.trim() || ''
  const fieldsReady = Boolean(load_number) && Boolean(brokerName) && amount > 0

  return {
    draftId: `draft-${group.groupId}`,
    groupId: group.groupId,
    invoice_number,
    load_number,
    broker_name: brokerName,
    broker_id: broker.broker_id,
    amount,
    invoice_date: isoDateFromUs(pdfInput.invoiceDate),
    carrier_name: carrier,
    rate_missing: amount <= 0,
    confirmed: fieldsReady,
    document_doc_ids: collectDocIds(group),
    invoice_pdf: invoicePdf,
    fingerprints: {
      rateCons: group.rateCons,
      bols: group.bols,
      other: group.others ?? [],
    },
  }
}

/** Map confirmed draft to Credyx Invoice fields for mock store. */
export function draftToInvoiceFields(
  draft: CredyxInvoiceDraft,
  clientId: string,
  clientName: string
): Omit<Invoice, 'id' | 'created_at' | 'batch_id' | 'batch_number'> {
  const broker = mockBrokers.find((b) => b.id === draft.broker_id)
  const dueDates = resolveDueDatesFromBroker(broker?.payment_terms_days)
  const docCount =
    draft.document_doc_ids.length + (draft.invoice_pdf ? 1 : 0)

  return {
    invoice_number: draft.invoice_number,
    client_id: clientId,
    client_name: clientName,
    broker_id: draft.broker_id,
    broker_name: draft.broker_name,
    amount: draft.amount,
    invoice_date: draft.invoice_date,
    ...dueDates,
    status: 'pending',
    load_number: draft.load_number,
    documents_count: docCount,
    notes: draft.rate_missing ? 'AI rate missing — client confirmed manually' : undefined,
    ai_confirmed_at: new Date().toISOString(),
    ai_confirmed_by: clientName,
    ai_review_status: 'not_run',
    doc_sort_group_id: draft.groupId,
    document_doc_ids: [...draft.document_doc_ids],
  }
}

/** True when the client added this load manually (not from AI sort). */
export function isManualCredyxDraft(draft: CredyxInvoiceDraft): boolean {
  return draft.groupId.startsWith('manual-')
}

export function generateNextDraftInvoiceNumber(
  clientId: string,
  existing: CredyxInvoiceDraft[],
  knownNumbers: string[] = []
): string {
  return getNextClientInvoiceNumber(clientId, [
    ...knownNumbers,
    ...existing.map((inv) => inv.invoice_number),
  ])
}

/** Blank invoice row the client can fill in during AI batch confirm. */
export async function createManualCredyxDraft(
  existing: CredyxInvoiceDraft[],
  clientId: string,
  clientName: string
): Promise<CredyxInvoiceDraft> {
  const groupId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  const invoice_date = new Date().toISOString().split('T')[0]
  const knownNumbers = await loadClientInvoiceNumbers(clientId)
  const carrier = systemCarrierName(clientId, clientName)
  const base: CredyxInvoiceDraft = {
    draftId: `draft-${groupId}`,
    groupId,
    invoice_number: generateNextDraftInvoiceNumber(clientId, existing, knownNumbers),
    load_number: '',
    broker_name: '',
    broker_id: '',
    amount: 0,
    invoice_date,
    carrier_name: carrier,
    rate_missing: true,
    confirmed: false,
    document_doc_ids: [],
    fingerprints: { rateCons: [], bols: [], other: [] },
  }
  const invoice_pdf = await regenerateDraftInvoicePdf(base, carrier)
  return { ...base, carrier_name: carrier, invoice_pdf }
}

function isoToUsDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  if (y && m && d) {
    return `${Number.parseInt(m, 10)}/${Number.parseInt(d, 10)}/${y}`
  }
  return new Date().toLocaleDateString('en-US')
}

/** Rebuild the generated invoice PDF from the client's edited draft fields. */
export async function regenerateDraftInvoicePdf(
  draft: CredyxInvoiceDraft,
  clientName: string
): Promise<File> {
  const carrier = clientName.trim() || draft.carrier_name || 'Carrier'
  const input: InvoicePDFInput = {
    invoiceNumber: draft.invoice_number,
    invoiceDate: isoToUsDate(draft.invoice_date),
    invoiceAmount: draft.amount,
    loadNumber: draft.load_number,
    brokerName: draft.broker_name,
    brokerAddress: '',
    carrierName: carrier,
    clientName: carrier,
    clientAddress: '',
    remittanceInfo: '',
  }
  return generateInvoicePDFFile(input)
}

/** Rebuild the Credyx invoice PDF for a persisted invoice (Verification / Packets sync). */
export async function regenerateInvoicePdfForInvoice(
  invoice: Invoice,
  clientName: string
): Promise<{ file: File; docId: string }> {
  const groupId = invoice.doc_sort_group_id || invoice.id
  const file = await regenerateDraftInvoicePdf(
    {
      draftId: invoice.id,
      groupId,
      invoice_number: invoice.invoice_number,
      load_number: invoice.load_number || '',
      broker_name: invoice.broker_name || '',
      broker_id: invoice.broker_id || '',
      amount: invoice.amount,
      invoice_date: invoice.invoice_date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      carrier_name: clientName,
      rate_missing: false,
      confirmed: true,
      document_doc_ids: invoice.document_doc_ids || [],
      fingerprints: { rateCons: [], bols: [], other: [] },
    },
    clientName
  )
  return { file, docId: `invoice-pdf-${groupId}` }
}

export function fingerprintDocIds(fps: DocSortFingerprint[]): string[] {
  return fps.map((fp) => fp.docId)
}
