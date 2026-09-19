import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { ChevronLeft, ChevronRight, FileText, RotateCcw, RotateCw, SlidersHorizontal } from 'lucide-react'
import DocumentDownloadOverlay from '../ui/DocumentDownloadOverlay'
import DocQualitySettingsWindow from './DocQualitySettingsWindow'
import { getPdfJs } from '../../utils/getPdfJs'
import {
  autoCropFromCanvas,
  docPageCropClipPath,
  docPageQualityFilter,
  isDefaultDocPageQuality,
  type DocPageQuality,
} from '../../utils/docPageQuality'
import {
  clearDocPageQuality,
  cloneDocPageQuality,
  loadDocPageQuality,
  saveDocPageQuality,
} from '../../utils/docPageQualityStore'

export interface CompactDocItem {
  id: string
  name: string
  file?: File
  /** Generated invoice PDF — viewable but not reclassified via drop. */
  generated?: boolean
}

export const PACKET_DOC_MIME = 'application/x-credyx-packet-doc'

export type PacketDocDragPayload = {
  docId: string
  fromDraftId: string | null
  generated?: boolean
}

export function readPacketDocDrag(event: DragEvent): PacketDocDragPayload | null {
  try {
    const raw =
      event.dataTransfer.getData(PACKET_DOC_MIME) ||
      event.dataTransfer.getData('text/plain')
    if (!raw) return null
    const parsed = JSON.parse(raw) as PacketDocDragPayload
    if (!parsed?.docId) return null
    return parsed
  } catch {
    return null
  }
}

export function writePacketDocDrag(
  event: DragEvent,
  payload: PacketDocDragPayload
): void {
  const raw = JSON.stringify(payload)
  event.dataTransfer.setData(PACKET_DOC_MIME, raw)
  event.dataTransfer.setData('text/plain', raw)
  event.dataTransfer.effectAllowed = 'move'
}

interface CompactPacketDocPaneProps {
  title: string
  documents: CompactDocItem[]
  emptyHint?: string
  downloading?: boolean
  downloadProgress?: number
  onEnsureDocument?: (docId: string) => void | Promise<void | File | null>
  /** Controlled active document (sync with attached lists). */
  activeDocId?: string | null
  /**
   * Bump this on each list click so the pane re-scrolls even when
   * `activeDocId` is unchanged (e.g. user scrolled away then clicked again).
   */
  scrollRequestId?: number
  onActiveDocChange?: (docId: string | null) => void
  dropKind?: 'rate_confirmation' | 'bill_of_lading'
  onDropDocument?: (payload: PacketDocDragPayload) => void
  dragFromDraftId?: string | null
  /**
   * Credyx-only: Ctrl+left-drag highlighter on the docs.
   * Strokes stay in memory only — never saved or shared with carriers/brokers.
   */
  allowTempHighlight?: boolean
  /** When this changes (e.g. selected invoice id), discard all highlights. */
  highlightResetKey?: string | null
  /** Credyx-only: open page quality / crop window (temporary view filters). */
  allowQualityTools?: boolean
  /**
   * When set, quality prefs can be Save'd to localStorage under this key
   * (e.g. `bol`, `rate_con`) and restored across invoices/sessions.
   */
  qualityStorageKey?: string
  /** Extra classes on the root pane (e.g. `h-full` to fill a flex parent). */
  className?: string
}

type PdfJsModule = typeof import('pdfjs-dist')
type PdfDocument = import('pdfjs-dist').PDFDocumentProxy

interface BundlePage {
  key: string
  docId: string
  docName: string
  generated?: boolean
  /** 1-based page within that file (images = 1). */
  pageInDoc: number
  /** 1-based index across the whole pane bundle. */
  bundleIndex: number
  kind: 'pdf' | 'image'
  file: File
}

function isPdfFile(file: File, name: string): boolean {
  const lower = name.toLowerCase()
  return lower.endsWith('.pdf') || file.type === 'application/pdf'
}

/**
 * Decide PDF vs image from magic bytes first (handoff uploads often lack .pdf
 * or arrive as application/octet-stream — those used to render as broken images).
 */
async function resolveIsPdf(file: File, name: string): Promise<boolean> {
  try {
    const { sniffBlobMime, headerLooksLikeImage, headerLooksLikePdf } = await import(
      '../../utils/fileMimeSniff'
    )
    const header = new Uint8Array(await file.slice(0, 16).arrayBuffer())
    if (headerLooksLikePdf(header)) return true
    if (headerLooksLikeImage(header)) return false
    const sniffed = await sniffBlobMime(file, name || file.name, file.type)
    if (sniffed === 'application/pdf') return true
    if (sniffed.startsWith('image/')) return false
  } catch {
    /* fall through */
  }
  // Unknown bytes: try PDF when extension/MIME say so, else still try PDF
  // (rate cons are often PDFs with odd camera/export names).
  if (isPdfFile(file, name)) return true
  const lower = (name || file.name || '').toLowerCase()
  if (/\.(png|jpe?g|gif|webp|heic|heif|tif|tiff)$/i.test(lower)) return false
  // No clear image signal — prefer PDF so we don't show blank broken images.
  return true
}

/** Normalize to 0 / 90 / 180 / 270. */
function clampRotation(deg: number): number {
  const n = ((Math.round(deg / 90) * 90) % 360 + 360) % 360
  return n
}

type HighlightStroke = { points: Array<{ x: number; y: number }> }

