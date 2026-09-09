/**
 * Credyx inbox: drag Outlook emails, paste replies, confirm before hold/dispute.
 */
import { useEffect, useMemo, useState } from 'react'
import { Inbox, RefreshCw } from 'lucide-react'
import { useClientTheme } from '../theme/ThemeContext'
import { useToast } from '../components/ui/ToastProvider'
import { mockInvoices } from '../data/mockInvoices'
import { getAdminUserDisplayName } from '../config/adminNav'
import { useAuth } from '../context/AuthContext'
import {
  confirmEmailReview,
  hydrateEmailInboxFromSupabase,
  ingestBrokerReply,
  listEmailReviews,
  openBrokerAccountDispute,
  reclassifyEmailReview,
  runEmailLifecycleChase,
} from '../services/emailLifecycleService'
import { upsertEmailReview } from '../data/emailInboxStore'
import type { EmailReviewItem, InboundClassification } from '../types/emailLifecycle'
import { proposedActionsForClassification } from '../utils/classifyInboundBrokerReply'
import {
  parseDroppedEmailFile,
  parseDroppedEmailText,
} from '../utils/parseDroppedEmail'
import { getInvoiceById } from '../data/mockInvoices'
import SendLifecycleEmailModal from '../components/admin/SendLifecycleEmailModal'

const CLASS_LABEL: Record<InboundClassification, string> = {
  paperwork_ok: 'Paperwork good',
  payment_ok: 'Payment status',
  negative: 'Negative',
  missing_docs: 'Missing docs / hold',
  claim: 'Claim',
  unclear: 'Unclear',
  non_response_paperwork: 'No reply — paperwork',
  non_response_payment: 'No reply — payment',
}

const STAFF_CLASSIFICATIONS: InboundClassification[] = [
  'missing_docs',
  'paperwork_ok',
  'payment_ok',
  'claim',
  'negative',
  'unclear',
]

