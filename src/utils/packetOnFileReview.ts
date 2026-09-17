import type { Invoice } from '../types/invoice'
import type { InvoiceAiReviewSnapshot } from '../types/invoiceAiReview'
import type { LoadCheckRow, LoadCheckStatus } from './loadReviewSummary'
import { CHECK_LABELS } from './reviewMessages'
import { amountsMatchCents } from './extractBatchFields'
import { freightAmountsMatch } from './amountMatching'
import { matchBrokerByName } from './brokerResolve'

/** Credyx packet values already stored on the invoice. */
export interface PacketOnFileContext {
  loadNumber?: string
  amount?: number
  brokerName?: string
  carrierName?: string
}

/** Values read from rate con / invoice paperwork. */
export interface PaperworkFields {
  loadNumber?: string
  amount?: number
  brokerName?: string
  /** Email domain read from rate con / invoice paperwork. */
  brokerDomain?: string
  carrierName?: string
  /** Compact pickup / origin line(s) from the rate con. */
  pickup?: string
  /** Compact delivery destination line(s) from the rate con. */
  destinations?: string
}

const RESOLVE_IDS = new Set(['req_load', 'req_broker', 'req_amount'])

/** True when Resolve issues can copy this check's paperwork value onto the packet. */
export function isResolvablePacketCheck(row: Pick<LoadCheckRow, 'id' | 'status'>): boolean {
  return RESOLVE_IDS.has(row.id) && row.status !== 'ok'
}

function digits(value?: string): string {
  return (value ?? '').replace(/\D/g, '').replace(/^0+/, '')
}

function loadNumbersAlign(a?: string, b?: string): boolean {
  if (!a?.trim() || !b?.trim()) return false
  const left = digits(a) || a.trim()
  const right = digits(b) || b.trim()
  return left === right || left.endsWith(right) || right.endsWith(left)
}

function amountsAlign(a?: number, b?: number): boolean {
  if (a == null || b == null) return false
  return amountsMatchCents(a, b) || freightAmountsMatch(a, b)
}

function namesAlign(a?: string, b?: string): boolean {
  if (!a?.trim() || !b?.trim()) return false
  const left = a.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  const right = b.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!left || !right) return false
  return left === right || left.includes(right) || right.includes(left)
}

