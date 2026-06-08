import { mockBrokers } from '../data/mockBrokers'
import type { CredyxInvoiceDraft } from '../types/credyxBatch'
import type { Invoice } from '../types/invoice'
import { buildInvoiceDraftFromGroup } from '../products/docSort/services/docSortInvoice'
import { generateInvoicePDFFile, type InvoicePDFInput } from '../utils/generateInvoicePDF'
import type { DocSortLoadGroup, DocSortFingerprint } from '../products/docSort/types'
/** Resolve broker id from extracted name (fuzzy contains match). */
export function resolveBrokerId(brokerName: string): { broker_id: string; broker_name: string } {
  const trimmed = brokerName.trim()
  if (!trimmed) {
    return { broker_id: 'broker-unknown', broker_name: 'Unknown Broker' }
  }
  const lower = trimmed.toLowerCase()
  const match = mockBrokers.find(
    (b) =>
      b.name.toLowerCase() === lower ||
      lower.includes(b.name.toLowerCase()) ||
      b.name.toLowerCase().includes(lower)
  )
  if (match) {
    return { broker_id: match.id, broker_name: match.name }
  }
  return { broker_id: `broker-custom-${Date.now()}`, broker_name: trimmed }
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
  return [...group.rateCons, ...group.bols].map((fp) => fp.docId)
}

/** Build client-editable draft from a matched DocSort load group. */
export async function buildCredyxDraftFromGroup(
  group: DocSortLoadGroup
): Promise<CredyxInvoiceDraft> {
  const pdfInput = buildInvoiceDraftFromGroup(group)
  const invoicePdf = await generateInvoicePDFFile(pdfInput)
  const broker = resolveBrokerId(pdfInput.brokerName)
  const amount = pdfInput.invoiceAmount ?? 0

  return {
    draftId: `draft-${group.groupId}`,
    groupId: group.groupId,
    invoice_number: pdfInput.invoiceNumber,
    load_number: group.label,
    broker_name: broker.broker_name,
    broker_id: broker.broker_id,
    amount,
    invoice_date: isoDateFromUs(pdfInput.invoiceDate),
    carrier_name: pdfInput.carrierName,
    rate_missing: amount <= 0,
    confirmed: false,
    document_doc_ids: collectDocIds(group),
    invoice_pdf: invoicePdf,
    fingerprints: {
      rateCons: group.rateCons,
      bols: group.bols,
    },
  }
}

/** Map confirmed draft to Credyx Invoice fields for mock store. */
export function draftToInvoiceFields(
  draft: CredyxInvoiceDraft,
  clientId: string,
  clientName: string
): Omit<Invoice, 'id' | 'created_at' | 'batch_id' | 'batch_number'> {
  const due = new Date()
  due.setDate(due.getDate() + 30)
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
    due_date: due.toISOString().split('T')[0],
    expected_payment_date: due.toISOString().split('T')[0],
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

export function generateNextDraftInvoiceNumber(existing: CredyxInvoiceDraft[]): string {
  const year = new Date().getFullYear()
  let max = 0
  existing.forEach((inv) => {
    const match = inv.invoice_number.match(/INV-\d+-(\d+)/i)
    if (match) max = Math.max(max, Number.parseInt(match[1], 10))
  })
  return `INV-${year}-${String(max + 1).padStart(3, '0')}`
}

/** Blank invoice row the client can fill in during AI batch confirm. */
export async function createManualCredyxDraft(
  existing: CredyxInvoiceDraft[],
  clientName: string
): Promise<CredyxInvoiceDraft> {
  const groupId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  const invoice_date = new Date().toISOString().split('T')[0]
  const base: CredyxInvoiceDraft = {
    draftId: `draft-${groupId}`,
    groupId,
    invoice_number: generateNextDraftInvoiceNumber(existing),
    load_number: '',
    broker_name: '',
    broker_id: 'broker-unknown',
    amount: 0,
    invoice_date,
    carrier_name: 'Carrier',
    rate_missing: true,
    confirmed: false,
    document_doc_ids: [],
    fingerprints: { rateCons: [], bols: [] },
  }
  const invoice_pdf = await regenerateDraftInvoicePdf(base, clientName)
  return { ...base, invoice_pdf }
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
  const input: InvoicePDFInput = {
    invoiceNumber: draft.invoice_number,
    invoiceDate: isoToUsDate(draft.invoice_date),
    invoiceAmount: draft.amount,
    loadNumber: draft.load_number,
    brokerName: draft.broker_name,
    brokerAddress: '',
    carrierName: draft.carrier_name || 'Carrier',
    clientName,
    clientAddress: '',
    remittanceInfo: '',
  }
  return generateInvoicePDFFile(input)
}

export function fingerprintDocIds(fps: DocSortFingerprint[]): string[] {
  return fps.map((fp) => fp.docId)
}
