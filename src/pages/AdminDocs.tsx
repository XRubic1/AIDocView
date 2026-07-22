import { useMemo, useState, type ReactNode } from 'react'
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  CirclePause,
  FileText,
  FileWarning,
  Hash,
  Lock,
  ShieldAlert,
  Wallet,
  Workflow,
} from 'lucide-react'
import AdminLayout from '../components/AdminLayout'
import { AR_POLICY } from '../utils/invoiceAging'
import '../styles/adminDocs.css'

type DocTopicId =
  | 'force-close'
  | 'hold'
  | 'write-off'
  | 'verify-process'
  | 'payment-posting'
  | 'invoice-load-guards'
  | 'managed-vs-self'
  | 'monthly-billing'

interface DocTopic {
  id: DocTopicId
  label: string
  summary: string
}

interface DocPageContent {
  title: string
  lede: string
  callout?: ReactNode
  steps: { title: string; body: string }[]
  facts: { label: string; value: string }[]
  footnote?: string
}

const TOPICS: DocTopic[] = [
  {
    id: 'force-close',
    label: 'Force close',
    summary: 'Aged Managed loads — fee still applies.',
  },
  {
    id: 'hold',
    label: 'On hold',
    summary: 'Pause collections; hidden until Process.',
  },
  {
    id: 'write-off',
    label: 'Write-off',
    summary: 'Uncollectable balance — fee exempt.',
  },
  {
    id: 'verify-process',
    label: 'Verify → Process',
    summary: 'What carriers see during verification.',
  },
  {
    id: 'payment-posting',
    label: 'Payment posting',
    summary: 'Full, short, and over payments.',
  },
  {
    id: 'invoice-load-guards',
    label: 'Invoice & load #',
    summary: 'Duplicate blocks and reuse warnings.',
  },
  {
    id: 'managed-vs-self',
    label: 'Managed vs self-service',
    summary: 'What each carrier plan can do.',
  },
  {
    id: 'monthly-billing',
    label: 'Monthly billing',
    summary: 'Fee terms, Payoneer, credits & reversals.',
  },
]