function money(amount?: number): string {
  if (amount == null) return '—'
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fileVsPaper(onFile?: string, paperwork?: string): string {
  return `On file: ${onFile?.trim() || '—'} · Paperwork: ${paperwork?.trim() || '—'}`
}

function checkRow(
  id: string,
  label: string,
  status: LoadCheckStatus,
  summary: string,
  onFile?: string,
  paperwork?: string
): LoadCheckRow {
  return {
    id,
    label,
    status,
    summary,
    detail: fileVsPaper(onFile, paperwork),
    excelValue: onFile,
    documentValue: paperwork,
  }
}

function loadRow(packet: PacketOnFileContext, paperwork: PaperworkFields): LoadCheckRow {
  const onFile = packet.loadNumber?.trim()
  const paper = paperwork.loadNumber?.trim()
  if (paper && onFile && loadNumbersAlign(onFile, paper)) {
    return checkRow('req_load', CHECK_LABELS.loadNumber, 'ok', 'Load number matches the packet on file.', onFile, paper)
  }
  if (paper && !onFile) {
    return checkRow(
      'req_load',
      CHECK_LABELS.loadNumber,
      'issue',
      `Packet has no load number. Paperwork shows ${paper}.`,
      onFile,
      paper
    )
  }
  if (paper && onFile) {
    return checkRow(
      'req_load',
      CHECK_LABELS.loadNumber,
      'issue',
      `Packet load ${onFile} does not match paperwork ${paper}.`,
      onFile,
      paper
    )
  }
  return checkRow(
    'req_load',
    CHECK_LABELS.loadNumber,
    'warning',
    'Load number was not found on the paperwork.',
    onFile,
    paper
  )
}

function brokerRow(packet: PacketOnFileContext, paperwork: PaperworkFields): LoadCheckRow {
  const onFile = packet.brokerName?.trim()
  const paper = paperwork.brokerName?.trim()
  const resolvedPaper = matchBrokerByName(paper || '', paperwork.brokerDomain)

  if (paper && onFile) {
    if (namesAlign(onFile, paper)) {
      return checkRow(
        'req_broker',
        CHECK_LABELS.broker,
        'ok',
        'Broker name matches the packet on file.',
        onFile,
        paper
      )
    }
    // Division name on paperwork + directory debtor via email domain / brand token.
    if (
      resolvedPaper.broker_id &&
      namesAlign(onFile, resolvedPaper.broker_name)
    ) {
      return checkRow(
        'req_broker',
        CHECK_LABELS.broker,
        'ok',
        paperwork.brokerDomain
          ? `Broker linked via ${paperwork.brokerDomain}.`
          : 'Broker matches the directory debtor on file.',
        onFile,
        paper
      )
    }
    return checkRow(
      'req_broker',
      CHECK_LABELS.broker,
      'issue',
      `Packet broker ${onFile} does not match paperwork ${paper}.`,
      onFile,
      paper
    )
  }
  if (paper && !onFile) {
    return checkRow(
      'req_broker',
      CHECK_LABELS.broker,
      'issue',
      `Packet has no broker. Paperwork shows ${paper}.`,
      onFile,
      paper
    )
  }
  return checkRow(
    'req_broker',
    CHECK_LABELS.broker,
    onFile ? 'ok' : 'warning',
    onFile ? 'Broker on file; none found on paperwork.' : 'Broker was not found on the paperwork.',
    onFile,
    paper
  )
}

function amountRow(packet: PacketOnFileContext, paperwork: PaperworkFields): LoadCheckRow {
  const onFile = packet.amount
  const paper = paperwork.amount
  if (paper != null && onFile != null && amountsAlign(onFile, paper)) {
    return checkRow(
      'req_amount',
      CHECK_LABELS.amount,
      'ok',
      'Freight amount matches the packet on file.',
      money(onFile),
      money(paper)
    )
  }
  if (paper != null && onFile != null) {
    return checkRow(
      'req_amount',
      CHECK_LABELS.amount,
      'issue',
      `Packet amount ${money(onFile)} does not match paperwork ${money(paper)}.`,
      money(onFile),
      money(paper)
    )
  }
  if (paper != null && (onFile == null || onFile === 0)) {
    return checkRow(
      'req_amount',
      CHECK_LABELS.amount,
      'issue',
      `Packet amount is missing. Paperwork shows ${money(paper)}.`,
      money(onFile),
      money(paper)
    )
  }
  return checkRow(
    'req_amount',
    CHECK_LABELS.amount,
    'warning',
    'Amount was not found on the paperwork.',
    money(onFile),
    money(paper)
  )
}

function carrierRow(packet: PacketOnFileContext, paperwork: PaperworkFields): LoadCheckRow {
  const onFile = packet.carrierName?.trim()
  const paper = paperwork.carrierName?.trim()
  if (paper && onFile && namesAlign(onFile, paper)) {
    return checkRow(
      'req_carrier',
      CHECK_LABELS.carrier,
      'ok',
      'Paperwork carrier matches the account on file.',
      onFile,
      paper
    )
  }
  if (paper && onFile) {
    return checkRow(
      'req_carrier',
      CHECK_LABELS.carrier,
      'issue',
      `Carrier on file (${onFile}) does not match paperwork (${paper}).`,
      onFile,
      paper
    )
  }
  if (paper && !onFile) {
    return checkRow(
      'req_carrier',
      CHECK_LABELS.carrier,
      'issue',
      `No carrier on file. Paperwork shows ${paper}.`,
      onFile,
      paper
    )
  }
  // Carrier must appear on the RC — account-on-file alone is not enough to pass.
  return checkRow(
    'req_carrier',
    CHECK_LABELS.carrier,
    'issue',
    onFile
      ? `Carrier not found on the rate confirmation (expected ${onFile}).`
      : 'Carrier was not found on the rate confirmation.',
    onFile,
    paper
  )
}

/** True when the paperwork carrier does not match the submitting account. */
export function isCarrierMismatchIssue(snapshot: InvoiceAiReviewSnapshot | null | undefined): boolean {
  if (!snapshot) return false
  return (snapshot.requiredFailed ?? []).some((row) => row.id === 'req_carrier')
}

/** Carrier-visible review reason when paperwork carrier ≠ account on file (or missing on RC). */
export function carrierMismatchHoldReason(
  onFile?: string | null,
  paperwork?: string | null
): string {
  const left = onFile?.trim() || 'account on file'
  const right = paperwork?.trim()
  if (!right) {
    return `Carrier name not found on the rate confirmation — expected: ${left}.`
  }
  return `Carrier name mismatch — on file: ${left}; paperwork: ${right}.`
}

/**
 * Replace load / broker / amount / carrier checks with packet-on-file vs paperwork.
 * BOL and stop checks stay as document audits.
 */
export function overlayPacketOnFileChecks(
  required: LoadCheckRow[],
  packet: PacketOnFileContext,
  paperwork: PaperworkFields
): LoadCheckRow[] {
  const byId = new Map(required.map((row) => [row.id, row]))
  byId.set('req_load', loadRow(packet, paperwork))
  byId.set('req_broker', brokerRow(packet, paperwork))
  byId.set('req_amount', amountRow(packet, paperwork))
  byId.set('req_carrier', carrierRow(packet, paperwork))

  const order = [
    'req_load',
    'req_broker',
    'req_amount',
    'req_bol',
    'req_stops',
    'req_carrier',
    'req_page_count',
  ]
  const ordered: LoadCheckRow[] = []
  for (const id of order) {
    const row = byId.get(id)
    if (row) ordered.push(row)
  }
  for (const row of required) {
    if (!order.includes(row.id)) ordered.push(row)
  }
  return ordered
}

/** True when Resolve issues can copy paperwork load / amount / broker onto the packet. */
export function snapshotHasResolvablePacketIssues(snapshot: InvoiceAiReviewSnapshot | null): boolean {
  if (!snapshot?.paperwork) return false
  const paper = snapshot.paperwork
  if (!paper.loadNumber && paper.amount == null && !paper.brokerName) return false
  return (snapshot.requiredAll ?? []).some((row) => isResolvablePacketCheck(row))
}

/** Invoice fields copied from paperwork. Never includes client_name. */
export function invoicePatchFromPaperwork(paperwork: PaperworkFields): Partial<Invoice> {
  const patch: Partial<Invoice> = {}
  if (paperwork.loadNumber?.trim()) patch.load_number = paperwork.loadNumber.trim()
  if (paperwork.amount != null && paperwork.amount > 0) patch.amount = paperwork.amount
  if (paperwork.brokerName?.trim() || paperwork.brokerDomain?.trim()) {
    const broker = matchBrokerByName(
      paperwork.brokerName?.trim() || '',
      paperwork.brokerDomain
    )
    patch.broker_name =
      broker.broker_name || paperwork.brokerName?.trim() || patch.broker_name
    if (broker.broker_id) patch.broker_id = broker.broker_id
  }
  return patch
}

/** Re-score snapshot after packet fields were updated from paperwork. Carrier stays the submitter. */
export function snapshotAfterPacketResolve(
  snapshot: InvoiceAiReviewSnapshot,
  packet: PacketOnFileContext
): InvoiceAiReviewSnapshot {
  const paperwork = snapshot.paperwork ?? {}
  const requiredAll = overlayPacketOnFileChecks(snapshot.requiredAll ?? [], packet, paperwork)
  const requiredFailed = requiredAll.filter((row) => row.status !== 'ok')
  const requiredPassed = requiredAll.filter((row) => row.status === 'ok')
  const failCount = requiredFailed.length
  const ready = failCount === 0
  return {
    ...snapshot,
    requiredAll,
    requiredFailed,
    requiredPassed,
    passCount: requiredPassed.length,
    requiredTotal: requiredAll.length,
    ready,
    headline: ready ? 'Good to go' : 'Needs additional work',
    detail: ready
      ? `All ${requiredAll.length} required checks passed.`
      : `${requiredPassed.length} of ${requiredAll.length} required checks passing.`,
  }
}
