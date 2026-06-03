import { BatchDocumentReviewResult, DocumentReviewResult } from '../types/documentReview'
import { SignatureAuthenticityStatus, SignatureStatus } from '../types/documentPipeline'
import { formatRateConStop } from './locationMatch'
import {
  buildPerInvoiceVerificationChecks,
  getPerPacketCrossValidation,
} from './perPacketVerification'
import {
  buildStructuredLoadReview,
  collectLoadReviewIssues,
  StructuredLoadReview,
} from './loadReviewSummary'
import { getPerInvoiceDisplayStatus } from './perInvoiceStatus'
import { documentHasBolEvidence } from './requiredDocuments'

export type FieldMatchTone = 'match' | 'mismatch' | 'warning' | 'neutral'

export interface LoadDetailField {
  label: string
  value: string
  match: FieldMatchTone
  subtext?: string
}

export interface LoadDetailSignature {
  label: string
  status: string
  ok: boolean
  subtext?: string
}

export interface LoadDetailView {
  title: string
  fileName: string
  statusLabel: string
  statusTone: 'verified' | 'issue' | 'neutral'
  statusReasons: string[]
  fields: LoadDetailField[]
  signatures: LoadDetailSignature[]
  review: StructuredLoadReview
  verificationSummary: ReturnType<typeof buildPerInvoiceVerificationChecks>
}

function display(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—'
  return String(value)
}

