import { Crop, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FieldRegionBox, ReviewImageInfo } from '../../types/documentReview'
import { getFieldLabel } from '../../utils/annotatableFields'

interface FieldRegionSelectorProps {
  images: ReviewImageInfo[]
  activeFieldKey: string | null
  /** User-drawn boxes (override AI). */
  regions: Record<string, FieldRegionBox>
  /** AI-suggested source boxes from extraction. */
  aiRegions?: Record<string, FieldRegionBox>
  onActiveFieldChange: (fieldKey: string) => void
  onRegionChange: (fieldKey: string, region: FieldRegionBox | null) => void
  fieldKeys: string[]
  /** Show quick-pick field chips under the image. Off when fields are edited in a side panel. */
  showFieldPicker?: boolean
  /** Engine Correct AI — minimal chrome, zoom toolbar, scrollable viewport. */
  compact?: boolean
}

const ZOOM_MIN = 0.5
const ZOOM_MAX = 3
const ZOOM_STEP = 0.15

interface DrawRect {
  x: number
  y: number
  width: number
  height: number
}

const FIELD_COLORS = ['#C2A558', '#2E7D32', '#1565C0', '#B8860B', '#991B1B', '#113543']

function colorForField(fieldKey: string, fieldKeys: string[]): string {
  const index = fieldKeys.indexOf(fieldKey)
  return FIELD_COLORS[index >= 0 ? index % FIELD_COLORS.length : 0]
}

