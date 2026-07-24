import { useState } from 'react'
import { Check, Copy, ExternalLink, Mail } from 'lucide-react'
import type { AssistantEmailDraft } from '../../../types/assistant'

interface AssistantEmailDraftCardProps {
  draft: AssistantEmailDraft
  /** Optional intro line above the draft. */
  note?: string
}

function audienceLabel(audience: AssistantEmailDraft['audience']): string {
  switch (audience) {
    case 'broker':
      return 'Broker'
    case 'credyx':
      return 'Credyx'
    case 'client':
      return 'Client'
    default:
      return 'Email'
  }
}

/** mailto: must use %20 for spaces — URLSearchParams uses + which many mail apps show literally. */
function buildMailto(draft: AssistantEmailDraft): string {
  const to = draft.to.trim()
  const parts: string[] = []
  if (draft.subject) parts.push(`subject=${encodeURIComponent(draft.subject)}`)
  if (draft.body) parts.push(`body=${encodeURIComponent(draft.body)}`)
  // Do not encode the address itself — encodeURIComponent would mangle @ for some clients.
  return `mailto:${to}${parts.length ? `?${parts.join('&')}` : ''}`
}

/**
 * Review card for an AI-generated email draft.
 * Copy or open in the user's mail app — does not auto-send via Credyx.
 */
export default function AssistantEmailDraftCard({
  draft,
  note,
}: AssistantEmailDraftCardProps) {
  const [copied, setCopied] = useState<'all' | 'body' | null>(null)
  const [to, setTo] = useState(draft.to)
  const [subject, setSubject] = useState(draft.subject)
  const [body, setBody] = useState(draft.body)

  const liveDraft: AssistantEmailDraft = {
    ...draft,
    to: to.trim(),
    subject: subject.trim(),
    body: body.trim(),
  }

  const copyText = async (which: 'all' | 'body') => {
    const text =
      which === 'body'
        ? liveDraft.body
        : `To: ${liveDraft.to || '(add recipient)'}\nSubject: ${liveDraft.subject}\n\n${liveDraft.body}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      window.setTimeout(() => setCopied(null), 1600)
    } catch {
      // Ignore clipboard failures (permissions / insecure context).
    }
  }

  const openMail = () => {
    window.location.href = buildMailto(liveDraft)
  }

  return (
    <div className="assistant-email-card">
      <div className="assistant-email-card__head">
        <span className="assistant-email-chip">
          <Mail className="w-3 h-3" aria-hidden />
          Draft · {audienceLabel(draft.audience)}
        </span>
        {(draft.invoiceNumber || draft.brokerName) && (
          <span className="assistant-email-card__meta">
            {draft.invoiceNumber ? `#${draft.invoiceNumber}` : ''}
            {draft.invoiceNumber && draft.brokerName ? ' · ' : ''}
            {draft.brokerName || ''}
          </span>
        )}
      </div>

      {note ? <p className="assistant-email-card__note">{note}</p> : null}

      <label className="assistant-email-card__field">
        <span>To</span>
        <input
          type="email"
          className="client-input"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          aria-label="Recipient email"
          placeholder="Recipient email"
        />
        {draft.toName ? (
          <span className="assistant-email-card__hint">{draft.toName}</span>
        ) : null}
      </label>

      <label className="assistant-email-card__field">
        <span>Subject</span>
        <input
          type="text"
          className="client-input"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          aria-label="Email subject"
        />
      </label>

      <label className="assistant-email-card__field">
        <span>Body</span>
        <textarea
          className="client-input assistant-email-card__body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          aria-label="Email body"
        />
      </label>

      <div className="assistant-email-card__actions">
        <button
          type="button"
          className="dashboard-btn-primary assistant-email-card__btn"
          onClick={openMail}
          disabled={!liveDraft.to.trim()}
          title={
            liveDraft.to.trim()
              ? 'Open in your email app'
              : 'Add a recipient email on the broker/client record first'
          }
        >
          <ExternalLink className="w-3.5 h-3.5" aria-hidden />
          Open in mail
        </button>
        <button
          type="button"
          className="dashboard-btn-secondary assistant-email-card__btn"
          onClick={() => void copyText('all')}
        >
          {copied === 'all' ? (
            <Check className="w-3.5 h-3.5" aria-hidden />
          ) : (
            <Copy className="w-3.5 h-3.5" aria-hidden />
          )}
          {copied === 'all' ? 'Copied' : 'Copy all'}
        </button>
        <button
          type="button"
          className="dashboard-btn-secondary assistant-email-card__btn"
          onClick={() => void copyText('body')}
        >
          {copied === 'body' ? (
            <Check className="w-3.5 h-3.5" aria-hidden />
          ) : (
            <Copy className="w-3.5 h-3.5" aria-hidden />
          )}
          {copied === 'body' ? 'Copied' : 'Copy body'}
        </button>
      </div>

      <p className="assistant-email-card__footer">
        Review before sending — Credyx does not auto-send this draft.
      </p>
    </div>
  )
}
