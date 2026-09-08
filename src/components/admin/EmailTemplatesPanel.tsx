import { useEffect, useMemo, useState } from 'react'
import { Mail, RotateCcw, Save } from 'lucide-react'
import {
  listEmailTemplates,
  resetEmailTemplateToDefault,
  saveEmailTemplate,
} from '../../services/emailTemplateService'
import type { EmailTemplateRow } from '../../types/emailTemplate'
import type { EmailTemplateId } from '../../config/emailTemplateDefaults'
import {
  buildCarrierDocumentIssueBodyHtml,
  CARRIER_DOCUMENT_ISSUE_COPY,
  type CarrierDocumentIssueCopy,
} from '../../config/emailLayouts'
import { getEmailPreviewSampleData } from '../../config/emailPreviewSampleData'
import { sendTransactionalEmail } from '../../services/emailService'
import { loadCompanyLogoAttachment } from '../../utils/emailCompanyLogo'
import {
  enrichEmailTemplateData,
  renderEmailTemplateString,
} from '../../utils/emailTemplateRender'
import { useToast } from '../ui/ToastProvider'
import Spinner from '../ui/Spinner'
import { useAuth } from '../../context/AuthContext'
import { useClientTheme } from '../../theme/ThemeContext'
import SendCarrierIssueEmailModal from './SendCarrierIssueEmailModal'

/**
 * Admin editor for transactional email templates.
 * Carrier document-issue includes a simple copy form, live preview, and send-test.
 */
