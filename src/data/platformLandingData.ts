/** Combined platform landing — AIDocView + DocSort product cards. */

export const PLATFORM_HERO = {
  tag: 'Freight document intelligence',
  title: 'Two products.',
  titleAccent: 'One paperwork stack.',
  sub: 'AIDocView audits every load for approval-ready paperwork. DocSort batches rate cons and BOLs, matches by load, and ships PDF binders and invoices — sold and deployed separately.',
} as const

export type PlatformProductId = 'aidocview' | 'docsort'

export interface PlatformProductCard {
  id: PlatformProductId
  name: string
  nameAccent: string
  tagline: string
  description: string
  highlights: string[]
  primaryCta: string
  primaryPath: string
  secondaryCta: string
  secondaryPath: string
  variant: 'audit' | 'sort'
}

export const PLATFORM_PRODUCTS: PlatformProductCard[] = [
  {
    id: 'aidocview',
    name: 'AI',
    nameAccent: 'DocView',
    tagline: 'Review engine',
    description:
      'Cross-validates rate cons, BOLs, invoices, and PODs. Clear approve, reject, or review verdicts with dispatcher rules that learn from corrections.',
    highlights: [
      'Full paperwork audit per load',
      'Approve · reject · review verdicts',
      'Cross-document validation',
      'Rules & shipper overrides',
      'Technical extraction log',
    ],
    primaryCta: 'Open review engine',
    primaryPath: '/engine',
    secondaryCta: 'AIDocView landing',
    secondaryPath: '/',
    variant: 'audit',
  },
  {
    id: 'docsort',
    name: 'Doc',
    nameAccent: 'Sort',
    tagline: 'Batch matching',
    description:
      'Upload dozens of PDFs at once. AI fingerprints and matches BOLs to rate cons — then view files, generate invoices, and export PDF binders by load or invoice number.',
    highlights: [
      'Bulk PDF upload & AI match',
      'AI-extracted rate (verify manually)',
      'PDF preview per document',
      'Invoice generation',
      'PDF binder · load # or invoice #',
    ],
    primaryCta: 'Open DocSort',
    primaryPath: '/sort',
    secondaryCta: 'DocSort landing',
    secondaryPath: '/docsort',
    variant: 'sort',
  },
]

export const PLATFORM_COMPARE_ROWS = [
  { label: 'Primary job', aidocview: 'Audit one load’s paperwork', docsort: 'Sort & package many PDFs' },
  { label: 'Verdicts', aidocview: 'Approve / reject / review', docsort: 'Match groups only' },
  { label: 'Rules engine', aidocview: 'Yes — learns overrides', docsort: 'No audit pipeline' },
  { label: 'Batch upload', aidocview: 'Per load workbench', docsort: 'Many PDFs at once' },
  { label: 'Invoice & binder', aidocview: 'Via AR workflows', docsort: 'Built-in PDF binder' },
  { label: 'Best for', aidocview: 'Factoring QA before funding', docsort: 'Clerks sorting daily drops' },
] as const

export const PLATFORM_WHEN_TO_USE = [
  {
    title: 'Use AIDocView when',
    body: 'You need a definitive answer on whether a single load’s packet is complete, compliant, and ready to factor — with flags, tolerances, and audit history.',
  },
  {
    title: 'Use DocSort when',
    body: 'You receive a folder of mixed rate cons and BOLs and need them grouped by load fast, with optional invoices and client-ready PDF binders — no verdict engine required.',
  },
] as const

export const PLATFORM_AI_NOTE =
  'DocSort uses AI for matching, rates, and metadata. AI can make mistakes — always double-check against original PDFs before invoicing or sending binders. AIDocView audit outputs should likewise be verified for high-stakes funding decisions.'
