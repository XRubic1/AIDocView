import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react'
import { ChevronLeft, ChevronRight, FileText, RotateCcw, RotateCw } from 'lucide-react'
import DocumentDownloadOverlay from '../ui/DocumentDownloadOverlay'

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
  onEnsureDocument?: (docId: string) => void | Promise<void>
  /** Controlled active document (sync with attached lists). */
  activeDocId?: string | null
  onActiveDocChange?: (docId: string | null) => void
  dropKind?: 'rate_confirmation' | 'bill_of_lading'
  onDropDocument?: (payload: PacketDocDragPayload) => void
  dragFromDraftId?: string | null
}

type PdfJsModule = typeof import('pdfjs-dist')
type PdfDocument = Awaited<
  ReturnType<Awaited<ReturnType<PdfJsModule['getDocument']>>['promise']>
>

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

let pdfjsLib: PdfJsModule | undefined

async function getPdfJs(): Promise<PdfJsModule> {
  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist')
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString()
  }
  return pdfjsLib
}

function isPdfFile(file: File, name: string): boolean {
  const lower = name.toLowerCase()
  return lower.endsWith('.pdf') || file.type === 'application/pdf'
}

/** Normalize to 0 / 90 / 180 / 270. */
function clampRotation(deg: number): number {
  const n = ((Math.round(deg / 90) * 90) % 360 + 360) % 360
  return n
}

/** Renders one PDF page (or image) into the scroll stack. */
function BundlePageView({
  page,
  pdf,
  imageUrl,
  rotation,
  onVisible,
  onRotate,
}: {
  page: BundlePage
  pdf: PdfDocument | null
  imageUrl?: string | null
  /** Extra clockwise degrees on top of the PDF’s own page rotate. */
  rotation: number
  onVisible: (bundleIndex: number, docId: string) => void
  onRotate: (pageKey: string, delta: 90 | -90) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const textLayerRef = useRef<HTMLDivElement | null>(null)
  const stackRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const userRotation = clampRotation(rotation)

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
        const scale = Math.max(1, targetWidth / base.width)
        const viewport = pdfPage.getViewport({ scale, rotation: rotationDeg })
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
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
  }, [page.kind, page.pageInDoc, page.key, pdf, userRotation, syncTextLayerScale])

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
          <canvas ref={canvasRef} className="client-ai-dual-pane__page-canvas" />
          <div
            ref={textLayerRef}
            className="textLayer client-ai-dual-pane__text-layer"
            aria-hidden={false}
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
            className="client-ai-dual-pane__page-image"
            style={{ transform: userRotation ? `rotate(${userRotation}deg)` : undefined }}
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
  downloading = false,
  downloadProgress,
  onEnsureDocument,
  activeDocId,
  onActiveDocChange,
  dropKind,
  onDropDocument,
  dragFromDraftId: _dragFromDraftId = null,
}: CompactPacketDocPaneProps) {
  const [dragOver, setDragOver] = useState(false)
  const [bundlePages, setBundlePages] = useState<BundlePage[]>([])
  const [pdfByDocId, setPdfByDocId] = useState<Record<string, PdfDocument>>({})
  const [imageUrlByDocId, setImageUrlByDocId] = useState<Record<string, string>>({})
  const [visibleBundleIndex, setVisibleBundleIndex] = useState(1)
  const [building, setBuilding] = useState(false)
  /** Per-page clockwise rotation offsets (degrees). */
  const [pageRotations, setPageRotations] = useState<Record<string, number>>({})
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const pdfCacheRef = useRef<Map<string, PdfDocument>>(new Map())
  const onActiveDocChangeRef = useRef(onActiveDocChange)
  onActiveDocChangeRef.current = onActiveDocChange
  /** Avoid scroll↔highlight feedback loops. */
  const lastDocIdRef = useRef<string | null>(null)

  // Prefetch every file in the pane (not only the focused one).
  useEffect(() => {
    if (!onEnsureDocument) return
    documents.forEach((doc) => {
      if (!doc.file) void onEnsureDocument(doc.id)
    })
  }, [documents, onEnsureDocument])

  // Build the flat page list across all loaded documents.
  useEffect(() => {
    let cancelled = false
    const docsWithFiles = documents.filter((d) => d.file)
    if (docsWithFiles.length === 0) {
      setBundlePages([])
      setPdfByDocId({})
      setImageUrlByDocId({})
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
          if (isPdfFile(file, doc.name)) {
            let pdf = pdfCacheRef.current.get(doc.id)
            if (!pdf) {
              const data = await file.arrayBuffer()
              pdf = await pdfjs.getDocument({ data }).promise
              pdfCacheRef.current.set(doc.id, pdf)
            }
            pdfMap[doc.id] = pdf
            const count = Math.max(1, pdf.numPages)
            for (let p = 1; p <= count; p += 1) {
              pages.push({
                key: `${doc.id}-p${p}`,
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
          } else {
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
  }, [documents])

  // Drop cached PDFs when docs leave the pane.
  useEffect(() => {
    const live = new Set(documents.map((d) => d.id))
    for (const id of [...pdfCacheRef.current.keys()]) {
      if (!live.has(id)) pdfCacheRef.current.delete(id)
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
    if (lastDocIdRef.current === activeDocId) return
    const first = bundlePages.find((p) => p.docId === activeDocId)
    if (!first) return
    lastDocIdRef.current = activeDocId
    const el = scrollRef.current.querySelector(
      `[data-bundle-index="${first.bundleIndex}"]`
    )
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setVisibleBundleIndex(first.bundleIndex)
  }, [activeDocId, bundlePages])

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
    documents.length > 0 && documents.some((d) => !d.file) && Boolean(onEnsureDocument)

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
      className={`client-ai-dual-pane${dragOver ? ' is-drop-target' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <header className="client-ai-dual-pane__head">
        <span className="client-ai-dual-pane__title">{title}</span>
        <div className="client-ai-dual-pane__nav">
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
        className="client-ai-dual-pane__body client-ai-dual-pane__scroll relative"
        ref={scrollRef}
      >
        <DocumentDownloadOverlay
          open={(downloading || waitingForFiles || building) && totalPages === 0}
          progress={downloadProgress}
          title={building ? 'Building page bundle' : 'Downloading documents'}
          variant="absolute"
        />

        {totalPages === 0 ? (
          <div className="client-ai-dual-pane__empty">
            <FileText className="w-5 h-5 opacity-50" />
            <span>
              {dropKind
                ? `${emptyHint} — drop a file here to mark as ${
                    dropKind === 'bill_of_lading' ? 'BOL' : 'rate con'
                  }`
                : emptyHint}
            </span>
          </div>
        ) : (
          <div className="client-ai-dual-pane__stack">
            {bundlePages.map((page) => (
              <BundlePageView
                key={page.key}
                page={page}
                pdf={pdfByDocId[page.docId] ?? null}
                imageUrl={imageUrlByDocId[page.docId]}
                rotation={pageRotations[page.key] || 0}
                onVisible={handleVisible}
                onRotate={rotatePage}
              />
            ))}
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
    </section>
  )
}
