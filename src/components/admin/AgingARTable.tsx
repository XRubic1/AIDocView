
import { formatCurrency } from '../../utils/format'
import { AgingAR } from '../../types/admin'

interface AgingARTableProps {
  aging: AgingAR
  onRowClick?: (ageRange: string) => void
}

export function AgingARTable({ aging, onRowClick }: AgingARTableProps) {
  const agingRows = [
    { label: '0–15 days', key: '1_15' as const, amount: aging['1_15'] },
    { label: '16-30 days', key: '16_30' as const, amount: aging['16_30'] },
    { label: '31-45 days', key: '31_45' as const, amount: aging['31_45'] },
    { label: '46-60 days', key: '46_60' as const, amount: aging['46_60'] },
    { label: '61-90 days', key: '61_90' as const, amount: aging['61_90'] },
    { label: 'Over 91 days', key: 'over_91' as const, amount: aging.over_91 },
  ]

  const getPercentage = (amount: number) => {
    if (aging.total === 0) return 0
    return ((amount / aging.total) * 100).toFixed(1)
  }

  const getRowColor = (index: number) => {
    if (index < 2) return { color: '#819291' } // 1-30 days
    if (index < 4) return { color: '#C2A558' } // 31-60 days
    return { color: '#C2A558' } // 61+ days
  }

  return (
    <div className="border" style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}>
      <div className="p-6">
        <h2 className="text-lg font-bold mb-4" style={{ color: '#113543' }}>Aging A/R - All Clients</h2>
        <p className="text-sm mb-4" style={{ color: '#819291' }}>Total outstanding amounts by aging bucket</p>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b" style={{ borderColor: '#819291' }}>
                <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>Age</th>
                <th className="text-right py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                  Amount
                </th>
                <th className="text-right py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                  % of Total
                </th>
              </tr>
            </thead>
            <tbody>
              {agingRows.map((row, index) => (
                <tr
                  key={row.key}
                  className={`border-b transition-colors ${
                    onRowClick ? 'cursor-pointer' : ''
                  }`}
                  style={{
                    borderColor: '#819291',
                    backgroundColor: index % 2 === 0 ? '#f8f9fa' : '#FFFFFF',
                  }}
                  onClick={() => onRowClick?.(row.key)}
                  onMouseEnter={(e) => {
                    if (onRowClick) {
                      e.currentTarget.style.backgroundColor = '#f0f0f0'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (onRowClick) {
                      e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#f8f9fa' : '#FFFFFF'
                    }
                  }}
                >
                  <td className="py-3 px-4 text-sm font-medium" style={getRowColor(index)}>
                    {row.label}
                  </td>
                  <td className="py-3 px-4 text-sm text-right font-medium" style={{ color: '#113543' }}>
                    {formatCurrency(row.amount)}
                  </td>
                  <td className="py-3 px-4 text-sm text-right" style={{ color: '#819291' }}>
                    {getPercentage(row.amount)}%
                  </td>
                </tr>
              ))}
              <tr className="border-t-2" style={{ borderColor: '#819291', backgroundColor: '#f8f9fa' }}>
                <td className="py-3 px-4 text-sm font-bold" style={{ color: '#113543' }}>Total</td>
                <td className="py-3 px-4 text-sm text-right font-bold" style={{ color: '#113543' }}>
                  {formatCurrency(aging.total)}
                </td>
                <td className="py-3 px-4 text-sm text-right font-bold" style={{ color: '#113543' }}>100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

