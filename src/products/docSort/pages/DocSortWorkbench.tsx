import { useCallback, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import '../styles/docSort.css'
import { isAIReviewEnabled } from '../../../config/aiReview'
import DocSortAiDisclaimer from '../components/DocSortAiDisclaimer'
import DocSortResults from '../components/DocSortResults'
import DocSortPdfViewer from '../components/DocSortPdfViewer'
import { runDocSort } from '../services/docSortRunner'
import type { DocSortFingerprint, DocSortProgress, DocSortResult, DocSortUpload } from '../types'

const ACCEPT = '.pdf,application/pdf'

function newUpload(file: File): DocSortUpload {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    file,
    fileName: file.name,
    status: 'pending',
  }
}

/**
 * Standalone DocSort workbench — fixed viewport, no page scroll.
 */
export default function DocSortWorkbench() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploads, setUploads] = useState<DocSortUpload[]>([])
  const [dragging, setDragging] = useState(false)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<DocSortProgress | null>(null)
  const [result, setResult] = useState<DocSortResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [viewDoc, setViewDoc] = useState<DocSortFingerprint | null>(null)

  const fileById = useMemo(() => {
    const map = new Map<string, File>()
    uploads.forEach((u) => map.set(u.id, u.file))
    return map
  }, [uploads])

  const viewFile = viewDoc ? fileById.get(viewDoc.docId) : undefined

  const addFiles = useCallback((files: FileList | File[]) => {
    const pdfs = Array.from(files).filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    )
    if (pdfs.length === 0) return
    setUploads((prev) => [...prev, ...pdfs.map(newUpload)])
    setResult(null)
    setError(null)
    setViewDoc(null)
  }, [])

  const removeUpload = (id: string) => {
    setUploads((prev) => prev.filter((u) => u.id !== id))
    if (viewDoc?.docId === id) setViewDoc(null)
  }

  const clearAll = () => {
    setUploads([])
    setResult(null)
    setError(null)
    setProgress(null)
    setViewDoc(null)
  }

  const handleSort = async () => {
    if (!isAIReviewEnabled()) {
      setError('DocSort needs Supabase and the openai-proxy Edge Function (OPENAI_API_KEY set server-side).')
      return
    }
    setRunning(true)
    setError(null)
    setResult(null)
    setViewDoc(null)
    try {
      const sorted = await runDocSort(uploads, setProgress)
      setResult(sorted)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sort failed.')
      setProgress({ phase: 'error', completed: 0, total: uploads.length })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="doc-sort-app">
      <header className="doc-sort-header">
        <Link to="/docsort" className="doc-sort-logo">
          Doc<span>Sort</span>
        </Link>
        <nav className="doc-sort-header-nav">
          <Link to="/home" className="doc-sort-nav-link">
            Products
          </Link>
          <Link to="/docsort" className="doc-sort-nav-link">
            Home
          </Link>
          <Link to="/" className="doc-sort-nav-link">
            AIDocView
          </Link>
        </nav>
      </header>

      <div className={`doc-sort-workspace${viewFile ? ' has-viewer' : ''}`}>
        <aside className="doc-sort-rail">
          <div className="doc-sort-rail-head">
            <span className="doc-sort-rail-title">Batch</span>
            <span className="doc-sort-rail-count">{uploads.length} PDF{uploads.length === 1 ? '' : 's'}</span>
          </div>

          <div
            className={`doc-sort-rail-drop${dragging ? ' dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              addFiles(e.dataTransfer.files)
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              multiple
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files)
                e.target.value = ''
              }}
            />
            <button
              type="button"
              className="doc-sort-btn-secondary doc-sort-rail-browse"
              disabled={running}
              onClick={() => inputRef.current?.click()}
            >
              Add PDFs
            </button>
            <span className="doc-sort-rail-drop-hint">or drop here</span>
          </div>

          <div className="doc-sort-rail-files">
            {uploads.length === 0 ? (
              <p className="doc-sort-rail-empty">Rate cons & BOLs appear here</p>
            ) : (
              uploads.map((u) => (
                <div key={u.id} className="doc-sort-file-row">
                  <span className="doc-sort-file-name" title={u.fileName}>
                    {u.fileName}
                  </span>
                  <button
                    type="button"
                    className="doc-sort-btn-ghost doc-sort-file-remove"
                    disabled={running}
                    onClick={() => removeUpload(u.id)}
                    aria-label={`Remove ${u.fileName}`}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>

          <DocSortAiDisclaimer variant="banner" />

          <div className="doc-sort-rail-foot">
            <button
              type="button"
              className="doc-sort-btn-primary doc-sort-rail-sort"
              disabled={running || uploads.length === 0}
              onClick={handleSort}
            >
              {running ? 'Sorting…' : 'Sort'}
            </button>
            <button
              type="button"
              className="doc-sort-btn-ghost"
              disabled={running || uploads.length === 0}
              onClick={clearAll}
            >
              Clear
            </button>
            {progress?.message && running && (
              <div className="doc-sort-progress">{progress.message}</div>
            )}
            {error && <div className="doc-sort-error">{error}</div>}
          </div>
        </aside>

        <div className="doc-sort-center">
          {result ? (
            <DocSortResults
              result={result}
              fileById={fileById}
              selectedDocId={viewDoc?.docId ?? null}
              onViewDoc={(doc) => {
                const file = fileById.get(doc.docId)
                if (file) setViewDoc(doc)
              }}
            />
          ) : (
            <div className="doc-sort-empty-stage">
              <div className="doc-sort-empty-title">Sort engine</div>
              <p className="doc-sort-empty-text">
                Add PDFs in the batch panel, then run <strong>Sort</strong>. Matched loads appear here — view,
                invoice, and export binders without leaving this screen.
              </p>
            </div>
          )}
        </div>

        {viewFile && viewDoc && (
          <DocSortPdfViewer
            file={viewFile}
            fileName={viewDoc.fileName}
            meta={
              viewDoc.kind === 'rate_confirmation'
                ? 'Rate confirmation'
                : viewDoc.kind === 'bill_of_lading'
                  ? 'Bill of lading'
                  : 'Document'
            }
            onClose={() => setViewDoc(null)}
          />
        )}
      </div>
    </div>
  )
}