const HIGHLIGHT_COLOR = 'rgba(250, 204, 21, 0.45)'
const HIGHLIGHT_WIDTH = 14
const VIEW_ZOOM_MIN = 0.5
const VIEW_ZOOM_MAX = 4
/** Ignore tiny right-drags so a plain right-click can zoom out. */
const MARQUEE_MIN_PX = 12

function clampViewZoom(value: number): number {
  return Math.min(VIEW_ZOOM_MAX, Math.max(VIEW_ZOOM_MIN, value))
}

type MarqueeRect = { x1: number; y1: number; x2: number; y2: number }

function normalizeMarquee(m: MarqueeRect): { x: number; y: number; w: number; h: number } {
  const x = Math.min(m.x1, m.x2)
  const y = Math.min(m.y1, m.y2)
  return { x, y, w: Math.abs(m.x2 - m.x1), h: Math.abs(m.y2 - m.y1) }
}

/** Draw stored highlighter strokes onto a canvas (CSS-pixel coords). */
function paintHighlightStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: HighlightStroke[],
  dpr: number
): void {
  ctx.save()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = HIGHLIGHT_COLOR
  ctx.lineWidth = HIGHLIGHT_WIDTH
  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue
    ctx.beginPath()
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
    for (let i = 1; i < stroke.points.length; i += 1) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y)
    }
    if (stroke.points.length === 1) {
      // Single click — still show a blob.
      ctx.lineTo(stroke.points[0].x + 0.01, stroke.points[0].y)
    }
    ctx.stroke()
  }
  ctx.restore()
}

/** Renders one PDF page (or image) into the scroll stack. */
function BundlePageView({
  page,
  pdf,
  imageUrl,
  rotation,
  quality,
  onVisible,
  onRotate,
  onCanvasReady,
}: {
  page: BundlePage
  pdf: PdfDocument | null
  imageUrl?: string | null
  /** Extra clockwise degrees on top of the PDF’s own page rotate. */
  rotation: number
  quality: DocPageQuality
  onVisible: (bundleIndex: number, docId: string) => void
  onRotate: (pageKey: string, delta: 90 | -90) => void
  onCanvasReady?: (pageKey: string, canvas: HTMLCanvasElement | null) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const textLayerRef = useRef<HTMLDivElement | null>(null)
  const stackRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const userRotation = clampRotation(rotation)
  const filterCss = docPageQualityFilter(quality)
  const clipPath = docPageCropClipPath(quality.crop)
  const visualStyle: CSSProperties = {
    filter: filterCss,
    clipPath,
  }

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting && e.intersectionRatio >= 0.45)
        if (hit) onVisible(page.bundleIndex, page.docId)
      },
      { root: el.closest('.client-ai-dual-pane__scroll'), threshold: [0.45, 0.6] }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [page.bundleIndex, page.docId, onVisible])

  /** Keep invisible text overlay aligned with the displayed canvas size. */
  const syncTextLayerScale = useCallback(() => {
    const canvas = canvasRef.current
    const layer = textLayerRef.current
    if (!canvas || !layer || !canvas.width) return
    const scaleX = canvas.clientWidth / canvas.width
    const scaleY = canvas.clientHeight / canvas.height
    layer.style.width = `${canvas.width}px`
    layer.style.height = `${canvas.height}px`
    layer.style.transform = `scale(${scaleX}, ${scaleY})`
  }, [])

  useEffect(() => {
    if (page.kind !== 'pdf' || !pdf || !canvasRef.current || !textLayerRef.current) return
    let cancelled = false
    let textLayer: InstanceType<PdfJsModule['TextLayer']> | null = null
    let resizeObserver: ResizeObserver | null = null

    void (async () => {
      try {
        const pdfjs = await getPdfJs()
        const pdfPage = await pdf.getPage(page.pageInDoc)
        if (cancelled || !canvasRef.current || !textLayerRef.current) return

        const rotationDeg = clampRotation((pdfPage.rotate || 0) + userRotation)
        const base = pdfPage.getViewport({ scale: 1, rotation: rotationDeg })
        const targetWidth = Math.min(720, canvasRef.current.parentElement?.clientWidth || 520)
        const dpr = Math.min(2.5, window.devicePixelRatio || 1)
        // Generated invoice PDFs are raster pages — render sharper so they look like PDFs.
        const minScale = page.generated ? 1.75 : 1
        const scale = Math.max(minScale, (targetWidth / base.width) * dpr)
        const viewport = pdfPage.getViewport({ scale, rotation: rotationDeg })
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d', { alpha: false })
        if (!ctx) return

        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        // Avoid a black GPU flash before paint (blank canvases composite as black).
        ctx.save()
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.restore()
        await pdfPage.render({ canvasContext: ctx, viewport, canvas }).promise
        if (cancelled || !textLayerRef.current) return

        const container = textLayerRef.current
        container.replaceChildren()
        container.setAttribute('style', '')
        container.className = 'textLayer client-ai-dual-pane__text-layer'
        container.style.setProperty('--total-scale-factor', String(scale))

        const textContent = await pdfPage.getTextContent()
        if (cancelled) return

        textLayer = new pdfjs.TextLayer({
          textContentSource: textContent,
          container,
          viewport,
        })
        await textLayer.render()
        if (cancelled) return

        syncTextLayerScale()
        if (stackRef.current && typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => syncTextLayerScale())
          resizeObserver.observe(stackRef.current)
        }
      } catch (err) {
        console.warn('[CompactPacketDocPane] page render failed', page.key, err)
      }
    })()

    return () => {
      cancelled = true
      textLayer?.cancel()
      resizeObserver?.disconnect()
      textLayerRef.current?.replaceChildren()
    }
  }, [page.kind, page.pageInDoc, page.key, page.generated, pdf, userRotation, syncTextLayerScale])

  useEffect(() => {
    onCanvasReady?.(page.key, canvasRef.current)
    return () => onCanvasReady?.(page.key, null)
  }, [page.key, onCanvasReady, pdf, imageUrl])

  return (
    <div
      ref={rootRef}
      className="client-ai-dual-pane__page-card"
      data-bundle-index={page.bundleIndex}
      data-doc-id={page.docId}
      id={`bundle-page-${page.key}`}
    >
      <div className="client-ai-dual-pane__page-label">
        <span className="client-ai-dual-pane__page-label-text">
          {page.generated ? 'Invoice' : page.docName} · p.{page.pageInDoc}
          {userRotation ? ` · ${userRotation}°` : ''}
        </span>
        <span className="client-ai-dual-pane__page-rotate">
          <button
            type="button"
            className="client-ai-dual-pane__nav-btn"
            aria-label="Rotate page left"
            title="Rotate left"
            onClick={() => onRotate(page.key, -90)}
          >
            <RotateCcw className="w-3 h-3" />
          </button>
          <button
            type="button"
            className="client-ai-dual-pane__nav-btn"
            aria-label="Rotate page right"
            title="Rotate right"
            onClick={() => onRotate(page.key, 90)}
          >
            <RotateCw className="w-3 h-3" />
          </button>
        </span>
      </div>
      {page.kind === 'pdf' ? (
        <div ref={stackRef} className="client-ai-dual-pane__page-stack">
          <canvas
            ref={canvasRef}
            className="client-ai-dual-pane__page-canvas client-ai-dual-pane__page-visual"
            style={visualStyle}
          />
          <div
            ref={textLayerRef}
            className="textLayer client-ai-dual-pane__text-layer"
            aria-hidden={false}
            style={clipPath ? { clipPath } : undefined}
          />
        </div>
      ) : imageUrl ? (
        <div
          className={`client-ai-dual-pane__page-image-wrap${
            userRotation === 90 || userRotation === 270
              ? ' client-ai-dual-pane__page-image-wrap--tall'
              : ''
          }`}
        >
          <img
            src={imageUrl}
            alt={page.docName}
            className="client-ai-dual-pane__page-image client-ai-dual-pane__page-visual"
            style={{
              ...visualStyle,
              transform: userRotation ? `rotate(${userRotation}deg)` : undefined,
            }}
          />
        </div>
      ) : (
        <div className="client-ai-dual-pane__page-missing">Could not load page</div>
      )}
    </div>
  )
}

