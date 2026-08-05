/**
 * Resolve invoice due date from broker "Due by (days)".
 * 0 / missing → no automatic due date.
 * N > 0 → YYYY-MM-DD of (fromDate ?? today) + N days.
 */
export function resolveDueDateFromBroker(
  dueByDays?: number | null,
  fromDate: Date = new Date()
): string | undefined {
  const days = dueByDays == null ? 0 : Number(dueByDays)
  if (!Number.isFinite(days) || days <= 0) return undefined

  const base = new Date(fromDate)
  base.setHours(12, 0, 0, 0)
  base.setDate(base.getDate() + Math.floor(days))

  const y = base.getFullYear()
  const m = String(base.getMonth() + 1).padStart(2, '0')
  const d = String(base.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Pair of due + expected payment dates when broker due-by is set. */
export function resolveDueDatesFromBroker(
  dueByDays?: number | null,
  fromDate: Date = new Date()
): { due_date?: string; expected_payment_date?: string } {
  const due = resolveDueDateFromBroker(dueByDays, fromDate)
  if (!due) return {}
  return { due_date: due, expected_payment_date: due }
}
