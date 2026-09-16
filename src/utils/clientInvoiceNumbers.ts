import { mockInvoices } from '../data/mockInvoices'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase'

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

/**
 * Sequence equivalence only applies to system-style numbers (digits / INV-YYYY-NNN).
 * Custom labels like `ABC-12` are compared by exact string only so they are never
 * silently remapped to the next system sequence.
 */
export function isSystemStyleInvoiceNumber(invoiceNumber: string): boolean {
  const trimmed = invoiceNumber.trim()
  return /^\d+$/.test(trimmed) || /^INV-\d{4}-\d+$/i.test(trimmed)
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

function invoiceNumberExactMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** True if `candidate` is already used by this client (store + optional reserved pending list). */
export function isInvoiceNumberTaken(
  clientId: string,
  candidate: string,
  reserved: string[] = []
): boolean {
  const normalized = candidate.trim()
  if (!normalized) return false
  const all = numbersForClient(clientId, reserved)

  if (all.some((num) => invoiceNumberExactMatch(num, normalized))) return true

  // Custom / alphanumeric numbers: exact match only (never rewrite via sequence).
  if (!isSystemStyleInvoiceNumber(normalized)) return false

  const candidateSeq = parseInvoiceNumberSequence(normalized)
  if (candidateSeq == null) return false
  return all.some((num) => {
    if (!isSystemStyleInvoiceNumber(num)) return false
    return parseInvoiceNumberSequence(num) === candidateSeq
  })
}

/** Highest numeric sequence already used by this client (memory + optional pending list). */
export function getMaxInvoiceSequence(clientId: string, additionalNumbers: string[] = []): number {
  let max = 0
  for (const num of numbersForClient(clientId, additionalNumbers)) {
    // Only system-style numbers feed the auto-increment sequence.
    if (!isSystemStyleInvoiceNumber(num)) continue
    const seq = parseInvoiceNumberSequence(num)
    if (seq != null && seq > max) max = seq
  }
  return max
}

/** Next invoice number for a client (`001`, `002`, …) from known in-memory + reserved lists. */
export function getNextClientInvoiceNumber(
  clientId: string,
  additionalNumbers: string[] = []
): string {
  return formatClientInvoiceNumber(getMaxInvoiceSequence(clientId, additionalNumbers) + 1)
}

/**
 * Load every invoice number for a carrier from memory + Supabase so auto-assign
 * does not collide with DB unique (client_id, invoice_number).
 */
export async function loadClientInvoiceNumbers(clientId: string): Promise<string[]> {
  const fromMemory = mockInvoices
    .filter((inv) => inv.client_id === clientId)
    .map((inv) => inv.invoice_number.trim())
    .filter(Boolean)

  if (!isSupabaseConfigured()) {
    return [...new Set(fromMemory)]
  }

  const supabase = getSupabase()
  if (!supabase) return [...new Set(fromMemory)]

  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('invoice_number')
      .eq('client_id', clientId)
      .limit(5000)

    if (error) {
      console.warn('[loadClientInvoiceNumbers]', error.message)
      return [...new Set(fromMemory)]
    }

    const fromDb = (data ?? [])
      .map((row) => String((row as { invoice_number?: string }).invoice_number ?? '').trim())
      .filter(Boolean)

    return [...new Set([...fromMemory, ...fromDb])]
  } catch (err) {
    console.warn('[loadClientInvoiceNumbers]', err)
    return [...new Set(fromMemory)]
  }
}

/**
 * Next invoice number after checking live DB + memory.
 * Pass `reserved` for numbers already claimed in this batch draft.
 */
export async function getNextClientInvoiceNumberAsync(
  clientId: string,
  reserved: string[] = []
): Promise<string> {
  const existing = await loadClientInvoiceNumbers(clientId)
  return getNextClientInvoiceNumber(clientId, [...existing, ...reserved])
}

/**
 * Allocate `count` unique invoice numbers for a carrier, checking DB first.
 */
export async function allocateClientInvoiceNumbers(
  clientId: string,
  count: number,
  alreadyReserved: string[] = []
): Promise<string[]> {
  const existing = await loadClientInvoiceNumbers(clientId)
  const reserved = [...existing, ...alreadyReserved]
  const allocated: string[] = []
  for (let i = 0; i < count; i++) {
    const next = getNextClientInvoiceNumber(clientId, [...reserved, ...allocated])
    allocated.push(next)
  }
  return allocated
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
    (isSystemStyleInvoiceNumber(normalized)
      ? parseInvoiceNumberSequence(normalized)
      : null) ?? getMaxInvoiceSequence(clientId, reserved)

  for (let i = 0; i < 10_000; i++) {
    seq += 1
    const candidate = formatClientInvoiceNumber(seq)
    if (!isInvoiceNumberTaken(clientId, candidate, reserved)) return candidate
  }

  return formatClientInvoiceNumber(Date.now() % 1_000_000)
}

/**
 * Async unique check that includes Supabase rows (avoids invoices_client_number_uidx).
 */
export async function ensureUniqueClientInvoiceNumberAsync(
  clientId: string,
  preferred: string,
  reserved: string[] = []
): Promise<string> {
  const existing = await loadClientInvoiceNumbers(clientId)
  return ensureUniqueClientInvoiceNumber(clientId, preferred, [...existing, ...reserved])
}
