import { useMemo, useState, useCallback, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  FileText,
  Info,
  Landmark,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useClientDemoSnapshot } from '../hooks/useClientDemoSnapshot'
import { formatCurrency, formatDate } from '../utils/format'
import CashFlowChart from '../components/client/CashFlowChart'
import CashCollectionForecast from '../components/client/CashCollectionForecast'
import BrokerRiskLevelChip from '../components/client/BrokerRiskLevelChip'
import {
  computeBrokerScores,
  computeCashFlowTrend,
  computeOpenArAging,
  computePaymentLag,
  computePeriodSummary,
  computePipelineMetrics,
  computeTaxReport,
  generateReportInsights,
  getPresetRange,
  type BrokerScoreRow,
  type DateRange,
  type ReportInsight,
} from '../utils/clientReports'
import { computeCashCollectionForecast } from '../utils/cashCollectionForecast'
import { buildOverviewCsvRows, computeConcentrationRisk } from '../utils/clientOverviewReports'
import {
  computeAvgDaysToPay,
  computeFeeSummary,
  computePaperworkSpeed,
  computeShortPaySummary,
  downloadTextFile,
  listActivityYears,
  listRecentMonths,
  monthToRange,
  toCsv,
  yearToRange,
} from '../utils/clientReportsExtra'
import { generateCarrierStatementPdf } from '../utils/generateCarrierStatementPdf'
import { getCarrierVisibleBrokerRiskLevel } from '../utils/clientBrokers'
import { mockBrokers } from '../data/mockBrokers'
import { useToast } from '../components/ui/ToastProvider'
import '../styles/clientReportsClean.css'

type ReportTab = 'overview' | 'brokers' | 'cash' | 'statements'
type DatePreset = 'mtd' | '30d' | '90d' | 'ytd'
type BrokerSortKey =
  | 'broker_name'
  | 'open_ar'
  | 'overdue_amount'
  | 'collected_in_range'
  | 'avg_days_invoice_to_pay'
  | 'late_payment_count'

const REPORT_TABS: { id: ReportTab; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'brokers', label: 'Brokers', icon: Users },
  { id: 'cash', label: 'Cash & fees', icon: Wallet },
  { id: 'statements', label: 'Statements', icon: FileText },
]

const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'mtd', label: 'This month' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
  { id: 'ytd', label: 'Year to date' },
]

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  check: 'Check',
  wire: 'Wire',
  ach: 'ACH',
  credit_card: 'Card',
}

/** Previous period of equal length ending the day before the current range starts. */
function getPreviousEqualRange(range: DateRange): DateRange {
  const start = new Date(`${range.start_date}T00:00:00`)
  const end = new Date(`${range.end_date}T00:00:00`)
  const durationMs = end.getTime() - start.getTime()
  const prevEnd = new Date(start.getTime() - 86_400_000)
  const prevStart = new Date(prevEnd.getTime() - durationMs)
  return {
    start_date: prevStart.toISOString().split('T')[0],
    end_date: prevEnd.toISOString().split('T')[0],
  }
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? null : 100
  return ((current - previous) / previous) * 100
}

function formatDays(days: number | null): string {
  if (days == null) return '—'
  return `${days} ${days === 1 ? 'day' : 'days'}`
}

/* ── Building blocks ── */

function Scope({ children }: { children: ReactNode }) {
  return <span className="rpt-scope">{children}</span>
}

function Card({
  title,
  scope,
  action,
  children,
  className = '',
}: {
  title: string
  scope?: string
  action?: { label: string; onClick: () => void }
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`rpt-card ${className}`.trim()}>
      <header className="rpt-card__head">
        <div className="rpt-card__title">
          <h2>{title}</h2>
          {scope ? <Scope>{scope}</Scope> : null}
        </div>
        {action ? (
          <button type="button" className="rpt-link" onClick={action.onClick}>
            {action.label}
            <ArrowRight size={14} aria-hidden />
          </button>
        ) : null}
      </header>
      <div className="rpt-card__body">{children}</div>
    </section>
  )
}

function Trend({ pct, invert = false }: { pct: number | null; invert?: boolean }) {
  if (pct == null || !Number.isFinite(pct) || Math.abs(pct) < 0.5) return null
  const good = invert ? pct < 0 : pct > 0
  const Icon = pct > 0 ? TrendingUp : TrendingDown
  return (
    <span className={`rpt-trend ${good ? 'is-good' : 'is-bad'}`}>
      <Icon size={12} aria-hidden />
      {Math.abs(pct).toFixed(0)}% vs prior period
    </span>
  )
}

function Kpi({
  label,
  value,
  sub,
  trend,
  tone,
}: {
  label: string
  value: string
  sub?: string
  trend?: ReactNode
  tone?: 'alert' | 'accent'
}) {
  return (
    <div className={`rpt-kpi${tone ? ` is-${tone}` : ''}`}>
      <span className="rpt-kpi__label">{label}</span>
      <span className="rpt-kpi__value">{value}</span>
      {trend ?? (sub ? <span className="rpt-kpi__sub">{sub}</span> : null)}
    </div>
  )
}

