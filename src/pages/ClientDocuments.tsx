import { useMemo, useRef, useState } from 'react'
import {
  Upload,
  Search,
  Eye,
  Trash2,
  FileText,
  FolderOpen,
  Plus,
  X,
  AlertCircle,
  Calendar,
} from 'lucide-react'
import ClientLayout from '../components/ClientLayout'
import DocumentViewer from '../components/DocumentViewer'
import { mockClientDashboardData } from '../data/mockClientDashboard'
import {
  addClientDocument,
  getClientDocumentFile,
  getClientDocuments,
  removeClientDocument,
  updateClientDocument,
} from '../services/clientDocumentService'
import { ClientDocument, ClientDocumentCategory } from '../types/clientDocument'
import { formatDate } from '../utils/format'
import { clientTheme as c } from '../theme/clientTheme'

type VaultTab = 'library' | 'upload'
type CategoryFilter = 'all' | ClientDocumentCategory

interface PendingUpload {
  id: string
  file: File
}

function isReminderDueSoon(expiresAt?: string): boolean {
  if (!expiresAt) return false
  const daysUntil = (new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  return daysUntil <= 45
}

function isReminderPast(expiresAt?: string): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt).getTime() < Date.now()
}

export default function ClientDocuments() {
  const [data] = useState(mockClientDashboardData)
  const [activeTab, setActiveTab] = useState<VaultTab>('library')
  const [refreshKey, setRefreshKey] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [viewingDoc, setViewingDoc] = useState<ClientDocument | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [reminderEditId, setReminderEditId] = useState<string | null>(null)
  const [reminderEditValue, setReminderEditValue] = useState('')

  const [uploadCategory, setUploadCategory] = useState<ClientDocumentCategory>('broker')
  const [uploadName, setUploadName] = useState('')
  const [uploadReminder, setUploadReminder] = useState('')
  const [pendingFiles, setPendingFiles] = useState<PendingUpload[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const documents = useMemo(
    () => getClientDocuments(data.client_id),
    [data.client_id, refreshKey]
  )

  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      const matchesSearch = doc.name.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesCategory = categoryFilter === 'all' || doc.category === categoryFilter
      return matchesSearch && matchesCategory
    })
  }, [documents, searchTerm, categoryFilter])

  const counts = useMemo(
    () => ({
      all: documents.length,
      broker: documents.filter((d) => d.category === 'broker').length,
      compliance: documents.filter((d) => d.category === 'compliance').length,
      other: documents.filter((d) => d.category === 'other').length,
    }),
    [documents]
  )

  const addPendingFiles = (files: FileList | File[]) => {
    const next = Array.from(files).map((file) => ({
      id: `pending-${Date.now()}-${Math.random()}`,
      file,
    }))
    setPendingFiles((prev) => [...prev, ...next])
    if (!uploadName.trim() && next.length === 1) {
      setUploadName(next[0].file.name.replace(/\.[^.]+$/, ''))
    }
    setUploadError(null)
  }

  const handleSaveUploads = async () => {
    if (pendingFiles.length === 0) {
      setUploadError('Add at least one file.')
      return
    }

    setIsUploading(true)
    setUploadError(null)

    try {
      pendingFiles.forEach((pending, index) => {
        const name =
          uploadName.trim() ||
          pending.file.name.replace(/\.[^.]+$/, '') ||
          pending.file.name

        addClientDocument(data.client_id, {
          name: pendingFiles.length === 1 ? name : `${name} ${index + 1}`,
          file: pending.file,
          category: uploadCategory,
          document_type: 'general',
          expires_at: uploadReminder || undefined,
          uploaded_by: data.client_name,
        })
      })

      setPendingFiles([])
      setUploadName('')
      setUploadReminder('')
      setRefreshKey((k) => k + 1)
      setActiveTab('library')
    } catch (error) {
      console.error('Upload failed:', error)
      setUploadError('Could not save. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }

  const handleDelete = (documentId: string) => {
    removeClientDocument(documentId)
    setDeleteConfirmId(null)
    setRefreshKey((k) => k + 1)
  }

  const openReminderEdit = (doc: ClientDocument) => {
    setReminderEditId(doc.id)
    setReminderEditValue(doc.expires_at ? doc.expires_at.split('T')[0] : '')
  }

  const saveReminderEdit = () => {
    if (!reminderEditId) return
    updateClientDocument(reminderEditId, {
      expires_at: reminderEditValue || undefined,
    })
    setReminderEditId(null)
    setReminderEditValue('')
    setRefreshKey((k) => k + 1)
  }

  const viewerDocuments = viewingDoc
    ? [
        {
          id: viewingDoc.id,
          name: viewingDoc.file_name,
          file: getClientDocumentFile(viewingDoc.id),
          type: viewingDoc.mime_type,
          size: viewingDoc.size,
        },
      ]
    : []

  return (
    <ClientLayout clientName={data.client_name} clientId={data.client_id}>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-xl font-bold" style={{ color: c.primary }}>
            Document Vault
          </h1>
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className="dashboard-btn-primary shrink-0"
          >
            <Plus className="w-4 h-4" />
            Upload
          </button>
        </div>

        <div className="page-tabs">
          <button
            type="button"
            onClick={() => setActiveTab('library')}
            className={`page-tab ${activeTab === 'library' ? 'page-tab--active' : ''}`}
          >
            My documents ({documents.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`page-tab ${activeTab === 'upload' ? 'page-tab--active' : ''}`}
          >
            Upload
          </button>
        </div>

        {activeTab === 'library' && (
          <div className="space-y-4">
            <div className="dashboard-card p-4">
              <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="doc-vault-search-wrap flex-1 min-w-0">
                  <Search className="doc-vault-search-icon w-4 h-4" style={{ color: c.secondary }} />
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="client-input doc-vault-search-input w-full"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { key: 'all' as const, label: 'All' },
                      { key: 'broker' as const, label: 'Broker' },
                      { key: 'compliance' as const, label: 'Compliance' },
                      { key: 'other' as const, label: 'Other' },
                    ] as const
                  ).map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setCategoryFilter(key)}
                      className={`doc-vault-filter ${categoryFilter === key ? 'doc-vault-filter--active' : ''}`}
                    >
                      {label}
                      <span className="doc-vault-filter-count">{counts[key]}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {filteredDocuments.length === 0 ? (
              <div className="dashboard-card doc-vault-empty">
                <FolderOpen className="w-10 h-10 mb-3" style={{ color: c.mutedLight }} />
                <p className="text-sm font-medium" style={{ color: c.primary }}>
                  {documents.length === 0 ? 'No documents yet' : 'No matches'}
                </p>
                {documents.length === 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('upload')}
                    className="dashboard-btn-primary mt-4"
                  >
                    <Upload className="w-4 h-4" />
                    Upload
                  </button>
                )}
              </div>
            ) : (
              <div className="doc-vault-list">
                {filteredDocuments.map((doc) => {
                  const past = isReminderPast(doc.expires_at)
                  const soon = isReminderDueSoon(doc.expires_at)

                  return (
                    <div key={doc.id} className="doc-vault-row">
                      <FileText className="w-4 h-4 shrink-0 mt-0.5" style={{ color: c.secondary }} />
                      <div className="doc-vault-row-body min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: c.primary }}>
                          {doc.name}
                        </p>
                        {reminderEditId === doc.id ? (
                          <div className="flex items-center gap-2 mt-1.5">
                            <input
                              type="date"
                              value={reminderEditValue}
                              onChange={(e) => setReminderEditValue(e.target.value)}
                              className="client-input text-xs py-1"
                            />
                            <button
                              type="button"
                              onClick={saveReminderEdit}
                              className="text-xs font-medium"
                              style={{ color: c.info }}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setReminderEditId(null)}
                              className="text-xs"
                              style={{ color: c.secondary }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : doc.expires_at ? (
                          <button
                            type="button"
                            onClick={() => openReminderEdit(doc)}
                            className={`doc-vault-reminder ${past ? 'doc-vault-reminder--past' : soon ? 'doc-vault-reminder--soon' : ''}`}
                          >
                            Reminder {formatDate(doc.expires_at)}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openReminderEdit(doc)}
                            className="doc-vault-reminder doc-vault-reminder--unset"
                          >
                            Set reminder
                          </button>
                        )}
                      </div>
                      <div className="doc-vault-row-actions">
                        <button
                          type="button"
                          onClick={() => openReminderEdit(doc)}
                          className="doc-vault-action-btn"
                          title="Reminder date"
                        >
                          <Calendar className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewingDoc(doc)}
                          className="doc-vault-action-btn"
                          title="View"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(doc.id)}
                          className="doc-vault-action-btn doc-vault-action-btn--danger"
                          title="Remove"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'upload' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="dashboard-card p-5 space-y-4">
              <div>
                <label className="client-label">Name</label>
                <input
                  type="text"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  placeholder="Document name"
                  className="client-input w-full"
                />
              </div>

              <div>
                <label className="client-label">Reminder date (optional)</label>
                <input
                  type="date"
                  value={uploadReminder}
                  onChange={(e) => setUploadReminder(e.target.value)}
                  className="client-input w-full"
                />
              </div>

              <div>
                <label className="client-label">Folder</label>
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value as ClientDocumentCategory)}
                  className="client-input w-full"
                >
                  <option value="broker">Broker</option>
                  <option value="compliance">Compliance</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="dashboard-card p-5 flex flex-col">
              <label className="client-label">File</label>
              <div
                className="doc-vault-dropzone flex-1"
                onDragOver={(e) => {
                  e.preventDefault()
                  e.currentTarget.classList.add('doc-vault-dropzone--active')
                }}
                onDragLeave={(e) => {
                  e.preventDefault()
                  e.currentTarget.classList.remove('doc-vault-dropzone--active')
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.currentTarget.classList.remove('doc-vault-dropzone--active')
                  if (e.dataTransfer.files.length > 0) {
                    addPendingFiles(e.dataTransfer.files)
                  }
                }}
              >
                <Upload className="w-8 h-8 mb-2" style={{ color: c.secondary }} />
                <p className="text-sm" style={{ color: c.secondary }}>
                  Drop files or{' '}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="font-medium underline-offset-2 hover:underline"
                    style={{ color: c.info }}
                  >
                    browse
                  </button>
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
                  onChange={(e) => {
                    if (e.target.files?.length) {
                      addPendingFiles(e.target.files)
                      e.target.value = ''
                    }
                  }}
                />
              </div>

              {pendingFiles.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {pendingFiles.map((pending) => (
                    <li key={pending.id} className="doc-vault-pending-item">
                      <span className="text-sm truncate flex-1" style={{ color: c.primary }}>
                        {pending.file.name}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setPendingFiles((prev) => prev.filter((p) => p.id !== pending.id))
                        }
                        className="p-1 rounded hover:bg-slate-100 shrink-0"
                        style={{ color: c.secondary }}
                        aria-label="Remove file"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {uploadError && (
                <div className="flex items-center gap-2 mt-3 text-sm" style={{ color: '#DC2626' }}>
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {uploadError}
                </div>
              )}

              <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setPendingFiles([])
                    setUploadError(null)
                    setActiveTab('library')
                  }}
                  className="dashboard-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveUploads}
                  disabled={pendingFiles.length === 0 || isUploading}
                  className="dashboard-btn-primary"
                >
                  {isUploading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {viewingDoc && (
        <DocumentViewer
          isOpen={!!viewingDoc}
          onClose={() => setViewingDoc(null)}
          documents={viewerDocuments}
          title={viewingDoc.name}
        />
      )}

      {deleteConfirmId && (
        <div
          className="invoice-dispute-modal-overlay"
          onClick={() => setDeleteConfirmId(null)}
          role="presentation"
        >
          <div
            className="invoice-dispute-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="delete-doc-title"
          >
            <div className="invoice-dispute-modal-header">
              <h3 id="delete-doc-title" className="text-base font-semibold" style={{ color: c.primary }}>
                Remove document?
              </h3>
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100"
                style={{ color: c.secondary }}
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="invoice-dispute-modal-footer">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="dashboard-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteConfirmId)}
                className="dashboard-btn-primary"
                style={{ backgroundColor: '#DC2626' }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </ClientLayout>
  )
}
