import type { Batch } from '../data/mockBatches'

/** Parse numeric sequence from `BATCH-2026-001-ABCL`. */
export function parseBatchSequence(
  batchNumber: string,
  year: number,
  clientCode: string
): number | null {
  const re = new RegExp(`^BATCH-${year}-(\\d+)-${clientCode}$`, 'i')
  const match = batchNumber.match(re)
  if (!match) return null
  return Number.parseInt(match[1], 10)
}

function formatBatchSequence(sequence: number): string {
  if (sequence < 1000) return String(sequence).padStart(3, '0')
  return String(sequence)
}

/** Highest batch sequence for a client in the current year (new format only). */
export function getMaxBatchSequence(
  batches: Pick<Batch, 'client_id' | 'batch_number'>[],
  clientId: string,
  clientCode: string
): number {
  const year = new Date().getFullYear()
  let max = 0
  for (const batch of batches.filter((b) => b.client_id === clientId)) {
    const seq = parseBatchSequence(batch.batch_number, year, clientCode)
    if (seq != null && seq > max) max = seq
  }
  return max
}

export function buildBatchNumber(year: number, sequence: number, clientCode: string): string {
  return `BATCH-${year}-${formatBatchSequence(sequence)}-${clientCode.toUpperCase()}`
}
