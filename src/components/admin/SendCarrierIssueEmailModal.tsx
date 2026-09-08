import { useEffect, useMemo, useState } from 'react'
import { Mail, Send, X } from 'lucide-react'
import type { Invoice } from '../../types/invoice'
import type { Client } from '../../types/client'
import { getEmailTemplate } from '../../services/emailTemplateService'
import { sendTransactionalEmail } from '../../services/emailService'
import { loadCompanyLogoAttachment } from '../../utils/emailCompanyLogo'
import {
  enrichEmailTemplateData,
  renderEmailTemplateString,
} from '../../utils/emailTemplateRender'
import {
  fieldsFromInvoice,
  sampleCarrierIssueFields,
  toTemplateData,
  type CarrierIssueEmailFields,
} from '../../utils/carrierDocumentIssueEmail'
import { useToast } from '../ui/ToastProvider'
import Spinner from '../ui/Spinner'
import { useClientTheme } from '../../theme/ThemeContext'

interface SendCarrierIssueEmailModalProps {
  onClose: () => void
  /** Real carrier send from an invoice. */
  invoice?: Invoice | null
  client?: Client | null
  /** Prefill recipient (carrier or admin test inbox). */
  defaultTo?: string
  /** Send [TEST] with sample or invoice-shaped data. */
  isTest?: boolean
  /** Unsaved Settings draft — used instead of the DB body when sending a test. */
  draftSubject?: string
  draftBodyHtml?: string
}

/**
 * Compose + live-preview a carrier document-issue email, then send via Resend.
 */
