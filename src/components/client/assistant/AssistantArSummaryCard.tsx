import { TrendingDown, TrendingUp, Minus } from 'lucide-react'
import type { AssistantArSummaryCard } from '../../../types/assistant'
import AgingARChart from '../AgingARChart'
import CashFlowChart from '../CashFlowChart'

interface AssistantArSummaryCardViewProps {
  summary: AssistantArSummaryCard
  note?: string
}

function GrowthChip({ pct }: { pct: number | null }) {
  if (pct == null) {
    return (
      <span className="assistant-ar__growth assistant-ar__growth--flat">
        <Minus className="w-3 h-3" aria-hidden />
        —
      </span>
    )
  }
  const up = pct > 3
  const down = pct < -3
  return (
    <span
      className={`assistant-ar__growth${
        up ? ' assistant-ar__growth--up' : down ? ' assistant-ar__growth--down' : ' assistant-ar__growth--flat'
      }`}
    >
      {up ? (
        <TrendingUp className="w-3 h-3" aria-hidden />
      ) : down ? (
        <TrendingDown className="w-3 h-3" aria-hidden />
      ) : (
        <Minus className="w-3 h-3" aria-hidden />
      )}
      {pct > 0 ? '+' : ''}
      {pct}%
    </span>
  )
}

/**
 * Portfolio A/R overview — KPIs, MoM growth, cash projection, and charts.
 * Does not list individual invoices (use follow-ups for that).
 */
export default function AssistantArSummaryCardView({
  summary,
  note,
}: AssistantArSummaryCardViewProps) {
  return (
    <div className="assistant-ar">
      <div className="assistant-ar__head">
        <span className="assistant-ar__chip">A/R overview</span>
        <h3 className="assistant-ar__headline">{summary.headline}</h3>
        <p className="assistant-ar__summary">{note?.trim() || summary.summary}</p>
      </div>

      <div className="assistant-ar__kpis">
        <div className="assistant-ar__kpi">
          <span className="assistant-ar__kpi-label">Open A/R</span>
          <span className="assistant-ar__kpi-value">{summary.openArLabel}</span>
          <span className="assistant-ar__kpi-meta">
            {summary.openInvoiceCount} invoice{summary.openInvoiceCount === 1 ? '' : 's'}
          </span>
        </div>
        <div className="assistant-ar__kpi">
          <span className="assistant-ar__kpi-label">On hold</span>
          <span className="assistant-ar__kpi-value">{summary.onHoldLabel}</span>
          <span className="assistant-ar__kpi-meta">
            {summary.onHoldCount} invoice{summary.onHoldCount === 1 ? '' : 's'}
          </span>
        </div>
        <div className="assistant-ar__kpi">
          <span className="assistant-ar__kpi-label">Past due</span>
          <span className="assistant-ar__kpi-value">{summary.overdueLabel}</span>
          <span className="assistant-ar__kpi-meta">
            {summary.overdueCount} invoice{summary.overdueCount === 1 ? '' : 's'}
          </span>
        </div>
        <div className="assistant-ar__kpi">
          <span className="assistant-ar__kpi-label">DSO</span>
          <span className="assistant-ar__kpi-value">
            {summary.dsoDays != null ? `${summary.dsoDays}d` : '—'}
          </span>
          <span className="assistant-ar__kpi-meta">weighted</span>
        </div>
      </div>

      <div className="assistant-ar__section">
        <p className="assistant-ar__section-title">Growth (this month vs last)</p>
        <div className="assistant-ar__growth-row">
          <div className="assistant-ar__growth-cell">
            <span className="assistant-ar__kpi-label">Invoiced</span>
            <span className="assistant-ar__kpi-value assistant-ar__kpi-value--sm">
              {summary.invoicedThisMonthLabel}
            </span>
            <GrowthChip pct={summary.invoicedGrowthPct} />
          </div>
          <div className="assistant-ar__growth-cell">
            <span className="assistant-ar__kpi-label">Collected</span>
            <span className="assistant-ar__kpi-value assistant-ar__kpi-value--sm">
              {summary.collectedThisMonthLabel}
            </span>
            <GrowthChip pct={summary.collectedGrowthPct} />
          </div>
        </div>
      </div>

      <div className="assistant-ar__section">
        <p className="assistant-ar__section-title">Projected collections</p>
        <div className="assistant-ar__growth-row">
          <div className="assistant-ar__growth-cell">
            <span className="assistant-ar__kpi-label">Next 7 days</span>
            <span className="assistant-ar__kpi-value assistant-ar__kpi-value--sm">
              {summary.project7Label}
            </span>
          </div>
          <div className="assistant-ar__growth-cell">
            <span className="assistant-ar__kpi-label">Next 30 days</span>
            <span className="assistant-ar__kpi-value assistant-ar__kpi-value--sm">
              {summary.project30Label}
            </span>
          </div>
        </div>
      </div>

      <div className="assistant-ar__section">
        <p className="assistant-ar__section-title">Invoiced vs collected</p>
        <div className="assistant-ar__chart">
          <CashFlowChart data={summary.cashFlow} compact />
        </div>
      </div>

      <div className="assistant-ar__section">
        <p className="assistant-ar__section-title">Aging</p>
        <div className="assistant-ar__chart assistant-ar__chart--aging">
          <AgingARChart aging={summary.aging} />
        </div>
      </div>
    </div>
  )
}
