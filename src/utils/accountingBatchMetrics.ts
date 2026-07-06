import type { PendingBatch } from '../types/admin'
import type { Invoice } from '../types/invoice'
import { getInvoicesByBatchId } from '../data/mockInvoices'

export type DateRange = 'all' | 'month' | 'quarter' | 'year'

export type BatchInvoiceOutcomes = {
  totalInvoices: number
  collectedCount: number
  collectedAmount: number
  forceClosedCount: number
  forceClosedAmount: number
}

export type BatchAccountingRow = PendingBatch & BatchInvoiceOutcomes & {
  feeAmount: number
  netAmount: number
}

export type MonthlyAccountingPoint = {
  month: string
  label: string
  fees: number
  collected: number
  forceClosed: number
  batchCount: number
}

export function getRangeStart(dateRange: DateRange): Date | null {
  const now = new Date()
  switch (dateRange) {
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1)
    case 'quarter': {
      const quarter = Math.floor(now.getMonth() / 3)
      return new Date(now.getFullYear(), quarter * 3, 1)
    }
    case 'year':
      return new Date(now.getFullYear(), 0, 1)
    default:
      return null
  }
}

export function batchInRange(submittedAt: string, dateRange: DateRange): boolean {
  const startDate = getRangeStart(dateRange)
  if (!startDate) return true
  return new Date(submittedAt) >= startDate
}

/** Collected amount for a paid invoice (uses paid_amount when set). */
export function getInvoiceCollectedAmount(invoice: Invoice): number {
  if (invoice.status !== 'paid') return 0
  return invoice.paid_amount ?? invoice.amount
}

/** Count and dollar totals for paid and force-closed invoices on a batch. */
export function getBatchInvoiceOutcomes(batchId: string): BatchInvoiceOutcomes {
  const invoices = getInvoicesByBatchId(batchId)
  let collectedCount = 0
  let collectedAmount = 0
  let forceClosedCount = 0
  let forceClosedAmount = 0

  for (const inv of invoices) {
    if (inv.status === 'paid') {
      collectedCount += 1
      collectedAmount += getInvoiceCollectedAmount(inv)
    } else if (inv.status === 'force_closed') {
      forceClosedCount += 1
      forceClosedAmount += inv.amount
    }
  }

  return {
    totalInvoices: invoices.length,
    collectedCount,
    collectedAmount,
    forceClosedCount,
    forceClosedAmount,
  }
}

/** Merge batch fee data with live invoice collection outcomes. */
export function buildBatchAccountingRow(batch: PendingBatch): BatchAccountingRow {
  const outcomes = getBatchInvoiceOutcomes(batch.id)
  return {
    ...batch,
    ...outcomes,
    feeAmount: batch.fee_calculation?.total_fee ?? 0,
    netAmount: batch.fee_calculation?.net_amount ?? 0,
  }
}

export function buildBatchAccountingRows(
  batches: PendingBatch[],
  dateRange: DateRange,
  clientId?: string,
  searchTerm?: string
): BatchAccountingRow[] {
  const q = searchTerm?.trim().toLowerCase() ?? ''
  return batches
    .filter((batch) => {
      if (!batchInRange(batch.submitted_at, dateRange)) return false
      if (clientId && batch.client_id !== clientId) return false
      if (!q) return true
      return (
        batch.batch_number.toLowerCase().includes(q) ||
        batch.client_name.toLowerCase().includes(q)
      )
    })
    .map(buildBatchAccountingRow)
}

export function summarizeBatchAccounting(rows: BatchAccountingRow[]) {
  return rows.reduce(
    (acc, row) => {
      acc.totalFees += row.feeAmount
      acc.totalBatchAmount += row.total_amount
      acc.totalNetAmount += row.netAmount
      acc.collectedCount += row.collectedCount
      acc.collectedAmount += row.collectedAmount
      acc.forceClosedCount += row.forceClosedCount
      acc.forceClosedAmount += row.forceClosedAmount
      acc.batchCount += 1
      return acc
    },
    {
      totalFees: 0,
      totalBatchAmount: 0,
      totalNetAmount: 0,
      collectedCount: 0,
      collectedAmount: 0,
      forceClosedCount: 0,
      forceClosedAmount: 0,
      batchCount: 0,
    }
  )
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: 'short',
    year: '2-digit',
  })
}

/** Group batch accounting rows by submission month for report charts. */
export function buildMonthlyReportSeries(rows: BatchAccountingRow[]): MonthlyAccountingPoint[] {
  const byMonth = new Map<string, MonthlyAccountingPoint>()

  for (const row of rows) {
    const key = monthKey(new Date(row.submitted_at))
    const existing = byMonth.get(key) ?? {
      month: key,
      label: monthLabel(key),
      fees: 0,
      collected: 0,
      forceClosed: 0,
      batchCount: 0,
    }
    existing.fees += row.feeAmount
    existing.collected += row.collectedAmount
    existing.forceClosed += row.forceClosedAmount
    existing.batchCount += 1
    byMonth.set(key, existing)
  }

  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month))
}
