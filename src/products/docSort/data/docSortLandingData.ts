/** Static marketing copy for DocSort landing (no AIDocView review data). */

export const DOCSORT_HERO = {
  tag: 'Batch document matching',
  line1: 'Sort rate cons',
  line2: '& BOLs',
  line3: 'in minutes.',
  sub: 'Upload a pile of PDFs. DocSort fingerprints each file, matches bills of lading to rate confirmations by load and lane — then review, invoice, and export binders. No audit pipeline. No verdict engine.',
} as const

export const DOCSORT_HERO_STATS = [
  { target: 200, suffix: '+', label: 'PDFs per batch', footnote: 'Parallel vision scan' },
  { target: 4, suffix: '×', label: 'Default concurrency', footnote: 'VITE_DOCSORT_PARALLEL' },
  { target: 3, suffix: '', label: 'Outputs per load', footnote: 'View · Invoice · Binder' },
] as const

export type DocSortTickerItem = {
  loadId: string
  status: 'matched' | 'unmatched' | 'invoice'
  label: string
}

export const DOCSORT_TICKER: DocSortTickerItem[] = [
  { loadId: 'LD-88421', status: 'matched', label: 'RC + BOL matched' },
  { loadId: 'LD-88419', status: 'matched', label: 'RC + BOL matched' },
  { loadId: 'LD-88390', status: 'invoice', label: 'Invoice generated' },
  { loadId: 'LD-88377', status: 'unmatched', label: 'BOL unmatched' },
  { loadId: 'LD-88355', status: 'matched', label: 'RC + BOL matched' },
  { loadId: 'LD-88341', status: 'invoice', label: 'Binder exported' },
]

export const DOCSORT_WORKFLOW = [
  {
    num: '01',
    title: 'Drop PDFs',
    desc: 'Rate confirmations, BOLs, and mixed packets in one upload zone.',
    delayClass: '',
  },
  {
    num: '02',
    title: 'AI fingerprint',
    desc: 'Page-one vision extracts load #, lane, broker, and document type per file.',
    delayClass: 'reveal-delay-1',
  },
  {
    num: '03',
    title: 'Auto-match',
    desc: 'BOLs pair to rate cons by load number and pickup → delivery keys.',
    delayClass: 'reveal-delay-2',
  },
  {
    num: '04',
    title: 'Review & verify',
    desc: 'Open any PDF in the side viewer before you send paperwork downstream.',
    delayClass: 'reveal-delay-3',
  },
  {
    num: '05',
    title: 'Invoice',
    desc: 'Pre-filled invoice PDF per load from the matched rate con.',
    delayClass: 'reveal-delay-4',
  },
  {
    num: '06',
    title: 'Export binder',
    desc: 'ZIP per load or full batch — Rate_Confirmation / BOL folders ready for clients.',
    delayClass: 'reveal-delay-5',
  },
] as const

export const DOCSORT_FEATURES = [
  {
    title: 'Built for sorting only',
    desc: 'DocSort does not run AIDocView’s cross-validation, verdicts, or rules engine. Sold and deployed separately.',
    variant: 'accent',
  },
  {
    title: 'View before you ship',
    desc: 'Every matched file has a View action — inline PDF preview so clerks confirm load numbers and stops.',
    variant: 'default',
  },
  {
    title: 'Client-ready binders',
    desc: 'One-click ZIP with folder structure your factoring clients expect, plus optional invoice PDF in the load folder.',
    variant: 'default',
  },
] as const

export const DOCSORT_COMPARE = {
  docsort: [
    'Match rate cons ↔ BOLs',
    'Batch PDF upload',
    'PDF preview',
    'Invoice generation',
    'Binder ZIP export',
  ],
  aidocview: [
    'Full paperwork audit',
    'Approve / reject / review verdicts',
    'Cross-document validation',
    'Dispatcher rules & learning',
    'Technical extraction log',
  ],
} as const

export const DOCSORT_SAMPLE_GROUPS = [
  {
    load: '88421',
    rateCon: 'RC_Knight_88421.pdf',
    bol: 'BOL_88421_signed.pdf',
    lane: 'Dallas, TX → Atlanta, GA',
    status: 'matched' as const,
  },
  {
    load: '88390',
    rateCon: 'RateCon_88390.pdf',
    bol: 'POD_88390.pdf',
    lane: 'Chicago, IL → Memphis, TN',
    status: 'matched' as const,
  },
  {
    load: '88377',
    rateCon: '—',
    bol: 'BOL_88377_orphan.pdf',
    lane: 'Unmatched — no rate con',
    status: 'unmatched' as const,
  },
] as const

export const DOCSORT_PREVIEW_NOTE = 'Illustration only — not live data'
