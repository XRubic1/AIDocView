import { getAmountToleranceSettings } from './reviewRulesEngine'

/** Compare freight dollar amounts with a practical tolerance for OCR/line-item differences. */

export type AmountComparison = 'exact' | 'close' | 'mismatch'

export function freightAmountDifference(a?: number | null, b?: number | null): number | null {
  if (a == null || b == null) return null
  return b - a
}

/** Allowed variance from Rules page (default $15 or 0.5% of larger amount). */
export function freightAmountTolerance(a: number, b: number): number {
  const { minUsd, percentFraction } = getAmountToleranceSettings()
  const base = Math.max(Math.abs(a), Math.abs(b))
  return Math.max(minUsd, base * percentFraction)
}

export function classifyFreightAmounts(a?: number | null, b?: number | null): AmountComparison {
  if (a == null || b == null) return 'mismatch'
  const diff = Math.abs(a - b)
  if (diff <= 0.01) return 'exact'
  if (diff <= freightAmountTolerance(a, b)) return 'close'
  return 'mismatch'
}

/** True when amounts match exactly or within freight tolerance. */
export function freightAmountsMatch(a?: number | null, b?: number | null): boolean {
  const kind = classifyFreightAmounts(a, b)
  return kind === 'exact' || kind === 'close'
}
