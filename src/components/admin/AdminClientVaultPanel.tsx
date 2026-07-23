import { useMemo, useRef, useState } from 'react'
import {
  Check,
  Eye,
  FileText,
  Loader2,
  Shield,
  Upload,
  X,
} from 'lucide-react'
import DocumentViewer from '../DocumentViewer'
import {
  addClientDocument,
  approveClientDocument,
  CLIENT_DOCUMENT_TYPE_OPTIONS,
  getClientDocumentFile,
  getClientDocumentTypeLabel,
  getClientDocuments,
  rejectClientDocument,
} from '../../services/clientDocumentService'
import type { Client } from '../../types/client'
import type { ClientDocument, ClientDocumentCategory } from '../../types/clientDocument'
import { formatDate, formatFileSize } from '../../utils/format'
import {
  getSetupChecklist,
  isClientSetupComplete,
} from '../../utils/clientSetupDocuments'
import { useToast } from '../ui/ToastProvider'

interface AdminClientVaultPanelProps {
  client: Client
  adminName: string
  onChanged?: () => void
}

const CATEGORY_LABELS: Record<ClientDocumentCategory, string> = {
  broker: 'Broker',
  compliance: 'Compliance',
  other: 'Other',
}

/** Admin vault review: checklist, approve/reject pending, upload on behalf (auto-approved). */
export default function AdminClientVaultPanel({
  client,
  adminName,
  onChanged,
}: AdminClientVaultPanelProps) {
  const { showToast } = useToast()
  const [refreshKey, setRefreshKey] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [viewingDoc, setViewingDoc] = useState<ClientDocument | null>(null)
  const [viewingFile, setViewingFile] = useState<File | undefined>(undefined)

  const [showUpload, setShowUpload] = useState(false)
  const [uploadCategory, setUploadCategory] = useState<ClientDocumentCategory>('compliance')
  const [uploadDocumentType, setUploadDocumentType] = useState(
    CLIENT_DOCUMENT_TYPE_OPTIONS.compliance[0].value
  )
  const [uploadName, setUploadName] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const documents = useMemo(
    () => getClientDocuments(client.id),
    [client.id, refreshKey]
  )

  const checklist = useMemo(
    () => getSetupChecklist(client.id, client),
    [client, refreshKey]
  )

  const setupComplete = useMemo(
    () => isClientSetupComplete(client.id, client),
    [client, refreshKey]
  )

  const pendingDocs = useMemo(
    () => documents.filter((d) => d.approval_status === 'pending'),
    [documents]
  )

  const bump = () => {
    setRefreshKey((k) => k + 1)
    onChanged?.()
  }

  const openViewer = async (doc: ClientDocument) => {
    setViewingDoc(doc)
    const file = await getClientDocumentFile(doc.id)
    setViewingFile(file)
  }

  const handleApprove = async (docId: string) => {
    setBusyId(docId)
    try {
      await approveClientDocument(docId, adminName)
      showToast('Document approved', 'success')
      bump()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Approve failed', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const handleReject = async () => {
    if (!rejectId) return
    setBusyId(rejectId)
    try {
      await rejectClientDocument(rejectId, adminName, rejectReason)
      showToast('Document rejected', 'success')
      setRejectId(null)
      setRejectReason('')
      bump()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Reject failed', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const handleCategoryChange = (category: ClientDocumentCategory) => {
    setUploadCategory(category)
    const first = CLIENT_DOCUMENT_TYPE_OPTIONS[category][0]?.value
    if (first) setUploadDocumentType(first)
  }

  const handleAdminUpload = async () => {
    if (!uploadFile) {
      showToast('Choose a file', 'error')
      return
    }
    setIsUploading(true)
    try {
      await addClientDocument(client.id, {
        name: uploadName.trim() || uploadFile.name.replace(/\.[^.]+$/, ''),
        file: uploadFile,
        category: uploadCategory,
        document_type: uploadDocumentType,
        uploaded_by: adminName,
        uploaded_by_role: 'admin',
      })
      showToast('Document uploaded (approved)', 'success')
      setShowUpload(false)
      setUploadFile(null)
      setUploadName('')
      bump()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Upload failed', 'error')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div
        className={`rounded-lg border px-3 py-2.5 ${
          setupComplete
            ? 'border-emerald-200 bg-emerald-50'
            : 'border-amber-200 bg-amber-50'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            <Shield
              className={`w-4 h-4 mt-0.5 shrink-0 ${
                setupComplete ? 'text-emerald-700' : 'text-amber-700'
              }`}
            />
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {setupComplete ? 'Setup complete' : 'Setup incomplete'}
              </p>
              <p className="text-xs text-slate-600 mt-0.5">
                {setupComplete
                  ? 'Required vault docs are approved — client can send invoices.'
                  : 'Client cannot send invoices until required docs are approved.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="dashboard-btn-primary dashboard-btn-compact shrink-0"
            onClick={() => setShowUpload(true)}
          >
            <Upload className="w-3.5 h-3.5" />
            Upload
          </button>
        </div>

        <ul className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {checklist.map((item) => (
            <li
              key={item.key}
              className="flex items-center justify-between gap-2 text-xs bg-white border border-slate-200 rounded px-2 py-1.5"
            >
              <span className="font-medium text-slate-800 truncate">{item.label}</span>
              <span
                className={`status-pill ${
                  item.status === 'approved'
                    ? 'status-pill--approved'
                    : item.status === 'pending'
                      ? 'status-pill--pending'
                      : 'status-pill--hold'
                }`}
              >
                {item.status === 'missing' ? 'Missing' : item.status}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {pendingDocs.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Pending approval ({pendingDocs.length})
          </h3>
          <ul className="space-y-2">
            {pendingDocs.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">{doc.name}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {getClientDocumentTypeLabel(doc.category, doc.document_type)} ·{' '}
                    {doc.file_name} · {formatDate(doc.uploaded_at)} · {doc.uploaded_by}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    className="p-1.5 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    title="View"
                    onClick={() => void openViewer(doc)}
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                    disabled={busyId === doc.id}
                    onClick={() => void handleApprove(doc.id)}
                  >
                    {busyId === doc.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    Approve
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border border-red-200 bg-white text-red-700 hover:bg-red-50 disabled:opacity-50"
                    disabled={busyId === doc.id}
                    onClick={() => {
                      setRejectId(doc.id)
                      setRejectReason('')
                    }}
                  >
                    <X className="w-3.5 h-3.5" />
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
          All vault documents ({documents.length})
        </h3>
        {documents.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-200 rounded-lg">
            No vault documents yet. Upload on behalf of the carrier or wait for client uploads.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="dashboard-table dashboard-table--compact w-full">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Size</th>
                  <th>Uploaded</th>
                  <th>By</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td className="font-medium text-slate-900 max-w-[160px] truncate">
                      {doc.name}
                    </td>
                    <td className="text-slate-600 text-xs">
                      <span className="block">{CATEGORY_LABELS[doc.category]}</span>
                      <span className="text-slate-500">
                        {getClientDocumentTypeLabel(doc.category, doc.document_type)}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`status-pill ${
                          doc.approval_status === 'approved'
                            ? 'status-pill--approved'
                            : doc.approval_status === 'pending'
                              ? 'status-pill--pending'
                              : 'status-pill--hold'
                        }`}
                        title={doc.rejection_reason}
                      >
                        {doc.approval_status}
                      </span>
                    </td>
                    <td className="tabular-nums text-slate-600">{formatFileSize(doc.size)}</td>
                    <td className="text-slate-600">{formatDate(doc.uploaded_at)}</td>
                    <td className="text-slate-600 text-xs">
                      {doc.uploaded_by}
                      <span className="block text-slate-400">{doc.uploaded_by_role}</span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="p-1.5 rounded text-slate-500 hover:bg-slate-100"
                        title="View"
                        onClick={() => void openViewer(doc)}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewingDoc && (
        <DocumentViewer
          isOpen={!!viewingDoc}
          onClose={() => {
            setViewingDoc(null)
            setViewingFile(undefined)
          }}
          documents={[
            {
              id: viewingDoc.id,
              name: viewingDoc.file_name,
              file: viewingFile,
              type: viewingDoc.mime_type,
              size: viewingDoc.size,
            },
          ]}
          title={viewingDoc.name}
        />
      )}

      {rejectId && (
        <div
          className="fixed inset-0 z-[60] bg-slate-900/40 flex items-center justify-center p-4"
          onClick={() => setRejectId(null)}
          role="presentation"
        >
          <div
            className="bg-white rounded-lg border border-slate-200 shadow-xl w-full max-w-md p-4"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <h3 className="text-sm font-semibold text-slate-900 mb-2">Reject document</h3>
            <textarea
              className="client-input w-full text-sm"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason (optional) — shown to the client"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                type="button"
                className="dashboard-btn-secondary"
                onClick={() => setRejectId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dashboard-btn-primary"
                style={{ backgroundColor: '#b91c1c' }}
                disabled={busyId === rejectId}
                onClick={() => void handleReject()}
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {showUpload && (
        <div
          className="fixed inset-0 z-[60] bg-slate-900/40 flex items-center justify-center p-4"
          onClick={() => !isUploading && setShowUpload(false)}
          role="presentation"
        >
          <div
            className="bg-white rounded-lg border border-slate-200 shadow-xl w-full max-w-md p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Upload for {client.name}
              </h3>
              <button
                type="button"
                className="p-1 rounded text-slate-500 hover:bg-slate-100"
                disabled={isUploading}
                onClick={() => setShowUpload(false)}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Admin uploads are auto-approved and count toward setup immediately.
            </p>
            <div>
              <label className="client-label">Name</label>
              <input
                type="text"
                className="client-input w-full"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder="Document name"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="client-label">Folder</label>
                <select
                  className="client-input w-full"
                  value={uploadCategory}
                  onChange={(e) =>
                    handleCategoryChange(e.target.value as ClientDocumentCategory)
                  }
                >
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="client-label">Type</label>
                <select
                  className="client-input w-full"
                  value={uploadDocumentType}
                  onChange={(e) => setUploadDocumentType(e.target.value)}
                >
                  {CLIENT_DOCUMENT_TYPE_OPTIONS[uploadCategory].map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="client-label">File</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                className="block w-full text-sm text-slate-600"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null
                  setUploadFile(file)
                  if (file && !uploadName.trim()) {
                    setUploadName(file.name.replace(/\.[^.]+$/, ''))
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                className="dashboard-btn-secondary"
                disabled={isUploading}
                onClick={() => setShowUpload(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dashboard-btn-primary"
                disabled={!uploadFile || isUploading}
                onClick={() => void handleAdminUpload()}
              >
                {isUploading ? 'Uploading…' : 'Upload & approve'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
