import { useState } from 'react'
import { Check, ExternalLink, StickyNote } from 'lucide-react'
import type { AssistantNoteDraft, AssistantNoteVisibility } from '../../../types/assistant'
import { addClientInvoiceNote } from '../../../services/clientInvoiceActions'
import { addAdminInvoiceNote } from '../../../services/adminInvoiceNoteActions'
import { notifyTenantDataUpdated } from '../../../services/supabase/tenantDataLiveSync'

interface AssistantNoteDraftCardProps {
  draft: AssistantNoteDraft
  mode?: 'client' | 'admin'
  authorName: string
  /** Optional intro above the draft. */
  note?: string
  onOpenInvoice?: (invoiceId: string, invoiceNumber: string) => void
  onPosted?: (invoiceId: string) => void
}

/**
 * Review card for an AI-drafted invoice note.
 * Posts only after the user confirms — never auto-writes.
 */
export default function AssistantNoteDraftCard({
  draft,
  mode = 'client',
  authorName,
  note,
  onOpenInvoice,
  onPosted,
}: AssistantNoteDraftCardProps) {
  const isAdmin = mode === 'admin'
  const [body, setBody] = useState(draft.body)
  const [visibility, setVisibility] = useState<AssistantNoteVisibility>(
    draft.visibility || 'client'
  )
  const [status, setStatus] = useState<'idle' | 'posting' | 'posted' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const canPost = Boolean(draft.invoiceId && body.trim() && status !== 'posted')

  const post = () => {
    if (!canPost || status === 'posting') return
    setStatus('posting')
    setError(null)
    try {
      const updated = isAdmin
        ? addAdminInvoiceNote(draft.invoiceId, body, authorName, { visibility })
        : addClientInvoiceNote(draft.invoiceId, body, authorName)

      if (!updated) {
        setStatus('error')
        setError('Could not post — check the invoice still exists.')
        return
      }

      notifyTenantDataUpdated(['invoices'], updated.client_id)
      setStatus('posted')
      onPosted?.(draft.invoiceId)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Failed to post note.')
    }
  }

  return (
    <div className="assistant-email-card assistant-note-card">
      <div className="assistant-email-card__head">
        <span className="assistant-email-chip assistant-note-chip">
          <StickyNote className="w-3 h-3" aria-hidden />
          {status === 'posted' ? 'Posted' : 'Note draft'}
        </span>
        <span className="assistant-email-card__meta">
          #{draft.invoiceNumber}
          {draft.brokerName ? ` · ${draft.brokerName}` : ''}
        </span>
      </div>

      {note?.trim() ? <p className="assistant-email-card__note">{note}</p> : null}

      {isAdmin && status !== 'posted' ? (
        <div className="assistant-note-card__vis" role="group" aria-label="Note visibility">
          <button
            type="button"
            className={`assistant-note-card__vis-btn${
              visibility === 'client' ? ' assistant-note-card__vis-btn--active' : ''
            }`}
            onClick={() => setVisibility('client')}
          >
            Client-visible
          </button>
          <button
            type="button"
            className={`assistant-note-card__vis-btn${
              visibility === 'internal' ? ' assistant-note-card__vis-btn--active' : ''
            }`}
            onClick={() => setVisibility('internal')}
          >
            Internal only
          </button>
        </div>
      ) : null}

      <label className="assistant-email-card__field">
        Note
        <textarea
          className="client-input assistant-email-card__body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          disabled={status === 'posted' || status === 'posting'}
          aria-label="Invoice note"
        />
      </label>

      {error ? (
        <p className="assistant-note-card__error" role="alert">
          {error}
        </p>
      ) : null}

      {status === 'posted' ? (
        <p className="assistant-note-card__success" role="status">
          <Check className="w-3.5 h-3.5" aria-hidden />
          Note posted to invoice #{draft.invoiceNumber}
        </p>
      ) : (
        <div className="assistant-email-card__actions">
          <button
            type="button"
            className="dashboard-btn-primary dashboard-btn-compact"
            disabled={!canPost || status === 'posting'}
            onClick={post}
          >
            {status === 'posting' ? 'Posting…' : 'Post note'}
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
