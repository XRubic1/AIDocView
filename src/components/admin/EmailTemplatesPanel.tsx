import { useEffect, useState } from 'react'
import { RotateCcw, Save } from 'lucide-react'
import {
  listEmailTemplates,
  resetEmailTemplateToDefault,
  saveEmailTemplate,
} from '../../services/emailTemplateService'
import type { EmailTemplateRow } from '../../types/emailTemplate'
import type { EmailTemplateId } from '../../config/emailTemplateDefaults'
import { useToast } from '../ui/ToastProvider'
import Spinner from '../ui/Spinner'
import { useAuth } from '../../context/AuthContext'
import { useClientTheme } from '../../theme/ThemeContext'

/**
 * Admin editor for transactional email subject/body templates.
 * Placeholders use {{key}} and are filled at send time.
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
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const selected = templates.find((t) => t.id === selectedId)

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
            rows.find((r) => r.id === 'broker_packet') ??
            rows.find((r) => r.id === 'carrier_batch_processed') ??
            rows[0]
          setSelectedId(first.id)
          setSubject(first.subject)
          setBodyHtml(first.body_html)
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
  }

  const handleSave = async () => {
    if (!selectedId) return
    setSaving(true)
    try {
      const updated = await saveEmailTemplate(
        selectedId,
        { subject, body_html: bodyHtml },
        actor
      )
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
        {/* Template list */}
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

        {/* Editor */}
        {selected ? (
          <div className="admin-email-templates__editor flex flex-col min-h-0 flex-1 gap-3">
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
              <p className="text-[11px] mt-1.5 font-mono truncate" style={{ color: c.mutedLight }}>
                {selected.placeholders}
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

            <div className="client-settings-field flex flex-col min-h-0 flex-1">
              <label className="client-label shrink-0" style={{ color: c.secondary }}>
                Body (HTML)
              </label>
              <textarea
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                className="client-input w-full flex-1 min-h-[160px] font-mono text-xs leading-relaxed resize-y"
                style={{ backgroundColor: c.card, color: c.primary }}
                spellCheck={false}
              />
            </div>

            <div
              className="shrink-0 rounded-lg border overflow-hidden"
              style={{ borderColor: c.border }}
            >
              <div
                className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide border-b"
                style={{
                  color: c.secondary,
                  borderColor: c.border,
                  backgroundColor: c.stat.slate,
                }}
              >
                Preview
              </div>
              <div
                className="text-sm p-3 overflow-auto max-h-40 prose prose-sm max-w-none"
                style={{ color: c.primary, backgroundColor: c.card }}
                // Admin-authored template preview only.
                dangerouslySetInnerHTML={{ __html: bodyHtml }}
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
            onClick={() => void handleSave()}
            disabled={saving}
            className="dashboard-btn-primary dashboard-btn-compact inline-flex items-center gap-1.5"
          >
            {saving ? <Spinner className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            Save template
          </button>
        </div>
      ) : null}
    </div>
  )
}
