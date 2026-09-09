import { useMemo, useState, type ReactNode } from 'react'
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  CirclePause,
  FileText,
  FileWarning,
  GitBranch,
  Hash,
  Lock,
  Mail,
  ShieldAlert,
  FolderOpen,
  Wallet,
  Workflow,
} from 'lucide-react'
import { AR_POLICY } from '../utils/invoiceAging'
import '../styles/adminDocs.css'

type DocTopicId =
  | 'invoice-lifecycle'
  | 'force-close'
  | 'hold'
  | 'write-off'
  | 'verify-process'
  | 'payment-posting'
  | 'invoice-load-guards'
  | 'managed-vs-self'
  | 'monthly-billing'
  | 'paperwork-sending'
  | 'vault-onboarding'

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
    id: 'invoice-lifecycle',
    label: 'Invoice lifecycle',
    summary: 'Every status and branch from docs to paid.',
  },
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
    summary: 'Fee terms, batch locks, Payoneer & credits.',
  },
  {
    id: 'paperwork-sending',
    label: 'Paperwork email',
    summary: 'Broker packets, limits, From addresses.',
  },
  {
    id: 'vault-onboarding',
    label: 'Vault onboarding',
    summary: 'Required setup docs and Credyx approval.',
  },
]

function pageForTopic(id: DocTopicId): DocPageContent {
  const days = AR_POLICY.forceCloseDays

  switch (id) {
    case 'invoice-lifecycle':
      return {
        title: 'Invoice lifecycle',
        lede: 'Every path an invoice can take — stored status, what lists show, money in flight, and how it can close. Credyx is A/R back office, not factoring.',
        callout: (
          <>
            Carrier stepper is always <strong>Submitted → Verified → Invoiced → Paid</strong>.
            Credyx does not confirm delivery or capture POD in the field. List labels like Open,
            Will Pay, and Open Disputed sit on top of stored status.
          </>
        ),
        steps: [
          {
            title: 'Happy path',
            body: 'Packet received (Submitted) → Credyx verifies (pending, then Open / approved) → PPW sent to the broker (Invoiced) → follow-up → payment confirmed (Paid). Until paid or closed, the invoice stays open A/R.',
          },
          {
            title: 'Verification branches',
            body: 'Pending review can be approved (Open), put On hold (missing docs / claim), or rejected. Hold before PPW stays on Verified; hold after PPW stays on Invoiced — it does not roll back.',
          },
          {
            title: 'Open A/R overlays',
            body: 'Open (blue). Overdue = 15+ days past expected pay. Will Pay (green) uses collection status W/P plus a scheduled payment date. Call Back (C/B) is a scheduled broker call. Open Disputed = invoice or remittance dispute. These do not change stored status to paid.',
          },
          {
            title: 'Will Pay miss',
            body: 'Nothing happens the day the scheduled pay date passes. Default 5 days later, still unpaid → Collections urgent (Will Pay unpaid 5d+). It does not go to carrier Attention (that list is paperwork holds only). Chase “needs attention” is a separate no-reply-after-inquiry clock.',
          },
          {
            title: 'Money in flight',
            body: 'Carrier post → pending until Credyx confirms. Credyx post → awaiting confirmation (Confirm). Receipt dispute = disputed remittance. Short paid = confirmed cash under face, remainder still open. Overpay = paid plus overage (carrier may accept excess).',
          },
          {
            title: 'Close paths',
            body: 'Full (or accepted) pay → Paid; age freezes at invoice date to pay date. Write-off → write_off_pending then written_off (fee exempt). Force close (Managed, 90d+) → force_closed (fee still bills). Rejected at verify is terminal for that packet.',
          },
          {
            title: 'Admin Invoices chips',
            body: 'Chips are on/off display buckets (one bucket per invoice). Search ignores chips. Paid is opt-in. Turning Open off does not hide overdue or Will Pay.',
          },
        ],
        facts: [
          { label: 'Open', value: 'approved — blue Open pill' },
          { label: 'Will Pay', value: 'W/P + scheduled date; miss +5d → Collections urgent' },
          { label: 'Open Disputed', value: 'Invoice or remittance dispute' },
          { label: 'Paid vs write-off', value: 'Paid/frozen age · written_off fee-exempt' },
          { label: 'Force close', value: 'Managed only · 90d+ · fee billable' },
          { label: 'Attention tab', value: 'Paperwork holds only — not missed Will Pay' },
        ],
        footnote:
          'Full map including mermaid diagrams: docs/INVOICE_LIFECYCLE.md in the repo.',
      }
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
            body: 'When every invoice is approved or on hold, Process moves the batch to submitted, locks Fee Terms, emails brokers a paperwork packet (invoice documents + Document Vault broker docs such as NOAs), and emails the carrier that the batch was processed.',
          },
          {
            title: 'After Process',
            body: 'Real statuses appear (Open / On Hold). Verification notes become visible. Deferred hold notifications fire for held invoices. Fee rates stay frozen. The carrier email includes any holds and a per-invoice summary of broker paperwork sends (sent / skipped / failed).',
          },
        ],
        facts: [
          { label: 'During verify', value: 'Client still sees Open' },
          { label: 'Notes', value: 'Admin notes reveal on Process' },
          { label: 'Holds', value: 'Bell + red status after Process' },
          { label: 'Fee terms', value: 'Lock on Process' },
          { label: 'Broker email', value: 'Invoice docs + vault broker/NOA' },
          { label: 'Carrier email', value: 'Processed + holds + PPW summary' },
        ],
        footnote:
          'Requires Resend secrets on the send-email Edge Function (RESEND_API_KEY, RESEND_FROM_EMAIL). See Docs → Paperwork email for limits, templates, and From-address setup. Without secrets, sends fail as “Email not configured” and are not marked delivered. Fee terms lock when the batch is processed.',
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
            body: 'Carrier creates AI/manual batches, posts payments (applied immediately), runs more invoice ops, and does not get Credyx force-close framing.',
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
            body: 'Self-service: canCreateBatch / AI / manual. Managed: handoff docs only until Credyx creates invoices on Ready to Post. Both tiers upload Document Vault setup docs; invoice intake is locked until Credyx approves the required packet.',
          },
          {
            title: 'Where to look',
            body: 'Clients directory → service tier. Client portal nav and actions hide what the plan does not allow. Vault review lives on Clients → Vault.',
          },
        ],
        facts: [
          { label: 'Force close', value: 'Managed yes · Self-service no' },
          { label: 'Create batches', value: 'Self-service yes · Managed handoff' },
          { label: 'Collections owner', value: 'Managed = Credyx · Self = carrier' },
          { label: 'Vault upload', value: 'Both tiers (client + admin)' },
          { label: 'Invoice gate', value: 'Until setup docs approved' },
        ],
      }
    case 'monthly-billing':
      return {
        title: 'Monthly billing',
        lede:
          'Credyx bills carriers monthly for the platform fee plus collection fees — based on confirmed collections, not open A/R.',
        callout: (
          <>
            Batch fees come from <strong>Clients → Fee Terms</strong>. Open batches follow live
            rates; when Credyx <strong>Processes</strong> a batch, those rates lock onto the batch
            and its invoices. Later Fee Terms changes do not rewrite processed history. Issued
            Credyx bills also keep a fee snapshot for clawbacks.
          </>
        ),
        steps: [
          {
            title: 'Batch fee terms (intended behavior)',
            body: 'When a client submits a batch or Credyx creates one, fee totals use that carrier’s current Fee Terms (including trial/active). While the batch is still open (ready to post, verification, etc.), changing the client’s Fee Terms updates those open batches. When the batch is Processed, Credyx freezes the then-current rates onto the batch and every invoice in it. If Fee Terms change later, processed batches and invoices keep the previous locked fee; only open batches pick up the new rates.',
          },
          {
            title: 'What gets billed',
            body: 'Each calendar month: $99 platform subscription + collection fees. Trial subscription waives fees while the client is on trial. Percentage → fee % × collected volume; flat → flat × invoices collected. Collections on processed invoices prefer their locked rates. Pending and reversed payments do not count.',
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
            body: 'If a payment is unprocessed or reversed after the Credyx bill for that collection month was already issued, it appears under Discount / credit → Reversal reimbursements with a system note (invoice, billed period, fee rate at bill time, reason, suggested fee). Select the row(s) and choose Reimburse selected. Fee amount prefers locked invoice/batch terms, else the rate on that issued bill. Reimbursed items hide behind Show reimbursed invoices.',
          },
          {
            title: 'When a clawback does not appear',
            body: 'If the payment is reversed before that month’s Credyx invoice is issued, volume simply drops — there is nothing to claw back. Same-month reverse after issue still qualifies because the bill was already sent.',
          },
          {
            title: 'Where to work',
            body: 'Admin → Billing (list + Open popup). Set Fee Terms / trial on Clients. Batch Accounting edits live client terms for open batches, or locked override for processed batches. Payment unprocess/move on Payment Posting.',
          },
        ],
        facts: [
          { label: 'Create / open batch', value: 'Live client Fee Terms' },
          { label: 'On Process', value: 'Lock rates → batch + invoices' },
          { label: 'Later Fee Terms change', value: 'Processed keep old rate' },
          { label: 'Credits / clawback', value: 'Next bill · after issue' },
        ],
        footnote:
          'Open batches always pull from the carrier account. Processed batches and already-issued Credyx bills keep their locked rates so history is not rewritten.',
      }
    case 'paperwork-sending':
      return {
        title: 'Paperwork email',
        lede: 'How Credyx sends broker packets and carrier notices — limits, templates, and From addresses.',
        callout: (
          <>
            Broker packets go out on <strong>Process</strong> (batch) or manually from{' '}
            <strong>Invoices → Send docs</strong>. Copy is edited under{' '}
            <strong>Settings → Email templates</strong>.
          </>
        ),
        steps: [
          {
            title: 'What gets sent to brokers',
            body: 'Template broker_packet: invoice #, load #, broker, carrier, and a fixed payment pointer (pay carrier per invoice remit-to; remittance advice to billing@ / ops@). Bank numbers are not in the email body. Remit-to lives on the invoice PDF. When remittance changed vs the carrier’s prior invoice, the email and PDF include a verify-before-paying note.',
          },
          {
            title: 'Attachments (manual Send docs)',
            body: 'Invoices → Send docs opens a checklist: pick which invoice documents and Document Vault broker docs to attach. Voided check and bank letter types default-checked when present. Warns (does not block) if neither bank-proof type is selected. Batch Process uses the same defaults automatically (invoice docs + bank proof) without a per-invoice picker.',
          },
          {
            title: 'What gets sent to carriers',
            body: 'After Process, one carrier email (carrier_batch_processed) summarizes holds (if any) and per-invoice paperwork results (sent / skipped / failed). No large document attachments on that notice.',
          },
          {
            title: 'Manual send from Invoices',
            body: 'Admin Invoices detail → Send docs. Pick a broker email or type any recipient, select attachments, optional message. History appears on the Send timeline filter.',
          },
          {
            title: 'Notify all brokers of remittance change',
            body: 'Clients → carrier Terms/remittance section → Notify brokers of remittance change. Template broker_remittance_updated emails every distinct broker on that carrier’s invoices. Attach vault bank proof; do not put account numbers in the body. Saving remittance does not auto-send — you click the button.',
          },
          {
            title: 'Attachment size & multi-part',
            body: 'Each email stays under ~35MB base64 (~25–26MB of files), including the logo. If the packet is larger, Credyx automatically splits it into Part 1 / Part 2 / … emails. Subject and body note the part; Send history records each part with a “sent separately” note. A single file that alone exceeds the budget cannot be split — compress it first.',
          },
          {
            title: 'Resend setup (domain + secrets)',
            body: 'Verify the domain in Resend (DKIM + SPF/MX on send). Set Edge secrets: RESEND_API_KEY, RESEND_FROM_EMAIL (fallback), RESEND_FROM_BROKER (e.g. Credyx Billing <billing@credyx.net>), RESEND_FROM_CARRIER (e.g. Credyx Ops <ops@credyx.net>). Optional Reply-To: RESEND_REPLY_TO / RESEND_REPLY_TO_BROKER / RESEND_REPLY_TO_CARRIER. Without RESEND_API_KEY, sends fail as “Email not configured”.',
          },
          {
            title: 'From address by audience',
            body: 'Broker templates (paperwork packet, remittance update, collections chase) use RESEND_FROM_BROKER when set. Carrier templates (batch processed, invite) use RESEND_FROM_CARRIER. Admin/system alerts use RESEND_FROM_ADMIN when set. Each falls back to RESEND_FROM_EMAIL. Same verified domain — no extra Resend fee.',
          },
          {
            title: 'If they reply',
            body: 'Replies go to the Reply-To address when configured, otherwise to the From mailbox (billing@ / ops@ / etc.). Credyx does not auto-ingest replies into the app. You need a real inbox or forwarder on that address (Google Workspace, Microsoft 365, or Namecheap email forwarding). Resend “Enable Receiving” is optional and separate — it is for inbound parsing, not required for simple reply inboxes.',
          },
          {
            title: 'Edit templates in Credyx',
            body: 'Settings → Email → pick a template → edit subject/HTML → Save. Use {{placeholders}} listed in the editor. Reset restores the built-in layout. send-email loads the DB row at send time.',
          },
        ],
        facts: [
          { label: 'Total attach cap', value: '~35MB base64 / email (~26MB files)' },
          { label: 'Oversize packet', value: 'Auto Part 1 / Part 2…' },
          { label: 'Manual attachments', value: 'Send docs checklist' },
          { label: 'Bank proof types', value: 'voided_check · bank_letter' },
          { label: 'Remittance blast', value: 'Clients → Notify brokers' },
          { label: 'Manual send', value: 'Invoices → Send docs' },
          { label: 'Templates', value: 'Settings → Email' },
          { label: 'Broker From', value: 'RESEND_FROM_BROKER → billing@' },
          { label: 'Carrier From', value: 'RESEND_FROM_CARRIER → ops@' },
          { label: 'Replies', value: 'Inbox/forwarder — not in-app' },
        ],
        footnote:
          'Resend free tier is fine for early volume; watch monthly send quotas. Multiple From addresses on the same verified domain do not require a separate paid plan. Replies only land if that mailbox (or Reply-To) actually receives mail. Remittance change notices never auto-send on save.',
      }
    case 'vault-onboarding':
      return {
        title: 'Vault onboarding',
        lede: 'Carriers must upload a broker-style setup packet to the Document Vault and get Credyx approval before sending invoices.',
        callout: (
          <>
            Client uploads stay <strong>pending</strong> until Credyx approves.&nbsp;
            Admin uploads are <strong>auto-approved</strong>.
          </>
        ),
        steps: [
          {
            title: 'Required packet',
            body: 'Always: W-9, COI, MC Authority, DOT Registration, plus voided check or bank letter. If the carrier is marked Factoring, also require Notice of Assignment (NOA).',
          },
          {
            title: 'Client Document Vault',
            body: 'Portal → Document Vault. Carrier picks folder + document type, uploads files. Each client upload shows “Awaiting Credyx approval” until reviewed.',
          },
          {
            title: 'Credyx review',
            body: 'Clients → open carrier → Vault tab. Approve or reject pending docs, or Upload on behalf (auto-approved). The list header shows how many carriers have pending docs.',
          },
          {
            title: 'Invoice gate',
            body: 'Until every required type is approved, client AI/manual batch submit and managed doc handoff are blocked. Admin create-batch for a carrier is not blocked by this gate.',
          },
          {
            title: 'Rejected docs',
            body: 'Rejected files do not count. The carrier re-uploads a replacement (new pending row) for Credyx to review again.',
          },
        ],
        facts: [
          { label: 'Always required', value: 'W-9 · COI · MC · DOT · bank proof' },
          { label: 'If factoring', value: 'NOA also required' },
          { label: 'Client upload', value: 'pending → approve/reject' },
          { label: 'Admin upload', value: 'approved immediately' },
          { label: 'Review UI', value: 'Clients → Vault' },
        ],
      }
  }
}

const TOPIC_ICONS: Record<DocTopicId, typeof ShieldAlert> = {
  'invoice-lifecycle': GitBranch,
  'force-close': ShieldAlert,
  hold: CirclePause,
  'write-off': FileWarning,
  'verify-process': Workflow,
  'payment-posting': Wallet,
  'invoice-load-guards': Hash,
  'managed-vs-self': Building2,
  'monthly-billing': FileText,
  'paperwork-sending': Mail,
  'vault-onboarding': FolderOpen,
}

/** Admin Docs — book-style reference for how Credyx features work. */
export default function AdminDocs() {
  const [topicId, setTopicId] = useState<DocTopicId>('invoice-lifecycle')
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
    <>
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
    </>
  )
}
