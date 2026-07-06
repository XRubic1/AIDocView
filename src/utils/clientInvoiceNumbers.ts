import { mockInvoices } from '../data/mockInvoices'

/** Parse the numeric sequence from invoice numbers like `001`, `4401`, or legacy `INV-2026-003`. */
export function parseInvoiceNumberSequence(invoiceNumber: string): number | null {
  const trimmed = invoiceNumber.trim()
  if (!trimmed) return null
  if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10)
  const legacy = trimmed.match(/INV-\d{4}-(\d+)$/i)
  if (legacy) return Number.parseInt(legacy[1], 10)
  const tail = trimmed.match(/(\d+)$/)
  if (tail) return Number.parseInt(tail[1], 10)
  return null
}

/** Format sequence as client invoice number (`001` … `999`, then `1000`, `4402`, etc.). */
export function formatClientInvoiceNumber(sequence: number): string {
  if (!Number.isFinite(sequence) || sequence < 1) return '001'
  if (sequence < 1000) return String(sequence).padStart(3, '0')
  return String(sequence)
}

function numbersForClient(clientId: string, extra: string[] = []): string[] {
  const fromStore = mockInvoices
    .filter((inv) => inv.client_id === clientId)
    .map((inv) => inv.invoice_number)
  return [...fromStore, ...extra]
}

function isInvoiceNumberTaken(
  clientId: string,
  candidate: string,
  reserved: string[] = []
): boolean {
  const all = numbersForClient(clientId, reserved)
  if (all.includes(candidate)) return true
  const candidateSeq = parseInvoiceNumberSequence(candidate)
  if (candidateSeq == null) return false
  return all.some((num) => parseInvoiceNumberSequence(num) === candidateSeq)
}

/** Highest numeric sequence already used by this client (memory + optional pending list). */
export function getMaxInvoiceSequence(clientId: string, additionalNumbers: string[] = []): number {
  let max = 0
  for (const num of numbersForClient(clientId, additionalNumbers)) {
    const seq = parseInvoiceNumberSequence(num)
    if (seq != null && seq > max) max = seq
  }
  return max
}

/** Next invoice number for a client (`001`, `002`, …). */
export function getNextClientInvoiceNumber(
  clientId: string,
  additionalNumbers: string[] = []
): string {
  return formatClientInvoiceNumber(getMaxInvoiceSequence(clientId, additionalNumbers) + 1)
}

/** Return `preferred` if unused; otherwise bump until free for this client. */
export function ensureUniqueClientInvoiceNumber(
  clientId: string,
  preferred: string,
  reserved: string[] = []
): string {
  const normalized = preferred.trim()
  if (normalized && !isInvoiceNumberTaken(clientId, normalized, reserved)) {
    return normalized
  }

  let seq =
    parseInvoiceNumberSequence(normalized) ??
    getMaxInvoiceSequence(clientId, reserved)

  for (let i = 0; i < 10_000; i++) {
    seq += 1
    const candidate = formatClientInvoiceNumber(seq)
    if (!isInvoiceNumberTaken(clientId, candidate, reserved)) return candidate
  }

  return formatClientInvoiceNumber(Date.now() % 1_000_000)
}
