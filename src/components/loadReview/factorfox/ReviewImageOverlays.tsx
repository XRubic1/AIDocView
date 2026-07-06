import { AiReviewRegion } from '../../../utils/aiReviewRegions'
import { ff } from './factorFoxTheme'

const REGION_COLORS = {
  rate_con: ff.accent,
  bol_signature: ff.green,
} as const

interface ReviewImageOverlaysProps {
  regions: AiReviewRegion[]
  /** When true, show short descriptions in tooltips / labels. */
  showDescriptions?: boolean
}

/** Read-only dashed boxes for AI source regions on a review page image. */
export default function ReviewImageOverlays({
  regions,
  showDescriptions = true,
}: ReviewImageOverlaysProps) {
  if (regions.length === 0) return null

  return (
    <div className="absolute inset-0 pointer-events-none">
      {regions.map((entry) => {
        const { region } = entry
        const color = REGION_COLORS[entry.kind]
        const title = [entry.label, entry.description].filter(Boolean).join(' — ')

        return (
          <div
            key={entry.id}
            className="absolute border-2 border-dashed"
            style={{
              left: `${region.x * 100}%`,
              top: `${region.y * 100}%`,
              width: `${region.width * 100}%`,
              height: `${region.height * 100}%`,
              borderColor: color,
              backgroundColor: entry.kind === 'bol_signature' ? `${color}18` : `${color}12`,
              boxShadow: `0 0 0 1px ${color}33`,
            }}
            title={title}
          >
            <span
              className="absolute -top-5 left-0 text-[10px] font-semibold px-1.5 py-0.5 whitespace-nowrap max-w-[min(100%,220px)] truncate"
              style={{
                backgroundColor: color,
                color: entry.kind === 'rate_con' ? ff.onPrimary : '#0c0c0b',
                fontFamily: ff.fontMono,
              }}
            >
              AI: {entry.label}
            </span>
            {showDescriptions && entry.description ? (
              <span
                className="absolute left-0 top-full mt-0.5 text-[9px] px-1 py-0.5 max-w-[200px] truncate hidden sm:block"
                style={{
                  backgroundColor: ff.bg3,
                  color: ff.textMuted,
                  border: `1px solid ${ff.border}`,
                  fontFamily: ff.fontMono,
                }}
              >
                {entry.description}
              </span>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
