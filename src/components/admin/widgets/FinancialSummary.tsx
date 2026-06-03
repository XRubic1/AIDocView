import { DollarSign, TrendingUp, Calendar, Percent } from 'lucide-react'
import { formatCurrency } from '../../../utils/format'

interface FinancialSummaryProps {
  cashFlowProjection: {
    next7Days: number
    next30Days: number
  }
  collectionRate: number
  totalRevenue: number
  outstandingVsCollected: {
    outstanding: number
    collected: number
  }
}

export function FinancialSummary({
  cashFlowProjection,
  collectionRate,
  totalRevenue,
  outstandingVsCollected,
}: FinancialSummaryProps) {
  const collectionPercentage = outstandingVsCollected.outstanding + outstandingVsCollected.collected > 0
    ? ((outstandingVsCollected.collected / (outstandingVsCollected.outstanding + outstandingVsCollected.collected)) * 100).toFixed(1)
    : '0.0'

  return (
    <div className="border" style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}>
      <div className="p-6">
        <h2 className="text-lg font-bold mb-4" style={{ color: '#113543' }}>Financial Summary</h2>
        <div className="space-y-4">
          {/* Cash Flow Projection */}
          <div className="p-4 rounded" style={{ backgroundColor: '#F5F5F5' }}>
            <div className="flex items-center space-x-2 mb-3">
              <Calendar className="w-4 h-4" style={{ color: '#819291' }} />
              <span className="text-sm font-medium" style={{ color: '#113543' }}>Cash Flow Projection</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: '#819291' }}>Next 7 days</span>
                <span className="font-bold text-sm" style={{ color: '#113543' }}>
                  {formatCurrency(cashFlowProjection.next7Days)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: '#819291' }}>Next 30 days</span>
                <span className="font-bold text-sm" style={{ color: '#113543' }}>
                  {formatCurrency(cashFlowProjection.next30Days)}
                </span>
              </div>
            </div>
          </div>

          {/* Collection Rate */}
          <div className="p-4 rounded" style={{ backgroundColor: '#F5F5F5' }}>
            <div className="flex items-center space-x-2 mb-3">
              <Percent className="w-4 h-4" style={{ color: '#819291' }} />
              <span className="text-sm font-medium" style={{ color: '#113543' }}>Collection Rate</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: '#819291' }}>Success rate</span>
              <span className="font-bold text-lg" style={{ color: collectionRate >= 80 ? '#2E7D32' : collectionRate >= 60 ? '#C2A558' : '#C2A558' }}>
                {collectionRate.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Total Revenue */}
          <div className="p-4 rounded" style={{ backgroundColor: '#F5F5F5' }}>
            <div className="flex items-center space-x-2 mb-3">
              <DollarSign className="w-4 h-4" style={{ color: '#819291' }} />
              <span className="text-sm font-medium" style={{ color: '#113543' }}>Total Revenue</span>
            </div>
            <div className="text-2xl font-bold" style={{ color: '#113543' }}>
              {formatCurrency(totalRevenue)}
            </div>
          </div>

          {/* Outstanding vs Collected */}
          <div className="p-4 rounded" style={{ backgroundColor: '#F5F5F5' }}>
            <div className="flex items-center space-x-2 mb-3">
              <TrendingUp className="w-4 h-4" style={{ color: '#819291' }} />
              <span className="text-sm font-medium" style={{ color: '#113543' }}>Outstanding vs Collected</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: '#819291' }}>Outstanding</span>
                <span className="font-bold text-sm" style={{ color: '#113543' }}>
                  {formatCurrency(outstandingVsCollected.outstanding)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: '#819291' }}>Collected</span>
                <span className="font-bold text-sm" style={{ color: '#2E7D32' }}>
                  {formatCurrency(outstandingVsCollected.collected)}
                </span>
              </div>
              <div className="mt-2 pt-2 border-t" style={{ borderColor: '#819291' }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium" style={{ color: '#113543' }}>Collection %</span>
                  <span className="font-bold text-sm" style={{ color: '#113543' }}>
                    {collectionPercentage}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


