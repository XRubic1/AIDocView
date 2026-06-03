import { AlertCircle, CheckCircle, FileWarning, MapPin } from 'lucide-react'
import { MultiStopBolResult } from '../../utils/multiStopBolValidation'

interface MultiStopBolPanelProps {
  multiStopBol?: MultiStopBolResult
}

/** Per-stop BOL coverage when rate con lists multiple delivery stops. */
export default function MultiStopBolPanel({ multiStopBol }: MultiStopBolPanelProps) {
  if (!multiStopBol?.isMultiStop) return null

  const completeCount = multiStopBol.stops.filter((stop) => stop.status === 'COMPLETE').length
  const allComplete = multiStopBol.overall === 'COMPLETE'

  const headerStyle = allComplete
    ? { bg: '#E8F5E9', color: '#2E7D32', Icon: CheckCircle }
    : { bg: '#FEE2E2', color: '#991B1B', Icon: AlertCircle }

  const HeaderIcon = headerStyle.Icon

  return (
    <div
      className="rounded-lg border overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300"
      style={{ borderColor: '#113543' }}
    >
      <div
        className="px-4 py-3 flex items-center gap-2 border-b"
        style={{ backgroundColor: headerStyle.bg, borderColor: '#819291' }}
      >
        <HeaderIcon className="w-5 h-5 flex-shrink-0" style={{ color: headerStyle.color }} />
        <div>
          <div className="text-sm font-bold" style={{ color: '#113543' }}>
            Multi-stop delivery — {completeCount}/{multiStopBol.stopCount} stops with signed BOL
          </div>
          <div className="text-xs mt-0.5" style={{ color: '#819291' }}>
            {multiStopBol.bolUnitCount} BOL document(s)/page(s) detected · one signed BOL required per
            stop
          </div>
        </div>
      </div>

      <ul className="divide-y" style={{ borderColor: '#819291', backgroundColor: '#FFFFFF' }}>
        {multiStopBol.stops.map((stop) => (
          <li key={stop.stopNumber} className="px-4 py-3 text-sm">
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#819291' }} />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold" style={{ color: '#113543' }}>
                    Stop {stop.stopNumber}
                  </span>
                  <StopStatusBadge status={stop.status} />
                </div>
                <div className="text-xs mt-0.5 truncate" style={{ color: '#819291' }}>
                  {stop.destinationLabel}
                </div>
                {stop.matchedBol && (
                  <div className="text-xs mt-1" style={{ color: '#113543' }}>
                    BOL: {stop.matchedBol.fileName}
                    {stop.matchedBol.pageNumbers.length > 0
                      ? ` · page ${stop.matchedBol.pageNumbers.join(', ')}`
                      : ''}
                  </div>
                )}
                {stop.notes && stop.status !== 'COMPLETE' && (
                  <div className="text-xs mt-1 flex items-center gap-1" style={{ color: '#C2A558' }}>
                    <FileWarning className="w-3.5 h-3.5" />
                    {stop.status === 'MISSING_SIGNATURE'
                      ? 'Receiver signature and/or receiving date missing on this BOL.'
                      : stop.notes}
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function StopStatusBadge({ status }: { status: string }) {
  const styles: Record<string, { label: string; bg: string; color: string }> = {
    COMPLETE: { label: 'Signed BOL', bg: '#E8F5E9', color: '#2E7D32' },
    MISSING_BOL: { label: 'Missing BOL', bg: '#FEE2E2', color: '#991B1B' },
    MISSING_SIGNATURE: { label: 'Unsigned BOL', bg: '#FFF8E1', color: '#C2A558' },
    ADDRESS_MISMATCH: { label: 'Address mismatch', bg: '#FEE2E2', color: '#991B1B' },
  }
  const style = styles[status] ?? { label: status, bg: '#f8f9fa', color: '#819291' }

  return (
    <span
      className="text-xs font-medium px-2 py-0.5 rounded-full"
      style={{ backgroundColor: style.bg, color: style.color }}
    >
      {style.label}
    </span>
  )
}
