import { useEffect, useRef, useState, useCallback, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Edge } from '@xyflow/react'
import { Bookmark, Check, Plus, Trash2, X } from 'lucide-react'
import type { BlueprintFlowNode, BlueprintNodeData } from '../../types/blueprintGraph'
import { BLUEPRINT_NODE_KIND_LABELS } from '../../types/blueprintGraph'
import {
  TRIGGER_SUBJECT_OPTIONS,
  actionsForSubject,
  eventsForSubject,
  findEvent,
  findWaitUntil,
  formatCatalogCardLine,
  lookupActionById,
  waitUntilForSubject,
  type BlueprintSubject,
} from './blueprintCatalog'
import {
  getActionIds,
  patchFromActionIds,
  patchFromCatalogOption,
  resolveSubjectForNode,
  subjectLabel,
} from './blueprintSubject'
import { upsertCardByName } from './blueprintCardLibrary'
import {
  channelLabel,
  defaultTaskConfig,
  getActionSetup,
  isActionConfigurable,
  isTaskReady,
  resolveFromEmailsList,
  taskSetupHint,
  type BlueprintDeliveryChannel,
  type BlueprintFromMailbox,
} from './blueprintActionSetup'
import {
  EMAIL_MAILBOXES,
  isValidMailboxEmail,
  listBlueprintFromOptions,
  type EmailMailboxSettings,
} from '../../config/emailMailboxes'
import {
  applyEmailMailboxes,
  loadEmailMailboxes,
  saveEmailMailboxes,
} from '../../services/platformSettingsService'
import { useRevealMissingSetup } from './blueprintSetupUi'
import {
  compileBlueprintIndex,
  defaultTriggerFilters,
  getTriggerEntry,
  INVOICE_TRIGGER_STATUS_OPTIONS,
  normalizeTriggerFilters,
  type BlueprintInvoiceTriggerStatus,
  type BlueprintTriggerEntry,
  type BlueprintTriggerFilters,
} from './blueprintTriggerFilters'
import {
  formatWhenCardLine,
  normalizeWhenMatch,
  whenMatchSwitchLabels,
} from './blueprintWhenMatch'
import { listEmailTemplates } from '../../services/emailTemplateService'
import type { EmailTemplateRow } from '../../types/emailTemplate'
import type { EmailTemplateId } from '../../config/emailTemplateDefaults'
import { getEmailPreviewSampleData } from '../../config/emailPreviewSampleData'
import {
  enrichEmailTemplateData,
  renderEmailTemplateString,
} from '../../utils/emailTemplateRender'
import { ensureCredyxEmailShell } from '../../config/emailLayouts'

const SIDE_WIDTH_KEY = 'credyx.blueprints.sideWidth'
const SIDE_WIDTH_MIN = 260
const SIDE_WIDTH_MAX = 560
const SIDE_WIDTH_DEFAULT = 280

const INVOICE_STATUS_HELP: Record<BlueprintInvoiceTriggerStatus, string> = {
  pending: 'Still waiting to be verified or invoiced to the broker.',
  review: 'Credyx is looking at this invoice (docs, holds, or questions).',
  approved: 'Paperwork is good and the invoice can be chased for payment.',
  hold: 'Something is blocking progress — missing docs, dispute, or a broker issue.',
  write_off_pending: 'Staff is considering writing this off — rare chase cases only.',
}

function FilterInfoTip({ text }: { text: string }) {
  return (
    <span className="bp-side__info">
      <button
        type="button"
        className="bp-side__info-btn"
        aria-label="More detail"
        onClick={(e) => e.preventDefault()}
      >
        !
      </button>
      <span className="bp-side__info-tip" role="tooltip">
        {text}
      </span>
    </span>
  )
}

function FilterLabel({
  children,
  tip,
}: {
  children: ReactNode
  tip: string
}) {
  return (
    <span className="bp-side__filter-label">
      <span>{children}</span>
      <FilterInfoTip text={tip} />
    </span>
  )
}

function readStoredSideWidth(): number {
  try {
    const raw = localStorage.getItem(SIDE_WIDTH_KEY)
    const n = raw ? Number(raw) : SIDE_WIDTH_DEFAULT
    if (!Number.isFinite(n)) return SIDE_WIDTH_DEFAULT
    return Math.min(SIDE_WIDTH_MAX, Math.max(SIDE_WIDTH_MIN, n))
  } catch {
    return SIDE_WIDTH_DEFAULT
  }
}

interface BlueprintSidePanelProps {
  node: BlueprintFlowNode | null
  nodes: BlueprintFlowNode[]
  edges: Edge[]
  onChange: (nodeId: string, patch: Partial<BlueprintNodeData>) => void
  onClose: () => void
}

