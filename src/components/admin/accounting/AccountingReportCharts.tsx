import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { BarChart3, TrendingUp } from 'lucide-react'
import DashboardPanel from '../../client/dashboard/DashboardPanel'
import { useClientTheme } from '../../../theme/ThemeContext'
import { formatCurrency } from '../../../utils/format'
import type { MonthlyAccountingPoint } from '../../../utils/accountingBatchMetrics'

interface AccountingReportChartsProps {
  monthlySeries: MonthlyAccountingPoint[]
  totals: {
    collectedCount: number
    collectedAmount: number
    forceClosedCount: number
    forceClosedAmount: number
  }
}

export function AccountingReportCharts({ monthlySeries, totals }: AccountingReportChartsProps) {
  const c = useClientTheme()

  const outcomeData = [
    {
      name: 'Collected',
      count: totals.collectedCount,
      amount: totals.collectedAmount,
      color: c.success,
    },
    {
      name: 'Force closed',
      count: totals.forceClosedCount,
      amount: totals.forceClosedAmount,
      color: c.chart.orange,
    },
  ].filter((item) => item.count > 0 || item.amount > 0)

  const tooltipStyle = {
    backgroundColor: c.card,
    border: `1px solid ${c.border}`,
    borderRadius: '8px',
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <DashboardPanel title="Fees & collections by month" icon={TrendingUp} iconTone="blue" interactive={false}>
        <div className="p-4" style={{ height: 320 }}>
          {monthlySeries.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm" style={{ color: c.secondary }}>
              No batch data for the selected period
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlySeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={c.chartGrid} opacity={0.6} />
                <XAxis dataKey="label" stroke={c.mutedLight} style={{ fontSize: 12 }} />
                <YAxis
                  stroke={c.mutedLight}
                  style={{ fontSize: 12 }}
                  tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={tooltipStyle}
                />
                <Legend />
                <Bar dataKey="fees" name="Fees earned" fill={c.chart.blue} radius={[4, 4, 0, 0]} />
                <Bar dataKey="collected" name="Collected" fill={c.success} radius={[4, 4, 0, 0]} />
                <Bar dataKey="forceClosed" name="Force closed" fill={c.chart.orange} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </DashboardPanel>

      <DashboardPanel title="Invoice outcomes" icon={BarChart3} iconTone="amber" interactive={false}>
        <div className="p-4" style={{ height: 320 }}>
          {outcomeData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm" style={{ color: c.secondary }}>
              No collected or force-closed invoices in this period
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={monthlySeries.map((point) => ({
                  label: point.label,
                  collected: point.collected,
                  forceClosed: point.forceClosed,
                }))}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={c.chartGrid} opacity={0.6} />
                <XAxis dataKey="label" stroke={c.mutedLight} style={{ fontSize: 12 }} />
                <YAxis
                  stroke={c.mutedLight}
                  style={{ fontSize: 12 }}
                  tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={tooltipStyle}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="collected"
                  name="Collected"
                  stroke={c.success}
                  strokeWidth={2}
                  dot={{ fill: c.success, r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="forceClosed"
                  name="Force closed"
                  stroke={c.chart.orange}
                  strokeWidth={2}
                  dot={{ fill: c.chart.orange, r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </DashboardPanel>
    </div>
  )
}
