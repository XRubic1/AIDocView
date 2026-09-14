/**
 * Admin AI tab — DocSort / AI review visibility and manual Credyx actions.
 * AI is optional; every action here can be done by hand.
 */
import { useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  ExternalLink,
  FileWarning,
  Mail,
  RefreshCw,
} from 'lucide-react'
import { getAllBatches } from '../../data/mockBatches'
import { mockInvoices } from '../../data/mockInvoices'
import { useClientTheme } from '../../theme/ThemeContext'
import { useToast } from '../ui/ToastProvider'
import { useAuth } from '../../context/AuthContext'
import { getAdminUserDisplayName } from '../../config/adminNav'
import { sendPaperworkForBatch } from '../../utils/paperworkSender'
import { hasPpwBeenSent } from '../../utils/ppwSent'
import BatchAiReviewPanel, { InvoiceAiReviewBadge } from './BatchAiReviewPanel'
import AdminBatchesListView, { type AdminBatchListItem } from './AdminBatchesListView'
import { formatCurrency } from '../../utils/format'

interface AiBatchTabProps {
  batchId: string | null
  onBatchSelect: (batchId: string) => void
  onOpenReadyToPost: (batchId: string) => void
  onOpenVerification: (batchId: string) => void
  onMoveToVerification: (batchId: string) => void
  onBack: () => void
  refreshKey: number
  onRefresh: () => void
  onOpenPacketRework?: (batchId: string) => void
}

function sortStatusLabel(status?: string): { label: string; tone: 'ok' | 'warn' | 'err' | 'muted' } {
  switch (status) {
    case 'ready':
      return { label: 'Sort ready', tone: 'ok' }
    case 'sorting':
      return { label: 'Sorting…', tone: 'warn' }
    case 'failed':
      return { label: 'Sort failed', tone: 'err' }
    case 'pending':
      return { label: 'Sort pending', tone: 'muted' }
    default:
      return { label: 'No sort run', tone: 'muted' }
  }
}

function reviewStatusLabel(status?: string): { label: string; tone: 'ok' | 'warn' | 'err' | 'muted' } {
  switch (status) {
    case 'ready':
      return { label: 'OK', tone: 'ok' }
    case 'needs_work':
      return { label: 'Needs review', tone: 'err' }
    case 'running':
      return { label: 'Reviewing', tone: 'warn' }
    case 'not_run':
    default:
      return { label: 'Reviewing', tone: 'muted' }
  }
}