export default function BlueprintSidePanel({
  node,
  nodes,
  edges,
  onChange,
  onClose,
}: BlueprintSidePanelProps) {
  const [saveFlash, setSaveFlash] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [expandedTask, setExpandedTask] = useState<string | null>(null)
  const [templates, setTemplates] = useState<EmailTemplateRow[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [showFullTemplate, setShowFullTemplate] = useState(false)
  const [sideWidth, setSideWidth] = useState(readStoredSideWidth)
  const [mailboxes, setMailboxes] = useState<EmailMailboxSettings>(() => ({
    ...EMAIL_MAILBOXES,
  }))
  const [newFromEmail, setNewFromEmail] = useState('')
  const [fromBusy, setFromBusy] = useState(false)
  const revealMissing = useRevealMissingSetup()
  const addMenuRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startW: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    void loadEmailMailboxes().then((m) => {
      if (!cancelled) setMailboxes(m)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const onResizePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startW: sideWidth }
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)

    const onMove = (ev: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      // Dragging left edge: move left → wider panel
      const next = Math.min(
        SIDE_WIDTH_MAX,
        Math.max(SIDE_WIDTH_MIN, drag.startW + (drag.startX - ev.clientX))
      )
      setSideWidth(next)
    }
    const onUp = (ev: PointerEvent) => {
      dragRef.current = null
      target.releasePointerCapture(ev.pointerId)
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
      setSideWidth((w) => {
        try {
          localStorage.setItem(SIDE_WIDTH_KEY, String(w))
        } catch {
          /* ignore */
        }
        return w
      })
    }
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
    target.addEventListener('pointercancel', onUp)
  }, [sideWidth])

  const resizeHandle = (
    <div
      className="bp-side__resize"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize editor panel"
      title="Drag to resize"
      onPointerDown={onResizePointerDown}
    />
  )

  useEffect(() => {
    setAddOpen(false)
    setExpandedTask(null)
    setShowFullTemplate(false)
  }, [node?.id])

  const openTemplateId =
    expandedTask && node
      ? node.data.actionConfigs?.[expandedTask]?.templateId ?? ''
      : ''

  useEffect(() => {
    setShowFullTemplate(false)
  }, [expandedTask, openTemplateId])

  useEffect(() => {
    if (!showFullTemplate) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowFullTemplate(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showFullTemplate])

  useEffect(() => {
    if (!addOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!addMenuRef.current?.contains(e.target as Node)) setAddOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [addOpen])

  useEffect(() => {
    if (!expandedTask) return
    const setup = getActionSetup(expandedTask)
    if (!setup.needsTemplate) return
    let cancelled = false
    setTemplatesLoading(true)
    listEmailTemplates()
      .then((rows) => {
        if (cancelled) return
        const allowed = new Set(setup.templateAudiences)
        setTemplates(
          rows.filter(
            (t) => t.audience !== 'auth' && (allowed.size === 0 || allowed.has(t.audience))
          )
        )
      })
      .catch(() => {
        if (!cancelled) setTemplates([])
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [expandedTask])

  if (!node) {
    return (
      <div className="bp-side-wrap" style={{ ['--bp-side-w' as string]: `${sideWidth}px` }}>
        {resizeHandle}
        <aside className="bp-side">
          <div className="bp-side__empty">
            <p>Click a box to edit it.</p>
            <p className="bp-side__hint">
              Then do cards can hold several tasks. Use Saved cards in the toolbar to reuse them.
            </p>
          </div>
        </aside>
      </div>
    )
  }

  const { data } = node
  const kind = data.kind
  const subject = resolveSubjectForNode(node.id, nodes, edges)
  const waitOptions = waitUntilForSubject(subject)
  const eventOptions = eventsForSubject(subject)
  const actionOptions = actionsForSubject(subject)
  const selectedWait = findWaitUntil(subject, data.waitUntilId)
  const selectedEvent = findEvent(subject, data.checkId)
  const actionIds = getActionIds(data)
  const editingAction = expandedTask ? lookupActionById(expandedTask) : null
  const editingSetup = expandedTask ? getActionSetup(expandedTask) : null
  const editingCfg =
    expandedTask != null
      ? (data.actionConfigs?.[expandedTask] ?? defaultTaskConfig(expandedTask))
      : null

  const persistCard = (merged: BlueprintNodeData) => {
    const saved = upsertCardByName({
      id: merged.libraryCardId,
      name: merged.label || BLUEPRINT_NODE_KIND_LABELS[merged.kind],
      subject,
      data: merged,
    })
    if (merged.libraryCardId !== saved.id) {
      onChange(node.id, { libraryCardId: saved.id })
    }
    setSaveFlash(true)
    window.setTimeout(() => setSaveFlash(false), 1000)
  }

  const applyPatch = (patch: Partial<BlueprintNodeData>, autoSave = true) => {
    const merged = { ...data, ...patch }
    onChange(node.id, patch)
    if (autoSave) persistCard(merged)
  }

  const setActionList = (ids: string[], openId?: string) => {
    const patch = patchFromActionIds(ids, (id) => {
      const a = lookupActionById(id)
      return a
        ? { id: a.id, defaultTitle: a.defaultTitle, cardLine: a.cardLine }
        : null
    })
    const prev = data.actionConfigs ?? {}
    const nextConfigs: NonNullable<BlueprintNodeData['actionConfigs']> = {}
    for (const id of ids) {
      nextConfigs[id] = prev[id] ?? defaultTaskConfig(id)
    }
    applyPatch({ ...patch, actionConfigs: nextConfigs }, true)
    if (openId && isActionConfigurable(openId)) setExpandedTask(openId)
  }

  const updateTaskConfig = (
    actionId: string,
    patch: Partial<{
      message: string
      channel: BlueprintDeliveryChannel
      templateId: string
      fromMailbox: BlueprintFromMailbox | ''
      fromEmail: string
      fromEmails: string[]
    }>
  ) => {
    const current = data.actionConfigs?.[actionId] ?? defaultTaskConfig(actionId)
    applyPatch({
      actionConfigs: {
        ...(data.actionConfigs ?? {}),
        [actionId]: { ...current, ...patch },
      },
    })
  }

  const fromOptions = listBlueprintFromOptions(mailboxes)
  const selectedFromEmails = resolveFromEmailsList(editingCfg, {
    billing: mailboxes.billingEmail,
    ops: mailboxes.opsEmail,
    admin: mailboxes.adminEmail,
    notifications: mailboxes.notificationsEmail,
  })

  const setFromEmailsOrdered = (emails: string[]) => {
    if (!expandedTask) return
    const cleaned = emails.map((e) => e.trim().toLowerCase()).filter(Boolean)
    const unique: string[] = []
    const seen = new Set<string>()
    for (const e of cleaned) {
      if (seen.has(e)) continue
      seen.add(e)
      unique.push(e)
    }
    const next = unique.length ? unique : [mailboxes.billingEmail.toLowerCase()]
    updateTaskConfig(expandedTask, {
      fromEmails: next,
      fromEmail: next[0] ?? '',
      fromMailbox: '',
    })
  }

  const toggleFromEmail = (email: string) => {
    const key = email.trim().toLowerCase()
    if (!key) return
    if (selectedFromEmails.includes(key)) {
      setFromEmailsOrdered(selectedFromEmails.filter((e) => e !== key))
      return
    }
    setFromEmailsOrdered([...selectedFromEmails, key])
  }

  const persistExtraFrom = async (nextExtras: string[]) => {
    setFromBusy(true)
    try {
      const next = await saveEmailMailboxes({
        ...mailboxes,
        extraFromEmails: nextExtras,
      })
      applyEmailMailboxes(next)
      setMailboxes(next)
      return next
    } finally {
      setFromBusy(false)
    }
  }

  const handleAddFromEmail = async () => {
    const email = newFromEmail.trim().toLowerCase()
    if (!isValidMailboxEmail(email)) return
    if (!email.endsWith('@credyx.net')) {
      window.alert('Use a @credyx.net address (must be verified in Resend).')
      return
    }
    const extras = [...mailboxes.extraFromEmails]
    const alreadyListed =
      extras.some((e) => e.toLowerCase() === email) ||
      fromOptions.some((o) => o.email.toLowerCase() === email)
    if (!alreadyListed) {
      extras.push(email)
      await persistExtraFrom(extras)
    }
    setNewFromEmail('')
    if (!selectedFromEmails.includes(email)) {
      setFromEmailsOrdered([...selectedFromEmails, email])
    }
  }

  const handleRemoveFromEmail = async (email: string) => {
    const key = email.toLowerCase()
    const nextExtras = mailboxes.extraFromEmails.filter(
      (e) => e.toLowerCase() !== key
    )
    await persistExtraFrom(nextExtras)
    if (selectedFromEmails.includes(key)) {
      setFromEmailsOrdered(selectedFromEmails.filter((e) => e !== key))
    }
  }

  const selectedTemplate =
    editingCfg?.templateId
      ? templates.find((t) => t.id === editingCfg.templateId) ?? null
      : null
  const previewText =
    selectedTemplate?.subject?.trim() ||
    editingCfg?.message?.trim() ||
    '…'
  const fullTemplatePreview = (() => {
    if (!selectedTemplate) return null
    const id = selectedTemplate.id as EmailTemplateId
    const sample = getEmailPreviewSampleData(id)
    const data = enrichEmailTemplateData(id, sample)
    return {
      subject: renderEmailTemplateString(selectedTemplate.subject, data),
      html: renderEmailTemplateString(
        ensureCredyxEmailShell(selectedTemplate.body_html, selectedTemplate.id),
        data
      ),
    }
  })()

  return (
    <div
      className={`bp-side-wrap${expandedTask ? ' bp-side-wrap--task-open' : ''}`}
      style={{ ['--bp-side-w' as string]: `${sideWidth}px` }}
    >
      {resizeHandle}
      {expandedTask && editingSetup && editingCfg ? (
        <aside className="bp-task-panel" aria-label="Task setup">
          <div className="bp-task-panel__head">
            <div>
              <div className="bp-task-panel__kind">Task setup</div>
              <h3 className="bp-task-panel__title">{editingAction?.label ?? expandedTask}</h3>
            </div>
            <button
              type="button"
              className="bp-side__close"
              aria-label="Close task setup"
              onClick={() => setExpandedTask(null)}
            >
              <X size={16} aria-hidden />
            </button>
          </div>

          <div className="bp-side__task-setup">
            {editingSetup.needsTemplate ? (
              <label className="bp-side__field">
                <span>Template (from Settings)</span>
                <select
                  value={editingCfg.templateId ?? ''}
                  disabled={templatesLoading}
                  onChange={(e) =>
                    updateTaskConfig(expandedTask, { templateId: e.target.value })
                  }
                >
                  <option value="">
                    {templatesLoading ? 'Loading templates…' : 'Choose a template…'}
                  </option>
                  {editingCfg.templateId &&
                  !templates.some((t) => t.id === editingCfg.templateId) ? (
                    <option value={editingCfg.templateId}>
                      {editingCfg.templateId} (saved)
                    </option>
                  ) : null}
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {selectedTemplate?.description ? (
                  <span className="bp-side__help">{selectedTemplate.description}</span>
                ) : (
                  <span className="bp-side__help">
                    Uses templates from Settings → Templates. Edit content there.
                  </span>
                )}
              </label>
            ) : null}

            {expandedTask === 'email_broker_packet' ? (
              <p className="bp-side__help">
                Sends the real broker paperwork packet (invoice docs + vault
                attachments), same path as Process / Send docs — not a template-only
                email.
              </p>
            ) : null}

            {editingSetup.needsFrom ? (
              <div className="bp-side__field">
                <span>From / CC</span>
                <div className="bp-side__from-chips" role="group" aria-label="Mailbox options">
                  {fromOptions.map((o) => {
                    const key = o.email.toLowerCase()
                    const selected = selectedFromEmails.includes(key)
                    const isFrom = selected && selectedFromEmails[0] === key
                    return (
                      <button
                        key={o.email}
                        type="button"
                        className={`bp-side__from-chip${selected ? ' is-selected' : ''}${isFrom ? ' is-from' : ''}`}
                        aria-pressed={selected}
                        title={
                          isFrom
                            ? `From · ${o.email}`
                            : selected
                              ? `CC · ${o.email}`
                              : o.email
                        }
                        onClick={() => toggleFromEmail(o.email)}
                      >
                        <span className="bp-side__from-chip-check" aria-hidden>
                          {selected ? <Check size={11} /> : null}
                        </span>
                        <span className="bp-side__from-chip-email">{o.email}</span>
                        {isFrom ? <span className="bp-side__from-chip-tag">From</span> : null}
                        {selected && !isFrom ? (
                          <span className="bp-side__from-chip-tag bp-side__from-chip-tag--cc">
                            CC
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                  {selectedFromEmails
                    .filter(
                      (e) => !fromOptions.some((o) => o.email.toLowerCase() === e)
                    )
                    .map((email) => {
                      const isFrom = selectedFromEmails[0] === email
                      return (
                        <button
                          key={email}
                          type="button"
                          className={`bp-side__from-chip is-selected${isFrom ? ' is-from' : ''}`}
                          aria-pressed
                          title={email}
                          onClick={() => toggleFromEmail(email)}
                        >
                          <span className="bp-side__from-chip-check" aria-hidden>
                            <Check size={11} />
                          </span>
                          <span className="bp-side__from-chip-email">{email}</span>
                          {isFrom ? (
                            <span className="bp-side__from-chip-tag">From</span>
                          ) : (
                            <span className="bp-side__from-chip-tag bp-side__from-chip-tag--cc">
                              CC
                            </span>
                          )}
                        </button>
                      )
                    })}
                </div>
                <div className="bp-side__from-add">
                  <input
                    type="email"
                    value={newFromEmail}
                    placeholder="add@credyx.net"
                    disabled={fromBusy}
                    onChange={(e) => setNewFromEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void handleAddFromEmail()
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="bp-side__mini-btn"
                    disabled={fromBusy || !newFromEmail.trim()}
                    onClick={() => void handleAddFromEmail()}
                  >
                    Add
                  </button>
                </div>
                {mailboxes.extraFromEmails.length > 0 ? (
                  <ul className="bp-side__from-list">
                    {mailboxes.extraFromEmails.map((email) => (
                      <li key={email}>
                        <span className="bp-side__from-addr">{email}</span>
                        <button
                          type="button"
                          className="bp-side__mini-btn bp-side__mini-btn--danger"
                          disabled={fromBusy}
                          aria-label={`Remove ${email} from extras`}
                          onClick={() => void handleRemoveFromEmail(email)}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <span className="bp-side__help">
                  First pick is From; more picks go on CC. Extras must be verified in Resend.
                </span>
              </div>
            ) : null}

            {editingSetup.needsMessage ? (
              <label className="bp-side__field">
                <span>{editingSetup.messageLabel}</span>
                <textarea
                  value={editingCfg.message}
                  placeholder={editingSetup.messagePlaceholder}
                  rows={editingSetup.needsTemplate ? 3 : 4}
                  onChange={(e) =>
                    updateTaskConfig(expandedTask, { message: e.target.value })
                  }
                />
                <span className="bp-side__help">
                  Quoted fields fill in on the note: "broker-email", "broker-name",
                  "invoice-number", "load-number". "broker-email" is the address the
                  email went to. A custom Send to from Actions is used instead.
                </span>
              </label>
            ) : null}

            {editingSetup.needsChannel ? (
              <fieldset className="bp-side__channel">
                <legend>Send via</legend>
                {(
                  [
                    ['email', 'Email only'],
                    ['app', 'App only'],
                    ['both', 'Email + app'],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="bp-side__channel-opt">
                    <input
                      type="radio"
                      name={`channel-${expandedTask}`}
                      checked={editingCfg.channel === value}
                      onChange={() =>
                        updateTaskConfig(expandedTask, { channel: value })
                      }
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
            ) : null}

            {editingSetup.needsMessage || editingSetup.needsTemplate ? (
              <div className="bp-side__preview-card">
                <div className="bp-side__preview-label-row">
                  <div className="bp-side__preview-label">How it looks</div>
                  {selectedTemplate ? (
                    <button
                      type="button"
                      className="bp-side__preview-toggle"
                      onClick={() => setShowFullTemplate(true)}
                    >
                      Show full template
                    </button>
                  ) : null}
                </div>
                {selectedTemplate ? (
                  <>
                    <div className="bp-side__preview-meta">
                      Template · {selectedTemplate.name}
                    </div>
                    <div className="bp-side__preview-body">
                      {fullTemplatePreview?.subject || previewText}
                    </div>
                    {editingCfg.message.trim() ? (
                      <div className="bp-side__preview-body bp-side__preview-body--note">
                        Note: {editingCfg.message.trim()}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="bp-side__preview-body">{previewText}</div>
                )}
                {editingSetup.needsChannel ? (
                  <div className="bp-side__preview-meta">
                    {channelLabel(editingCfg.channel)}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </aside>
      ) : null}

      <aside className="bp-side">
      <div className="bp-side__head">
        <div>
          <div className="bp-side__kind">{BLUEPRINT_NODE_KIND_LABELS[kind]}</div>
          <h2 className="bp-side__title">Edit this step</h2>
        </div>
        <button type="button" className="bp-side__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="bp-side__title-row">
        <label className="bp-side__field bp-side__field--grow">
          <span>Title</span>
          <input
            type="text"
            value={data.label}
            onChange={(e) => applyPatch({ label: e.target.value })}
            placeholder="Name this card"
          />
        </label>
        <button
          type="button"
          className={`bp-side__save-icon${saveFlash ? ' bp-side__save-icon--ok' : ''}`}
          title="Save card"
          aria-label="Save card"
          onClick={() => persistCard(data)}
        >
          <Bookmark size={16} aria-hidden />
        </button>
      </div>

      {kind === 'trigger' && (
        <>
          <label className="bp-side__field">
            <span>Who does this apply to?</span>
            <select
              value={data.triggerSubject ?? 'invoices'}
              onChange={(e) => {
                const next = e.target.value as BlueprintSubject
                const opt = TRIGGER_SUBJECT_OPTIONS.find((o) => o.id === next)
                const filters = normalizeTriggerFilters(data.triggerFilters)
                applyPatch({
                  triggerSubject: next,
                  label: opt?.title ?? data.label,
                  triggerFilters: filters,
                  triggerEntry: getTriggerEntry(data),
                })
              }}
            >
              {TRIGGER_SUBJECT_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="bp-side__channel">
            <legend>How do they enter?</legend>
            {(
              [
                [
                  'filter',
                  'Match filters',
                  'Start with invoices, brokers, or batches that already match your rules below. Good for scheduled chase: Credyx looks for records that fit, then follows Wait / When / Then do.',
                ],
                [
                  'event',
                  'When an event happens',
                  'Start when something happens in Credyx (for example an invoice goes on hold, a broker is added, or a batch is processed). The filters below are still an optional gate.',
                ],
              ] as const
            ).map(([value, label, tip]) => (
              <label key={value} className="bp-side__channel-opt">
                <input
                  type="radio"
                  name="trigger-entry"
                  checked={getTriggerEntry(data) === value}
                  onChange={() => {
                    const entry = value as BlueprintTriggerEntry
                    const subject = data.triggerSubject ?? 'invoices'
                    const opt = TRIGGER_SUBJECT_OPTIONS.find((o) => o.id === subject)
                    applyPatch({
                      triggerEntry: entry,
                      label:
                        entry === 'event'
                          ? subject === 'brokers'
                            ? 'When a broker event happens'
                            : subject === 'batches'
                              ? 'When a batch event happens'
                              : 'When an invoice event happens'
                          : opt?.title ?? data.label,
                    })
                  }}
                />
                <FilterLabel tip={tip}>{label}</FilterLabel>
              </label>
            ))}
          </fieldset>

          <p className="bp-side__help">
            Only matching records enter this blueprint — not every open invoice, broker, or batch in
            the system.
          </p>

          {(() => {
            const subjectKey =
              data.triggerSubject === 'brokers' || data.triggerSubject === 'batches'
                ? data.triggerSubject
                : 'invoices'
            const filters = normalizeTriggerFilters(
              data.triggerFilters ?? defaultTriggerFilters()
            )
            const patchFilters = (next: BlueprintTriggerFilters) => {
              applyPatch({ triggerFilters: next })
            }

            if (subjectKey === 'invoices') {
              const inv = filters.invoices
              return (
                <div className="bp-side__filters">
                  <div className="bp-side__filters-head">
                    <div className="bp-side__todos-label">Which invoices?</div>
                    <FilterInfoTip text="These rules decide which invoices can enter this blueprint. An invoice must match every rule you turn on — not every open invoice in Credyx." />
                  </div>
                  <p className="bp-side__help">
                    Think of this as a gate: only invoices that pass these checks start the chain.
                  </p>
                  <label className="bp-side__channel-opt">
                    <input
                      type="checkbox"
                      checked={inv.openOnly}
                      onChange={(e) =>
                        patchFilters({
                          ...filters,
                          invoices: { ...inv, openOnly: e.target.checked },
                        })
                      }
                    />
                    <FilterLabel tip="Skip invoices that are already paid, force-closed, or written off. Leave this on for payment chase so you only touch money still owed.">
                      Still unpaid (not paid or closed)
                    </FilterLabel>
                  </label>
                  <div className="bp-side__filter-group">
                    <span className="bp-side__filter-group-label">
                      <FilterLabel tip="Pick the invoice statuses this blueprint cares about. Uncheck anything you do not want in this flow. At least one status stays selected.">
                        Invoice status
                      </FilterLabel>
                    </span>
                    {INVOICE_TRIGGER_STATUS_OPTIONS.map((opt) => {
                      const checked = inv.statuses.includes(opt.id)
                      return (
                        <label key={opt.id} className="bp-side__channel-opt">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const statuses: BlueprintInvoiceTriggerStatus[] = checked
                                ? inv.statuses.filter((s) => s !== opt.id)
                                : [...inv.statuses, opt.id]
                              patchFilters({
                                ...filters,
                                invoices: {
                                  ...inv,
                                  statuses:
                                    statuses.length > 0
                                      ? statuses
                                      : defaultTriggerFilters().invoices.statuses,
                                },
                              })
                            }}
                          />
                          <FilterLabel tip={INVOICE_STATUS_HELP[opt.id]}>
                            {opt.label}
                          </FilterLabel>
                        </label>
                      )
                    })}
                  </div>
                  <label className="bp-side__field">
                    <span>
                      <FilterLabel tip="How many days after the due date before this blueprint can start. Example: 15 means only invoices that are at least 15 days late. Leave blank to ignore past-due age.">
                        Days past due (optional)
                      </FilterLabel>
                    </span>
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={inv.minDaysPastDue}
                      placeholder="e.g. 15 — blank = any age"
                      onChange={(e) =>
                        patchFilters({
                          ...filters,
                          invoices: { ...inv, minDaysPastDue: e.target.value },
                        })
                      }
                    />
                  </label>
                </div>
              )
            }

            if (subjectKey === 'batches') {
              const ba = filters.batches
              return (
                <div className="bp-side__filters">
                  <div className="bp-side__filters-head">
                    <div className="bp-side__todos-label">Which batches?</div>
                    <FilterInfoTip text="Optional gate after a batch event — usually keep submitted only for Process workflows." />
                  </div>
                  <p className="bp-side__help">
                    Only batches that pass these checks continue the chain.
                  </p>
                  <label className="bp-side__channel-opt">
                    <input
                      type="checkbox"
                      checked={ba.submittedOnly}
                      onChange={(e) =>
                        patchFilters({
                          ...filters,
                          batches: { ...ba, submittedOnly: e.target.checked },
                        })
                      }
                    />
                    <FilterLabel tip="After Process, batches are submitted. Leave on so this flow only runs on processed batches.">
                      Submitted (processed) only
                    </FilterLabel>
                  </label>
                </div>
              )
            }

            const br = filters.brokers
            return (
              <div className="bp-side__filters">
                <div className="bp-side__filters-head">
                  <div className="bp-side__todos-label">Which brokers?</div>
                  <FilterInfoTip text="These rules decide which brokers can enter this blueprint — not every broker in Credyx." />
                </div>
                <p className="bp-side__help">
                  Only brokers that pass these checks start the chain.
                </p>
                <label className="bp-side__channel-opt">
                  <input
                    type="checkbox"
                    checked={br.activeOnly}
                    onChange={(e) =>
                      patchFilters({
                        ...filters,
                        brokers: { ...br, activeOnly: e.target.checked },
                      })
                    }
                  />
                  <FilterLabel tip="Skip inactive or archived brokers so this flow only runs on brokers you still work with.">
                    Active brokers only
                  </FilterLabel>
                </label>
                <label className="bp-side__field">
                  <span>
                    <FilterLabel tip="How many days with no confirmed payment before this broker can enter. Example: 30 means only brokers with no payment for at least 30 days. Leave blank to ignore.">
                      Days with no payment (optional)
                    </FilterLabel>
                  </span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={br.minDaysNoPayment}
                    placeholder="e.g. 30 — blank = any"
                    onChange={(e) =>
                      patchFilters({
                        ...filters,
                        brokers: { ...br, minDaysNoPayment: e.target.value },
                      })
                    }
                  />
                </label>
              </div>
            )
          })()}
        </>
      )}

      {kind === 'wait' && (
        <>
          {!subject ? (
            <p className="bp-side__warn">
              Connect this box to a <strong>Start with</strong> step so we know broker vs invoice
              vs batch clocks.
            </p>
          ) : (
            <p className="bp-side__context">Wait clocks for: {subjectLabel(subject)}</p>
          )}

          <label className="bp-side__field">
            <span>Wait until…</span>
            <select
              value={data.waitUntilId ?? ''}
              disabled={!subject || waitOptions.length === 0}
              onChange={(e) => {
                const id = e.target.value
                const opt = waitOptions.find((c) => c.id === id)
                if (!opt) {
                  applyPatch({ waitUntilId: '', days: '', fieldKey: '' })
                  return
                }
                applyPatch(patchFromCatalogOption('waitUntilId', id, opt, opt.defaultDays))
              }}
            >
              <option value="">Choose…</option>
              {waitOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          {selectedWait?.help ? <p className="bp-side__help">{selectedWait.help}</p> : null}

          {selectedWait?.needsDays ? (
            <>
              {selectedWait.id === 'pause_days' ? (
                <label className="bp-side__field">
                  <span>Unit</span>
                  <select
                    value={data.waitUnit || 'days'}
                    onChange={(e) => {
                      const waitUnit = e.target.value as 'days' | 'hours' | 'minutes'
                      const days = data.days ?? selectedWait.defaultDays ?? '3'
                      applyPatch({
                        waitUnit,
                        days,
                        fieldKey: formatCatalogCardLine(selectedWait, days, waitUnit),
                      })
                    }}
                  >
                    <option value="days">Days</option>
                    <option value="hours">Hours</option>
                    <option value="minutes">Minutes</option>
                  </select>
                  <span className="bp-side__help">
                    Hours/minutes wake sooner (good for testing). Days still use ~9:00 local.
                  </span>
                </label>
              ) : null}
              <label className="bp-side__field">
                <span>{selectedWait.daysHint ?? 'How long?'}</span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={data.days ?? ''}
                  placeholder={selectedWait.defaultDays ?? '15'}
                  onChange={(e) => {
                    const days = e.target.value
                    applyPatch({
                      days,
                      fieldKey: formatCatalogCardLine(
                        selectedWait,
                        days,
                        data.waitUnit
                      ),
                    })
                  }}
                />
              </label>
            </>
          ) : null}
        </>
      )}

      {(kind === 'if' || kind === 'elseif') && (
        <>
          {!subject ? (
            <p className="bp-side__warn">
              Connect this box back to a <strong>Start with</strong> step so we know which events to
              show.
            </p>
          ) : (
            <p className="bp-side__context">
              What to check? (for {subjectLabel(subject)}) Use the switch for the opposite case
              (e.g. on hold ↔ removed from hold).
            </p>
          )}

          <label className="bp-side__field">
            <span>Event</span>
            <select
              value={data.checkId ?? ''}
              disabled={!subject || eventOptions.length === 0}
              onChange={(e) => {
                const id = e.target.value
                const opt = eventOptions.find((c) => c.id === id)
                if (!opt) {
                  applyPatch({ checkId: '', fieldKey: '', fieldValue: '', whenMatch: 'yes' })
                  return
                }
                applyPatch({
                  ...patchFromCatalogOption('checkId', id, opt, opt.defaultDays),
                  whenMatch: data.whenMatch === 'no' ? 'no' : 'yes',
                })
              }}
            >
              <option value="">Choose…</option>
              {eventOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          {data.checkId ? (
            <div className="bp-side__match-switch" role="group" aria-label="If true or false">
              <span className="bp-side__match-switch-label">Match when</span>
              <div className="bp-side__match-switch-rows">
                {(['yes', 'no'] as const).map((value) => {
                  const labels = whenMatchSwitchLabels(data.checkId)
                  const text = value === 'yes' ? labels.yes : labels.no
                  const on = normalizeWhenMatch(data) === value
                  return (
                    <button
                      key={value}
                      type="button"
                      className={`bp-side__match-opt${on ? ' bp-side__match-opt--on' : ''}${value === 'no' ? ' bp-side__match-opt--no' : ''}`}
                      aria-pressed={on}
                      onClick={() =>
                        applyPatch({
                          whenMatch: value,
                          fieldKey: formatWhenCardLine({
                            ...data,
                            whenMatch: value,
                          }),
                        })
                      }
                    >
                      <span className="bp-side__match-opt-tag">
                        {value === 'yes' ? 'True' : 'False'}
                      </span>
                      {text}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          {selectedEvent?.needsDays ? (
            <label className="bp-side__field">
              <span>{selectedEvent.daysHint ?? 'How many days?'}</span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={data.fieldValue ?? ''}
                placeholder={selectedEvent.defaultDays ?? '15'}
                onChange={(e) => {
                  const days = e.target.value
                  applyPatch({
                    fieldValue: days,
                    fieldKey: formatCatalogCardLine(selectedEvent, days),
                  })
                }}
              />
            </label>
          ) : null}
        </>
      )}

      {(kind === 'branch_true' || kind === 'branch_false') && (
        <p className="bp-side__context">
          Legacy True/False card — prefer a When with the True/False switch instead. Still works if
          already connected.
        </p>
      )}

      {kind === 'action' && (
        <>
          {!subject ? (
            <p className="bp-side__warn">
              Connect this box back to a <strong>Start with</strong> step so we know which tasks to
              show.
            </p>
          ) : (
            <p className="bp-side__context">Tasks for {subjectLabel(subject)}</p>
          )}

          <div className="bp-side__todos">
            <div className="bp-side__todos-head">
              <div className="bp-side__todos-label">To-do list</div>
              <div className="bp-side__add-wrap" ref={addMenuRef}>
                <button
                  type="button"
                  className="bp-side__add-plus"
                  aria-label="Add a task"
                  title="Add a task"
                  disabled={!subject || actionOptions.length === 0}
                  onClick={() => setAddOpen((v) => !v)}
                >
                  <Plus size={16} aria-hidden />
                </button>
                {addOpen ? (
                  <div className="bp-side__add-menu" role="menu">
                    {actionOptions.map((a) => {
                      const taken = actionIds.includes(a.id)
                      return (
                        <button
                          key={a.id}
                          type="button"
                          role="menuitem"
                          className="bp-side__add-menu-item"
                          disabled={taken}
                          onClick={() => {
                            if (taken) return
                            setAddOpen(false)
                            setActionList([...actionIds, a.id], a.id)
                          }}
                        >
                          {a.label}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            </div>

            {actionIds.length === 0 ? (
              <p className="bp-side__hint">No tasks yet — tap + to add one.</p>
            ) : (
              <ul className="bp-side__todo-list">
                {actionIds.map((id, index) => {
                  const action = lookupActionById(id)
                  const configurable = isActionConfigurable(id)
                  const open = expandedTask === id
                  const cfg = data.actionConfigs?.[id] ?? defaultTaskConfig(id)
                  const ready = isTaskReady(id, cfg)
                  const missing = !ready && revealMissing
                  return (
                    <li
                      key={`${id}-${index}`}
                      className={`bp-side__todo-item${open ? ' bp-side__todo-item--open' : ''}${
                        missing ? ' bp-side__todo-item--missing' : ''
                      }${ready ? ' bp-side__todo-item--ready' : ''}`}
                    >
                      <div className="bp-side__todo-row">
                        <button
                          type="button"
                          className="bp-side__todo-main"
                          disabled={!configurable}
                          onClick={() =>
                            configurable &&
                            setExpandedTask((cur) => (cur === id ? null : id))
                          }
                        >
                          <span
                            className={`bp-side__todo-status${
                              ready
                                ? ' bp-side__todo-status--ready'
                                : missing
                                  ? ' bp-side__todo-status--missing'
                                  : ''
                            }`}
                            title={
                              ready
                                ? 'Set up'
                                : missing
                                  ? taskSetupHint(id)
                                  : 'Not set up yet'
                            }
                            aria-hidden
                          >
                            {ready ? (
                              <Check size={12} strokeWidth={3} />
                            ) : missing ? (
                              <X size={12} strokeWidth={3} />
                            ) : null}
                          </span>
                          <span className="bp-side__todo-name">
                            {action?.label ?? id}
                            {missing ? (
                              <span className="bp-side__todo-missing-hint">
                                {taskSetupHint(id)}
                              </span>
                            ) : null}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="bp-side__todo-remove"
                          aria-label="Remove task"
                          onClick={() => {
                            if (expandedTask === id) setExpandedTask(null)
                            setActionList(actionIds.filter((_, i) => i !== index))
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </>
      )}

      {(() => {
        const index = compileBlueprintIndex(nodes, edges)
        if (index.waits.length === 0 && index.events.length === 0) return null
        return (
          <div className="bp-side__compile">
            <div className="bp-side__todos-label">Compiled index (preview)</div>
            <p className="bp-side__help">
              A future runner would index clocks and events — not scan every record against every
              blueprint.
            </p>
            {index.waits.length > 0 ? (
              <div className="bp-side__compile-block">
                <div className="bp-side__compile-heading">Wait until → wake when</div>
                <ul className="bp-side__compile-list">
                  {index.waits.map((w) => (
                    <li key={w.nodeId}>
                      <strong>{w.title}</strong>
                      <span>{w.line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {index.events.length > 0 ? (
              <div className="bp-side__compile-block">
                <div className="bp-side__compile-heading">When → subscribe to</div>
                <ul className="bp-side__compile-list">
                  {index.events.map((ev) => (
                    <li key={ev.nodeId}>
                      <strong>{ev.title}</strong>
                      <span>{ev.line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )
      })()}

      <p className="bp-side__hint">Preview only — tasks are not sent for real yet.</p>
      </aside>

      {showFullTemplate && selectedTemplate && fullTemplatePreview
        ? createPortal(
            <div
              className="bp-tpl-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Full template preview"
              onClick={() => setShowFullTemplate(false)}
            >
              <div
                className="bp-tpl-modal__panel"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="bp-tpl-modal__head">
                  <div>
                    <div className="bp-tpl-modal__kind">Template preview</div>
                    <h3 className="bp-tpl-modal__title">{selectedTemplate.name}</h3>
                    <p className="bp-tpl-modal__subject">
                      Subject: {fullTemplatePreview.subject || '—'}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="bp-side__close"
                    aria-label="Close template preview"
                    onClick={() => setShowFullTemplate(false)}
                  >
                    <X size={16} aria-hidden />
                  </button>
                </div>
                <div className="bp-tpl-modal__body">
                  <iframe
                    title="Full template preview"
                    className="bp-tpl-modal__frame"
                    sandbox=""
                    srcDoc={fullTemplatePreview.html}
                  />
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  )
}