function formatMoney(amount: number | null | undefined): string {
  if (amount == null) return '—'
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function authenticitySubtext(auth?: SignatureAuthenticityStatus): string | undefined {
  if (auth === 'NOTED') return 'May be forged or stamped — verify'
  if (auth === 'UNCLEAR') return 'Authenticity unclear'
  return undefined
}

function sigRow(
  label: string,
  status?: SignatureStatus,
  authenticity?: SignatureAuthenticityStatus
): LoadDetailSignature {
  const ok = status === 'PRESENT' || status === 'PASS_BY_RULE'
  const text =
    status === 'PRESENT'
      ? 'Present'
      : status === 'PASS_BY_RULE'
        ? 'Pass (rule)'
        : status === 'MISSING'
          ? 'Missing'
          : status === 'UNCLEAR'
            ? 'Unclear'
            : '—'
  const subtext = authenticitySubtext(authenticity)
  const authConcern = authenticity === 'NOTED'
  return {
    label,
    status: text,
    ok: ok && status != null && !authConcern,
    subtext,
  }
}

function fieldMatch(ok: boolean | null, hasValue: boolean): FieldMatchTone {
  if (!hasValue) return 'neutral'
  if (ok === true) return 'match'
  if (ok === false) return 'mismatch'
  return 'neutral'
}

/** Dispatcher-friendly field list for one reviewed PDF / load. */
export function buildLoadDetailView(
  doc: DocumentReviewResult,
  batch: BatchDocumentReviewResult,
  options?: { excelFileName?: string | null }
): LoadDetailView {
  const verification = batch.multiInvoice?.verifications.find(
    (v) => v.unit.fileName === doc.fileName
  )
  const inv = verification?.unit.invoice ?? doc.extraction.primaryInvoice
  const rate = doc.extraction.rateConParse
  const fields = doc.extraction.rateConFields
  const bol = doc.extraction.bolAudit
  const cross = getPerPacketCrossValidation(doc.fileName, batch)

  const pickup =
    fields?.pickup?.value ??
    (rate?.origin ? formatRateConStop(rate.origin) : undefined) ??
    doc.extraction.shipFrom ??
    doc.extraction.origin ??
    bol?.ship_from

  const delivery =
    fields?.drop?.value ??
    (rate?.destinations?.[0] ? formatRateConStop(rate.destinations[0]) : undefined) ??
    doc.extraction.shipTo ??
    doc.extraction.destination ??
    bol?.ship_to

  const carrier =
    rate?.carrier_name ?? fields?.carrier?.value ?? inv?.carrier_name ?? undefined
  const broker =
    rate?.broker_name ?? fields?.broker?.value ?? inv?.broker_name ?? undefined
  const loadNumber = rate?.load_number ?? inv?.load_number ?? fields?.loadNumber?.value
  const invoiceNumber = inv?.invoice_number
  const rateAmount = rate?.rate_total ?? fields?.rate?.value
  const invoiceAmount = inv?.amount_total ?? cross?.amount.invoice_amount
  const rateLineItems = rate?.rate_line_items ?? []
  const linehaul = rateLineItems.find((row) => row.category === 'linehaul')?.amount
  const unloading = rateLineItems
    .filter((row) => row.category === 'unloading' || /lumper|unload/i.test(row.description ?? ''))
    .reduce((sum, row) => sum + (row.amount ?? 0), 0)
  const lumperTotal = (doc.extraction.lumperPageAudits ?? []).reduce(
    (sum, row) => sum + (row.amount ?? 0),
    0
  )

  const excel = verification?.excelMatch

  const bolDetected = documentHasBolEvidence(doc.extraction)
  const bolPages =
    doc.extraction.pageClassifications?.filter((p) => p.pageType === 'bill_of_lading')
      .length ?? 0

  const detailFields: LoadDetailField[] = [
    {
      label: 'BOL in this PDF',
      value: bolDetected
        ? bolPages > 0
          ? `Yes · ${bolPages} BOL page(s) classified`
          : 'Yes · BOL audit completed'
        : 'Not detected',
      match: bolDetected ? 'match' : 'mismatch',
    },
    {
      label: 'Load number',
      value: display(loadNumber),
      match: fieldMatch(cross ? cross.load_number.status === 'MATCH' : null, Boolean(loadNumber)),
      subtext: cross?.load_number.details,
    },
    {
      label: 'Invoice number',
      value: display(invoiceNumber),
      match: 'neutral',
    },
    {
      label: 'Broker',
      value: display(broker),
      match: fieldMatch(cross ? cross.broker.status === 'MATCH' : null, Boolean(broker)),
      subtext: cross?.broker.details,
    },
    {
      label: 'Carrier',
      value: display(carrier),
      match: fieldMatch(
        cross ? cross.carrier.status === 'CONFIRMED' : null,
        Boolean(carrier)
      ),
      subtext: cross?.carrier.details,
    },
    {
      label: 'Pickup',
      value: display(pickup),
      match: 'neutral',
    },
    {
      label: 'Delivery',
      value: display(delivery),
      match: fieldMatch(
        bol?.destination_match === 'PASS' ? true : bol ? false : null,
        Boolean(delivery)
      ),
      subtext: bol?.destination_notes,
    },
    {
      label: 'Rate con amount',
      value: formatMoney(rateAmount as number | null),
      match: 'neutral',
      subtext:
        rateLineItems.length > 0
          ? `Line items: ${rateLineItems
              .map((row) => `${row.description ?? row.category ?? 'item'} ${formatMoney(row.amount ?? undefined)}`)
              .join(' · ')}`
          : undefined,
    },
    {
      label: 'Invoice amount',
      value: formatMoney(invoiceAmount),
      match: fieldMatch(
        cross
          ? cross.amount.status === 'MATCH' ||
            cross.amount.status === 'OVERAGE_EXPLAINED' ||
            cross.amount.status === 'EXPLAINED_BY_LUMPER'
          : null,
        invoiceAmount != null
      ),
      subtext: cross?.amount.details,
    },
    {
      label: 'Lumper receipts total',
      value: lumperTotal > 0 ? formatMoney(lumperTotal) : 'Not detected',
      match:
        lumperTotal > 0
          ? cross?.amount.status === 'EXPLAINED_BY_LUMPER'
            ? 'match'
            : 'warning'
          : 'neutral',
      subtext:
        unloading > 0
          ? `Rate con unloading/lumper line: ${formatMoney(unloading)}`
          : linehaul != null
            ? `Rate con line haul: ${formatMoney(linehaul)}`
            : undefined,
    },
  ]

  if (excel?.row) {
    detailFields.push({
      label: 'Excel row',
      value: [
        excel.row.loadNumber,
        excel.row.broker,
        excel.row.amount != null ? formatMoney(excel.row.amount) : null,
      ]
        .filter(Boolean)
        .join(' · '),
      match:
        excel.overall === 'MATCH'
          ? 'match'
          : excel.overall === 'MISMATCH'
            ? 'mismatch'
            : 'warning',
      subtext: `Matched from ${excel.row.loadNumber ? 'load #' : 'sheet'}`,
    })
  }

  const signatures: LoadDetailSignature[] = bol
    ? [
        sigRow('Receiver', bol.signatures.receiver, bol.signatures.receiver_authenticity),
        sigRow('Shipper', bol.signatures.shipper, bol.signatures.shipper_authenticity),
        sigRow('Carrier / driver', bol.signatures.carrier, bol.signatures.carrier_authenticity),
        sigRow('Receiver date', bol.signatures.receiver_date),
      ]
    : [
        {
          label: 'Receiver',
          status: doc.extraction.hasReceiverSignature ? 'Present' : '—',
          ok: Boolean(doc.extraction.hasReceiverSignature),
        },
        {
          label: 'Any signature',
          status: doc.extraction.hasSignature ? 'Present' : '—',
          ok: Boolean(doc.extraction.hasSignature),
        },
      ]

  const packetStatus = getPerInvoiceDisplayStatus(doc.fileName, batch)
  const unifiedIssues = collectLoadReviewIssues(doc, batch)
  const statusReasons =
    unifiedIssues.length > 0 ? unifiedIssues : packetStatus.reasons
  const statusLabel =
    unifiedIssues.length > 0 && packetStatus.label === 'Verified'
      ? 'Review'
      : packetStatus.label
  const statusTone =
    statusLabel === 'Verified'
      ? 'verified'
      : statusLabel === 'Rejected'
        ? 'issue'
        : 'neutral'

  const title =
    inv?.invoice_number ?? doc.fileName.replace(/\.pdf$/i, '')

  return {
    title,
    fileName: doc.fileName,
    statusLabel,
    statusTone,
    statusReasons,
    fields: detailFields,
    signatures,
    review: buildStructuredLoadReview(doc, batch, {
      excelFileName: options?.excelFileName ?? batch.excelFileName,
    }),
    verificationSummary: buildPerInvoiceVerificationChecks(doc.fileName, batch),
  }
}
