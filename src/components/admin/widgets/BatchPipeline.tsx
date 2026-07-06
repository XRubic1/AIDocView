import { FileText, CheckCircle, Clock, Boxes } from 'lucide-react'
import DashboardPanel from '../../client/dashboard/DashboardPanel'
import { useClientTheme } from '../../../theme/ThemeContext'
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
  const c = useClientTheme()

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
    <DashboardPanel title="Batch Pipeline" icon={Boxes} iconTone="slate" interactive={false}>
      <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
        {stages.map((stage) => {
          const percentage = totalBatches > 0 ? (stage.count / totalBatches) * 100 : 0
          return (
            <button
              key={stage.stage}
              type="button"
              disabled={!onStageClick}
              onClick={() => onStageClick?.(stage.stage)}
              className={`w-full p-3 rounded-lg text-left transition-shadow ${
                onStageClick ? 'dashboard-card-interactive cursor-pointer' : 'cursor-default'
              }`}
              style={{ backgroundColor: c.stat.slate }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span style={{ color: stage.color }}>{getIcon(stage.stage)}</span>
                  <span className="font-medium text-sm truncate" style={{ color: c.primary }}>
                    {stage.label}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-bold text-sm tabular-nums" style={{ color: c.primary }}>
                    {stage.count}
                  </span>
                  <div className="w-20 h-1.5 rounded-full" style={{ backgroundColor: c.border }}>
                    <div
                      className="h-1.5 rounded-full"
                      style={{
                        width: `${percentage}%`,
                        backgroundColor: stage.color,
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs" style={{ color: c.secondary }}>
                <span className="tabular-nums">{formatCurrency(stage.totalAmount)}</span>
                {stage.avgTimeHours > 0 && (
                  <span className="tabular-nums">Avg {stage.avgTimeHours.toFixed(1)} hrs</span>
                )}
              </div>
            </button>
          )
        })}
      </div>
      <div className="px-4 pb-4 pt-2 border-t flex items-center justify-between" style={{ borderColor: c.border }}>
        <span className="text-sm font-medium" style={{ color: c.secondary }}>
          Total Batches
        </span>
        <span className="text-lg font-bold tabular-nums" style={{ color: c.primary }}>
          {totalBatches}
        </span>
      </div>
    </DashboardPanel>
  )
}