function pageForTopic(id: DocTopicId): DocPageContent {
  const days = AR_POLICY.forceCloseDays

  switch (id) {
    case 'force-close':
      return {
        title: 'Force close',
        lede: 'Close aged Managed loads Credyx worked in collections, while keeping the collection fee billable.',
        callout: (
          <>
            <strong>Force close</strong> → <code>force_closed</code>, fee still applies.&nbsp;
            <strong>Write-off</strong> → <code>written_off</code>, fee exempt.
          </>
        ),
        steps: [
          {
            title: 'Managed carriers only',
            body: 'Self-service carriers run their own collections. Credyx does not force-close their loads or lock a collection fee that way.',
          },
          {
            title: 'Eligibility clock',
            body: `Eligible when still open A/R (approved) and ${days}+ days past expected payment. Threshold is in Settings → Invoices & A/R.`,
          },
          {
            title: 'On hold does not count',
            body: 'Held invoices are not open A/R for force-close. They will not become eligible while on hold, even past the day threshold.',
          },
          {
            title: 'How Credyx closes it',
            body: 'Collections or invoice detail → Close Invoice → Force Close. Status becomes force_closed; the load leaves aging A/R and collections chase.',
          },
          {
            title: 'What the client sees',
            body: 'Managed clients see eligibility badges. They cannot force-close themselves. Self-service clients do not see force-close framing.',
          },
        ],
        facts: [
          { label: 'Eligible when', value: `Approved + ${days}+ days + Managed` },
          { label: 'Result', value: 'force_closed — fee still bills' },
          { label: 'Not eligible', value: 'Hold, pending, paid, write-off, self-service' },
        ],
      }
    case 'hold':
      return {
        title: 'On hold',
        lede: 'Pause an invoice when Credyx needs more information or a broker issue must be resolved.',
        callout: (
          <>
            During <strong>batch verification</strong>, hold status and verification notes stay
            hidden from the carrier until the batch is <strong>Processed</strong>.
          </>
        ),
        steps: [
          {
            title: 'When to use hold',
            body: 'Missing paperwork, broker disputes, or anything that should stop collections until Credyx clears it.',
          },
          {
            title: 'During verify',
            body: 'Approve/hold updates Credyx immediately, but the client portal still shows Open. Hold bells and admin notes wait until Process.',
          },
          {
            title: 'After Process',
            body: 'Held invoices appear as On Hold (red). A bell notification is sent. Held loads do not count toward force-close eligibility.',
          },
          {
            title: 'Navbar badge',
            body: 'The client Invoices nav shows a red count of held invoices (only after the batch is processed).',
          },
        ],
        facts: [
          { label: 'Client label', value: 'On Hold (red)' },
          { label: 'Force close', value: 'Does not count while held' },
          { label: 'Notify', value: 'Bell after batch Process' },
        ],
      }
    case 'write-off':
      return {
        title: 'Write-off',
        lede: 'Close an uncollectable balance when Credyx should not bill the collection fee.',
        callout: (
          <>
            <strong>Write-off</strong> = fee exempt.&nbsp;
            <strong>Force close</strong> = fee still applies. Choose the correct close type.
          </>
        ),
        steps: [
          {
            title: 'When to write off',
            body: 'Broker will not pay, short-pay accepted as final, or Credyx agrees the remaining balance should not earn a collection fee.',
          },
          {
            title: 'How Credyx closes it',
            body: 'Invoice detail → Close Invoice → Write Off. Status becomes written_off (or write_off_pending when client approval is required).',
          },
          {
            title: 'Client view',
            body: 'Carriers see Written Off in yellow/amber. Pending write-off approval is shown to them as Written Off.',
          },
          {
            title: 'Fees',
            body: 'written_off invoices are excluded from fee-billable totals. Short-pay write-offs can drive reimbursement / fee-credit flows.',
          },
        ],
        facts: [
          { label: 'Result', value: 'written_off — fee exempt' },
          { label: 'Client pill', value: 'Yellow / amber' },
          { label: 'vs Force close', value: 'Force close keeps the fee' },
        ],
      }
    case 'verify-process':
      return {
        title: 'Verify → Process',
        lede: 'What updates during verification, and what the carrier sees only after Process.',
        callout: (
          <>
            Credyx can approve/hold and add notes during verify. The carrier keeps seeing{' '}
            <strong>Open</strong> until Process reveals outcomes.
          </>
        ),
        steps: [
          {
            title: 'Ready to post → Verification',
            body: 'Batch moves into Verification. Credyx reviews documents, approves or holds each invoice, and may add verification notes.',
          },
          {
            title: 'Client view while verifying',
            body: 'Invoices stay Open. Admin verification notes and hold/reject outcomes are hidden. Carrier-authored notes still show.',
          },
          {
            title: 'Process batch',
            body: 'When every invoice is approved or on hold, Process moves the batch to submitted, sends PPW where needed, and emails the carrier.',
          },
          {
            title: 'After Process',
            body: 'Real statuses appear (Open / On Hold). Verification notes become visible. Deferred hold notifications fire for held invoices.',
          },
        ],
        facts: [
          { label: 'During verify', value: 'Client still sees Open' },
          { label: 'Notes', value: 'Admin notes reveal on Process' },
          { label: 'Holds', value: 'Bell + red status after Process' },
        ],
        footnote: 'Admin status in Credyx is real during verify; only the client portal is gated.',
      }
    case 'payment-posting':
      return {
        title: 'Payment posting',
        lede: 'How remittances land on invoices — full pay, short pay, overpay, and confirmation.',
        callout: (
          <>
            Credyx posts most remittances from <strong>Payment Posting</strong>. Client-posted
            payments typically stay <strong>pending</strong> until Credyx confirms.
          </>
        ),
        steps: [
          {
            title: 'Credyx posts (direct)',
            body: 'Payment Posting workspace: match remittance to invoice(s), post full / short / over. Confirmed payments update received totals and may close or variance the invoice.',
          },
          {
            title: 'Full payment',
            body: 'Confirmed amount covers the invoice → invoice can move to Paid. Aging / open A/R drops accordingly.',
          },
          {
            title: 'Short payment',
            body: 'Confirmed amount is under invoice total → invoice stays open with a Short paid (yellow) variance. Remaining balance can later be written off or collected.',
          },
          {
            title: 'Overpayment',
            body: 'Confirmed amount exceeds invoice → Paid with Overpaid variance. Excess may sit as credit / overpayment handling.',
          },
          {
            title: 'Client confirm / dispute',
            body: 'Managed carriers may need to confirm receipt of Credyx-posted payments, or dispute if the amount looks wrong. Disputes can place the invoice on hold.',
          },
        ],
        facts: [
          { label: 'Workspace', value: 'Payment Posting in OPERATIONS' },
          { label: 'Short paid pill', value: 'Yellow / amber' },
          { label: 'Truth source', value: 'Confirmed payments drive A/R' },
        ],
      }
    case 'invoice-load-guards':
      return {
        title: 'Invoice & load numbers',
        lede: 'Safeguards when creating invoices in batches — hard blocks vs soft warnings.',
        callout: (
          <>
            <strong>Invoice #</strong> must be unique per carrier (blocks submit).&nbsp;
            <strong>Load #</strong> may repeat with a warning.
          </>
        ),
        steps: [
          {
            title: 'Invoice number — hard block',
            body: 'If the number is already used for that carrier (or duplicated in the same batch), submit is blocked. Custom alphanumeric numbers are kept as entered; they are not silently rewritten to the next system sequence.',
          },
          {
            title: 'Client portal scope',
            body: 'Clients only see collisions against their own invoices and load numbers — never other carriers.',
          },
          {
            title: 'Admin invoice # scope',
            body: 'Still per carrier. Credyx cannot reuse another invoice # for the same carrier; other carriers may share the same numeric style.',
          },
          {
            title: 'Load number — warning',
            body: 'Same load # is allowed. Client: warn if they already used it. Admin: warn for same carrier and if other carriers used it too. Submit continues after confirm.',
          },
          {
            title: 'Where it applies',
            body: 'Manual + AI batch create (client and admin), and handoff invoice create/edit on Ready to Post.',
          },
        ],
        facts: [
          { label: 'Invoice #', value: 'Block if already used for carrier' },
          { label: 'Load #', value: 'Warn — still allow submit' },
          { label: 'Custom numbers', value: 'Preserved (no silent renumber)' },
        ],
      }
    case 'managed-vs-self':
      return {
        title: 'Managed vs self-service',
        lede: 'Two carrier plans — different who-does-what for batches, payments, and collections.',
        callout: (
          <>
            Set the plan on the client record. Capabilities are enforced in the portal and key
            money actions.
          </>
        ),
        steps: [
          {
            title: 'Self-service',
            body: 'Carrier creates AI/manual batches, posts payments (often pending Credyx confirm), runs more invoice ops, and does not get Credyx force-close framing.',
          },
          {
            title: 'Managed',
            body: 'Carrier mainly submits documents (handoff). Credyx builds invoices, posts remittances, works collections, and may force-close aged loads. Carrier confirms payment receipts and can dispute.',
          },
          {
            title: 'Force close',
            body: 'Managed only (hasForceClose). Self-service aged loads resolve via payment or write-off paths instead.',
          },
          {
            title: 'Batch creation',
            body: 'Self-service: canCreateBatch / AI / manual. Managed: handoff docs only until Credyx creates invoices on Ready to Post.',
          },
          {
            title: 'Where to look',
            body: 'Clients directory → service tier. Client portal nav and actions hide what the plan does not allow.',
          },
        ],
        facts: [
          { label: 'Force close', value: 'Managed yes · Self-service no' },
          { label: 'Create batches', value: 'Self-service yes · Managed handoff' },
          { label: 'Collections owner', value: 'Managed = Credyx · Self = carrier' },
        ],
      }
    case 'monthly-billing':
      return {
        title: 'Monthly billing',
        lede:
          'Credyx bills carriers monthly for the platform fee plus a collection fee from client Fee Terms — based on confirmed collections, not open A/R.',
        callout: (
          <>
            Fee source of truth is <strong>Clients → Fee Terms</strong> (percentage of collected, or
            flat per invoice). Trial clients are not charged until subscription status is{' '}
            <strong>active</strong>.
          </>
        ),
        steps: [
          {
            title: 'What gets billed',
            body: 'Each calendar month: $99 platform subscription + collection fee. Percentage terms → fee % × confirmed payment amounts in that month. Flat terms → flat amount × invoices that had confirmed collections that month. Pending and reversed payments do not count toward volume.',
          },
          {
            title: 'Issue → Payoneer → Paid',
            body: 'Open Monthly Billing, pick the period, Open a client invoice. Review line items, Issue invoice, Request Payoneer payment, then Mark payment received when funds arrive. Accounts escalate and can lock after long unpaid stretches.',
          },
          {
            title: 'Discount / credit tab',
            body: 'Add manual invoice-fee reimbursements or goodwill credits. Credits sit on the client reimbursement account and reduce the next issued Credyx invoice (never below $0; leftover carries forward). Pending credits can be voided; credits already applied to an issued bill cannot.',
          },
          {
            title: 'Reversal reimbursements',
            body: 'If a payment is unprocessed or reversed after the Credyx bill for that collection month was already issued, it appears under Discount / credit → Reversal reimbursements with a system note (invoice, billed period, fee rate at bill time, reason, suggested fee). Select the row(s) and choose Reimburse selected. Fee amount uses the fee terms locked on that Credyx bill (e.g. 1% × payment), so later Fee Terms changes (1% → 1.25%) do not change the clawback. Reimbursed items hide behind Show reimbursed invoices.',
          },
          {
            title: 'When a clawback does not appear',
            body: 'If the payment is reversed before that month’s Credyx invoice is issued, July volume simply drops — there is nothing to claw back. Same-month reverse after issue still qualifies because the bill was already sent.',
          },
          {
            title: 'Where to work',
            body: 'Admin → Billing (list + Open popup). Fee Terms and trial/active status on Clients. Payment unprocess/move on Payment Posting.',
          },
        ],
        facts: [
          { label: 'Fee source', value: 'Client Fee Terms' },
          { label: 'Bill base', value: 'Confirmed collections in the month' },
          { label: 'Credits', value: 'Next invoice · floor $0' },
          { label: 'Reversal clawback', value: 'Manual select after bill issued' },
        ],
        footnote:
          'Opened Credyx billing invoices store a snapshot of line items. Changing Fee Terms later does not rewrite already-issued bills.',
      }
  }
}

