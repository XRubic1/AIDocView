import type { BrokerScoreRow } from './clientReports'
import type { TaxReportSummary } from './clientReports'
import type { PaymentLagStats } from './clientReports'
import type { PeriodSummary } from './clientReports'
import type { CashCollectionForecast } from './cashCollectionForecast'

/**
 * Industry-standard report pack for freight / trucking client portals.
 * Mapped from factoring portals, month-end AR checklists, and carrier KPI guides.
 */
export const OVERVIEW_REPORT_SECTIONS = [
  {
    id: 'cash_flow',
    title: 'Cash flow trend',
    industryLabel: 'Cash flow',
    description: 'Monthly invoiced vs collected — core operating cash visibility.',
  },
  {
    id: 'collection_forecast',
    title: 'Expected collections',
    industryLabel: 'Collection forecast',
    description: 'Predicted cash from open A/R using due dates and broker pay patterns.',
  },
  {
    id: 'collections',
    title: 'Collections effectiveness',
    industryLabel: 'Collections',
    description: 'Period invoiced/collected, DSO, on-time pay rate, and monthly trend.',
  },
  {
    id: 'aging',
    title: 'A/R aging snapshot',
    industryLabel: 'Invoice aging',
    description: 'Open receivables by age bucket — identifies overdue exposure.',
  },
  {
    id: 'broker_risk',
    title: 'Broker credit & risk',
    industryLabel: 'Broker pay risk',
    description: 'Pay speed, risk rating, concentration, and overdue by broker.',
  },
  {
    id: 'tax',
    title: 'Tax & revenue',
    industryLabel: 'Tax / 1099',
    description: 'Gross freight revenue collected for tax prep and 1099 reference.',
  },
] as const

export type ConcentrationRisk = {
  top_broker_name: string | null
  top_broker_ar: number
  top_broker_pct: number
  top3_pct: number
  is_elevated: boolean
}

/** Share of open A/R held by top broker(s) — concentration risk indicator. */
export function computeConcentrationRisk(brokers: BrokerScoreRow[]): ConcentrationRisk {
  const withAr = brokers.filter((b) => b.open_ar > 0).sort((a, b) => b.open_ar - a.open_ar)
  const total = withAr.reduce((s, b) => s + b.open_ar, 0)

  if (total === 0 || !withAr[0]) {
    return {
      top_broker_name: null,
      top_broker_ar: 0,
      top_broker_pct: 0,
      top3_pct: 0,
      is_elevated: false,
    }
  }

  const top = withAr[0]
  const top3 = withAr.slice(0, 3).reduce((s, b) => s + b.open_ar, 0)
  const top_pct = (top.open_ar / total) * 100

  return {
    top_broker_name: top.broker_name,
    top_broker_ar: top.open_ar,
    top_broker_pct: top_pct,
    top3_pct: (top3 / total) * 100,
    is_elevated: top_pct >= 40,
  }
}

/** CSV rows for the overview report pack export. */
export function buildOverviewCsvRows(input: {
  summary: PeriodSummary
  aging: { overdue_amount: number; total_ar: number }
  taxReport: TaxReportSummary
  paymentLag: PaymentLagStats
  forecast: CashCollectionForecast
  concentration: ConcentrationRisk
  brokerRiskRows: Array<{ broker_name: string; rating: string; collected_in_range: number; overdue_amount: number }>
}): string {
  const { summary, aging, taxReport, paymentLag, forecast, concentration, brokerRiskRows } = input
  let csv = 'Section,Metric,Value\n'

  csv += `Collections,Invoiced,${summary.invoiced}\n`
  csv += `Collections,Collected,${summary.collected}\n`
  csv += `Collections,Collection rate,${summary.collection_rate.toFixed(1)}%\n`
  csv += `Collections,DSO,${summary.dso ?? ''}\n`
  csv += `Collections,Open A/R,${summary.open_ar}\n`
  csv += `Collections,Overdue,${aging.overdue_amount}\n`
  csv += `Payment behavior,On-time %,${paymentLag.on_time_pct.toFixed(1)}%\n`
  csv += `Payment behavior,Late %,${paymentLag.late_pct.toFixed(1)}%\n`
  csv += `Payment behavior,Avg pay lag (days),${paymentLag.avg_days ?? ''}\n`
  csv += `Forecast,Expected 7 days,${forecast.next_7_days}\n`
  csv += `Forecast,Expected 30 days,${forecast.next_30_days}\n`
  csv += `Forecast,Open A/R,${forecast.open_ar}\n`
  csv += `Concentration,Top broker,${concentration.top_broker_name ?? ''}\n`
  csv += `Concentration,Top broker % of A/R,${concentration.top_broker_pct.toFixed(1)}%\n`
  csv += `Concentration,Top 3 brokers % of A/R,${concentration.top3_pct.toFixed(1)}%\n`
  csv += `Tax,Gross collected,${taxReport.gross_collected}\n`
  csv += `Tax,Payment count,${taxReport.payment_count}\n`

  taxReport.by_broker.forEach((b) => {
    csv += `Tax broker,${b.broker_name},${b.gross_collected}\n`
  })
  brokerRiskRows.forEach((b) => {
    csv += `Broker risk,${b.broker_name},${b.rating}\n`
  })

  return csv
}