export default function AdminEmailInbox() {
  const c = useClientTheme()
  const { showToast } = useToast()
  const { resolved } = useAuth()
  const actor = getAdminUserDisplayName(resolved.user?.email)
  const [tick, setTick] = useState(0)
  const [pasteInvoiceId, setPasteInvoiceId] = useState('')
  const [pasteFrom, setPasteFrom] = useState('')
  const [pasteSubject, setPasteSubject] = useState('')
  const [pasteBody, setPasteBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [composeInvoiceId, setComposeInvoiceId] = useState<string | null>(null)
  const [cardClass, setCardClass] = useState<Record<string, InboundClassification>>({})
  const [cardInvoice, setCardInvoice] = useState<Record<string, string>>({})

  useEffect(() => {
    void hydrateEmailInboxFromSupabase().then(() => setTick((n) => n + 1))
  }, [])

  const pending = useMemo(() => listEmailReviews('pending_review'), [tick])

  const queueParsed = async (
    fromAddress: string,
    subject: string,
    bodyText: string,
    invoiceId?: string
  ) => {
    if (!bodyText.trim() && !subject.trim()) {
      showToast('That drop had no readable email body', 'error')
      return
    }
    await ingestBrokerReply({
      invoiceId: invoiceId || pasteInvoiceId || undefined,
      fromAddress: fromAddress || 'broker@unknown',
      subject: subject || '(no subject)',
      bodyText: bodyText,
    })
    setTick((n) => n + 1)
  }

  const ingest = () => {
    if (!pasteBody.trim()) {
      showToast('Paste or drop the broker email', 'error')
      return
    }
    setBusy(true)
    void queueParsed(pasteFrom, pasteSubject, pasteBody, pasteInvoiceId || undefined)
      .then(() => {
        setPasteBody('')
        showToast('Queued for review', 'success')
      })
      .finally(() => setBusy(false))
  }

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (list.length === 0) return
    setBusy(true)
    try {
      let ok = 0
      for (const file of list) {
        try {
          const parsed = await parseDroppedEmailFile(file)
          await queueParsed(parsed.fromAddress, parsed.subject, parsed.bodyText)
          ok += 1
        } catch (err) {
          showToast(
            err instanceof Error ? `Could not read ${file.name}: ${err.message}` : 'Could not read that file',
            'error'
          )
        }
      }
      if (ok > 0) showToast(`Queued ${ok} email${ok === 1 ? '' : 's'}`, 'success')
    } finally {
      setBusy(false)
    }
  }

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const files = e.dataTransfer.files
    if (files.length > 0) {
      await handleFiles(files)
      return
    }
    const parsed = parseDroppedEmailText(
      e.dataTransfer.getData('text/plain'),
      e.dataTransfer.getData('text/html')
    )
    if (!parsed) {
      showToast('Outlook did not attach a file. Try dragging the message onto this box, or save as .eml first.', 'error')
      return
    }
    setBusy(true)
    try {
      await queueParsed(parsed.fromAddress, parsed.subject, parsed.bodyText)
      showToast('Queued for review', 'success')
    } finally {
      setBusy(false)
    }
  }

  const confirm = async (item: EmailReviewItem) => {
    const classification = cardClass[item.id] ?? item.classification
    const invoiceId = cardInvoice[item.id] || item.invoice_id || undefined
    setBusy(true)
    try {
      const result = await confirmEmailReview(item.id, {
        actorName: actor,
        classification,
        invoiceId,
        actions: proposedActionsForClassification(classification),
      })
      if (!result.ok) {
        showToast(result.error ?? 'Could not confirm', 'error')
        return
      }
      showToast('Applied', 'success')
      setTick((n) => n + 1)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="client-shell-scroll h-full min-h-0 overflow-y-auto p-5">
      <div className="p-4 space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2" style={{ color: c.primary }}>
              <Inbox className="w-5 h-5" />
              Inbox
            </h1>
            <p className="text-sm text-slate-500">
              Drop Outlook messages here. Confirm before hold, dispute, or carrier email.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void runEmailLifecycleChase()
                .then((r) => {
                  showToast(`Chase ran — ${r.sent} sent, ${r.actions} staff items`, 'success')
                  setTick((n) => n + 1)
                })
                .finally(() => setBusy(false))
            }}
          >
            <RefreshCw className="w-4 h-4" />
            Run chase clocks
          </button>
        </header>

        <section
          className={`rounded-xl border-2 border-dashed p-4 space-y-3 transition-colors duration-150 ${
            dragging ? 'bg-sky-50' : 'bg-white'
          }`}
          style={{ borderColor: dragging ? '#1684FE' : c.border }}
          onDragEnter={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
            setDragging(true)
          }}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node)) return
            setDragging(false)
          }}
          onDrop={(e) => void onDrop(e)}
        >
          <div className="text-center py-3">
            <p className="text-sm font-semibold" style={{ color: c.primary }}>
              Drag emails from Outlook onto this box
            </p>
            <p className="text-xs mt-1" style={{ color: c.secondary }}>
              Classic Outlook drops a .msg file. New Outlook: save as .eml, then drop. AI classifies
              the note; you confirm before a hold.
            </p>
            {busy ? (
              <p className="text-xs mt-2 font-medium text-[#1684FE]">Classifying…</p>
            ) : null}
            <label className="mt-2 inline-block text-sm font-medium text-[#1684FE] cursor-pointer">
              Or choose .msg / .eml files
              <input
                type="file"
                className="sr-only"
                accept=".msg,.eml,message/rfc822,application/vnd.ms-outlook"
                multiple
                onChange={(e) => {
                  if (e.target.files) void handleFiles(e.target.files)
                  e.target.value = ''
                }}
              />
            </label>
          </div>
          <select
            className="client-input w-full text-sm"
            value={pasteInvoiceId}
            onChange={(e) => setPasteInvoiceId(e.target.value)}
          >
            <option value="">Match invoice/load from the email…</option>
            {mockInvoices.slice(0, 80).map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.invoice_number} · {inv.broker_name} · {inv.client_name}
              </option>
            ))}
          </select>
          <input
            className="client-input w-full text-sm"
            placeholder="From"
            value={pasteFrom}
            onChange={(e) => setPasteFrom(e.target.value)}
          />
          <input
            className="client-input w-full text-sm"
            placeholder="Subject"
            value={pasteSubject}
            onChange={(e) => setPasteSubject(e.target.value)}
          />
          <textarea
            className="client-input w-full text-sm min-h-[88px]"
            placeholder="Or paste the email body"
            value={pasteBody}
            onChange={(e) => setPasteBody(e.target.value)}
          />
          <button type="button" className="text-sm font-medium text-[#1684FE]" onClick={ingest}>
            Classify and queue
          </button>
        </section>

        <ul className="space-y-3">
          {pending.length === 0 ? (
            <li className="text-sm text-slate-500">No items waiting for confirm.</li>
          ) : (
            pending.map((item) => {
              const classification = cardClass[item.id] ?? item.classification
              const invoiceId = cardInvoice[item.id] ?? item.invoice_id ?? ''
              return (
                <li key={item.id} className="rounded-lg border border-slate-200 p-3 space-y-2">
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[#1684FE]">
                      {CLASS_LABEL[classification]}
                    </span>
                    <span className="text-sm font-medium">
                      {item.invoice_number ?? 'Unmatched'} · {item.load_number ?? ''}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700">{item.summary}</p>
                  {item.body_text ? (
                    <pre className="text-xs whitespace-pre-wrap text-slate-600 bg-slate-50 rounded p-2 max-h-32 overflow-auto">
                      {item.body_text}
                    </pre>
                  ) : null}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="text-xs text-slate-500">
                      Type
                      <select
                        className="client-input w-full text-sm mt-1"
                        value={classification}
                        onChange={(e) =>
                          setCardClass((prev) => ({
                            ...prev,
                            [item.id]: e.target.value as InboundClassification,
                          }))
                        }
                      >
                        {STAFF_CLASSIFICATIONS.map((id) => (
                          <option key={id} value={id}>
                            {CLASS_LABEL[id]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs text-slate-500">
                      Invoice
                      <select
                        className="client-input w-full text-sm mt-1"
                        value={invoiceId}
                        onChange={(e) =>
                          setCardInvoice((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                      >
                        <option value="">Select invoice…</option>
                        {mockInvoices.slice(0, 80).map((inv) => (
                          <option key={inv.id} value={inv.id}>
                            {inv.invoice_number} · {inv.broker_name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-md bg-[#1684FE] text-white text-sm px-3 py-1"
                      onClick={() => void confirm(item)}
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-md border border-slate-200 text-sm px-3 py-1"
                      onClick={() => {
                        setBusy(true)
                        void reclassifyEmailReview(item.id)
                          .then((updated) => {
                            if (!updated) {
                              showToast('Could not reclassify', 'error')
                              return
                            }
                            setCardClass((prev) => ({ ...prev, [item.id]: updated.classification }))
                            setTick((n) => n + 1)
                            showToast('AI classification updated', 'success')
                          })
                          .finally(() => setBusy(false))
                      }}
                    >
                      Re-run AI
                    </button>
                    {classification === 'claim' && (invoiceId || item.invoice_id) ? (
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 text-sm px-3 py-1"
                        onClick={() => {
                          const inv = getInvoiceById(invoiceId || item.invoice_id!)
                          if (inv) setComposeInvoiceId(inv.id)
                        }}
                      >
                        Ask: whole account?
                      </button>
                    ) : null}
                    {(invoiceId || item.invoice_id) && item.broker_id && item.client_id ? (
                      <button
                        type="button"
                        className="rounded-md border border-amber-300 text-sm px-3 py-1"
                        onClick={() => {
                          void openBrokerAccountDispute({
                            clientId: item.client_id!,
                            brokerId: item.broker_id!,
                            reason: item.summary || 'Claim confirmed on whole account',
                            actorName: actor,
                          }).then((r) => {
                            showToast(`Dispute on ${r.count} invoice(s)`, 'success')
                            void confirm(item)
                          })
                        }}
                      >
                        Confirm whole-account dispute
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="rounded-md border border-slate-200 text-sm px-3 py-1"
                      onClick={() => {
                        upsertEmailReview({ ...item, status: 'dismissed' })
                        setTick((n) => n + 1)
                      }}
                    >
                      Dismiss
                    </button>
                  </div>
                </li>
              )
            })
          )}
        </ul>
      </div>
      {composeInvoiceId ? (
        <SendLifecycleEmailModal
          invoiceId={composeInvoiceId}
          templateId="broker_claim_scope"
          onClose={() => setComposeInvoiceId(null)}
        />
      ) : null}
    </div>
  )
}