export default function EmailTemplatesPanel() {
  const c = useClientTheme()
  const { showToast } = useToast()
  const { session } = useAuth()
  const actor = session?.user?.email ?? session?.user?.id
  const [templates, setTemplates] = useState<EmailTemplateRow[]>([])
  const [selectedId, setSelectedId] = useState<EmailTemplateId | ''>('')
  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [easyCopy, setEasyCopy] = useState<CarrierDocumentIssueCopy>({ ...CARRIER_DOCUMENT_ISSUE_COPY })
  const [simpleMode, setSimpleMode] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showTestSend, setShowTestSend] = useState(false)

  const selected = templates.find((t) => t.id === selectedId)
  const isDocIssue = selectedId === 'carrier_document_issue'

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const rows = await listEmailTemplates()
        if (cancelled) return
        setTemplates(rows)
        if (rows.length > 0) {
          const first =
            rows.find((r) => r.id === 'carrier_document_issue') ??
            rows.find((r) => r.id === 'broker_packet') ??
            rows[0]
          setSelectedId(first.id)
          setSubject(first.subject)
          setBodyHtml(first.body_html)
          setSimpleMode(first.id === 'carrier_document_issue')
        }
      } catch (err) {
        if (!cancelled) {
          showToast(err instanceof Error ? err.message : 'Could not load templates', 'error')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [showToast])

  const selectTemplate = (id: EmailTemplateId) => {
    const row = templates.find((t) => t.id === id)
    if (!row) return
    setSelectedId(id)
    setSubject(row.subject)
    setBodyHtml(row.body_html)
    setSimpleMode(id === 'carrier_document_issue')
    setEasyCopy({ ...CARRIER_DOCUMENT_ISSUE_COPY })
  }

  const applyEasyCopy = (next: CarrierDocumentIssueCopy) => {
    setEasyCopy(next)
    setBodyHtml(buildCarrierDocumentIssueBodyHtml(next))
  }

  const preview = useMemo(() => {
    if (!selectedId) return { subject: '', html: '' }
    const sample = getEmailPreviewSampleData(selectedId)
    const data = enrichEmailTemplateData(selectedId, sample)
    const htmlSource =
      selectedId === 'carrier_document_issue' && simpleMode
        ? buildCarrierDocumentIssueBodyHtml(easyCopy)
        : bodyHtml
    return {
      subject: renderEmailTemplateString(subject, data),
      html: renderEmailTemplateString(htmlSource, data),
    }
  }, [selectedId, subject, bodyHtml, simpleMode, easyCopy])

  const handleSave = async () => {
    if (!selectedId) return
    setSaving(true)
    try {
      const html = isDocIssue && simpleMode ? buildCarrierDocumentIssueBodyHtml(easyCopy) : bodyHtml
      const updated = await saveEmailTemplate(
        selectedId,
        { subject, body_html: html },
        actor
      )
      setBodyHtml(updated.body_html)
      setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      showToast('Email template saved', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save template', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (!selectedId) return
    if (!confirm('Reset this template to the built-in Credyx default?')) return
    setSaving(true)
    try {
      const updated = await resetEmailTemplateToDefault(selectedId, actor)
      setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      setSubject(updated.subject)
      setBodyHtml(updated.body_html)
      setEasyCopy({ ...CARRIER_DOCUMENT_ISSUE_COPY })
      showToast('Template reset to default', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not reset template', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div
        className="flex items-center justify-center gap-2 py-16 text-sm"
        style={{ color: c.secondary }}
      >
        <Spinner className="w-4 h-4" />
        Loading templates…
      </div>
    )
  }

  return (
    <div className="admin-email-templates flex flex-col min-h-0 h-full gap-3">
      <div className="admin-email-templates__shell flex flex-col lg:flex-row min-h-0 flex-1 gap-3">
        <aside
          className="admin-email-templates__list shrink-0 overflow-y-auto border rounded-lg"
          style={{ borderColor: c.border, backgroundColor: c.card }}
        >
          {templates.map((t) => {
            const active = selectedId === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => selectTemplate(t.id)}
                className="w-full text-left px-3 py-2.5 border-b last:border-0 transition-colors"
                style={{
                  borderColor: c.border,
                  backgroundColor: active ? c.stat.slate : 'transparent',
                  color: c.primary,
                }}
              >
                <div className="text-sm font-medium leading-snug truncate">{t.name}</div>
                <div
                  className="text-[10px] uppercase tracking-wide mt-0.5 truncate"
                  style={{ color: c.secondary }}
                >
                  {t.audience}
                </div>
              </button>
            )
          })}
        </aside>

        {selected ? (
          <div className="admin-email-templates__workspace min-h-0 flex-1">
            <div className="admin-email-templates__editor flex flex-col min-h-0 gap-3 overflow-y-auto pr-0.5">
              <div
                className="shrink-0 rounded-lg px-3 py-2.5 border"
                style={{ borderColor: c.border, backgroundColor: c.stat.slate }}
              >
                <p className="text-sm font-semibold leading-tight" style={{ color: c.primary }}>
                  {selected.name}
                </p>
                <p className="text-[11px] mt-0.5 line-clamp-2" style={{ color: c.secondary }}>
                  {selected.description}
                </p>
              </div>

              <div className="client-settings-field shrink-0">
                <label className="client-label" style={{ color: c.secondary }}>
                  Subject
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="client-input w-full"
                  style={{
                    backgroundColor: c.card,
                    fontSize: 13,
                    color: c.primary,
                    height: 36,
                    minHeight: 36,
                  }}
                />
              </div>

              {isDocIssue ? (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setSimpleMode(true)}
                    className="dashboard-btn-compact text-xs px-2.5 py-1 rounded-md"
                    style={{
                      backgroundColor: simpleMode ? c.info : 'transparent',
                      color: simpleMode ? '#fff' : c.primary,
                      border: `1px solid ${c.border}`,
                    }}
                  >
                    Simple
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimpleMode(false)}
                    className="dashboard-btn-compact text-xs px-2.5 py-1 rounded-md"
                    style={{
                      backgroundColor: !simpleMode ? c.info : 'transparent',
                      color: !simpleMode ? '#fff' : c.primary,
                      border: `1px solid ${c.border}`,
                    }}
                  >
                    HTML
                  </button>
                </div>
              ) : null}

              {isDocIssue && simpleMode ? (
                <div className="grid gap-3">
                  {(
                    [
                      ['eyebrow', 'Eyebrow'],
                      ['headline', 'Headline'],
                      ['intro', 'Intro'],
                      ['nextStep', 'Next step'],
                      ['footer', 'Footer'],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key}>
                      <label className="client-label" style={{ color: c.secondary }}>
                        {label}
                      </label>
                      <textarea
                        value={easyCopy[key]}
                        onChange={(e) => applyEasyCopy({ ...easyCopy, [key]: e.target.value })}
                        rows={key === 'intro' || key === 'nextStep' ? 4 : 2}
                        className="client-input w-full text-sm"
                        style={{ backgroundColor: c.card, color: c.primary }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="client-settings-field flex flex-col min-h-0 flex-1">
                  <label className="client-label shrink-0" style={{ color: c.secondary }}>
                    Body (HTML)
                  </label>
                  <textarea
                    value={bodyHtml}
                    onChange={(e) => setBodyHtml(e.target.value)}
                    className="client-input w-full flex-1 min-h-[220px] font-mono text-xs leading-relaxed resize-y"
                    style={{ backgroundColor: c.card, color: c.primary }}
                    spellCheck={false}
                  />
                </div>
              )}
            </div>

            <div
              className="admin-email-templates__preview min-h-0 flex flex-col rounded-lg border overflow-hidden"
              style={{ borderColor: c.border, backgroundColor: c.card }}
            >
              <div
                className="shrink-0 px-3 py-2 border-b"
                style={{
                  borderColor: c.border,
                  backgroundColor: c.stat.slate,
                }}
              >
                <p
                  className="text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: c.secondary }}
                >
                  Sample
                </p>
                <p className="text-xs font-medium mt-0.5 leading-snug" style={{ color: c.primary }}>
                  {preview.subject || 'Subject preview'}
                </p>
              </div>
              <iframe
                title="Template preview"
                className="admin-email-templates__preview-frame w-full flex-1 min-h-0 bg-[#f1f5f9]"
                sandbox=""
                srcDoc={preview.html}
              />
            </div>
          </div>
        ) : null}
      </div>

      {selected ? (
        <div
          className="client-settings-tab-panel__footer shrink-0 !mt-0 !pt-3 flex flex-wrap justify-end gap-2"
          style={{ borderColor: c.border }}
        >
          <button
            type="button"
            onClick={() => void handleReset()}
            disabled={saving}
            className="dashboard-btn-secondary dashboard-btn-compact inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
          <button
            type="button"
            onClick={() => setShowTestSend(true)}
            disabled={saving}
            className="dashboard-btn-secondary dashboard-btn-compact inline-flex items-center gap-1.5"
          >
            <Mail className="w-3.5 h-3.5" />
            Send test email
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="dashboard-btn-primary dashboard-btn-compact inline-flex items-center gap-1.5"
          >
            {saving ? <Spinner className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            Save template
          </button>
        </div>
      ) : null}

      {showTestSend && selectedId ? (
        isDocIssue ? (
          <SendCarrierIssueEmailModal
            onClose={() => setShowTestSend(false)}
            defaultTo={session?.user?.email ?? ''}
            isTest
            draftSubject={subject}
            draftBodyHtml={
              simpleMode ? buildCarrierDocumentIssueBodyHtml(easyCopy) : bodyHtml
            }
          />
        ) : (
          <SendGenericTestEmailModal
            templateId={selectedId}
            subject={subject}
            bodyHtml={bodyHtml}
            defaultTo={session?.user?.email ?? ''}
            onClose={() => setShowTestSend(false)}
          />
        )
      ) : null}
    </div>
  )
}

function SendGenericTestEmailModal({
  templateId,
  subject,
  bodyHtml,
  defaultTo,
  onClose,
}: {
  templateId: EmailTemplateId
  subject: string
  bodyHtml: string
  defaultTo: string
  onClose: () => void
}) {
  const c = useClientTheme()
  const { showToast } = useToast()
  const [to, setTo] = useState(defaultTo)
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    const recipient = to.trim()
    if (!recipient.includes('@')) {
      showToast('Enter a valid email address', 'error')
      return
    }
    setSending(true)
    try {
      const logo = await loadCompanyLogoAttachment()
      const data = getEmailPreviewSampleData(templateId)
      if (logo) {
        data.companyLogoHtml = `<img src="cid:${logo.contentId}" alt="Credyx" width="168" style="display:block;border:0;height:auto;" />`
      }
      const result = await sendTransactionalEmail(templateId, recipient, data, {
        isTest: true,
        attachments: logo ? [logo] : undefined,
        overrideSubject: subject,
        overrideHtml: bodyHtml,
      })
      if (!result.ok) {
        showToast(result.error ?? 'Send failed', 'error')
        return
      }
      showToast(
        `Sent to ${recipient}. Search that inbox and Spam/Promotions for “[TEST]”. In Resend, open the latest email and confirm To + Delivered.`,
        'success'
      )
      onClose()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Send failed', 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="rounded-xl shadow-xl w-full max-w-md p-5" style={{ backgroundColor: c.card }}>
        <h3 className="text-base font-semibold mb-1" style={{ color: c.primary }}>
          Send test email
        </h3>
        <p className="text-xs mb-3" style={{ color: c.secondary }}>
          Sends this template with sample data. Subject is prefixed with [TEST].
        </p>
        <input
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="client-input w-full mb-4"
          style={{ backgroundColor: c.card, color: c.primary }}
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="dashboard-btn-secondary dashboard-btn-compact">
            Cancel
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={() => void handleSend()}
            className="dashboard-btn-primary dashboard-btn-compact inline-flex items-center gap-1.5"
          >
            {sending ? <Spinner className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
            Send test email
          </button>
        </div>
      </div>
    </div>
  )
}
