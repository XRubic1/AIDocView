import { useState, useEffect } from 'react'
import { X, ChevronLeft, ChevronRight, Download, Printer, FileText } from 'lucide-react'
import jsPDF from 'jspdf'

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
}: DocumentViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [documentUrls, setDocumentUrls] = useState<string[]>([])

  // Generate URLs for documents
  useEffect(() => {
    if (!isOpen || documents.length === 0) return

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
    setCurrentIndex(0)

    // Cleanup URLs on unmount
    return () => {
      urls.forEach((url) => {
        if (url && url.startsWith('blob:')) {
          URL.revokeObjectURL(url)
        }
      })
    }
  }, [isOpen, documents])

  useEffect(() => {
    if (currentIndex >= documents.length) {
      setCurrentIndex(Math.max(0, documents.length - 1))
    }
  }, [documents.length, currentIndex])

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
      alert('Please download the document and convert it to PDF using a document converter, or contact support for assistance.')
    }
  }

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size'
    if (bytes === 0) return '0 Bytes'
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

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div
        className="bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[95vh] overflow-hidden flex flex-col"
        style={{ backgroundColor: '#FFFFFF' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-6 border-b"
          style={{ borderColor: '#819291' }}
        >
          <div className="flex-1">
            <h3 className="text-lg font-semibold" style={{ color: '#113543' }}>
              {title}
            </h3>
            {invoiceNumber && (
              <p className="text-sm mt-1" style={{ color: '#819291' }}>
                Invoice #{invoiceNumber}
              </p>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-sm" style={{ color: '#819291' }}>
              {currentIndex + 1} of {documents.length}
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded transition-colors"
              style={{ color: '#113543' }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Document Navigation */}
        {documents.length > 1 && (
          <div
            className="flex items-center justify-between p-4 border-b bg-gray-50"
            style={{ borderColor: '#819291', backgroundColor: '#f8f9fa' }}
          >
            <button
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              className="flex items-center space-x-2 px-4 py-2 text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                color: currentIndex === 0 ? '#819291' : '#113543',
                border: '1px solid #819291',
              }}
              onMouseEnter={(e) => {
                if (currentIndex > 0) {
                  e.currentTarget.style.backgroundColor = '#f8f9fa'
                  e.currentTarget.style.borderColor = '#C2A558'
                }
              }}
              onMouseLeave={(e) => {
                if (currentIndex > 0) {
                  e.currentTarget.style.backgroundColor = '#FFFFFF'
                  e.currentTarget.style.borderColor = '#819291'
                }
              }}
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>

            <div className="flex items-center space-x-2 flex-1 justify-center">
              {documents.map((doc, idx) => (
                <button
                  key={doc.id}
                  onClick={() => setCurrentIndex(idx)}
                  className="px-3 py-1 text-xs font-medium rounded transition-colors"
                  style={{
                    backgroundColor: idx === currentIndex ? '#113543' : '#FFFFFF',
                    color: idx === currentIndex ? '#FFFFFF' : '#113543',
                    border: '1px solid #819291',
                  }}
                  onMouseEnter={(e) => {
                    if (idx !== currentIndex) {
                      e.currentTarget.style.backgroundColor = '#f8f9fa'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (idx !== currentIndex) {
                      e.currentTarget.style.backgroundColor = '#FFFFFF'
                    }
                  }}
                >
                  <FileText className="w-3 h-3 inline mr-1" />
                  {doc.name.length > 20 ? doc.name.substring(0, 20) + '...' : doc.name}
                </button>
              ))}
            </div>

            <button
              onClick={handleNext}
              disabled={currentIndex === documents.length - 1}
              className="flex items-center space-x-2 px-4 py-2 text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                color: currentIndex === documents.length - 1 ? '#819291' : '#113543',
                border: '1px solid #819291',
              }}
              onMouseEnter={(e) => {
                if (currentIndex < documents.length - 1) {
                  e.currentTarget.style.backgroundColor = '#f8f9fa'
                  e.currentTarget.style.borderColor = '#C2A558'
                }
              }}
              onMouseLeave={(e) => {
                if (currentIndex < documents.length - 1) {
                  e.currentTarget.style.backgroundColor = '#FFFFFF'
                  e.currentTarget.style.borderColor = '#819291'
                }
              }}
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Document Viewer */}
        <div className="flex-1 overflow-auto p-6" style={{ backgroundColor: '#f8f9fa' }}>
          {currentDocument && currentUrl ? (
            <div className="flex items-center justify-center h-full">
              {getFileType(currentDocument.name) === 'pdf' ? (
                <iframe
                  src={currentUrl}
                  className="w-full h-full min-h-[600px] border rounded"
                  style={{ borderColor: '#819291' }}
                  title={currentDocument.name}
                />
              ) : getFileType(currentDocument.name) === 'image' ? (
                <div className="flex flex-col items-center justify-center">
                  <div className="mb-4 p-3 rounded" style={{ backgroundColor: '#f0f0f0' }}>
                    <p className="text-xs" style={{ color: '#819291' }}>
                      Image will be converted to PDF when downloading or printing
                    </p>
                  </div>
                  <img
                    src={currentUrl}
                    alt={currentDocument.name}
                    className="max-w-full max-h-[60vh] object-contain rounded shadow-lg"
                  />
                </div>
              ) : getFileType(currentDocument.name) === 'document' ? (
                <div className="text-center p-8">
                  <FileText className="w-16 h-16 mx-auto mb-4" style={{ color: '#819291' }} />
                  <p className="text-lg font-medium mb-2" style={{ color: '#113543' }}>
                    {currentDocument.name}
                  </p>
                  <p className="text-sm mb-4" style={{ color: '#819291' }}>
                    {formatFileSize(currentDocument.size)}
                  </p>
                  <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-4">
                    <p className="text-sm font-medium mb-2" style={{ color: '#856404' }}>
                      DOC/DOCX Conversion Required
                    </p>
                    <p className="text-xs" style={{ color: '#856404' }}>
                      This document type requires server-side conversion to PDF. 
                      Please download the file and convert it using a document converter, 
                      or contact support for assistance.
                    </p>
                  </div>
                  <p className="text-sm" style={{ color: '#819291' }}>
                    Click Download to save the original file
                  </p>
                </div>
              ) : (
                <div className="text-center p-8">
                  <FileText className="w-16 h-16 mx-auto mb-4" style={{ color: '#819291' }} />
                  <p className="text-lg font-medium mb-2" style={{ color: '#113543' }}>
                    {currentDocument.name}
                  </p>
                  <p className="text-sm mb-4" style={{ color: '#819291' }}>
                    {formatFileSize(currentDocument.size)}
                  </p>
                  <p className="text-sm" style={{ color: '#819291' }}>
                    Preview not available for this file type. Please download to view.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <FileText className="w-16 h-16 mx-auto mb-4" style={{ color: '#819291' }} />
                <p className="text-lg font-medium mb-2" style={{ color: '#113543' }}>
                  {currentDocument?.name || 'No document'}
                </p>
                <p className="text-sm" style={{ color: '#819291' }}>
                  Document preview not available
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer with Actions */}
        <div
          className="flex items-center justify-between p-6 border-t"
          style={{ borderColor: '#819291' }}
        >
          <div className="flex items-center space-x-3">
            <FileText className="w-4 h-4" style={{ color: '#819291' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: '#113543' }}>
                {currentDocument?.name}
              </p>
              {currentDocument?.size && (
                <p className="text-xs" style={{ color: '#819291' }}>
                  {formatFileSize(currentDocument.size)}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {canMoveCurrent && (
              <label className="flex items-center gap-2">
                <span className="text-xs font-medium" style={{ color: '#64748b' }}>
                  Move to
                </span>
                <select
                  className="doc-viewer-move-select"
                  defaultValue=""
                  onChange={(e) => {
                    const value = e.target.value
                    if (!value || !currentDocument) return
                    onMoveDocument?.(
                      currentDocument.id,
                      value === '__unmatched__' ? null : value
                    )
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
              onClick={handleDownload}
              disabled={!currentDocument}
              className="flex items-center space-x-2 px-4 py-2 text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                color: '#113543',
                border: '1px solid #819291',
              }}
              onMouseEnter={(e) => {
                if (currentDocument) {
                  e.currentTarget.style.backgroundColor = '#f8f9fa'
                  e.currentTarget.style.borderColor = '#C2A558'
                }
              }}
              onMouseLeave={(e) => {
                if (currentDocument) {
                  e.currentTarget.style.backgroundColor = '#FFFFFF'
                  e.currentTarget.style.borderColor = '#819291'
                }
              }}
            >
              <Download className="w-4 h-4" />
              <span>Download</span>
            </button>
            <button
              onClick={handlePrint}
              disabled={!currentUrl || (getFileType(currentDocument?.name || '') !== 'pdf' && getFileType(currentDocument?.name || '') !== 'image')}
              className="flex items-center space-x-2 px-4 py-2 text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                color: '#113543',
                border: '1px solid #819291',
              }}
              onMouseEnter={(e) => {
                if (currentUrl && (getFileType(currentDocument?.name || '') === 'pdf' || getFileType(currentDocument?.name || '') === 'image')) {
                  e.currentTarget.style.backgroundColor = '#f8f9fa'
                  e.currentTarget.style.borderColor = '#C2A558'
                }
              }}
              onMouseLeave={(e) => {
                if (currentUrl && (getFileType(currentDocument?.name || '') === 'pdf' || getFileType(currentDocument?.name || '') === 'image')) {
                  e.currentTarget.style.backgroundColor = '#FFFFFF'
                  e.currentTarget.style.borderColor = '#819291'
                }
              }}
            >
              <Printer className="w-4 h-4" />
              <span>Print</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium transition-colors"
              style={{
                backgroundColor: '#113543',
                color: '#FFFFFF',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#0d2a35'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#113543'
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