/** Interactive document viewer — click a field, drag a box around where the AI should read. */
export default function FieldRegionSelector({
  images,
  activeFieldKey,
  regions,
  aiRegions = {},
  onActiveFieldChange,
  onRegionChange,
  fieldKeys,
  showFieldPicker = true,
  compact = false,
}: FieldRegionSelectorProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [activePage, setActivePage] = useState(images[0]?.pageNumber ?? 1)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [zoom, setZoom] = useState(1)
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 })
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null)
  const [draftRect, setDraftRect] = useState<DrawRect | null>(null)

  useEffect(() => {
    if (!activeFieldKey) return
    const activeField = regions[activeFieldKey] ?? aiRegions[activeFieldKey]
    if (activeField?.pageNumber) setActivePage(activeField.pageNumber)
  }, [activeFieldKey, regions, aiRegions])

  const pageImage = images.find((img) => img.pageNumber === activePage) ?? images[0]

  const fitBaseWidth = viewportSize.width > 0 ? viewportSize.width : 320
  const imageAspect =
    pageImage && pageImage.imageWidth > 0
      ? pageImage.imageHeight / pageImage.imageWidth
      : 1.294

  const zoomedWidth = Math.round(fitBaseWidth * zoom)
  const zoomedHeight = Math.round(zoomedWidth * imageAspect)

  useEffect(() => {
    const el = compact ? viewportRef.current : containerRef.current
    if (!el) return

    const observer = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect()
      if (compact) {
        setViewportSize({ width: rect.width, height: rect.height })
      } else {
        setDisplaySize({ width: rect.width, height: rect.height })
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [compact])

  useEffect(() => {
    if (compact) {
      setDisplaySize({ width: zoomedWidth, height: zoomedHeight })
    }
  }, [compact, zoomedWidth, zoomedHeight])

  const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))

  const handleWheel = (e: React.WheelEvent) => {
    if (!compact) return
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    setZoom((z) => clampZoom(z + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)))
  }

  const zoomPercent = Math.round(zoom * 100)

  const toNormalized = useCallback(
    (rect: DrawRect): FieldRegionBox | null => {
      if (!pageImage || rect.width < 8 || rect.height < 8) return null
      const scaleX = pageImage.imageWidth / displaySize.width
      const scaleY = pageImage.imageHeight / displaySize.height

      const x = Math.max(0, Math.min(1, (rect.x * scaleX) / pageImage.imageWidth))
      const y = Math.max(0, Math.min(1, (rect.y * scaleY) / pageImage.imageHeight))
      const width = Math.max(0, Math.min(1 - x, (rect.width * scaleX) / pageImage.imageWidth))
      const height = Math.max(0, Math.min(1 - y, (rect.height * scaleY) / pageImage.imageHeight))

      if (width < 0.01 || height < 0.01) return null
      return { pageNumber: pageImage.pageNumber, x, y, width, height }
    },
    [displaySize.height, displaySize.width, pageImage]
  )

  const toDisplayRect = useCallback(
    (region: FieldRegionBox): DrawRect => {
      if (!pageImage) return { x: 0, y: 0, width: 0, height: 0 }
      const scaleX = displaySize.width / pageImage.imageWidth
      const scaleY = displaySize.height / pageImage.imageHeight
      return {
        x: region.x * pageImage.imageWidth * scaleX,
        y: region.y * pageImage.imageHeight * scaleY,
        width: region.width * pageImage.imageWidth * scaleX,
        height: region.height * pageImage.imageHeight * scaleY,
      }
    },
    [displaySize.height, displaySize.width, pageImage]
  )

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!activeFieldKey || !pageImage) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - bounds.left
    const y = event.clientY - bounds.top
    setIsDrawing(true)
    setDrawStart({ x, y })
    setDraftRect({ x, y, width: 0, height: 0 })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawing || !drawStart) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - bounds.left
    const y = event.clientY - bounds.top
    setDraftRect({
      x: Math.min(drawStart.x, x),
      y: Math.min(drawStart.y, y),
      width: Math.abs(x - drawStart.x),
      height: Math.abs(y - drawStart.y),
    })
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawing || !activeFieldKey || !draftRect) {
      setIsDrawing(false)
      setDrawStart(null)
      setDraftRect(null)
      return
    }

    const normalized = toNormalized(draftRect)
    if (normalized) onRegionChange(activeFieldKey, normalized)

    setIsDrawing(false)
    setDrawStart(null)
    setDraftRect(null)
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  if (!pageImage) return null

  const canvas = (
    <div
      ref={containerRef}
      className={`relative select-none touch-none overflow-hidden cursor-crosshair ${
        compact ? 'engine-doc-canvas' : 'w-full rounded border'
      }`}
      style={
        compact
          ? { width: zoomedWidth, height: zoomedHeight, borderColor: 'rgba(255,255,255,0.1)' }
          : { borderColor: '#819291', backgroundColor: '#f8f9fa' }
      }
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <img
        src={pageImage.previewDataUrl}
        alt={`Page ${pageImage.pageNumber} for field marking`}
        className={compact ? 'block pointer-events-none' : 'w-full block pointer-events-none'}
        style={compact ? { width: zoomedWidth, height: zoomedHeight } : undefined}
        draggable={false}
        width={compact ? zoomedWidth : undefined}
        height={compact ? zoomedHeight : undefined}
      />
      {fieldKeys.map((fieldKey) => {
        const aiRegion = aiRegions[fieldKey]
        if (!aiRegion || aiRegion.pageNumber !== pageImage.pageNumber || regions[fieldKey]) {
          return null
        }
        const rect = toDisplayRect(aiRegion)
        const color = colorForField(fieldKey, fieldKeys)
        const isActive = activeFieldKey === fieldKey

        return (
          <div
            key={`ai-${fieldKey}`}
            className="absolute border-2 border-dashed pointer-events-none"
            style={{
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              borderColor: color,
              backgroundColor: `${color}15`,
              boxShadow: isActive ? `0 0 0 2px ${color}` : undefined,
            }}
          >
            <span
              className="absolute -top-5 left-0 text-[10px] font-semibold px-1 rounded whitespace-nowrap"
              style={{ backgroundColor: color, color: '#FFFFFF' }}
            >
              AI: {getFieldLabel(fieldKey)}
            </span>
          </div>
        )
      })}

      {fieldKeys.map((fieldKey) => {
        const region = regions[fieldKey]
        if (!region || region.pageNumber !== pageImage.pageNumber) return null
        const rect = toDisplayRect(region)
        const color = colorForField(fieldKey, fieldKeys)
        const isActive = activeFieldKey === fieldKey

        return (
          <div
            key={`user-${fieldKey}`}
            className="absolute border-2 pointer-events-none"
            style={{
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              borderColor: color,
              backgroundColor: `${color}22`,
              boxShadow: isActive ? `0 0 0 2px ${color}` : undefined,
            }}
          >
            <span
              className="absolute -top-5 left-0 text-[10px] font-semibold px-1 rounded whitespace-nowrap"
              style={{ backgroundColor: color, color: '#FFFFFF' }}
            >
              {getFieldLabel(fieldKey)}
            </span>
          </div>
        )
      })}

      {draftRect && activeFieldKey && (
        <div
          className="absolute border-2 border-dashed pointer-events-none"
          style={{
            left: draftRect.x,
            top: draftRect.y,
            width: draftRect.width,
            height: draftRect.height,
            borderColor: colorForField(activeFieldKey, fieldKeys),
            backgroundColor: `${colorForField(activeFieldKey, fieldKeys)}33`,
          }}
        />
      )}
    </div>
  )

  if (compact) {
    return (
      <div className="engine-doc-viewer">
        <div className="engine-doc-toolbar">
          {images.length > 1 && (
            <div className="engine-doc-pages">
              {images.map((img) => (
                <button
                  key={img.pageNumber}
                  type="button"
                  className={activePage === img.pageNumber ? 'active' : ''}
                  onClick={() => setActivePage(img.pageNumber)}
                >
                  P{img.pageNumber}
                </button>
              ))}
            </div>
          )}
          <div className="engine-doc-zoom">
            <button type="button" title="Zoom out" onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}>
              <ZoomOut className="w-3 h-3" />
            </button>
            <button type="button" title="Zoom in" onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}>
              <ZoomIn className="w-3 h-3" />
            </button>
            <span className="engine-doc-zoom-pct">{zoomPercent}%</span>
            <button type="button" title="Reset zoom" onClick={() => setZoom(1)}>
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>
          {activeFieldKey && regions[activeFieldKey] && (
            <button
              type="button"
              className="engine-doc-clear"
              onClick={() => onRegionChange(activeFieldKey, null)}
            >
              <X className="w-3 h-3" />
              Clear box
            </button>
          )}
        </div>
        <div
          ref={viewportRef}
          className="engine-doc-viewport"
          onWheel={handleWheel}
          title="Ctrl + scroll to zoom"
        >
          <div className="engine-doc-scroll-inner">{canvas}</div>
        </div>
        {!activeFieldKey && (
          <p className="engine-doc-tip">Pick a field on the right, then draw on the page</p>
        )}
      </div>
    )
  }

  return (
    <div className="rounded border p-3 space-y-3" style={{ borderColor: '#113543', backgroundColor: '#FFFFFF' }}>
      <div className="flex items-start gap-2">
        <Crop className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#C2A558' }} />
        <div>
          <div className="text-xs font-semibold" style={{ color: '#113543' }}>
            Where the AI read each field
          </div>
          <p className="text-[11px] mt-0.5" style={{ color: '#819291' }}>
            Dashed boxes show where the AI pulled data from. Click a field and drag to adjust or replace.
          </p>
        </div>
      </div>

      {images.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {images.map((img) => (
            <button
              key={img.pageNumber}
              type="button"
              onClick={() => setActivePage(img.pageNumber)}
              className="px-2 py-1 text-[11px] rounded border"
              style={{
                borderColor: activePage === img.pageNumber ? '#C2A558' : '#819291',
                backgroundColor: activePage === img.pageNumber ? '#FFFBF0' : '#f8f9fa',
                color: '#113543',
              }}
            >
              Page {img.pageNumber}
            </button>
          ))}
        </div>
      )}

      {canvas}

      {showFieldPicker && (
        <div className="flex flex-wrap gap-1.5">
          {fieldKeys.map((fieldKey) => {
            const isActive = activeFieldKey === fieldKey
            const hasRegion = Boolean(regions[fieldKey] || aiRegions[fieldKey])
            const color = colorForField(fieldKey, fieldKeys)

            return (
              <button
                key={fieldKey}
                type="button"
                onClick={() => onActiveFieldChange(fieldKey)}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border transition-colors"
                style={{
                  borderColor: isActive ? color : '#819291',
                  backgroundColor: isActive ? `${color}18` : '#f8f9fa',
                  color: '#113543',
                }}
              >
                {getFieldLabel(fieldKey)}
                {hasRegion && (
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                )}
              </button>
            )
          })}
        </div>
      )}

      {activeFieldKey && regions[activeFieldKey] && (
        <button
          type="button"
          onClick={() => onRegionChange(activeFieldKey, null)}
          className="inline-flex items-center gap-1 text-[11px]"
          style={{ color: '#991B1B' }}
        >
          <X className="w-3 h-3" />
          Clear box for {getFieldLabel(activeFieldKey)}
        </button>
      )}

      {!activeFieldKey && showFieldPicker && (
        <p className="text-[11px]" style={{ color: '#C2A558' }}>
          Select a field to start drawing.
        </p>
      )}

      {!activeFieldKey && !showFieldPicker && (
        <p className="text-[11px]" style={{ color: '#C2A558' }}>
          Select a field on the right, then draw a box on the document.
        </p>
      )}
    </div>
  )
}
