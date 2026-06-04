/** Static content for the AIDocView marketing landing page */

export type TickerStatus = 'approved' | 'review' | 'rejected'

export interface TickerItem {
  status: TickerStatus
  label: string
  loadId: string
}

export const TICKER_ITEMS: TickerItem[] = [
  { status: 'approved', label: 'APPROVED', loadId: 'LD-48291 · WALMART SUPERCENTER · $2,450.00' },
  { status: 'review', label: 'NEEDS REVIEW', loadId: 'LD-48292 · AMAZON FC-PHX · BOL signature unclear' },
  { status: 'approved', label: 'APPROVED', loadId: 'LD-48293 · HOME DEPOT #1842 · $3,780.00' },
  { status: 'rejected', label: 'REJECTED', loadId: 'LD-48294 · KROGER DIST · Invoice amount mismatch $240' },
  { status: 'approved', label: 'APPROVED', loadId: 'LD-48295 · TARGET DC-ATL · $1,920.00' },
  { status: 'review', label: 'NEEDS REVIEW', loadId: 'LD-48296 · SYSCO DALLAS · Stop 2 POD missing' },
  { status: 'approved', label: 'APPROVED', loadId: 'LD-48297 · CVS PHARMACY · $1,150.00' },
  { status: 'approved', label: 'APPROVED', loadId: "LD-48298 · LOWE'S #0337 · $4,200.00" },
]

export interface WorkflowStep {
  num: string
  title: string
  desc: string
  delayClass?: string
}

export const WORKFLOW_STEPS: WorkflowStep[] = [
  { num: '01', title: 'Upload', desc: 'Drop PDFs, images, or multi-page files. Any format your brokers send.' },
  { num: '02', title: 'Classify', desc: 'Every page identified — rate con, BOL, invoice, POD, lumper, or unknown.', delayClass: 'reveal-delay-1' },
  { num: '03', title: 'Extract', desc: 'Structured fields pulled from each doc type. Load #, amounts, dates, stops.', delayClass: 'reveal-delay-2' },
  { num: '04', title: 'Compare', desc: 'Cross-referenced against each other and your Excel load sheet row.', delayClass: 'reveal-delay-3' },
  { num: '05', title: 'Flag', desc: 'Mismatches, missing pages, bad signatures, multi-stop gaps — all surfaced.' },
  { num: '06', title: 'Verdict', desc: 'Approved, Needs Review, or Rejected — one clear answer per load.', delayClass: 'reveal-delay-1' },
  { num: '07', title: 'Learn', desc: 'Your corrections become permanent rules. Smarter with every load.', delayClass: 'reveal-delay-2' },
]

export interface DocRow {
  type: string
  typeClass: string
  name: string
  check: 'ok' | 'warn' | 'err'
  symbol: string
}

export const SAMPLE_DOCS: DocRow[] = [
  { type: 'Rate Con', typeClass: 'rate-con', name: 'rate_confirmation_48294.pdf', check: 'ok', symbol: '✓' },
  { type: 'BOL', typeClass: 'bol', name: 'bill_of_lading_48294.pdf', check: 'ok', symbol: '✓' },
  { type: 'Invoice', typeClass: 'invoice', name: 'invoice_XY-9921.pdf', check: 'err', symbol: '✗' },
  { type: 'POD', typeClass: 'pod', name: 'proof_of_delivery_48294.pdf', check: 'warn', symbol: '!' },
  { type: 'Lumper', typeClass: 'lumper', name: 'lumper_receipt_48294.jpg', check: 'ok', symbol: '✓' },
]

export interface VerdictCard {
  variant: 'approved' | 'review' | 'rejected'
  icon: string
  name: string
  desc: string
  checks: string[]
  delayClass?: string
}

export const VERDICT_CARDS: VerdictCard[] = [
  {
    variant: 'approved',
    icon: '✓',
    name: 'Approved',
    desc: 'All documents present, amounts match, signatures valid. Ready to process immediately.',
    checks: [
      'All required docs accounted for',
      'Invoice matches rate confirmation',
      'BOL receiver signature confirmed',
      'Load # consistent across all docs',
      'All stops have corresponding PODs',
    ],
  },
  {
    variant: 'review',
    icon: '⚠',
    name: 'Needs Review',
    desc: 'Minor discrepancies or ambiguous items. Human eyes required before processing.',
    checks: [
      'Signature present but illegible',
      'Amount within tolerance threshold',
      'Date discrepancy on one document',
      "One stop's POD is low resolution",
      'Broker name variation detected',
    ],
    delayClass: 'reveal-delay-1',
  },
  {
    variant: 'rejected',
    icon: '✗',
    name: 'Rejected',
    desc: 'Critical issue found. Do not process. Requires correction or resubmission.',
    checks: [
      'Invoice amount mismatch > tolerance',
      'Required document missing entirely',
      'No receiver signature on BOL',
      'Load number not found in system',
      'Multi-stop gap — delivery unconfirmed',
    ],
    delayClass: 'reveal-delay-2',
  },
]

export interface RuleCardData {
  name: string
  badge: 'system' | 'learned'
  badgeLabel: string
  bodyText: string
  codeSnippets?: string[]
  meta: string
  isNew?: boolean
}

/** Example rules shown when none are saved locally yet. */
export const EXAMPLE_RULE_CARDS: RuleCardData[] = [
  {
    name: 'Standard BOL Signature',
    badge: 'system',
    badgeLabel: 'Built-in',
    bodyText: 'Require receiver_signature + delivery_date on all BOLs',
    meta: 'Enabled by default in Review Engine → Rules',
  },
  {
    name: 'Invoice vs Rate Con Amount',
    badge: 'system',
    badgeLabel: 'Built-in',
    bodyText: 'Flag when invoice total differs from rate confirmation beyond your tolerance',
    meta: 'Tune tolerance in built-in rule settings',
  },
  {
    name: 'Shipper-specific override',
    badge: 'learned',
    badgeLabel: 'Learned',
    bodyText: 'Example: facility stamp counts as receiver signature for a named shipper',
    meta: 'You add these in Rules → Shipper after a correction',
  },
]

/** Labels for the static demo panels (not live data). */
export const DEMO_REVIEW_PANEL = {
  title: 'Example · LD-48294 · Kroger Distribution · 5 documents',
  status: 'rejected' as const,
  flagsTitle: 'Example rejection reasons',
}
