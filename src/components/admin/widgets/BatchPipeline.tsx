import { FileText, CheckCircle, Clock, AlertCircle } from 'lucide-react'
import { formatCurrency } from '../../../utils/format'

interface PipelineStage {
  stage: string
  label: string
  count: number
  totalAmount: number
  avgTimeHours: number
  color: string
}

interface BatchPipelineProps {
  stages: PipelineStage[]
  onStageClick?: (stage: string) => void
}

export function BatchPipeline({ stages, onStageClick }: BatchPipelineProps) {
  const getIcon = (stage: string) => {
    switch (stage) {
      case 'ready_to_post':
        return <FileText className="w-4 h-4" />
      case 'verification':
        return <Clock className="w-4 h-4" />
      case 'approval':
        return <CheckCircle className="w-4 h-4" />
      case 'submitted':
        return <CheckCircle className="w-4 h-4" />
      default:
        return <FileText className="w-4 h-4" />
    }
  }

  const totalBatches = stages.reduce((sum, stage) => sum + stage.count, 0)

  return (
    <div className="border" style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}>
      <div className="p-6">
        <h2 className="text-lg font-bold mb-4" style={{ color: '#113543' }}>Batch Pipeline</h2>
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {stages.map((stage, index) => {
            const percentage = totalBatches > 0 ? (stage.count / totalBatches) * 100 : 0
            return (
              <div
                key={stage.stage}
                className={`p-4 rounded transition-colors ${
                  onStageClick ? 'cursor-pointer hover:shadow-md' : ''
                }`}
                style={{ backgroundColor: '#F5F5F5' }}
                onClick={() => onStageClick?.(stage.stage)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <div style={{ color: stage.color }}>{getIcon(stage.stage)}</div>
                    <span className="font-medium text-sm" style={{ color: '#113543' }}>
                      {stage.label}
                    </span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="font-bold text-sm" style={{ color: '#113543' }}>
                      {stage.count}
                    </span>
                    <div className="w-24 h-2 rounded-full" style={{ backgroundColor: '#E0E0E0' }}>
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${percentage}%`,
                          backgroundColor: stage.color,
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs mt-2" style={{ color: '#819291' }}>
                  <span>{formatCurrency(stage.totalAmount)}</span>
                  {stage.avgTimeHours > 0 && (
                    <span>Avg {stage.avgTimeHours.toFixed(1)} hrs</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-4 pt-4 border-t" style={{ borderColor: '#819291' }}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium" style={{ color: '#113543' }}>Total Batches</span>
            <span className="text-lg font-bold" style={{ color: '#113543' }}>{totalBatches}</span>
          </div>
        </div>
      </div>
    </div>
  )
}


