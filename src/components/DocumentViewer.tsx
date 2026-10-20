import { useState, useEffect, useRef } from 'react'
import { X, ChevronLeft, ChevronRight, Download, Printer, FileText, Upload } from 'lucide-react'
import jsPDF from 'jspdf'
import { useToast } from './ui/ToastProvider'
import DocumentDownloadOverlay from './ui/DocumentDownloadOverlay'
import '../styles/documentViewer.css'

interface Document {
  id: string
  name: string
  file?: File
  url?: string
  type?: string
  size?: number
}

interface DocumentMoveTarget {
  draftId: string | null
  label: string
}

interface DocumentViewerProps {
  isOpen: boolean
  onClose: () => void
  documents: Document[]
  invoiceNumber?: string
  title?: string
  moveTargets?: DocumentMoveTarget[]
  onMoveDocument?: (docId: string, toDraftId: string | null) => void
  lockedDocIds?: string[]
  moveDisabled?: boolean
  /** Unassign the current supporting doc back to the unmatched pile. */
  onUnassignDocument?: (docId: string) => void
  /** Permanently delete the current supporting doc. */
  onDeleteDocument?: (docId: string) => void
  /** Highlight / jump to this document id in the list. */
  activeDocId?: string
  /** `pane` fills the parent (split layouts); default is a centered modal. */
  layout?: 'modal' | 'pane'
  /** Show blurry download overlay while a remote PDF is being fetched. */
  isDownloading?: boolean
  downloadProgress?: number
  downloadLabel?: string
  downloadFileName?: string
  /** Real files are still being fetched (e.g. from storage). */
  loading?: boolean
  /** When set, shows an Upload button so users can add more documents. */
  onUpload?: (files: File[]) => void | Promise<void>
}

