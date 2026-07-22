import { mockInvoices } from '../data/mockInvoices'
import {
  isInvoiceNumberTaken,
  isSystemStyleInvoiceNumber,
  parseInvoiceNumberSequence,
} from './clientInvoiceNumbers'

/** Normalize load numbers for comparison (trim + case-insensitive). */
export function normalizeLoadNumber(loadNumber: string | undefined | null): string {
  return (loadNumber ?? '').trim().toLowerCase()
}

export type LoadNumberWarningLevel = 'same_carrier' | 'other_carrier'

export interface LoadNumberWarning {
  level: LoadNumberWarningLevel
  invoiceNumber: string
  clientName: string
  clientId: string
  loadNumber: string
}

export interface FindLoadNumberOptions {
  /** When set, only search this carrier's invoices (client portal). Omit for admin global search. */
  clientId?: string
  /** Invoice ids to ignore (e.g. the row being edited). */
  excludeInvoiceIds?: string[]
}

/**
 * Find existing invoices that reuse this load number.
 * Pass `clientId` to scope to one carrier; omit for cross-carrier (admin) search.
 */
export function findInvoicesByLoadNumber(
  loadNumber: string | undefined | null,
  options: FindLoadNumberOptions = {}
) {
  const needle = normalizeLoadNumber(loadNumber)
  if (!needle) return []

  const exclude = new Set(options.excludeInvoiceIds ?? [])

  return mockInvoices.filter((inv) => {
    if (exclude.has(inv.id)) return false
    if (options.clientId && inv.client_id !== options.clientId) return false
    return normalizeLoadNumber(inv.load_number) === needle
  })
}

/**
 * Build soft warnings for a load number reuse.
 * - `clientId` set + `crossCarrier: false` (default): same-carrier only (client portal)
 * - `crossCarrier: true`: same carrier + other carriers (Credyx admin)
 */
export function getLoadNumberWarnings(
  loadNumber: string | undefined | null,
  options: FindLoadNumberOptions & {
    /** Carrier currently creating the invoice (required for level classification). */
    forClientId: string
    /** When true, also warn about other carriers using this load #. */
    crossCarrier?: boolean
  }
): LoadNumberWarning[] {
  const needle = normalizeLoadNumber(loadNumber)
  if (!needle) return []

  const scope: FindLoadNumberOptions = {
    excludeInvoiceIds: options.excludeInvoiceIds,
    clientId: options.crossCarrier ? undefined : options.forClientId,
  }

  const matches = findInvoicesByLoadNumber(loadNumber, scope)
  const displayLoad = (loadNumber ?? '').trim()

  return matches.map((inv) => ({
    level:
      inv.client_id === options.forClientId
        ? ('same_carrier' as const)
        : ('other_carrier' as const),
    invoiceNumber: inv.invoice_number,
    clientName: inv.client_name,
    clientId: inv.client_id,
    loadNumber: displayLoad,
  }))
}

/** Human-readable message for a single load warning. */
export function formatLoadNumberWarning(
  warning: LoadNumberWarning,
  mode: 'client' | 'admin' = 'client'
): string {
  if (mode === 'client') {
    return `You already submitted load ${warning.loadNumber} on invoice ${warning.invoiceNumber}`
  }
  if (warning.level === 'same_carrier') {
    return `Load ${warning.loadNumber} was already used on invoice ${warning.invoiceNumber} for this carrier`
  }
  return `Load ${warning.loadNumber} was also used by ${warning.clientName} on invoice ${warning.invoiceNumber}`
}

/** Format multiple load warnings into one confirm/toast string. */
export function formatLoadNumberWarningsSummary(
  warnings: LoadNumberWarning[],
  mode: 'client' | 'admin' = 'client'
): string {
  if (warnings.length === 0) return ''
  const lines = warnings.map((w) => formatLoadNumberWarning(w, mode))
  return `${lines.join('\n')}\n\nSubmit anyway?`
}

export interface BatchInvoiceNumberIssue {
  index: number
  invoiceNumber: string
  reason: 'empty' | 'duplicate_in_batch' | 'already_used'
  message: string
}

/**
 * Validate invoice numbers in a pending batch against the store and within the batch.
 * Does not auto-rewrite — callers should block submit when issues are returned.
 */