const TOPIC_ICONS: Record<DocTopicId, typeof ShieldAlert> = {
  'force-close': ShieldAlert,
  hold: CirclePause,
  'write-off': FileWarning,
  'verify-process': Workflow,
  'payment-posting': Wallet,
  'invoice-load-guards': Hash,
  'managed-vs-self': Building2,
  'monthly-billing': FileText,
}

/** Admin Docs — book-style reference for how Credyx features work. */
export default function AdminDocs() {
  const [topicId, setTopicId] = useState<DocTopicId>('force-close')
  const topicIndex = TOPICS.findIndex((t) => t.id === topicId)
  const topic = TOPICS[topicIndex] ?? TOPICS[0]
  const page = useMemo(() => pageForTopic(topic.id), [topic.id])
  const chapterNum = String(topicIndex + 1).padStart(2, '0')

  const goPrev = () => {
    if (topicIndex <= 0) return
    setTopicId(TOPICS[topicIndex - 1].id)
  }
  const goNext = () => {
    if (topicIndex >= TOPICS.length - 1) return
    setTopicId(TOPICS[topicIndex + 1].id)
  }

  return (
    <AdminLayout userName="Admin User" userRole="Administrator" flushMain>
      <div className="admin-docs">
        <div className="admin-docs__stage">
          <nav className="admin-docs__toc" aria-label="Table of contents">
            <p className="admin-docs__toc-label">Contents</p>
            <ul className="admin-docs__toc-list">
              {TOPICS.map((item, index) => {
                const Icon = TOPIC_ICONS[item.id]
                const active = item.id === topic.id
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`admin-docs__toc-item${active ? ' admin-docs__toc-item--active' : ''}`}
                      onClick={() => setTopicId(item.id)}
                    >
                      <span className="admin-docs__toc-num">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span>
                        <span className="admin-docs__toc-label-text inline-flex items-center gap-1.5">
                          <Icon className="w-3.5 h-3.5 shrink-0 opacity-80" />
                          {item.label}
                        </span>
                        <span className="admin-docs__toc-blurb">{item.summary}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>

          <div className="admin-docs__page-wrap">
            <article className="admin-docs__page" key={topic.id}>
              <div className="admin-docs__page-inner">
                <p className="admin-docs__chapter">Chapter {chapterNum}</p>
                <h2 className="admin-docs__page-title">{page.title}</h2>
                <p className="admin-docs__page-lede">{page.lede}</p>
                {page.callout && <div className="admin-docs__callout">{page.callout}</div>}

                <div className="admin-docs__body">
                  <ol className="admin-docs__steps">
                    {page.steps.map((step, index) => (
                      <li key={step.title} className="admin-docs__step">
                        <span className="admin-docs__step-num">{index + 1}</span>
                        <div>
                          <p className="admin-docs__step-title">{step.title}</p>
                          <p className="admin-docs__step-body">{step.body}</p>
                        </div>
                      </li>
                    ))}
                  </ol>

                  <aside className="admin-docs__aside" aria-label="Key facts">
                    <p className="admin-docs__aside-label">At a glance</p>
                    {page.facts.map((fact) => (
                      <div key={fact.label} className="admin-docs__fact">
                        <p className="admin-docs__fact-label">{fact.label}</p>
                        <p className="admin-docs__fact-value">{fact.value}</p>
                      </div>
                    ))}
                  </aside>
                </div>

                {page.footnote && (
                  <p className="admin-docs__note">
                    <Lock className="w-3.5 h-3.5" />
                    {page.footnote}
                  </p>
                )}
              </div>

              <footer className="admin-docs__footer">
                <span className="admin-docs__page-num">
                  {topicIndex + 1} / {TOPICS.length}
                </span>
                <div className="admin-docs__nav-btns">
                  <button
                    type="button"
                    className="admin-docs__nav-btn"
                    onClick={goPrev}
                    disabled={topicIndex <= 0}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </button>
                  <button
                    type="button"
                    className="admin-docs__nav-btn"
                    onClick={goNext}
                    disabled={topicIndex >= TOPICS.length - 1}
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </footer>
            </article>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