export default function SendCarrierIssueEmailModal({
  onClose,
  invoice,
  client,
  defaultTo = '',
  isTest = false,
  draftSubject,
  draftBodyHtml,
}: SendCarrierIssueEmailModalProps) {
  const c = useClientTheme()
  const { showToast } = useToast()
  const [to, setTo] = useState(defaultTo)
  const [fields, setFields] = useState<CarrierIssueEmailFields>(() =>
    invoice ? fieldsFromInvoice(invoice, client) : sampleCarrierIssueFields()
  )
  const [subjectTpl, setSubjectTpl] = useState(
    draftSubject ?? 'Action needed — invoice {{invoiceNumber}} · Load {{loadNumber}}'
  )
  const [bodyTpl, setBodyTpl] = useState(draftBodyHtml ?? '')
  const [loadingTpl, setLoadingTpl] = useState(!draftBodyHtml)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (draftBodyHtml) {
      setSubjectTpl(draftSubject ?? subjectTpl)
      setBodyTpl(draftBodyHtml)
      setLoadingTpl(false)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const row = await getEmailTemplate('carrier_document_issue')
        if (cancelled) return
        setSubjectTpl(row.subject)
        setBodyTpl(row.body_html)
      } catch (err) {
        if (!cancelled) {
          showToast(err instanceof Error ? err.message : 'Could not load template', 'error')
        }
      } finally {
        if (!cancelled) setLoadingTpl(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per open
  }, [draftBodyHtml, draftSubject])

  const preview = useMemo(() => {
    const data = enrichEmailTemplateData('carrier_document_issue', toTemplateData(fields))
    return {
      subject: renderEmailTemplateString(subjectTpl, data),
      html: renderEmailTemplateString(bodyTpl, data),
    }
  }, [fields, subjectTpl, bodyTpl])

  const patch = (patch: Partial<CarrierIssueEmailFields>) => {
    setFields((prev) => ({ ...prev, ...patch }))
  }

  const handleSend = async () => {
    const recipient = to.trim()
    if (!recipient || !recipient.includes('@')) {
      showToast('Enter a valid email address', 'error')
      return
    }
    if (!parseIssueLinesSafe(fields.issueList).length) {
      showToast('Add at least one item under What we need', 'error')
      return
    }

    setSending(true)
    try {
      const logo = await loadCompanyLogoAttachment()
      const data = toTemplateData(fields)
      if (logo) {
        data.companyLogoHtml = `<img src="cid:${logo.contentId}" alt="Credyx" width="168" style="display:block;border:0;height:auto;" />`
      }

      const result = await sendTransactionalEmail('carrier_document_issue', recipient, data, {
        isTest,
        attachments: logo ? [logo] : undefined,
        overrideSubject: subjectTpl,
        overrideHtml: bodyTpl,
      })

      if (!result.ok) {
        showToast(result.error ?? 'Send failed', 'error')
        return
      }
      showToast(
        isTest
          ? `Sent to ${recipient}. Search that inbox (and Spam/Promotions) for “[TEST]”. API success ≠ inbox — check the latest email in Resend for To + Delivered.`
          : `Sent to ${recipient}. Check that inbox and Spam.`,
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
    <div className="fixed inset-0 z-[80] overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="relative rounded-xl shadow-xl max-w-5xl w-full overflow-hidden"
          style={{ backgroundColor: c.card, border: `1px solid ${c.border}` }}
        >
          <div
            className="flex items-center justify-between px-5 py-3.5 border-b"
            style={{ borderColor: c.border }}
          >
            <div>
              <h2 className="text-lg font-semibold" style={{ color: c.primary }}>
                {isTest ? 'Send test email' : 'Email carrier'}
              </h2>
              <p className="text-xs mt-0.5" style={{ color: c.secondary }}>
                {isTest
                  ? 'Uses sample (or edited) data so you can see the template in your inbox.'
                  : 'Document issue template — edit the list, preview, then send.'}
              </p>
            </div>
            <button type="button" onClick={onClose} className="p-2" style={{ color: c.secondary }}>
              <X className="w-5 h-5" />
            </button>
          </div>

          {loadingTpl ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm" style={{ color: c.secondary }}>
              <Spinner className="w-4 h-4" />
              Loading template…
            </div>
          ) : (
            <div className="grid lg:grid-cols-2 gap-0">
              <div className="p-5 space-y-3 border-b lg:border-b-0 lg:border-r" style={{ borderColor: c.border }}>
                <label className="block text-xs font-medium" style={{ color: c.secondary }}>
                  Send to
                </label>
                <input
                  type="email"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="client-input w-full"
                  style={{ backgroundColor: c.card, color: c.primary }}
                  placeholder="carrier@example.com"
                />

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Contact name" value={fields.contactName} onChange={(v) => patch({ contactName: v })} />
                  <Field label="Carrier" value={fields.clientName} onChange={(v) => patch({ clientName: v })} />
                  <Field label="Invoice" value={fields.invoiceNumber} onChange={(v) => patch({ invoiceNumber: v })} />
                  <Field label="Load" value={fields.loadNumber} onChange={(v) => patch({ loadNumber: v })} />
                </div>
                <Field label="Broker" value={fields.brokerName} onChange={(v) => patch({ brokerName: v })} />

                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: c.secondary }}>
                    What we need (one item per line)
                  </label>
                  <textarea
                    value={fields.issueList}
                    onChange={(e) => patch({ issueList: e.target.value })}
                    rows={5}
                    className="client-input w-full text-sm"
                    style={{ backgroundColor: c.card, color: c.primary }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: c.secondary }}>
                    Extra note (optional)
                  </label>
                  <textarea
                    value={fields.message}
                    onChange={(e) => patch({ message: e.target.value })}
                    rows={3}
                    className="client-input w-full text-sm"
                    style={{ backgroundColor: c.card, color: c.primary }}
                  />
                </div>
              </div>

              <div className="p-5 flex flex-col min-h-[420px]">
                <p className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: c.secondary }}>
                  Preview
                </p>
                <p className="text-xs font-medium mb-2 truncate" style={{ color: c.primary }}>
                  {preview.subject}
                </p>
                <iframe
                  title="Email preview"
                  className="flex-1 w-full rounded-lg border min-h-[320px] bg-white"
                  style={{ borderColor: c.border }}
                  sandbox=""
                  srcDoc={preview.html}
                />
              </div>
            </div>
          )}

          <div
            className="flex justify-end gap-2 px-5 py-3 border-t"
            style={{ borderColor: c.border }}
          >
            <button type="button" onClick={onClose} className="dashboard-btn-secondary dashboard-btn-compact">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={sending || loadingTpl}
              className="dashboard-btn-primary dashboard-btn-compact inline-flex items-center gap-1.5"
            >
              {sending ? <Spinner className="w-3.5 h-3.5" /> : isTest ? <Mail className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
              {isTest ? 'Send test email' : 'Send email'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function parseIssueLinesSafe(issueList: string): string[] {
  return issueList
    .split(/\n/)
    .map((line) => line.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean)
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const c = useClientTheme()
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: c.secondary }}>
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="client-input w-full"
        style={{ backgroundColor: c.card, color: c.primary, height: 36, minHeight: 36 }}
      />
    </div>
  )
}
