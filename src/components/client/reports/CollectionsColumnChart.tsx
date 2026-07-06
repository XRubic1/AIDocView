import { useClientTheme } from '../../../theme/ThemeContext'
import { formatCurrency } from '../../../utils/format'

export type CollectionsMonthPoint = {
  monthKey: string
  label: string
  invoiced: number
  collected: number
}

type CollectionsColumnChartProps = {
  data: CollectionsMonthPoint[]
}

/** Compact grouped column chart — invoiced vs collected per month (pure SVG). */
export default function CollectionsColumnChart({ data }: CollectionsColumnChartProps) {
  const c = useClientTheme()

  if (data.length === 0) {
    return (
      <p className="text-xs text-center py-4" style={{ color: c.secondary }}>
        No activity in this period
      </p>
    )
  }

  const max = Math.max(...data.map((d) => Math.max(d.invoiced, d.collected)), 1)
  const barW = 7
  const innerGap = 3
  const groupGap = 10
  const groupW = barW * 2 + innerGap
  const chartH = 72
  const padX = 8
  const padBottom = 18
  const width = padX * 2 + data.length * groupW + (data.length - 1) * groupGap
  const height = chartH + padBottom

  const scaleY = (v: number) => (v / max) * chartH

  return (
    <div className="collections-column-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="collections-column-chart__svg"
        role="img"
        aria-label="Monthly invoiced versus collected"
      >
        {data.map((row, i) => {
          const x = padX + i * (groupW + groupGap)
          const invoicedH = scaleY(row.invoiced)
          const collectedH = scaleY(row.collected)
          const baseY = chartH

          return (
            <g key={row.monthKey}>
              <rect
                x={x}
                y={baseY - invoicedH}
                width={barW}
                height={Math.max(invoicedH, row.invoiced > 0 ? 2 : 0)}
                rx={2}
                fill={c.chart.blue}
                opacity={0.85}
              >
                <title>{`${row.label}: ${formatCurrency(row.invoiced)} invoiced`}</title>
              </rect>
              <rect
                x={x + barW + innerGap}
                y={baseY - collectedH}
                width={barW}
                height={Math.max(collectedH, row.collected > 0 ? 2 : 0)}
                rx={2}
                fill={c.success}
                opacity={0.9}
              >
                <title>{`${row.label}: ${formatCurrency(row.collected)} collected`}</title>
              </rect>
              <text
                x={x + groupW / 2}
                y={height - 4}
                textAnchor="middle"
                className="collections-column-chart__label"
                fill={c.mutedLight}
              >
                {row.label}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="collections-column-chart__legend">
        <span className="collections-column-chart__legend-item">
          <span className="collections-column-chart__swatch" style={{ backgroundColor: c.chart.blue }} />
          Invoiced
        </span>
        <span className="collections-column-chart__legend-item">
          <span className="collections-column-chart__swatch" style={{ backgroundColor: c.success }} />
          Collected
        </span>
      </div>
    </div>
  )
}