/**
 * Dual-pane viewer: all docs in this role form one scrollable page bundle.
 * Page chrome shows position in the full bundle (e.g. 3/17), not per-file.
 */
export default function CompactPacketDocPane({
  title,
  documents,
  emptyHint = 'No documents',
  downloading: _downloading = false,
  downloadProgress,
  onEnsureDocument,
  activeDocId,
  scrollRequestId = 0,
  onActiveDocChange,
  dropKind,
  onDropDocument,
  dragFromDraftId: _dragFromDraftId = null,
  allowTempHighlight = false,
  highlightResetKey = null,
  allowQualityTools = false,
  qualityStorageKey,
  className,
}: CompactPacketDocPaneProps) {
  const [dragOver, setDragOver] = useState(false)
  const [bundlePages, setBundlePages] = useState<BundlePage[]>([])
  const [pdfByDocId, setPdfByDocId] = useState<Record<string, PdfDocument>>({})
  const [imageUrlByDocId, setImageUrlByDocId] = useState<Record<string, string>>({})
  const [visibleBundleIndex, setVisibleBundleIndex] = useState(1)
  const [building, setBuilding] = useState(false)
  /** Doc ids where ensure finished without a File — stop infinite download overlay. */
  const [ensureFailedIds, setEnsureFailedIds] = useState<Set<string>>(() => new Set())
  const ensureFailedRef = useRef<Set<string>>(new Set())
  const ensureInFlightRef = useRef<Set<string>>(new Set())
  /** Per-page clockwise rotation offsets (degrees). */
  const [pageRotations, setPageRotations] = useState<Record<string, number>>({})
  /** Ctrl held — enable highlighter pointer capture over docs. */
  const [ctrlHeld, setCtrlHeld] = useState(false)
  /** Temporary view zoom; not saved with the packet. */
  const [viewZoom, setViewZoom] = useState(1)
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null)
  /** Unscaled stack size — used to size the scrollable zoom space. */
  const [stackNatural, setStackNatural] = useState({ w: 0, h: 0 })
  const [qualityOpen, setQualityOpen] = useState(false)
  const [pageQuality, setPageQuality] = useState<DocPageQuality>(() =>
    qualityStorageKey
      ? loadDocPageQuality(qualityStorageKey)
      : cloneDocPageQuality()
  )
  const [autoCropBusy, setAutoCropBusy] = useState(false)
  const pageCanvasByKeyRef = useRef<Map<string, HTMLCanvasElement>>(new Map())
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const stackRef = useRef<HTMLDivElement | null>(null)
  const highlightCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const strokesRef = useRef<HighlightStroke[]>([])
  const drawingRef = useRef(false)
  const zoomDragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
  } | null>(null)
  const viewZoomRef = useRef(viewZoom)
  viewZoomRef.current = viewZoom
  const marqueeRef = useRef<MarqueeRect | null>(null)
  marqueeRef.current = marquee
  const pendingScrollRef = useRef<{ left: number; top: number } | null>(null)
  const pdfCacheRef = useRef<Map<string, PdfDocument>>(new Map())
  const onActiveDocChangeRef = useRef(onActiveDocChange)
  onActiveDocChangeRef.current = onActiveDocChange
  /** Avoid scroll↔highlight feedback loops. */
  const lastDocIdRef = useRef<string | null>(null)
  /** Tracks parent list-click bumps so we can re-jump to the same doc. */
  const lastScrollRequestRef = useRef(0)

  /** Bust PDF cache when the generated invoice file is replaced under the same doc id. */
  const pdfRevisionKey = (docId: string, file: File) =>
    `${docId}::${file.size}::${file.lastModified}::${file.name}`

  const docsFingerprint = useMemo(
    () =>
      documents
        .map((d) =>
          d.file
            ? `${d.id}:${d.file.size}:${d.file.lastModified}`
            : d.id
        )
        .join('|'),
    [documents]
  )

  /** Redraw highlighter canvas from stroke history (keeps marks across resize). */
  const redrawHighlights = useCallback(() => {
    const canvas = highlightCanvasRef.current
    const stack = stackRef.current
    if (!canvas || !stack) return
    // Size to the in-flow stack box only — never scrollHeight (absolute canvas
    // would inflate scrollHeight and leave blank space below the docs).
    const w = Math.max(1, stack.clientWidth)
    const h = Math.max(1, stack.clientHeight)
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const nextW = Math.floor(w * dpr)
    const nextH = Math.floor(h * dpr)
    if (canvas.width !== nextW || canvas.height !== nextH) {
      canvas.width = nextW
      canvas.height = nextH
    }
    // Let CSS inset:0 / width/height 100% own the layout box.
    canvas.style.width = ''
    canvas.style.height = ''
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    paintHighlightStrokes(ctx, strokesRef.current, dpr)
  }, [])

  const clearHighlights = useCallback(() => {
    strokesRef.current = []
    drawingRef.current = false
    const canvas = highlightCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
  }, [])

  // Discard marks + zoom when invoice/docs change. Restore saved quality prefs when keyed.
  useEffect(() => {
    clearHighlights()
    setViewZoom(1)
    setMarquee(null)
    zoomDragRef.current = null
    setPageQuality(
      qualityStorageKey
        ? loadDocPageQuality(qualityStorageKey)
        : cloneDocPageQuality()
    )
    setQualityOpen(false)
  }, [highlightResetKey, docsFingerprint, clearHighlights, qualityStorageKey])

  const onPageCanvasReady = useCallback((pageKey: string, canvas: HTMLCanvasElement | null) => {
    if (canvas) pageCanvasByKeyRef.current.set(pageKey, canvas)
    else pageCanvasByKeyRef.current.delete(pageKey)
  }, [])

  const runAutoCropVisiblePage = useCallback(() => {
    const page = bundlePages.find((p) => p.bundleIndex === visibleBundleIndex)
    if (!page) return
    setAutoCropBusy(true)
    try {
      let canvas = pageCanvasByKeyRef.current.get(page.key) ?? null
      if (!canvas && page.kind === 'image') {
        const card = scrollRef.current?.querySelector(
          `[data-bundle-index="${page.bundleIndex}"] img`
        ) as HTMLImageElement | null
        if (card && card.naturalWidth > 0) {
          const tmp = document.createElement('canvas')
          tmp.width = card.naturalWidth
          tmp.height = card.naturalHeight
          const ctx = tmp.getContext('2d')
          ctx?.drawImage(card, 0, 0)
          canvas = tmp
        }
      }
      if (!canvas || canvas.width < 8) return
      const crop = autoCropFromCanvas(canvas)
      setPageQuality((prev) => ({ ...prev, crop }))
    } finally {
      setAutoCropBusy(false)
    }
  }, [bundlePages, visibleBundleIndex])

  // Track Ctrl so the overlay can capture pointer only while highlighting.
  useEffect(() => {
    if (!allowTempHighlight) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control') setCtrlHeld(true)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control') {
        setCtrlHeld(false)
        drawingRef.current = false
      }
    }
    const onBlur = () => {
      setCtrlHeld(false)
      drawingRef.current = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [allowTempHighlight])

  // Keep highlight canvas sized to the page stack.
  useEffect(() => {
    if (!allowTempHighlight) return
    const stack = stackRef.current
    if (!stack) return
    const ro = new ResizeObserver(() => redrawHighlights())
    ro.observe(stack)
    redrawHighlights()
    return () => ro.disconnect()
  }, [allowTempHighlight, bundlePages, viewZoom, redrawHighlights])

  const pointFromEvent = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = highlightCanvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    // Map through CSS zoom / transform so strokes land on the doc pixels.
    const cssW = canvas.clientWidth || rect.width
    const cssH = canvas.clientHeight || rect.height
    return {
      x: ((e.clientX - rect.left) / rect.width) * cssW,
      y: ((e.clientY - rect.top) / rect.height) * cssH,
    }
  }

  const onHighlightPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!allowTempHighlight || !e.ctrlKey || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const pt = pointFromEvent(e)
    if (!pt) return
    drawingRef.current = true
    strokesRef.current = [...strokesRef.current, { points: [pt] }]
    e.currentTarget.setPointerCapture(e.pointerId)
    redrawHighlights()
  }

  const onHighlightPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !e.ctrlKey) return
    e.preventDefault()
    const pt = pointFromEvent(e)
    if (!pt) return
    const strokes = strokesRef.current
    const current = strokes[strokes.length - 1]
    if (!current) return
    current.points.push(pt)
    redrawHighlights()
  }

  const onHighlightPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    drawingRef.current = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
  }

  const clientPointInScroller = (e: { clientX: number; clientY: number }) => {
    const scroller = scrollRef.current
    if (!scroller) return null
    const rect = scroller.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      scroller,
    }
  }

  // Measure unscaled stack so zoom can size a real scrollable area (incl. sides).
  useEffect(() => {
    const stack = stackRef.current
    const scroller = scrollRef.current
    if (!stack) return
    const measure = () => {
      const w = Math.max(1, scroller?.clientWidth || stack.offsetWidth)
      const h = Math.max(0, stack.offsetHeight)
      setStackNatural((prev) => (prev.w === w && prev.h === h ? prev : { w, h }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(stack)
    if (scroller) ro.observe(scroller)
    return () => ro.disconnect()
  }, [bundlePages])

  /** Clamp scroll using known content×zoom size — scrollWidth is unreliable mid-layout. */
  const applyScrollTarget = useCallback(
    (target: { left: number; top: number }) => {
      const el = scrollRef.current
      if (!el) return
      const z = viewZoomRef.current
      const contentW = Math.max(stackNatural.w, el.clientWidth, 1)
      const contentH = Math.max(stackNatural.h, 1)
      const maxLeft = Math.max(0, contentW * z - el.clientWidth)
      const maxTop = Math.max(0, contentH * z - el.clientHeight)
      el.scrollLeft = Math.min(Math.max(0, target.left), maxLeft)
      el.scrollTop = Math.min(Math.max(0, target.top), maxTop)
    },
    [stackNatural.w, stackNatural.h]
  )

  // Restore scroll before paint; re-apply next frame once zoom layout settles.
  useLayoutEffect(() => {
    const pending = pendingScrollRef.current
    if (!pending) return
    pendingScrollRef.current = null
    applyScrollTarget(pending)
    const saved = { ...pending }
    const id = requestAnimationFrame(() => applyScrollTarget(saved))
    return () => cancelAnimationFrame(id)
  }, [viewZoom, applyScrollTarget])

  const zoomSpaceStyle = useMemo((): CSSProperties => {
    if (viewZoom <= 1.001 || stackNatural.w <= 0 || stackNatural.h <= 0) {
      return { width: '100%' }
    }
    // Explicit size so left/right edges are actually scrollable when zoomed.
    return {
      width: stackNatural.w * viewZoom,
      height: stackNatural.h * viewZoom,
    }
  }, [viewZoom, stackNatural])

  const stackZoomStyle = useMemo((): CSSProperties => {
    if (viewZoom <= 1.001) {
      return { width: '100%' }
    }
    return {
      width: stackNatural.w,
      transform: `scale(${viewZoom})`,
      transformOrigin: 'top left',
    }
  }, [viewZoom, stackNatural.w])

  /**
   * Zoom while keeping a viewport point (or marquee center) locked to the same content.
   * Uses content×zoom math so side regions can scroll into view.
   */
  const queueZoomAt = (
    nextZoom: number,
    viewportX: number,
    viewportY: number,
    opts?: { center?: boolean }
  ) => {
    const scroller = scrollRef.current
    const currentZoom = viewZoomRef.current
    if (!scroller) {
      setViewZoom(nextZoom)
      return
    }
    const contentX = (scroller.scrollLeft + viewportX) / currentZoom
    const contentY = (scroller.scrollTop + viewportY) / currentZoom
    const anchorX = opts?.center ? scroller.clientWidth / 2 : 0
    const anchorY = opts?.center ? scroller.clientHeight / 2 : 0
    pendingScrollRef.current = {
      left: contentX * nextZoom - (opts?.center ? anchorX : viewportX),
      top: contentY * nextZoom - (opts?.center ? anchorY : viewportY),
    }
    setViewZoom(nextZoom)
  }

  /**
   * Right-drag draws a marquee box; release zooms that area into view.
   * Plain right-click (no drag) zooms back out to 100%.
   */
  const onZoomPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 2) return
    e.preventDefault()
    const pt = clientPointInScroller(e)
    if (!pt) return
    zoomDragRef.current = {
      pointerId: e.pointerId,
      startX: pt.x,
      startY: pt.y,
    }
    const next = { x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y }
    marqueeRef.current = next
    setMarquee(next)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onZoomPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const drag = zoomDragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    e.preventDefault()
    const pt = clientPointInScroller(e)
    if (!pt) return
    const next = {
      x1: drag.startX,
      y1: drag.startY,
      x2: pt.x,
      y2: pt.y,
    }
    marqueeRef.current = next
    setMarquee(next)
  }

  const onZoomPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    const drag = zoomDragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    zoomDragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }

    const scroller = scrollRef.current
    const raw = marqueeRef.current
    marqueeRef.current = null
    setMarquee(null)
    if (!scroller) return

    const box = raw ? normalizeMarquee(raw) : null

    // Click / tiny drag → zoom out when already zoomed.
    if (!box || box.w < MARQUEE_MIN_PX || box.h < MARQUEE_MIN_PX) {
      if (viewZoomRef.current > 1.01) {
        queueZoomAt(1, 0, 0)
      }
      return
    }

    const currentZoom = viewZoomRef.current
    const scale = Math.min(scroller.clientWidth / box.w, scroller.clientHeight / box.h)
    const nextZoom = clampViewZoom(currentZoom * scale)
    if (Math.abs(nextZoom - currentZoom) < 0.02) return

    // Center the selected region so left/right edge zooms land in view.
    queueZoomAt(nextZoom, box.x + box.w / 2, box.y + box.h / 2, { center: true })
  }

  const onDocContextMenu = (e: ReactMouseEvent) => {
    // Block native menu so right-drag marquee zoom works cleanly.
    e.preventDefault()
  }

  const onHighlightPointerDownCombined = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button === 2) {
      onZoomPointerDown(e)
      return
    }
    onHighlightPointerDown(e)
  }

  const onHighlightPointerMoveCombined = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (zoomDragRef.current) {
      onZoomPointerMove(e)
      return
    }
    onHighlightPointerMove(e)
  }

  const onHighlightPointerUpCombined = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button === 2 || zoomDragRef.current) {
      onZoomPointerUp(e)
      return
    }
    onHighlightPointerUp(e)
  }

  const marqueeStyle = useMemo((): CSSProperties | undefined => {
    if (!marquee) return undefined
    const box = normalizeMarquee(marquee)
    const scroller = scrollRef.current
    // Marquee coords are viewport-relative; abspos inside the scroller is content-relative.
    const ox = scroller?.scrollLeft ?? 0
    const oy = scroller?.scrollTop ?? 0
    return {
      left: box.x + ox,
      top: box.y + oy,
      width: box.w,
      height: box.h,
    }
  }, [marquee])

  // Prefetch every file in the pane (not only the focused one).
  useEffect(() => {
    if (!onEnsureDocument) return
    documents.forEach((doc) => {
      if (doc.file) {
        if (ensureFailedRef.current.has(doc.id)) {
          ensureFailedRef.current.delete(doc.id)
          setEnsureFailedIds(new Set(ensureFailedRef.current))
        }
        return
      }
      if (ensureFailedRef.current.has(doc.id) || ensureInFlightRef.current.has(doc.id)) {
        return
      }
      ensureInFlightRef.current.add(doc.id)
      void (async () => {
        try {
          const result = await onEnsureDocument(doc.id)
          if (result instanceof File) {
            ensureFailedRef.current.delete(doc.id)
            setEnsureFailedIds(new Set(ensureFailedRef.current))
            return
          }
          if (result === null) {
            ensureFailedRef.current.add(doc.id)
            setEnsureFailedIds(new Set(ensureFailedRef.current))
          }
        } catch {
          ensureFailedRef.current.add(doc.id)
          setEnsureFailedIds(new Set(ensureFailedRef.current))
        } finally {
          ensureInFlightRef.current.delete(doc.id)
        }
      })()
    })
  }, [documents, onEnsureDocument])

  // Clear stuck overlay when ensure never returns a File (legacy void callbacks).
  useEffect(() => {
    if (!onEnsureDocument) return
    const missing = documents.filter(
      (d) => !d.file && !ensureFailedRef.current.has(d.id)
    )
    if (missing.length === 0) return
    const timer = window.setTimeout(() => {
      let changed = false
      for (const doc of missing) {
        if (!ensureInFlightRef.current.has(doc.id) && !ensureFailedRef.current.has(doc.id)) {
          ensureFailedRef.current.add(doc.id)
          changed = true
        }
      }
      if (changed) setEnsureFailedIds(new Set(ensureFailedRef.current))
    }, 12_000)
    return () => window.clearTimeout(timer)
  }, [documents, onEnsureDocument])

  // Build the flat page list across all loaded documents.
  useEffect(() => {
    let cancelled = false
    const docsWithFiles = documents.filter((d) => d.file)
    if (docsWithFiles.length === 0) {
      setBuilding(false)
      setBundlePages([])
      setPdfByDocId({})
      setImageUrlByDocId((prev) => {
        Object.values(prev).forEach((url) => URL.revokeObjectURL(url))
        return {}
      })
      setVisibleBundleIndex(1)
      return
    }

    setBuilding(true)
    void (async () => {
      try {
        const pdfjs = await getPdfJs()
        const pages: BundlePage[] = []
        const pdfMap: Record<string, PdfDocument> = {}
        const imageMap: Record<string, string> = {}
        let bundleIndex = 1

        for (const doc of docsWithFiles) {
          const file = doc.file!
          const preferPdf = await resolveIsPdf(file, doc.name)
          let loadedAsPdf = false

          if (preferPdf) {
            try {
              const revision = pdfRevisionKey(doc.id, file)
              let pdf = pdfCacheRef.current.get(revision)
              if (!pdf) {
                // Drop prior revisions for this doc id so regenerated invoices refresh.
                for (const key of [...pdfCacheRef.current.keys()]) {
                  if (key === revision || !key.startsWith(`${doc.id}::`)) continue
                  const stale = pdfCacheRef.current.get(key)
                  pdfCacheRef.current.delete(key)
                  void stale?.destroy?.().catch(() => undefined)
                }
                const data = await file.arrayBuffer()
                pdf = await pdfjs.getDocument({ data }).promise
                pdfCacheRef.current.set(revision, pdf)
              }
              pdfMap[doc.id] = pdf
              const count = Math.max(1, pdf.numPages)
              for (let p = 1; p <= count; p += 1) {
                pages.push({
                  key: `${revision}-p${p}`,
                  docId: doc.id,
                  docName: doc.name,
                  generated: doc.generated,
                  pageInDoc: p,
                  bundleIndex,
                  kind: 'pdf',
                  file,
                })
                bundleIndex += 1
              }
              loadedAsPdf = true
            } catch (err) {
              console.warn(
                '[CompactPacketDocPane] PDF open failed, falling back to image',
                doc.name,
                err
              )
            }
          }

          if (!loadedAsPdf) {
            imageMap[doc.id] = URL.createObjectURL(file)
            pages.push({
              key: `${doc.id}-p1`,
              docId: doc.id,
              docName: doc.name,
              generated: doc.generated,
              pageInDoc: 1,
              bundleIndex,
              kind: 'image',
              file,
            })
            bundleIndex += 1
          }
        }

        if (cancelled) {
          Object.values(imageMap).forEach((url) => URL.revokeObjectURL(url))
          return
        }

        setImageUrlByDocId((prev) => {
          Object.values(prev).forEach((url) => URL.revokeObjectURL(url))
          return imageMap
        })
        setPdfByDocId(pdfMap)
        setBundlePages(pages)
        setVisibleBundleIndex((prev) => Math.min(prev, Math.max(1, pages.length)))
      } catch (err) {
        console.warn('[CompactPacketDocPane] bundle build failed', err)
        if (!cancelled) setBundlePages([])
      } finally {
        if (!cancelled) setBuilding(false)
      }
    })()

    return () => {
      cancelled = true
    }
    // Fingerprint (ids + file sizes) avoids rebuild churn from new array identities.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docsFingerprint])

  // Drop cached PDFs when docs leave the pane (keys are revision-scoped).
  useEffect(() => {
    const live = new Set(documents.map((d) => d.id))
    for (const key of [...pdfCacheRef.current.keys()]) {
      const docId = key.split('::')[0] ?? key
      if (!live.has(docId)) pdfCacheRef.current.delete(key)
    }
  }, [documents])

  const totalPages = bundlePages.length

  const handleVisible = useCallback((bundleIndex: number, docId: string) => {
    setVisibleBundleIndex(bundleIndex)
    if (lastDocIdRef.current === docId) return
    lastDocIdRef.current = docId
    onActiveDocChangeRef.current?.(docId)
  }, [])

  const rotatePage = useCallback((pageKey: string, delta: 90 | -90) => {
    setPageRotations((prev) => ({
      ...prev,
      [pageKey]: clampRotation((prev[pageKey] || 0) + delta),
    }))
  }, [])

  const rotateVisiblePage = useCallback(
    (delta: 90 | -90) => {
      const page = bundlePages.find((p) => p.bundleIndex === visibleBundleIndex)
      if (!page) return
      rotatePage(page.key, delta)
    },
    [bundlePages, visibleBundleIndex, rotatePage]
  )

  // When the user picks a doc from the list, jump to its first page in the stack.
  useEffect(() => {
    if (!activeDocId || !scrollRef.current) return
    const forcedJump = scrollRequestId !== lastScrollRequestRef.current
    if (forcedJump) lastScrollRequestRef.current = scrollRequestId
    else if (lastDocIdRef.current === activeDocId) return
    const first = bundlePages.find((p) => p.docId === activeDocId)
    if (!first) return
    lastDocIdRef.current = activeDocId
    const el = scrollRef.current.querySelector(
      `[data-bundle-index="${first.bundleIndex}"]`
    )
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setVisibleBundleIndex(first.bundleIndex)
  }, [activeDocId, bundlePages, scrollRequestId])

  const scrollToBundleIndex = (index: number) => {
    const clamped = Math.max(1, Math.min(totalPages, index))
    const el = scrollRef.current?.querySelector(`[data-bundle-index="${clamped}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setVisibleBundleIndex(clamped)
    const page = bundlePages.find((p) => p.bundleIndex === clamped)
    if (page) {
      lastDocIdRef.current = page.docId
      onActiveDocChangeRef.current?.(page.docId)
    }
  }

  const handleDragOver = (event: DragEvent) => {
    if (!dropKind || !onDropDocument) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDragOver(true)
  }

  const handleDrop = (event: DragEvent) => {
    if (!dropKind || !onDropDocument) return
    event.preventDefault()
    setDragOver(false)
    const payload = readPacketDocDrag(event)
    if (!payload || payload.generated) return
    onDropDocument(payload)
  }

  const waitingForFiles =
    documents.length > 0 &&
    documents.some((d) => !d.file && !ensureFailedIds.has(d.id)) &&
    Boolean(onEnsureDocument)

  const pageLabel = totalPages === 0 ? '0/0' : `${visibleBundleIndex}/${totalPages}`

  const dragDoc = useMemo(() => {
    const id =
      activeDocId ||
      bundlePages.find((p) => p.bundleIndex === visibleBundleIndex)?.docId ||
      documents[0]?.id
    return documents.find((d) => d.id === id) ?? null
  }, [activeDocId, bundlePages, visibleBundleIndex, documents])

  return (
    <section
      className={`client-ai-dual-pane${dragOver ? ' is-drop-target' : ''}${
        className ? ` ${className}` : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <header className="client-ai-dual-pane__head">
        <span className="client-ai-dual-pane__title">{title}</span>
        <div className="client-ai-dual-pane__nav">
          {allowTempHighlight ? (
            <span
              className="client-ai-dual-pane__hint"
              title="Ctrl+drag highlight · Right-drag a box to zoom in · Right-click to zoom out"
            >
              Ctrl+drag · box zoom
            </span>
          ) : (
            <span
              className="client-ai-dual-pane__hint"
              title="Right-drag a box to zoom in · Right-click to zoom out"
            >
              Box zoom
            </span>
          )}
          {viewZoom !== 1 ? (
            <button
              type="button"
              className="client-ai-dual-pane__zoom-badge"
              onClick={() => queueZoomAt(1, 0, 0)}
              title="Reset zoom"
            >
              {Math.round(viewZoom * 100)}%
            </button>
          ) : null}
          {allowQualityTools ? (
            <button
              type="button"
              className={`client-ai-dual-pane__nav-btn${
                qualityOpen || !isDefaultDocPageQuality(pageQuality) ? ' is-on' : ''
              }`}
              disabled={totalPages === 0}
              onClick={() => setQualityOpen((v) => !v)}
              aria-label="Page quality and crop"
              title="Quality & crop"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            className="client-ai-dual-pane__nav-btn"
            disabled={totalPages === 0}
            onClick={() => rotateVisiblePage(-90)}
            aria-label="Rotate current page left"
            title="Rotate left"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            className="client-ai-dual-pane__nav-btn"
            disabled={totalPages === 0}
            onClick={() => rotateVisiblePage(90)}
            aria-label="Rotate current page right"
            title="Rotate right"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            className="client-ai-dual-pane__nav-btn"
            disabled={visibleBundleIndex <= 1 || totalPages === 0}
            onClick={() => scrollToBundleIndex(visibleBundleIndex - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="client-ai-dual-pane__page" title="Page in full document bundle">
            {pageLabel}
          </span>
          <button
            type="button"
            className="client-ai-dual-pane__nav-btn"
            disabled={visibleBundleIndex >= totalPages || totalPages === 0}
            onClick={() => scrollToBundleIndex(visibleBundleIndex + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      <div
        className={`client-ai-dual-pane__body client-ai-dual-pane__scroll relative${
          allowTempHighlight && ctrlHeld ? ' is-highlighting' : ''
        }${marquee ? ' is-zooming' : ''}`}
        ref={scrollRef}
        onContextMenu={onDocContextMenu}
        onPointerDown={onZoomPointerDown}
        onPointerMove={onZoomPointerMove}
        onPointerUp={onZoomPointerUp}
        onPointerCancel={onZoomPointerUp}
      >
        <DocumentDownloadOverlay
          open={
            documents.length > 0 &&
            totalPages === 0 &&
            (waitingForFiles || building)
          }
          progress={downloadProgress}
          title={building ? 'Building page bundle' : 'Downloading documents'}
          variant="absolute"
        />

        {marqueeStyle ? (
          <div className="client-ai-dual-pane__marquee" style={marqueeStyle} aria-hidden />
        ) : null}

        {totalPages === 0 ? (
          <div className="client-ai-dual-pane__empty">
            <FileText className="w-5 h-5 opacity-50" />
            <span>
              {documents.some((d) => !d.file && ensureFailedIds.has(d.id))
                ? 'Could not load this document. Try another page or re-open Doc Split.'
                : dropKind
                  ? `${emptyHint} — drop a file here to mark as ${
                      dropKind === 'bill_of_lading' ? 'BOL' : 'rate con'
                    }`
                  : emptyHint}
            </span>
          </div>
        ) : (
          <div className="client-ai-dual-pane__zoom-space" style={zoomSpaceStyle}>
            <div
              className="client-ai-dual-pane__stack"
              ref={stackRef}
              style={stackZoomStyle}
            >
              {bundlePages.map((page) => (
                <BundlePageView
                  key={page.key}
                  page={page}
                  pdf={pdfByDocId[page.docId] ?? null}
                  imageUrl={imageUrlByDocId[page.docId]}
                  rotation={pageRotations[page.key] || 0}
                  quality={pageQuality}
                  onVisible={handleVisible}
                  onRotate={rotatePage}
                  onCanvasReady={allowQualityTools ? onPageCanvasReady : undefined}
                />
              ))}
              {allowTempHighlight ? (
                <canvas
                  ref={highlightCanvasRef}
                  className={`client-ai-dual-pane__highlight${
                    ctrlHeld ? ' is-active' : ''
                  }`}
                  aria-hidden
                  onPointerDown={onHighlightPointerDownCombined}
                  onPointerMove={onHighlightPointerMoveCombined}
                  onPointerUp={onHighlightPointerUpCombined}
                  onPointerCancel={onHighlightPointerUpCombined}
                />
              ) : null}
            </div>
          </div>
        )}
      </div>

      {dragDoc?.name ? (
        <p className="client-ai-dual-pane__filename" title={dragDoc.name}>
          {dragDoc.generated ? 'Invoice · ' : ''}
          {dragDoc.name}
          {totalPages > 0 ? ` · ${totalPages} pages` : ''}
        </p>
      ) : null}

      {allowQualityTools ? (
        <DocQualitySettingsWindow
          open={qualityOpen}
          title={`${title} quality`}
          quality={pageQuality}
          onChange={setPageQuality}
          onClose={() => setQualityOpen(false)}
          onAutoCrop={runAutoCropVisiblePage}
          autoCropBusy={autoCropBusy}
          onSave={
            qualityStorageKey
              ? (q) => saveDocPageQuality(qualityStorageKey, q)
              : undefined
          }
          onResetSaved={
            qualityStorageKey
              ? () => clearDocPageQuality(qualityStorageKey)
              : undefined
          }
        />
      ) : null}
    </section>
  )
}