export function validateBatchInvoiceNumbers(
  clientId: string,
  numbers: string[],
  options?: { excludeInvoiceIds?: string[] }
): BatchInvoiceNumberIssue[] {
  const issues: BatchInvoiceNumberIssue[] = []
  const seenExact = new Map<string, number>()
  const seenSeq = new Map<number, number>()

  for (let index = 0; index < numbers.length; index++) {
    const raw = numbers[index]?.trim() ?? ''
    if (!raw) {
      issues.push({
        index,
        invoiceNumber: raw,
        reason: 'empty',
        message: 'Invoice number is required',
      })
      continue
    }

    const lower = raw.toLowerCase()
    const prevExact = seenExact.get(lower)
    if (prevExact != null) {
      issues.push({
        index,
        invoiceNumber: raw,
        reason: 'duplicate_in_batch',
        message: `Invoice number ${raw} is duplicated in this batch (also on row ${prevExact + 1})`,
      })
      continue
    }

    // Sequence collisions only for system-style numbers (digits / INV-YYYY-NNN).
    if (isSystemStyleInvoiceNumber(raw)) {
      const seq = parseInvoiceNumberSequence(raw)
      if (seq != null) {
        const prevSeq = seenSeq.get(seq)
        if (prevSeq != null) {
          issues.push({
            index,
            invoiceNumber: raw,
            reason: 'duplicate_in_batch',
            message: `Invoice number ${raw} conflicts with another number in this batch (row ${prevSeq + 1})`,
          })
          continue
        }
      }
    }

    if (isInvoiceNumberTakenExcluding(clientId, raw, [], options?.excludeInvoiceIds)) {
      issues.push({
        index,
        invoiceNumber: raw,
        reason: 'already_used',
        message: `Invoice number ${raw} is already used for this carrier`,
      })
      continue
    }

    seenExact.set(lower, index)
    if (isSystemStyleInvoiceNumber(raw)) {
      const seq = parseInvoiceNumberSequence(raw)
      if (seq != null) seenSeq.set(seq, index)
    }
  }

  return issues
}

/** Assert a single invoice number is free for this carrier; throws if taken. */
export function assertInvoiceNumberAvailable(
  clientId: string,
  invoiceNumber: string,
  reserved: string[] = [],
  excludeInvoiceIds: string[] = []
): string {
  const normalized = invoiceNumber.trim()
  if (!normalized) {
    throw new Error('Invoice number is required')
  }
  if (isInvoiceNumberTakenExcluding(clientId, normalized, reserved, excludeInvoiceIds)) {
    throw new Error(`Invoice number ${normalized} is already used for this carrier`)
  }
  return normalized
}

/** Whether two invoice number strings collide (exact or same numeric sequence). */
export function invoiceNumbersConflict(a: string, b: string): boolean {
  const left = a.trim()
  const right = b.trim()
  if (!left || !right) return false
  if (left.toLowerCase() === right.toLowerCase()) return true
  if (!isSystemStyleInvoiceNumber(left) || !isSystemStyleInvoiceNumber(right)) return false
  const seqA = parseInvoiceNumberSequence(left)
  const seqB = parseInvoiceNumberSequence(right)
  return seqA != null && seqB != null && seqA === seqB
}

/**
 * Like `isInvoiceNumberTaken`, but can ignore specific existing invoice ids
 * (needed when editing an invoice that keeps its own number).
 */
export function isInvoiceNumberTakenExcluding(
  clientId: string,
  candidate: string,
  reserved: string[] = [],
  excludeInvoiceIds: string[] = []
): boolean {
  const normalized = candidate.trim()
  if (!normalized) return false

  if (excludeInvoiceIds.length === 0) {
    return isInvoiceNumberTaken(clientId, normalized, reserved)
  }

  const exclude = new Set(excludeInvoiceIds)
  const all = [
    ...mockInvoices
      .filter((inv) => inv.client_id === clientId && !exclude.has(inv.id))
      .map((inv) => inv.invoice_number),
    ...reserved,
  ]

  if (all.some((num) => num.trim().toLowerCase() === normalized.toLowerCase())) {
    return true
  }
  if (!isSystemStyleInvoiceNumber(normalized)) return false

  const candidateSeq = parseInvoiceNumberSequence(normalized)
  if (candidateSeq == null) return false
  return all.some((num) => {
    if (!isSystemStyleInvoiceNumber(num)) return false
    return parseInvoiceNumberSequence(num) === candidateSeq
  })
}

/** Collect load warnings for every invoice in a batch (deduped by load #). */
export function getBatchLoadNumberWarnings(
  clientId: string,
  loadNumbers: (string | undefined | null)[],
  options?: { crossCarrier?: boolean; excludeInvoiceIds?: string[] }
): LoadNumberWarning[] {
  const seenLoads = new Set<string>()
  const warnings: LoadNumberWarning[] = []

  for (const load of loadNumbers) {
    const key = normalizeLoadNumber(load)
    if (!key || seenLoads.has(key)) continue
    seenLoads.add(key)

    warnings.push(
      ...getLoadNumberWarnings(load, {
        forClientId: clientId,
        crossCarrier: options?.crossCarrier,
        excludeInvoiceIds: options?.excludeInvoiceIds,
      })
    )
  }

  return warnings
}

/**
 * Within-batch load reuse warnings (same load on multiple rows in the draft).
 * Soft only — does not block submit.
 */
export function getWithinBatchLoadWarnings(
  loadNumbers: (string | undefined | null)[]
): string[] {
  const firstIndex = new Map<string, number>()
  const messages: string[] = []

  for (let i = 0; i < loadNumbers.length; i++) {
    const key = normalizeLoadNumber(loadNumbers[i])
    if (!key) continue
    const prev = firstIndex.get(key)
    if (prev != null) {
      const display = (loadNumbers[i] ?? '').trim()
      messages.push(
        `Load ${display} appears more than once in this batch (rows ${prev + 1} and ${i + 1})`
      )
    } else {
      firstIndex.set(key, i)
    }
  }

  return messages
}