export default function DocumentViewer({
  isOpen,
  onClose,
  documents,
  invoiceNumber,
  title = 'View Documents',
  moveTargets,
  onMoveDocument,
  lockedDocIds = [],
  moveDisabled = false,
  onUnassignDocument,
  onDeleteDocument,
  activeDocId,
  layout = 'modal',
  isDownloading = false,
  downloadProgress,
  downloadLabel,
  downloadFileName,
  loading = false,
  onUpload,
}: DocumentViewerProps) {
  const { showToast } = useToast()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [documentUrls, setDocumentUrls] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isPane = layout === 'pane'

  // Generate URLs for documents
  useEffect(() => {
    if ((!isOpen && !isPane) || documents.length === 0) return

    const urls: string[] = []
    documents.forEach((doc) => {
      if (doc.file) {
        const url = URL.createObjectURL(doc.file)
        urls.push(url)
      } else if (doc.url) {
        urls.push(doc.url)
      } else {
        // For mock documents, create a placeholder
        urls.push('')
      }
    })

    setDocumentUrls(urls)
    setCurrentIndex((prev) => {
      const preferred = activeDocId
        ? documents.findIndex((doc) => doc.id === activeDocId)
        : prev
      if (preferred >= 0 && preferred < documents.length) return preferred
      return Math.min(prev, Math.max(0, documents.length - 1))
    })

    // Cleanup URLs on unmount
    return () => {
      urls.forEach((url) => {
        if (url && url.startsWith('blob:')) {
          URL.revokeObjectURL(url)
        }
      })
    }
  }, [isOpen, isPane, documents])

  useEffect(() => {
    if (!activeDocId) return
    const idx = documents.findIndex((doc) => doc.id === activeDocId)
    if (idx >= 0) setCurrentIndex(idx)
  }, [activeDocId, documents])

  const currentDocument = documents[currentIndex]
  const currentUrl = documentUrls[currentIndex]

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
    }
  }

  const handleNext = () => {
    if (currentIndex < documents.length - 1) {
      setCurrentIndex(currentIndex + 1)
    }
  }

  const convertImageToPDF = async (imageUrl: string): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const pdf = new jsPDF('p', 'mm', 'a4')
        const imgWidth = img.width
        const imgHeight = img.height
        const pdfWidth = pdf.internal.pageSize.getWidth()
        const pdfHeight = (imgHeight * pdfWidth) / imgWidth
        
        // If image is taller than one page, split it
        if (pdfHeight > pdf.internal.pageSize.getHeight()) {
          const pageHeight = pdf.internal.pageSize.getHeight()
          let heightLeft = pdfHeight
          let position = 0
          
          pdf.addImage(imageUrl, 'PNG', 0, position, pdfWidth, pdfHeight)
          heightLeft -= pageHeight
          
          while (heightLeft > 0) {
            position = heightLeft - pdfHeight
            pdf.addPage()
            pdf.addImage(imageUrl, 'PNG', 0, position, pdfWidth, pdfHeight)
            heightLeft -= pageHeight
          }
        } else {
          pdf.addImage(imageUrl, 'PNG', 0, 0, pdfWidth, pdfHeight)
        }
        
        const pdfBlob = pdf.output('blob')
        resolve(pdfBlob)
      }
      img.onerror = reject
      img.src = imageUrl
    })
  }

  const handleDownload = async () => {
    if (!currentDocument) return

    const fileType = getFileType(currentDocument.name)
    
    // Convert images to PDF before downloading
    if ((fileType === 'image') && currentUrl) {
      try {
        const pdfBlob = await convertImageToPDF(currentUrl)
        const pdfFileName = currentDocument.name.replace(/\.(png|jpeg|jpg)$/i, '.pdf')
        const url = URL.createObjectURL(pdfBlob)
        const link = document.createElement('a')
        link.href = url
        link.download = pdfFileName
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      } catch (error) {
        console.error('Error converting image to PDF:', error)
        // Fallback to original download
        if (currentDocument.file) {
          const url = URL.createObjectURL(currentDocument.file)
          const link = document.createElement('a')
          link.href = url
          link.download = currentDocument.name
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          URL.revokeObjectURL(url)
        }
      }
    } else if (currentDocument.file) {
      const url = URL.createObjectURL(currentDocument.file)
      const link = document.createElement('a')
      link.href = url
      link.download = currentDocument.name
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } else if (currentUrl) {
      const link = document.createElement('a')
      link.href = currentUrl
      link.download = currentDocument.name
      link.target = '_blank'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  const handlePrint = async () => {
    if (!currentUrl || !currentDocument) return

    const fileType = getFileType(currentDocument.name)
    
    // Convert images to PDF before printing
    if (fileType === 'image') {
      try {
        const pdfBlob = await convertImageToPDF(currentUrl)
        const pdfUrl = URL.createObjectURL(pdfBlob)
        const printWindow = window.open(pdfUrl, '_blank')
        if (printWindow) {
          printWindow.onload = () => {
            printWindow.print()
            // Clean up after printing
            setTimeout(() => URL.revokeObjectURL(pdfUrl), 1000)
          }
        }
      } catch (error) {
        console.error('Error converting image to PDF for printing:', error)
        // Fallback to regular print
        const printWindow = window.open(currentUrl, '_blank')
        if (printWindow) {
          printWindow.onload = () => {
            printWindow.print()
          }
        }
      }
    } else if (fileType === 'pdf') {
      const printWindow = window.open(currentUrl, '_blank')
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print()
        }
      }
    } else {
      // For DOC/DOCX, show message that conversion is needed
      showToast(
        'Please download the document and convert it to PDF using a document converter, or contact support for assistance.',
        'info'
      )
    }
  }

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return ''
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const getFileType = (name: string) => {
    const extension = name.split('.').pop()?.toLowerCase()
    if (['pdf'].includes(extension || '')) return 'pdf'
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension || '')) return 'image'
    if (['doc', 'docx'].includes(extension || '')) return 'document'
    return 'other'
  }

  const canMoveCurrent =
    Boolean(onMoveDocument && moveTargets?.length && currentDocument) &&
    !lockedDocIds.includes(currentDocument.id) &&
    !moveDisabled
  const canUnassignCurrent =
    Boolean(onUnassignDocument && currentDocument) &&
    !lockedDocIds.includes(currentDocument.id)
  const canDeleteCurrent =
    Boolean(onDeleteDocument && currentDocument) &&
    !lockedDocIds.includes(currentDocument.id)

  if (!isOpen && !isPane) return null

  const fileType = currentDocument ? getFileType(currentDocument.name) : 'other'
  const canPrint = Boolean(currentUrl) && (fileType === 'pdf' || fileType === 'image')
  const multiple = documents.length > 1
  const sizeLabel = formatFileSize(currentDocument?.size)

  const panel = (
    <div
      className={`dv-panel${isPane ? ' is-pane' : ''}`}
      role={isPane ? undefined : 'dialog'}
      aria-modal={isPane ? undefined : true}
      aria-label={title}
      onClick={(e) => e.stopPropagation()}
    >
      <DocumentDownloadOverlay
        open={isDownloading}
        progress={downloadProgress}
        title={downloadLabel || 'Downloading document'}
        fileName={downloadFileName}
        subtitle="Fetching the file so you can review it…"
        variant="absolute"
      />

      <header className="dv-header">
        <div className="dv-header__titles">
          <h3 className="dv-title">{title}</h3>
          {invoiceNumber ? <p className="dv-subtitle">Invoice #{invoiceNumber}</p> : null}
        </div>
        <div className="dv-header__end">
          <span className="dv-count tabular-nums">
            {documents.length === 0 ? '0 of 0' : `${currentIndex + 1} of ${documents.length}`}
          </span>
          {!isPane && (
            <button type="button" className="dv-icon-btn" onClick={onClose} aria-label="Close">
              <X size={18} strokeWidth={2.25} />
            </button>
          )}
        </div>
      </header>

      {multiple && (
        <nav className="dv-tabs" aria-label="Documents">
          <button
            type="button"
            className="dv-icon-btn"
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            aria-label="Previous document"
          >
            <ChevronLeft size={18} strokeWidth={2.25} />
          </button>
          <div className="dv-tabs__list" role="tablist">
            {documents.map((doc, idx) => (
              <button
                key={doc.id}
                type="button"
                role="tab"
                aria-selected={idx === currentIndex}
                className={`dv-tab${idx === currentIndex ? ' is-active' : ''}`}
                onClick={() => setCurrentIndex(idx)}
                title={doc.name}
              >
                <FileText size={13} strokeWidth={2.25} aria-hidden />
                <span>{doc.name.length > 24 ? `${doc.name.slice(0, 24)}…` : doc.name}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="dv-icon-btn"
            onClick={handleNext}
            disabled={currentIndex === documents.length - 1}
            aria-label="Next document"
          >
            <ChevronRight size={18} strokeWidth={2.25} />
          </button>
        </nav>
      )}

      <div className="dv-stage">
        {currentDocument && currentUrl ? (
          fileType === 'pdf' ? (
            <iframe
              src={currentUrl.startsWith('blob:') ? `${currentUrl}#navpanes=0&view=FitH` : currentUrl}
              className="dv-frame" title={currentDocument.name}
            />
          ) : fileType === 'image' ? (
            <div className="dv-image-wrap">
              <img src={currentUrl} alt={currentDocument.name} className="dv-image" />
              <p className="dv-note">Images are converted to PDF when downloading or printing.</p>
            </div>
          ) : (
            <div className="dv-empty">
              <FileText size={40} strokeWidth={1.5} aria-hidden />
              <p className="dv-empty__title">{currentDocument.name}</p>
              {sizeLabel ? <p className="dv-empty__sub">{sizeLabel}</p> : null}
              <p className="dv-empty__sub">
                {fileType === 'document'
                  ? 'Word documents can’t be previewed here. Download the file to open it.'
                  : 'Preview isn’t available for this file type. Download to view.'}
              </p>
            </div>
          )
        ) : (
          <div className="dv-empty">
            {loading ? (
              <span className="dv-spinner" aria-hidden />
            ) : (
              <FileText size={40} strokeWidth={1.5} aria-hidden />
            )}
            <p className="dv-empty__title">{currentDocument?.name || 'No documents'}</p>
            <p className="dv-empty__sub">
              {loading ? 'Loading document…' : 'This document isn’t available to preview.'}
            </p>
          </div>
        )}
      </div>

      <footer className="dv-footer">
        <div className="dv-file">
          <FileText size={16} strokeWidth={2} aria-hidden />
          <div className="dv-file__text">
            <p className="dv-file__name">{currentDocument?.name}</p>
            {sizeLabel ? <p className="dv-file__size">{sizeLabel}</p> : null}
          </div>
        </div>
        <div className="dv-actions">
          {canUnassignCurrent && (
            <button
              type="button"
              className="dv-btn"
              onClick={() => currentDocument && onUnassignDocument?.(currentDocument.id)}
            >
              Unassign
            </button>
          )}
          {canDeleteCurrent && (
            <button
              type="button"
              className="dv-btn is-danger"
              onClick={() => {
                if (!currentDocument) return
                if (window.confirm(`Delete ${currentDocument.name}? This cannot be undone.`)) {
                  onDeleteDocument?.(currentDocument.id)
                }
              }}
            >
              Delete
            </button>
          )}
          {canMoveCurrent && (
            <label className="dv-move">
              <span>Move to</span>
              <select
                className="doc-viewer-move-select"
                defaultValue=""
                onChange={(e) => {
                  const value = e.target.value
                  if (!value || !currentDocument) return
                  onMoveDocument?.(currentDocument.id, value === '__unmatched__' ? null : value)
                  e.target.value = ''
                }}
              >
                <option value="">Select…</option>
                {moveTargets?.map((target) => (
                  <option
                    key={target.draftId ?? '__unmatched__'}
                    value={target.draftId ?? '__unmatched__'}
                  >
                    {target.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            className="dv-btn"
            onClick={handleDownload}
            disabled={!currentDocument || (!currentDocument.file && !currentUrl)}
          >
            <Download size={15} strokeWidth={2.25} aria-hidden />
            Download
          </button>
          {onUpload && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                className="dv-file-input"
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? [])
                  e.target.value = ''
                  if (files.length === 0) return
                  setUploading(true)
                  try {
                    await onUpload(files)
                  } finally {
                    setUploading(false)
                  }
                }}
              />
              <button
                type="button"
                className="dv-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload size={15} strokeWidth={2.25} aria-hidden />
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
            </>
          )}
          <button type="button" className="dv-btn" onClick={handlePrint} disabled={!canPrint}>
            <Printer size={15} strokeWidth={2.25} aria-hidden />
            Print
          </button>
          {!isPane && (
            <button type="button" className="dv-btn is-primary" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </footer>
    </div>
  )

  if (isPane) return <div className="dv-pane-shell">{panel}</div>

  return (
    <div className="dv-overlay" role="presentation" onClick={onClose}>
      {panel}
    </div>
  )
}
