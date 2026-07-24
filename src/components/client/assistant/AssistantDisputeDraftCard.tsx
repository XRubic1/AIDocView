import { useState } from 'react'
import { Check, ExternalLink, ShieldAlert, Upload } from 'lucide-react'
import type { AssistantDisputeDraft, AssistantDisputeReason } from '../../../types/assistant'
import {
  DISPUTE_REASON_OPTIONS,
  openClientInvoiceDispute,
} from '../../../services/clientInvoiceActions'
import { notifyTenantDataUpdated } from '../../../services/supabase/tenantDataLiveSync'

interface AssistantDisputeDraftCardProps {
  draft: AssistantDisputeDraft
  authorName: string
  /** Optional intro above the draft. */
  note?: string
  onOpenInvoice?: (invoiceId: string, invoiceNumber: string) => void
  onOpened?: (invoiceId: string) => void
}

/** Format an upload timestamp for the banner. */
function formatUploadWhen(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Review card for an AI-drafted invoice dispute.
 * Opens the dispute only after the user confirms — never auto-files.
 * When the carrier already uploaded after a missing-docs notice, shows a clear
 * “you uploaded” banner so this isn’t confused with “upload again.”
 */
export default function AssistantDisputeDraftCard({
  draft,
  authorName,
  note,
  onOpenInvoice,
  onOpened,
}: AssistantDisputeDraftCardProps) {
  const [reason, setReason] = useState<AssistantDisputeReason>(draft.reason || 'other')
  const [description, setDescription] = useState(draft.description)
  const [status, setStatus] = useState<'idle' | 'opening' | 'opened' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const canOpen = Boolean(draft.invoiceId && description.trim() && status !== 'opened')
  const uploadWhen = formatUploadWhen(draft.uploadAt)

  const openDispute = () => {
    if (!canOpen || status === 'opening') return
    setStatus('opening')
    setError(null)
    try {
      const updated = openClientInvoiceDispute(draft.invoiceId, reason, description, authorName)
      if (!updated) {
        setStatus('error')
        setError('Could not open the dispute — check the invoice still exists.')
        return
      }
      notifyTenantDataUpdated(['invoices'], updated.client_id)
      setStatus('opened')
      onOpened?.(draft.invoiceId)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Failed to open dispute.')
    }
  }

  return (
    <div className="assistant-email-card assistant-dispute-card">
      <div className="assistant-email-card__head">
        <span className="assistant-email-chip assistant-dispute-chip">
          <ShieldAlert className="w-3 h-3" aria-hidden />
          {status === 'opened' ? 'Dispute opened' : 'Dispute draft'}
        </span>
        <span className="assistant-email-card__meta">
          #{draft.invoiceNumber}
          {draft.brokerName ? ` · ${draft.brokerName}` : ''}
        </span>
      </div>

      {note?.trim() ? <p className="assistant-email-card__note">{note}</p> : null}

      {draft.youUploaded ? (
        <div className="assistant-dispute-card__upload" role="status">
          <Upload className="w-4 h-4 assistant-dispute-card__upload-icon" aria-hidden />
          <div className="assistant-dispute-card__upload-body">
            <strong>You already uploaded paperwork</strong>
            {draft.uploadSummary ? (
              <p>
                {draft.uploadSummary}
                {uploadWhen ? ` · ${uploadWhen}` : ''}
              </p>
            ) : null}
            <p className="assistant-dispute-card__upload-hint">
              This dispute asks Credyx to <em>review your upload and clear the hold</em> — not to
              send documents again.
            </p>
          </div>
        </div>
      ) : null}

      <label className="assistant-email-card__field">
        Reason
        <select
          className="client-input"
          value={reason}
          onChange={(e) => setReason(e.target.value as AssistantDisputeReason)}
          disabled={status === 'opened' || status === 'opening'}
          aria-label="Dispute reason"
        >
          {DISPUTE_REASON_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.value === 'other' && draft.youUploaded
                ? 'Paperwork already uploaded — clear hold'
                : opt.label}
            </option>
          ))}
        </select>
      </label>

      <label className="assistant-email-card__field">
        What you&apos;re asking Credyx
        <textarea
          className="client-input assistant-email-card__body"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Describe the issue — e.g. I already uploaded the BOL; please clear the hold."
          disabled={status === 'opened' || status === 'opening'}
          aria-label="Dispute description"
        />
      </label>

      {error ? (
        <p className="assistant-note-card__error" role="alert">
          {error}
        </p>
      ) : null}

      {status === 'opened' ? (
        <p className="assistant-note-card__success" role="status">
          <Check className="w-3.5 h-3.5" aria-hidden />
          {draft.youUploaded
            ? `Dispute opened on #${draft.invoiceNumber} — Credyx will review your upload and clear the hold if everything checks out.`
            : `Dispute opened on invoice #${draft.invoiceNumber} — Credyx will review it.`}
        </p>
      ) : (
        <div className="assistant-email-card__actions">
          <button
            type="button"
            className="dashboard-btn-primary dashboard-btn-compact"
            disabled={!canOpen || status === 'opening'}
            onClick={openDispute}
          >
            {status === 'opening' ? 'Opening…' : 'Open dispute'}
          </button>
          {onOpenInvoice && draft.invoiceId ? (
            <button
              type="button"
              className="dashboard-btn-secondary dashboard-btn-compact"
              onClick={() => onOpenInvoice(draft.invoiceId, draft.invoiceNumber)}
            >
              <ExternalLink className="w-3.5 h-3.5" aria-hidden />
              Open invoice
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}