function BarRow({
  label,
  value,
  max,
  display,
  sub,
  tone,
}: {
  label: string
  value: number
  max: number
  display: string
  sub?: string
  tone?: 'alert' | 'muted'
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="rpt-bar" title={`${label}: ${display}${sub ? ` · ${sub}` : ''}`}>
      <div className="rpt-bar__head">
        <span className="rpt-bar__label">{label}</span>
        <span className="rpt-bar__value">{display}</span>
      </div>
      <div className="rpt-bar__track">
        <div
          className={`rpt-bar__fill${tone ? ` is-${tone}` : ''}`}
          style={{ width: value > 0 ? `max(${pct}%, 4px)` : 0 }}
        />
      </div>
      {sub ? <span className="rpt-bar__sub">{sub}</span> : null}
    </div>
  )
}

const INSIGHT_ICONS: Record<ReportInsight['tone'], LucideIcon> = {
  danger: AlertTriangle,
  warning: AlertCircle,
  success: CheckCircle2,
  info: Info,
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rpt-empty">{children}</p>
}

/* ── Page ── */

export default function ClientReports() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const {
    invoices,
    payments,
    clientId,
    clientName,
    dashboard,
  } = useClientDemoSnapshot()
  const carrierName = clientName || dashboard?.client_name || 'Carrier'

  const tabParam = searchParams.get('tab') as ReportTab | null
  const tab: ReportTab = REPORT_TABS.some((t) => t.id === tabParam) ? tabParam! : 'overview'
  const setTab = (next: ReportTab) => {
    const params = new URLSearchParams(searchParams)
    if (next === 'overview') params.delete('tab')
    else params.set('tab', next)
    setSearchParams(params, { replace: true })
  }

  const [datePreset, setDatePreset] = useState<DatePreset | 'custom'>('90d')
  const [dateRange, setDateRange] = useState<DateRange>(() => getPresetRange('90d'))
  const applyPreset = (preset: DatePreset) => {
    setDatePreset(preset)
    setDateRange(getPresetRange(preset))
  }
  const rangeLabel = `${formatDate(dateRange.start_date)} – ${formatDate(dateRange.end_date)}`
  const previousRange = useMemo(() => getPreviousEqualRange(dateRange), [dateRange])

  /* Core metrics */
  const summary = useMemo(
    () => computePeriodSummary(invoices, payments, dateRange),
    [invoices, payments, dateRange]
  )
  const prevSummary = useMemo(
    () => computePeriodSummary(invoices, payments, previousRange),
    [invoices, payments, previousRange]
  )
  const aging = useMemo(() => computeOpenArAging(invoices, new Date(), payments), [invoices, payments])
  const cashFlow = useMemo(() => computeCashFlowTrend(invoices, payments, 6), [invoices, payments])
  const forecast = useMemo(
    () => computeCashCollectionForecast(invoices, payments),
    [invoices, payments]
  )
  const pipeline = useMemo(() => computePipelineMetrics(invoices, dateRange), [invoices, dateRange])
  const paymentLag = useMemo(
    () => computePaymentLag(payments, invoices, dateRange),
    [payments, invoices, dateRange]
  )
  const avgDaysToPay = useMemo(
    () => computeAvgDaysToPay(invoices, payments, dateRange),
    [invoices, payments, dateRange]
  )
  const prevAvgDaysToPay = useMemo(
    () => computeAvgDaysToPay(invoices, payments, previousRange),
    [invoices, payments, previousRange]
  )

  /* Brokers */
  const termsByBrokerName = useMemo(() => {
    const terms: Record<string, number | null | undefined> = {}
    for (const b of mockBrokers) terms[b.name] = b.payment_terms_days
    return terms
  }, [])
  const brokers = useMemo(
    () => computeBrokerScores(invoices, payments, dateRange, new Date(), termsByBrokerName),
    [invoices, payments, dateRange, termsByBrokerName]
  )
  const concentration = useMemo(() => computeConcentrationRisk(brokers), [brokers])
  const riskByBroker = useMemo(() => {
    const map = new Map<string, ReturnType<typeof getCarrierVisibleBrokerRiskLevel>>()
    for (const b of brokers) {
      const sample = invoices.find((i) => i.broker_name === b.broker_name)
      map.set(
        b.broker_name,
        getCarrierVisibleBrokerRiskLevel(clientId, {
          broker_id: sample?.broker_id ?? '',
          broker_name: b.broker_name,
        })
      )
    }
    return map
  }, [brokers, invoices, clientId])
  const [brokerSort, setBrokerSort] = useState<{ key: BrokerSortKey; dir: 'asc' | 'desc' }>({
    key: 'open_ar',
    dir: 'desc',
  })
  const sortedBrokers = useMemo(() => {
    const rows = [...brokers]
    const { key, dir } = brokerSort
    rows.sort((a, b) => {
      const av = a[key] ?? -1
      const bv = b[key] ?? -1
      const cmp =
        typeof av === 'string' && typeof bv === 'string'
          ? av.localeCompare(bv)
          : Number(av) - Number(bv)
      return dir === 'asc' ? cmp : -cmp
    })
    return rows
  }, [brokers, brokerSort])
  const toggleBrokerSort = (key: BrokerSortKey) =>
    setBrokerSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'broker_name' ? 'asc' : 'desc' }
    )
  const openBroker = (row: BrokerScoreRow) => {
    const sample = invoices.find((i) => i.broker_name === row.broker_name)
    const key = sample?.broker_id || row.broker_name
    navigate(`/client/brokers?broker=${encodeURIComponent(key)}`)
  }

  const insights = useMemo(
    () => generateReportInsights({ summary, aging, brokers, pipeline, paymentLag, cashFlow }).slice(0, 3),
    [summary, aging, brokers, pipeline, paymentLag, cashFlow]
  )

  /* Cash & fees */
  const fees = useMemo(() => computeFeeSummary(invoices, payments, dateRange), [invoices, payments, dateRange])
  const prevFees = useMemo(
    () => computeFeeSummary(invoices, payments, previousRange),
    [invoices, payments, previousRange]
  )
  const shortPays = useMemo(
    () => computeShortPaySummary(invoices, payments, dateRange),
    [invoices, payments, dateRange]
  )
  const paperwork = useMemo(() => computePaperworkSpeed(invoices, dateRange), [invoices, dateRange])
  const paymentMethods = useMemo(() => {
    const confirmed = payments.filter(
      (p) =>
        p.status === 'confirmed' &&
        p.received_date >= dateRange.start_date &&
        p.received_date <= dateRange.end_date
    )
    return Object.keys(PAYMENT_METHOD_LABELS)
      .map((method) => {
        const items = confirmed.filter((p) => p.payment_method === method)
        return {
          method: PAYMENT_METHOD_LABELS[method],
          amount: items.reduce((s, p) => s + p.amount, 0),
          count: items.length,
        }
      })
      .filter((m) => m.count > 0)
      .sort((a, b) => b.amount - a.amount)
  }, [payments, dateRange])

  /* Statements */
  const months = useMemo(() => listRecentMonths(12), [])
  const years = useMemo(() => listActivityYears(invoices, payments), [invoices, payments])
  const [statementMonth, setStatementMonth] = useState(() => months[1]?.key ?? months[0].key)
  const [taxYear, setTaxYear] = useState(() => new Date().getFullYear())
  const statementRange = useMemo(() => monthToRange(statementMonth), [statementMonth])
  const statementLabel = months.find((m) => m.key === statementMonth)?.label ?? statementMonth
  const statementSummary = useMemo(
    () => computePeriodSummary(invoices, payments, statementRange),
    [invoices, payments, statementRange]
  )
  const statementFees = useMemo(
    () => computeFeeSummary(invoices, payments, statementRange),
    [invoices, payments, statementRange]
  )
  const statementPayments = useMemo(
    () =>
      payments
        .filter(
          (p) =>
            p.status === 'confirmed' &&
            p.received_date >= statementRange.start_date &&
            p.received_date <= statementRange.end_date
        )
        .sort((a, b) => a.received_date.localeCompare(b.received_date)),
    [payments, statementRange]
  )
  const statementByBroker = useMemo(() => {
    const map = new Map<string, { broker: string; invoiced: number; collected: number }>()
    const row = (name: string) => {
      const existing = map.get(name) ?? { broker: name, invoiced: 0, collected: 0 }
      map.set(name, existing)
      return existing
    }
    for (const inv of invoices) {
      if (inv.invoice_date >= statementRange.start_date && inv.invoice_date <= statementRange.end_date) {
        row(inv.broker_name).invoiced += inv.amount
      }
    }
    for (const p of statementPayments) row(p.broker_name).collected += p.amount
    return [...map.values()].sort((a, b) => b.collected - a.collected || b.invoiced - a.invoiced)
  }, [invoices, statementPayments, statementRange])
  const taxReport = useMemo(
    () => computeTaxReport(invoices, payments, yearToRange(taxYear)),
    [invoices, payments, taxYear]
  )
  const [pdfBusy, setPdfBusy] = useState(false)

  const feeNote = (summaryFees: typeof fees) =>
    summaryFees.terms_labels.length > 0
      ? `Estimated from your fee terms (${summaryFees.terms_labels.join(', ')})`
      : 'No fee terms on file for these invoices'

  /* Exports */
  const exportCurrentTab = useCallback(() => {
    const stamp = `${dateRange.start_date}_to_${dateRange.end_date}`
    if (tab === 'overview') {
      downloadTextFile(
        `credyx_overview_${stamp}.csv`,
        buildOverviewCsvRows({
          summary,
          aging,
          taxReport: computeTaxReport(invoices, payments, dateRange),
          paymentLag,
          forecast,
          concentration,
          brokerRiskRows: brokers.map((b) => ({
            broker_name: b.broker_name,
            rating: riskByBroker.get(b.broker_name) ?? 'unrated',
            collected_in_range: b.collected_in_range,
            overdue_amount: b.overdue_amount,
          })),
        })
      )
      return
    }
    if (tab === 'brokers') {
      downloadTextFile(
        `credyx_brokers_${stamp}.csv`,
        toCsv([
          ['Broker', 'Risk', 'Open A/R', 'Share of A/R %', 'Overdue', 'Collected in range', 'Avg days to pay', 'Late payments', 'Terms (days)'],
          ...sortedBrokers.map((b) => [
            b.broker_name,
            riskByBroker.get(b.broker_name) ?? 'unrated',
            b.open_ar,
            b.share_of_ar.toFixed(1),
            b.overdue_amount,
            b.collected_in_range,
            b.avg_days_invoice_to_pay ?? '',
            b.late_payment_count ?? 0,
            b.payment_terms_days ?? '',
          ]),
        ])
      )
      return
    }
    if (tab === 'cash') {
      downloadTextFile(
        `credyx_cash_and_fees_${stamp}.csv`,
        toCsv([
          ['Section', 'Metric', 'Value'],
          ['Period', 'Invoiced', summary.invoiced],
          ['Period', 'Collected', summary.collected],
          ['Fees', 'Gross collected', fees.gross_collected],
          ['Fees', 'Credyx fees (estimated)', fees.fees],
          ['Fees', 'Net to you', fees.net],
          ['Fees', 'Collected on trial (fees waived)', fees.waived_gross],
          ['Short pays', 'Short paid', shortPays.short_amount],
          ['Short pays', 'Short paid invoices', shortPays.short_count],
          ['Short pays', 'Written off', shortPays.written_off_amount],
          ['Short pays', 'Overpaid', shortPays.over_amount],
          ['Forecast', 'Expected next 7 days', forecast.next_7_days],
          ['Forecast', 'Expected next 30 days', forecast.next_30_days],
          ...cashFlow.map((m) => ['Monthly', `${m.month} invoiced`, m.invoiced]),
          ...cashFlow.map((m) => ['Monthly', `${m.month} collected`, m.collected]),
        ])
      )
    }
  }, [
    tab,
    dateRange,
    summary,
    aging,
    invoices,
    payments,
    paymentLag,
    forecast,
    concentration,
    brokers,
    riskByBroker,
    sortedBrokers,
    fees,
    shortPays,
    cashFlow,
  ])

  const downloadStatementPdf = async () => {
    setPdfBusy(true)
    try {
      await generateCarrierStatementPdf({
        carrierName,
        periodLabel: statementLabel,
        startDate: statementRange.start_date,
        endDate: statementRange.end_date,
        summary: {
          invoiced: statementSummary.invoiced,
          invoiceCount: statementSummary.invoice_count,
          collected: statementSummary.collected,
          paymentCount: statementSummary.payment_count,
          fees: statementFees.fees,
          net: statementFees.net,
          openAr: aging.total_ar,
        },
        feeNote: feeNote(statementFees),
        byBroker: statementByBroker,
        payments: statementPayments.map((p) => ({
          date: p.received_date,
          invoice: p.invoice_number,
          broker: p.broker_name,
          method: PAYMENT_METHOD_LABELS[p.payment_method] ?? p.payment_method,
          amount: p.amount,
        })),
      })
    } catch {
      showToast('Could not create the PDF. Try again.', 'error')
    } finally {
      setPdfBusy(false)
    }
  }

  const downloadStatementCsv = () =>
    downloadTextFile(
      `credyx_statement_${statementMonth}.csv`,
      toCsv([
        ['Statement', statementLabel],
        ['Carrier', carrierName],
        [],
        ['Invoiced', statementSummary.invoiced],
        ['Collected', statementSummary.collected],
        ['Credyx fees (estimated)', statementFees.fees],
        ['Net to you', statementFees.net],
        [],
        ['Date received', 'Invoice', 'Broker', 'Method', 'Amount'],
        ...statementPayments.map((p) => [
          p.received_date,
          p.invoice_number,
          p.broker_name,
          PAYMENT_METHOD_LABELS[p.payment_method] ?? p.payment_method,
          p.amount,
        ]),
      ])
    )

  const downloadTaxCsv = () =>
    downloadTextFile(
      `credyx_1099_summary_${taxYear}.csv`,
      toCsv([
        ['Tax year', taxYear],
        ['Gross collected', taxReport.gross_collected],
        [],
        ['Broker', 'Gross collected', 'Payments'],
        ...taxReport.by_broker.map((b) => [b.broker_name, b.gross_collected, b.payment_count]),
      ])
    )

  const downloadAllInvoices = () =>
    downloadTextFile(
      'credyx_all_invoices.csv',
      toCsv([
        ['Invoice', 'Load', 'Broker', 'Invoice date', 'Due date', 'Amount', 'Paid', 'Status', 'Batch'],
        ...invoices.map((i) => [
          i.invoice_number,
          i.load_number ?? '',
          i.broker_name,
          i.invoice_date,
          i.due_date ?? '',
          i.amount,
          i.paid_amount ?? '',
          i.status,
          i.batch_number ?? '',
        ]),
      ])
    )

  const downloadAllPayments = () =>
    downloadTextFile(
      'credyx_all_payments.csv',
      toCsv([
        ['Received', 'Invoice', 'Broker', 'Method', 'Reference', 'Amount', 'Status'],
        ...payments.map((p) => [
          p.received_date,
          p.invoice_number,
          p.broker_name,
          PAYMENT_METHOD_LABELS[p.payment_method] ?? p.payment_method,
          p.payment_reference ?? '',
          p.amount,
          p.status,
        ]),
      ])
    )

  const maxAging = Math.max(...aging.buckets.map((b) => b.amount), 1)
  const topBrokers = brokers.filter((b) => b.open_ar > 0).slice(0, 5)
  const maxTopBroker = Math.max(...topBrokers.map((b) => b.open_ar), 1)
  const maxMethod = Math.max(...paymentMethods.map((m) => m.amount), 1)
  const onTimeKnown = paymentLag.sample_size > 0

  const sortHeader = (key: BrokerSortKey, label: string, align: 'left' | 'right' = 'right') => {
    const active = brokerSort.key === key
    return (
      <th className={align === 'right' ? 'is-num' : undefined}>
        <button
          type="button"
          className={`rpt-sort${active ? ' is-active' : ''}`}
          onClick={() => toggleBrokerSort(key)}
          aria-sort={active ? (brokerSort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        >
          {label}
          {active ? (
            brokerSort.dir === 'asc' ? <ChevronUp size={13} aria-hidden /> : <ChevronDown size={13} aria-hidden />
          ) : null}
        </button>
      </th>
    )
  }

  return (
    <div className="client-reports-page rpt overflow-hidden flex flex-col min-h-0">
      {/* Toolbar: report tabs, date range, export */}
      <div className="rpt-toolbar shrink-0">
        <div className="rpt-tabs" role="tablist" aria-label="Reports">
          {REPORT_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`rpt-tab${tab === t.id ? ' is-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <t.icon size={15} aria-hidden />
              {t.label}
            </button>
          ))}
        </div>

        {tab !== 'statements' ? (
          <div className="rpt-filters">
            <div className="rpt-presets" role="group" aria-label="Date range">
              {DATE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`rpt-preset${datePreset === p.id ? ' is-active' : ''}`}
                  aria-pressed={datePreset === p.id}
                  onClick={() => applyPreset(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className={`rpt-dates${datePreset === 'custom' ? ' is-active' : ''}`}>
              <input
                type="date"
                value={dateRange.start_date}
                max={dateRange.end_date}
                onChange={(e) => {
                  setDatePreset('custom')
                  setDateRange((prev) => ({ ...prev, start_date: e.target.value }))
                }}
                aria-label="Start date"
              />
              <span aria-hidden>–</span>
              <input
                type="date"
                value={dateRange.end_date}
                min={dateRange.start_date}
                onChange={(e) => {
                  setDatePreset('custom')
                  setDateRange((prev) => ({ ...prev, end_date: e.target.value }))
                }}
                aria-label="End date"
              />
            </div>
            <button type="button" className="rpt-btn" onClick={exportCurrentTab}>
              <Download size={15} aria-hidden />
              Export CSV
            </button>
          </div>
        ) : null}
      </div>

      <div key={tab} className="rpt-body flex-1 min-h-0 overflow-y-auto">
        {/* ───────── Overview ───────── */}
        {tab === 'overview' && (
          <>
            <div className="rpt-kpis">
              <Kpi
                label="Collected"
                value={formatCurrency(summary.collected)}
                trend={<Trend pct={pctChange(summary.collected, prevSummary.collected)} />}
                sub={`${summary.payment_count} payments · ${rangeLabel}`}
              />
              <Kpi
                label="Open A/R"
                value={formatCurrency(aging.total_ar)}
                sub={
                  aging.overdue_amount > 0
                    ? `${formatCurrency(aging.overdue_amount)} overdue · as of today`
                    : `${aging.total_invoices} open invoices · as of today`
                }
                tone={aging.overdue_amount > 0 ? 'alert' : undefined}
              />
              <Kpi
                label="Expected next 30 days"
                value={formatCurrency(forecast.next_30_days)}
                sub={`${formatCurrency(forecast.next_7_days)} in the next 7 days`}
                tone="accent"
              />
              <Kpi
                label="Avg days to get paid"
                value={formatDays(avgDaysToPay)}
                trend={
                  avgDaysToPay != null && prevAvgDaysToPay != null ? (
                    <Trend pct={pctChange(avgDaysToPay, prevAvgDaysToPay)} invert />
                  ) : undefined
                }
                sub="Invoice date to payment"
              />
            </div>

            <Card title="What stands out" scope="Selected dates" className="rpt-insights-card">
              {insights.length === 0 ? (
                <div className="rpt-insight is-success">
                  <CheckCircle2 size={18} aria-hidden />
                  <div>
                    <p className="rpt-insight__title">Nothing needs your attention</p>
                    <p className="rpt-insight__body">No overdue balances, disputes or unusual payment delays.</p>
                  </div>
                </div>
              ) : (
                <ul className="rpt-insights">
                  {insights.map((insight) => {
                    const Icon = INSIGHT_ICONS[insight.tone]
                    return (
                      <li key={insight.id} className={`rpt-insight is-${insight.tone}`}>
                        <Icon size={18} aria-hidden />
                        <div>
                          <p className="rpt-insight__title">{insight.title}</p>
                          <p className="rpt-insight__body">{insight.body}</p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>

            <div className="rpt-grid">
              <Card title="Invoiced vs collected" scope="Last 6 months" className="rpt-span-7">
                <CashFlowChart data={cashFlow} compact />
              </Card>
              <Card
                title="A/R aging"
                scope="As of today"
                className="rpt-span-5"
                action={{ label: 'Aging A/R', onClick: () => navigate('/client/aging-ar') }}
              >
                {aging.total_ar <= 0 ? (
                  <Empty>No open receivables.</Empty>
                ) : (
                  <div className="rpt-bars">
                    {aging.buckets.map((bucket) => (
                      <BarRow
                        key={bucket.id}
                        label={`${bucket.label} days`}
                        value={bucket.amount}
                        max={maxAging}
                        display={formatCurrency(bucket.amount)}
                        sub={`${bucket.invoice_count} invoice${bucket.invoice_count === 1 ? '' : 's'}`}
                        tone={bucket.amount > 0 && bucket.id !== '0_15' && bucket.id !== '16_30' ? 'alert' : undefined}
                      />
                    ))}
                  </div>
                )}
              </Card>

              <Card
                title="Top brokers by open A/R"
                scope="As of today"
                className="rpt-span-6"
                action={{ label: 'All brokers', onClick: () => setTab('brokers') }}
              >
                {topBrokers.length === 0 ? (
                  <Empty>No open balances with brokers.</Empty>
                ) : (
                  <div className="rpt-bars">
                    {topBrokers.map((b) => (
                      <BarRow
                        key={b.broker_name}
                        label={b.broker_name}
                        value={b.open_ar}
                        max={maxTopBroker}
                        display={formatCurrency(b.open_ar)}
                        sub={`${b.share_of_ar.toFixed(0)}% of open A/R${
                          b.overdue_amount > 0 ? ` · ${formatCurrency(b.overdue_amount)} overdue` : ''
                        }`}
                      />
                    ))}
                  </div>
                )}
              </Card>

              <Card
                title="Paperwork speed"
                scope="Selected dates"
                className="rpt-span-6"
                action={{ label: 'Invoices', onClick: () => navigate('/client/invoices') }}
              >
                <div className="rpt-stats">
                  <div className="rpt-stat">
                    <span className="rpt-stat__value">{paperwork.submitted}</span>
                    <span className="rpt-stat__label">Invoices submitted</span>
                  </div>
                  <div className="rpt-stat">
                    <span className="rpt-stat__value">{formatDays(paperwork.avg_days_to_verify)}</span>
                    <span className="rpt-stat__label">To verify</span>
                  </div>
                  <div className="rpt-stat">
                    <span className="rpt-stat__value">{formatDays(paperwork.avg_days_to_send)}</span>
                    <span className="rpt-stat__label">To send to broker</span>
                  </div>
                </div>
                <div className="rpt-subhead">
                  Most common hold reasons
                  {paperwork.on_hold_now > 0 ? (
                    <span className="rpt-pill is-alert">{paperwork.on_hold_now} on hold now</span>
                  ) : null}
                </div>
                {paperwork.hold_reasons.length === 0 ? (
                  <Empty>No holds in this period.</Empty>
                ) : (
                  <ul className="rpt-list">
                    {paperwork.hold_reasons.map((r) => (
                      <li key={r.reason}>
                        <span>{r.reason}</span>
                        <span className="rpt-list__num">{r.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </>
        )}

        {/* ───────── Brokers ───────── */}
        {tab === 'brokers' && (
          <>
            <div className="rpt-kpis">
              <Kpi label="Brokers" value={String(brokers.length)} sub="With open A/R or activity in range" />
              <Kpi
                label="Largest broker share"
                value={concentration.top_broker_name ? `${concentration.top_broker_pct.toFixed(0)}%` : '—'}
                sub={concentration.top_broker_name ?? 'No open A/R'}
                tone={concentration.is_elevated ? 'alert' : undefined}
              />
              <Kpi
                label="Top 3 brokers"
                value={concentration.top_broker_name ? `${concentration.top3_pct.toFixed(0)}%` : '—'}
                sub="Share of open A/R"
              />
              <Kpi
                label="Brokers with overdue"
                value={String(brokers.filter((b) => b.overdue_amount > 0).length)}
                sub={formatCurrency(aging.overdue_amount)}
                tone={aging.overdue_amount > 0 ? 'alert' : undefined}
              />
            </div>

            {concentration.is_elevated && concentration.top_broker_name ? (
              <div className="rpt-notice">
                <AlertCircle size={18} aria-hidden />
                <p>
                  <strong>{concentration.top_broker_name}</strong> holds{' '}
                  {concentration.top_broker_pct.toFixed(0)}% of your open A/R. If they pay late, a large share
                  of your cash is delayed. Consider spreading loads across more brokers.
                </p>
              </div>
            ) : null}

            <Card title="Broker performance" scope="Open A/R as of today · collected in selected dates">
              {sortedBrokers.length === 0 ? (
                <Empty>No broker activity in this period.</Empty>
              ) : (
                <div className="rpt-table-wrap">
                  <table className="rpt-table">
                    <thead>
                      <tr>
                        {sortHeader('broker_name', 'Broker', 'left')}
                        {sortHeader('open_ar', 'Open A/R')}
                        {sortHeader('overdue_amount', 'Overdue')}
                        {sortHeader('collected_in_range', 'Collected')}
                        {sortHeader('avg_days_invoice_to_pay', 'Days to pay')}
                        {sortHeader('late_payment_count', 'Late pays')}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedBrokers.map((b) => {
                        const risk = riskByBroker.get(b.broker_name) ?? 'unrated'
                        return (
                          <tr key={b.broker_name} onClick={() => openBroker(b)} tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') openBroker(b)
                            }}
                          >
                            <td>
                              <span className="rpt-table__main">{b.broker_name}</span>
                              <span className="rpt-table__sub">
                                {risk === 'medium' || risk === 'high' ? (
                                  <BrokerRiskLevelChip level={risk} size="sm" />
                                ) : b.payment_terms_days ? (
                                  `Net ${b.payment_terms_days} terms`
                                ) : (
                                  'Terms not on file'
                                )}
                              </span>
                            </td>
                            <td className="is-num">
                              <span className="rpt-table__main">{formatCurrency(b.open_ar)}</span>
                              <span className="rpt-table__sub">{b.share_of_ar.toFixed(0)}% of A/R</span>
                            </td>
                            <td className={`is-num${b.overdue_amount > 0 ? ' is-alert' : ''}`}>
                              {b.overdue_amount > 0 ? formatCurrency(b.overdue_amount) : '—'}
                            </td>
                            <td className="is-num">{formatCurrency(b.collected_in_range)}</td>
                            <td className="is-num">{formatDays(b.avg_days_invoice_to_pay ?? null)}</td>
                            <td className={`is-num${(b.late_payment_count ?? 0) > 0 ? ' is-alert' : ''}`}>
                              {b.late_payment_count ?? 0}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}

        {/* ───────── Cash & fees ───────── */}
        {tab === 'cash' && (
          <>
            <div className="rpt-kpis">
              <Kpi
                label="Invoiced"
                value={formatCurrency(summary.invoiced)}
                trend={<Trend pct={pctChange(summary.invoiced, prevSummary.invoiced)} />}
                sub={`${summary.invoice_count} invoices`}
              />
              <Kpi
                label="Collected"
                value={formatCurrency(summary.collected)}
                trend={<Trend pct={pctChange(summary.collected, prevSummary.collected)} />}
                sub={`${summary.payment_count} payments`}
              />
              <Kpi
                label="Credyx fees"
                value={formatCurrency(fees.fees)}
                trend={<Trend pct={pctChange(fees.fees, prevFees.fees)} invert />}
                sub="Estimated"
              />
              <Kpi label="Net to you" value={formatCurrency(fees.net)} sub="Collected minus fees" tone="accent" />
            </div>

            <div className="rpt-grid">
              <Card title="Invoiced vs collected" scope="Last 6 months" className="rpt-span-7">
                <CashFlowChart data={cashFlow} compact />
              </Card>
              <Card title="Expected collections" scope="Next 30 days" className="rpt-span-5 rpt-card--flush">
                <CashCollectionForecast invoices={invoices} payments={payments} compact />
              </Card>

              <Card title="Fees & net" scope="Selected dates" className="rpt-span-6">
                <dl className="rpt-ledger">
                  <div>
                    <dt>Gross collected</dt>
                    <dd>{formatCurrency(fees.gross_collected)}</dd>
                  </div>
                  <div>
                    <dt>Credyx fees</dt>
                    <dd>− {formatCurrency(fees.fees)}</dd>
                  </div>
                  <div className="is-total">
                    <dt>Net to you</dt>
                    <dd>{formatCurrency(fees.net)}</dd>
                  </div>
                </dl>
                {fees.waived_gross > 0 ? (
                  <p className="rpt-note">
                    {formatCurrency(fees.waived_gross)} was collected on trial invoices, so no fees were charged.
                  </p>
                ) : null}
                {fees.unknown_terms_gross > 0 ? (
                  <p className="rpt-note">
                    {formatCurrency(fees.unknown_terms_gross)} has no fee terms on file and is not included in fees.
                  </p>
                ) : null}
                <p className="rpt-note">{feeNote(fees)}. Your monthly Credyx invoice is the final amount.</p>
              </Card>

              <Card title="How brokers paid" scope="Selected dates" className="rpt-span-6">
                {onTimeKnown ? (
                  <div className="rpt-split" aria-label="On-time versus late payments">
                    <div className="rpt-split__bar">
                      <span className="is-good" style={{ width: `${paymentLag.on_time_pct}%` }} />
                      <span className="is-bad" style={{ width: `${paymentLag.late_pct}%` }} />
                    </div>
                    <div className="rpt-split__legend">
                      <span>
                        <i className="is-good" aria-hidden /> On time {paymentLag.on_time_pct.toFixed(0)}%
                      </span>
                      <span>
                        <i className="is-bad" aria-hidden /> Late {paymentLag.late_pct.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ) : null}
                {paymentMethods.length === 0 ? (
                  <Empty>No payments received in this period.</Empty>
                ) : (
                  <div className="rpt-bars">
                    {paymentMethods.map((m) => (
                      <BarRow
                        key={m.method}
                        label={m.method}
                        value={m.amount}
                        max={maxMethod}
                        display={formatCurrency(m.amount)}
                        sub={`${m.count} payment${m.count === 1 ? '' : 's'}`}
                      />
                    ))}
                  </div>
                )}
              </Card>

              <Card
                title="Short pays & disputes"
                scope="Selected dates · disputes as of today"
                className="rpt-span-12"
                action={{ label: 'Pay variances', onClick: () => navigate('/client/short-payments') }}
              >
                <div className="rpt-stats rpt-stats--4">
                  <div className={`rpt-stat${shortPays.short_amount > 0 ? ' is-alert' : ''}`}>
                    <span className="rpt-stat__value">{formatCurrency(shortPays.short_amount)}</span>
                    <span className="rpt-stat__label">
                      Short paid · {shortPays.short_count} invoice{shortPays.short_count === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="rpt-stat">
                    <span className="rpt-stat__value">{formatCurrency(shortPays.written_off_amount)}</span>
                    <span className="rpt-stat__label">Written off · {shortPays.written_off_count}</span>
                  </div>
                  <div className="rpt-stat">
                    <span className="rpt-stat__value">{formatCurrency(shortPays.over_amount)}</span>
                    <span className="rpt-stat__label">Overpaid · {shortPays.over_count}</span>
                  </div>
                  <div className={`rpt-stat${shortPays.open_disputes > 0 ? ' is-alert' : ''}`}>
                    <span className="rpt-stat__value">{shortPays.open_disputes}</span>
                    <span className="rpt-stat__label">Open disputes</span>
                  </div>
                </div>
                {shortPays.by_broker.length > 0 ? (
                  <>
                    <div className="rpt-subhead">Brokers that short-paid</div>
                    <ul className="rpt-list">
                      {shortPays.by_broker.slice(0, 5).map((b) => (
                        <li key={b.broker_name}>
                          <span>{b.broker_name}</span>
                          <span className="rpt-list__num">
                            {formatCurrency(b.short_amount)} · {b.short_count}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </Card>
            </div>
          </>
        )}

        {/* ───────── Statements ───────── */}
        {tab === 'statements' && (
          <div className="rpt-grid">
            <Card title="Monthly statement" className="rpt-span-7">
              <label className="rpt-field">
                <span>Month</span>
                <select value={statementMonth} onChange={(e) => setStatementMonth(e.target.value)}>
                  {months.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <dl className="rpt-ledger">
                <div>
                  <dt>Invoiced · {statementSummary.invoice_count} invoices</dt>
                  <dd>{formatCurrency(statementSummary.invoiced)}</dd>
                </div>
                <div>
                  <dt>Collected · {statementSummary.payment_count} payments</dt>
                  <dd>{formatCurrency(statementSummary.collected)}</dd>
                </div>
                <div>
                  <dt>Credyx fees (estimated)</dt>
                  <dd>− {formatCurrency(statementFees.fees)}</dd>
                </div>
                <div className="is-total">
                  <dt>Net to you</dt>
                  <dd>{formatCurrency(statementFees.net)}</dd>
                </div>
              </dl>
              <p className="rpt-note">
                Includes a breakdown by broker and every payment received in {statementLabel}.
              </p>
              <div className="rpt-actions">
                <button type="button" className="rpt-btn is-primary" onClick={downloadStatementPdf} disabled={pdfBusy}>
                  <FileText size={15} aria-hidden />
                  {pdfBusy ? 'Preparing PDF…' : 'Download PDF'}
                </button>
                <button type="button" className="rpt-btn" onClick={downloadStatementCsv}>
                  <FileSpreadsheet size={15} aria-hidden />
                  CSV
                </button>
              </div>
            </Card>

            <Card title="Tax summary (1099 reference)" className="rpt-span-5">
              <label className="rpt-field">
                <span>Tax year</span>
                <select value={taxYear} onChange={(e) => setTaxYear(Number(e.target.value))}>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
              <div className="rpt-hero-num">
                <span className="rpt-hero-num__label">Gross freight revenue collected</span>
                <span className="rpt-hero-num__value">{formatCurrency(taxReport.gross_collected)}</span>
                <span className="rpt-hero-num__sub">{taxReport.payment_count} payments in {taxYear}</span>
              </div>
              {taxReport.by_broker.length === 0 ? (
                <Empty>No payments received in {taxYear}.</Empty>
              ) : (
                <ul className="rpt-list">
                  {taxReport.by_broker.slice(0, 6).map((b) => (
                    <li key={b.broker_name}>
                      <span>{b.broker_name}</span>
                      <span className="rpt-list__num">{formatCurrency(b.gross_collected)}</span>
                    </li>
                  ))}
                  {taxReport.by_broker.length > 6 ? (
                    <li className="rpt-list__more">+ {taxReport.by_broker.length - 6} more in the CSV</li>
                  ) : null}
                </ul>
              )}
              <div className="rpt-actions">
                <button type="button" className="rpt-btn" onClick={downloadTaxCsv}>
                  <Landmark size={15} aria-hidden />
                  Download for your accountant
                </button>
              </div>
            </Card>

            <Card title="Data exports" className="rpt-span-12">
              <div className="rpt-exports">
                <button type="button" className="rpt-export" onClick={downloadAllInvoices}>
                  <FileSpreadsheet size={20} aria-hidden />
                  <span>
                    <strong>All invoices</strong>
                    <small>{invoices.length} rows · amount, broker, status, due date</small>
                  </span>
                  <Download size={16} aria-hidden />
                </button>
                <button type="button" className="rpt-export" onClick={downloadAllPayments}>
                  <FileSpreadsheet size={20} aria-hidden />
                  <span>
                    <strong>All payments</strong>
                    <small>{payments.length} rows · date, broker, method, reference</small>
                  </span>
                  <Download size={16} aria-hidden />
                </button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
