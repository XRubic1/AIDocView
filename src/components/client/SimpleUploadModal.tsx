import { useState, useRef, DragEvent } from 'react'
import { Upload, X, FileText, CheckCircle, Loader } from 'lucide-react'
import { useToast } from '../ui/ToastProvider'

interface UploadedFile {
  id: string
  file: File
  name: string
  size: number
  type: string
}

interface SimpleUploadModalProps {
  isOpen: boolean
  onClose: () => void
  onUploadComplete: (files: File[]) => void
  clientId: string
  clientName: string
}

export default function SimpleUploadModal({
  isOpen,
  onClose,
  onUploadComplete,
  clientId: _clientId,
  clientName: _clientName,
}: SimpleUploadModalProps) {
  const { showToast } = useToast()
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    addFiles(files)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files)
      addFiles(files)
    }
  }

  const addFiles = (files: File[]) => {
    const newFiles: UploadedFile[] = files.map((file) => ({
      id: `file-${Date.now()}-${Math.random()}`,
      file,
      name: file.name,
      size: file.size,
      type: file.type,
    }))

    setUploadedFiles((prev) => [...prev, ...newFiles])
  }

  const removeFile = (id: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  const handleSubmit = async () => {
    if (uploadedFiles.length === 0) {
      showToast('Please upload at least one document', 'error')
      return
    }

    setIsUploading(true)

    // Simulate upload process
    await new Promise((resolve) => setTimeout(resolve, 1500))

    // Call the completion handler with the files
    onUploadComplete(uploadedFiles.map((f) => f.file))

    // Reset and close
    setUploadedFiles([])
    setIsUploading(false)
    onClose()
  }

  const handleClose = () => {
    if (!isUploading) {
      setUploadedFiles([])
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ borderColor: '#e2e8f0' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: '#e2e8f0' }}>
          <div>
            <h2 className="text-2xl font-bold" style={{ color: '#113543' }}>
              Upload Documents
            </h2>
            <p className="text-sm mt-1" style={{ color: '#64748b' }}>
              Drag and drop your POD, BOL, and rate confirmations. We'll handle the rest.
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={isUploading}
            className="p-2 transition-colors disabled:opacity-50"
            style={{ color: '#64748b' }}
            onMouseEnter={(e) => {
              if (!isUploading) e.currentTarget.style.color = '#113543'
            }}
            onMouseLeave={(e) => {
              if (!isUploading) e.currentTarget.style.color = '#64748b'
            }}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Upload Area */}
        <div className="p-6">
          <div
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-all ${
              isDragging ? 'border-opacity-100' : 'border-opacity-50'
            }`}
            style={{
              borderColor: isDragging ? '#0891b2' : '#64748b',
              backgroundColor: isDragging ? '#FEF9E7' : '#F9FAFB',
            }}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <Upload
              className="w-16 h-16 mx-auto mb-4"
              style={{ color: isDragging ? '#0891b2' : '#64748b' }}
            />
            <h3 className="text-lg font-semibold mb-2" style={{ color: '#113543' }}>
              {isDragging ? 'Drop files here' : 'Drag and drop files here'}
            </h3>
            <p className="text-sm mb-4" style={{ color: '#64748b' }}>
              or click to browse
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="px-6 py-2 text-sm font-medium text-white rounded transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#113543' }}
              onMouseEnter={(e) => {
                if (!isUploading) e.currentTarget.style.backgroundColor = '#0a2529'
              }}
              onMouseLeave={(e) => {
                if (!isUploading) e.currentTarget.style.backgroundColor = '#113543'
              }}
            >
              Select Files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            />
            <p className="text-xs mt-4" style={{ color: '#64748b' }}>
              Supported: PDF, Images (JPG, PNG), Word Documents
            </p>
          </div>

          {/* Uploaded Files List */}
          {uploadedFiles.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-semibold mb-3" style={{ color: '#113543' }}>
                Uploaded Files ({uploadedFiles.length})
              </h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {uploadedFiles.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-3 border rounded"
                    style={{ borderColor: '#e2e8f0', backgroundColor: '#FFFFFF' }}
                  >
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      <FileText className="w-5 h-5 flex-shrink-0" style={{ color: '#0891b2' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: '#113543' }}>
                          {file.name}
                        </p>
                        <p className="text-xs" style={{ color: '#64748b' }}>
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => removeFile(file.id)}
                      disabled={isUploading}
                      className="p-1 transition-colors disabled:opacity-50"
                      style={{ color: '#64748b' }}
                      onMouseEnter={(e) => {
                        if (!isUploading) e.currentTarget.style.color = '#dc2626'
                      }}
                      onMouseLeave={(e) => {
                        if (!isUploading) e.currentTarget.style.color = '#64748b'
                      }}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Info Box */}
          <div className="mt-6 p-4 rounded-lg" style={{ backgroundColor: '#F0F9FF', borderColor: '#0891b2' }}>
            <div className="flex items-start space-x-3">
              <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#0891b2' }} />
              <div>
                <p className="text-sm font-medium mb-1" style={{ color: '#113543' }}>
                  What happens next?
                </p>
                <p className="text-xs" style={{ color: '#64748b' }}>
                  Our team will review your documents, create invoices automatically, and send them to your brokers. 
                  You'll be notified once everything is processed.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-4 p-6 border-t" style={{ borderColor: '#e2e8f0' }}>
          <button
            onClick={handleClose}
            disabled={isUploading}
            className="px-6 py-2 text-sm font-medium rounded transition-colors disabled:opacity-50"
            style={{ color: '#64748b', border: '1px solid #e2e8f0' }}
            onMouseEnter={(e) => {
              if (!isUploading) e.currentTarget.style.backgroundColor = '#F5F5F5'
            }}
            onMouseLeave={(e) => {
              if (!isUploading) e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={uploadedFiles.length === 0 || isUploading}
            className="flex items-center space-x-2 px-6 py-2 text-sm font-medium text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#113543' }}
            onMouseEnter={(e) => {
              if (!isUploading && uploadedFiles.length > 0) {
                e.currentTarget.style.backgroundColor = '#0a2529'
              }
            }}
            onMouseLeave={(e) => {
              if (!isUploading && uploadedFiles.length > 0) {
                e.currentTarget.style.backgroundColor = '#113543'
              }
            }}
          >
            {isUploading ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                <span>Uploading...</span>
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                <span>Upload {uploadedFiles.length > 0 && `(${uploadedFiles.length})`}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}