export default function AiBatchTab({
  batchId,
  onBatchSelect,
  onOpenReadyToPost,
  onOpenVerification,
  onMoveToVerification,
  onBack,
  refreshKey,
  onRefresh,
  onOpenPacketRework,
}: AiBatchTabProps) {
  const c = useClientTheme()
  const { showToast } = useToast()
  const { resolved, session } = useAuth()
  const authUser = resolved.user ?? session?.user ?? null
  const adminUserId = authUser?.id ?? 'unknown'
  const adminUserName = getAdminUserDisplayName(authUser?.email ?? null)
  const [sendingPpw, setSendingPpw] = useState(false)

  const openBatchPreview = (targetBatchId: string) => {
    onOpenPacketRework?.(targetBatchId)
  }

  const aiBatches = useMemo(() => {
    return getAllBatches().filter(
      (b) =>
        b.status !== 'draft' &&
        (b.upload_mode === 'ai' ||
          b.sort_status === 'sorting' ||
          b.sort_status === 'failed' ||
          b.sort_status === 'ready' ||
          (b.unmatched_doc_ids && b.unmatched_doc_ids.length > 0) ||
          mockInvoices.some(
            (inv) =>
              inv.batch_id === b.id &&
              inv.ai_review_status &&
              inv.ai_review_status !== 'not_run'
          ))
    )
  }, [refreshKey])

  const allBatches = getAllBatches()
  const batch = batchId ? allBatches.find((b) => b.id === batchId) : null

  if (!batchId || !batch) {
    const listItems: AdminBatchListItem[] = aiBatches.map((b) => ({
      id: b.id,
      batch_number: b.batch_number,
      client_name: b.client_name,
      total_invoices: b.total_invoices,
      total_amount: b.total_amount,
      submitted_at: b.submitted_at,
      status: b.status,
      upload_mode: b.upload_mode,
    }))

    return (
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <div
          className="shrink-0 px-4 py-3 border-b text-sm"
          style={{ borderColor: c.border, color: c.secondary, backgroundColor: c.card }}
        >
          <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: c.primary }}>
            <Bot className="w-4 h-4" />
            AI processing
          </span>
          {' — '}
          DocSort mismatches, review status, and manual Credyx fixes. Every step can be done by hand.
        </div>
        <AdminBatchesListView
          batches={listItems}
          variant="all"
          onSelectBatch={onBatchSelect}
          actionLabel="Open AI"
          onAction={(item, e) => {
            e.stopPropagation()
            onBatchSelect(item.id)
          }}
          onPreviewClick={(item, e) => {
            e.stopPropagation()
            openBatchPreview(item.id)
          }}
          emptyTitle="No AI-tracked batches"
          emptyHint="AI uploads and batches with sort/review activity appear here"
        />
      </div>
    )
  }

  const batchInvoices = mockInvoices.filter((inv) => inv.batch_id === batchId)
  const unmatchedCount = batch.unmatched_doc_ids?.length ?? 0
  const sortInfo = sortStatusLabel(batch.sort_status)
  const needsWork = batchInvoices.filter((inv) => inv.ai_review_status === 'needs_work')
  const reviewOk = batchInvoices.filter((inv) => inv.ai_review_status === 'ready')
  const ppwSentCount = batchInvoices.filter(hasPpwBeenSent).length
  const missingBroker = batchInvoices.filter((inv) => !inv.broker_id)

  const toneColor = (tone: 'ok' | 'warn' | 'err' | 'muted') => {
    if (tone === 'ok') return c.success
    if (tone === 'warn') return c.warning
    if (tone === 'err') return c.error ?? '#b45309'
    return c.secondary
  }

  const handleSendPpw = async () => {
    if (sendingPpw) return
    const eligible = batchInvoices.filter((inv) => inv.broker_id && inv.documents_count)
    if (eligible.length === 0) {
      showToast('No invoices with broker and documents ready for PPW.', 'error')
      return
    }
    setSendingPpw(true)
    try {
      const result = await sendPaperworkForBatch(
        eligible,
        batch.batch_number,
        adminUserId,
        adminUserName,
        'Admin',
        { skipAlreadySent: true }
      )
      showToast(
        `PPW: ${result.success} sent, ${result.failed} failed, ${result.skipped} already sent.`,
        result.failed > 0 ? 'info' : 'success'
      )
      onRefresh()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'PPW send failed', 'error')
    } finally {
      setSendingPpw(false)
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-5">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="dashboard-btn-secondary !h-8 !px-2.5 inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold truncate" style={{ color: c.primary }}>
              {batch.batch_number}
            </h2>
            <p className="text-sm truncate" style={{ color: c.secondary }}>
              {batch.client_name} · AI workspace
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => openBatchPreview(batchId)}
            className="dashboard-btn-secondary inline-flex items-center gap-1.5"
            title="Open Packets rework workspace"
          >
            <ExternalLink className="w-4 h-4" />
            Packets
          </button>
          <BatchAiReviewPanel batchId={batchId} onComplete={onRefresh} />
          <button
            type="button"
            onClick={() => void handleSendPpw()}
            disabled={sendingPpw}
            className="dashboard-btn-secondary inline-flex items-center gap-1.5"
          >
            <Mail className="w-4 h-4" />
            {sendingPpw ? 'Sending…' : 'Send PPW'}
          </button>
          <button
            type="button"
            onClick={() => onOpenReadyToPost(batchId)}
            className="dashboard-btn-secondary"
          >
            Ready to Post
          </button>
          {batch.status === 'ready_to_post' && (
            <button
              type="button"
              onClick={() => onMoveToVerification(batchId)}
              className="dashboard-btn-primary"
            >
              Move to Verification
            </button>
          )}
          {(batch.status === 'verification' || batch.status === 'approval') && (
            <button
              type="button"
              onClick={() => onOpenVerification(batchId)}
              className="dashboard-btn-primary"
            >
              Open Verification
            </button>
          )}
        </div>
      </div>

      {/* Status notes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'DocSort', value: sortInfo.label, color: toneColor(sortInfo.tone) },
          {
            label: 'Unmatched docs',
            value: String(unmatchedCount),
            color: unmatchedCount > 0 ? toneColor('err') : toneColor('ok'),
          },
          {
            label: 'AI review OK',
            value: `${reviewOk.length}/${batchInvoices.length}`,
            color: toneColor(reviewOk.length === batchInvoices.length && batchInvoices.length > 0 ? 'ok' : 'muted'),
          },
          {
            label: 'PPW sent',
            value: `${ppwSentCount}/${batchInvoices.length}`,
            color: toneColor(ppwSentCount === batchInvoices.length && batchInvoices.length > 0 ? 'ok' : 'muted'),
          },
        ].map((stat) => (
          <div key={stat.label} className="dashboard-card px-4 py-3">
            <div className="text-xs font-medium mb-1" style={{ color: c.secondary }}>
              {stat.label}
            </div>
            <div className="text-lg font-semibold tabular-nums" style={{ color: stat.color }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Issue callouts */}
      <div className="space-y-2 mb-4">
        {batch.sort_status === 'failed' && (
          <div
            className="flex items-start gap-2 px-3 py-2 rounded border text-sm"
            style={{ borderColor: c.border, backgroundColor: c.stat?.amber ?? '#fef3c7', color: c.primary }}
          >
            <FileWarning className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong>DocSort failed.</strong> Open Ready to Post to assign documents manually, or re-run
              sort from the client draft if still available.
            </div>
          </div>
        )}
        {unmatchedCount > 0 && (
          <div
            className="flex items-start gap-2 px-3 py-2 rounded border text-sm"
            style={{ borderColor: c.border, backgroundColor: c.stat?.amber ?? '#fef3c7', color: c.primary }}
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong>{unmatchedCount} unmatched document(s).</strong> RC without BOL, BOL without RC, or
              unclassified files. Fix in Ready to Post by assigning docs to invoices.
              {batch.unmatched_doc_ids && (
                <span className="block text-xs mt-1 opacity-80">
                  Ids: {batch.unmatched_doc_ids.slice(0, 8).join(', ')}
                  {batch.unmatched_doc_ids.length > 8 ? '…' : ''}
                </span>
              )}
            </div>
          </div>
        )}
        {missingBroker.length > 0 && (
          <div
            className="flex items-start gap-2 px-3 py-2 rounded border text-sm"
            style={{ borderColor: c.border, backgroundColor: c.stat?.amber ?? '#fef3c7', color: c.primary }}
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong>{missingBroker.length} invoice(s) missing broker.</strong> Credyx must assign or create
              the broker before PPW and verification.
            </div>
          </div>
        )}
        {needsWork.length > 0 && (
          <div
            className="flex items-start gap-2 px-3 py-2 rounded border text-sm"
            style={{ borderColor: c.border, backgroundColor: c.stat?.red ?? '#fee2e2', color: c.primary }}
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong>AI found issues on {needsWork.length} invoice(s).</strong> Review paperwork in
              Verification and approve or hold. Credyx can override any AI result.
            </div>
          </div>
        )}
        {batch.sort_status === 'ready' && unmatchedCount === 0 && needsWork.length === 0 && (
          <div
            className="flex items-start gap-2 px-3 py-2 rounded border text-sm"
            style={{ borderColor: c.border, backgroundColor: c.stat?.green ?? '#dcfce7', color: c.primary }}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              Sort looks clean. Send PPW when brokers are assigned, then move to Verification or run AI
              review.
            </div>
          </div>
        )}
      </div>

      {/* Per-invoice AI status */}
      <div className="dashboard-card overflow-hidden">
        <div
          className="px-4 py-2.5 border-b flex items-center justify-between gap-2"
          style={{ borderColor: c.border }}
        >
          <span className="text-sm font-semibold" style={{ color: c.primary }}>
            Invoices — AI status
          </span>
          <button
            type="button"
            onClick={onRefresh}
            className="text-xs inline-flex items-center gap-1"
            style={{ color: c.secondary }}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
        {batchInvoices.length === 0 ? (
          <div className="p-6 text-center text-sm" style={{ color: c.secondary }}>
            No invoices yet — create them in Ready to Post (handoff) or wait for AI intake.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full dashboard-table dashboard-table--compact">
              <thead>
                <tr>
                  <th className="text-left">Invoice#</th>
                  <th className="text-left">Load#</th>
                  <th className="text-left">Broker</th>
                  <th className="text-right">Amount</th>
                  <th className="text-left">AI review</th>
                  <th className="text-left">PPW</th>
                  <th className="text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {batchInvoices.map((inv) => {
                  const rev = reviewStatusLabel(inv.ai_review_status)
                  return (
                    <tr
                      key={inv.id}
                      className="cursor-pointer dashboard-card-interactive"
                      onClick={() => openBatchPreview(batchId)}
                      title="Open Packets rework"
                    >
                      <td className="font-medium" style={{ color: c.primary }}>
                        {inv.invoice_number}
                      </td>
                      <td style={{ color: c.secondary }}>{inv.load_number || '—'}</td>
                      <td style={{ color: c.secondary }}>
                        {inv.broker_name || (
                          <span style={{ color: toneColor('err') }}>Missing</span>
                        )}
                      </td>
                      <td className="text-right tabular-nums">{formatCurrency(inv.amount)}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <InvoiceAiReviewBadge invoice={inv} status={inv.ai_review_status} />
                      </td>
                      <td>
                        {hasPpwBeenSent(inv) ? (
                          <span className="inline-flex items-center gap-1" style={{ color: c.success }}>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Sent
                          </span>
                        ) : (
                          <span style={{ color: c.secondary }}>Not sent</span>
                        )}
                      </td>
                      <td
                        className="text-xs max-w-[220px] truncate"
                        style={{ color: rev.tone === 'err' ? toneColor('err') : c.secondary }}
                        title={inv.ai_review_summary}
                      >
                        {inv.ai_review_summary || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
