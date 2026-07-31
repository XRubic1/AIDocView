/**
 * Follow-on tours after submit:
 * - Batch tour: where paperwork lands and batch detail cards
 * - Invoice tour: Open → Hold → PPW → confirm → paid
 */

export type FollowOnTourStep = {
  id: string
  target: string | null
  title: string
  body: string
  /** Base route (deep-link query is added at runtime). */
  navigateTo?: string
  /** Append highlight / payment / batch deep-link for this step. */
  deepLink?: 'none' | 'batch' | 'openBatch' | 'invoice' | 'invoiceRow' | 'payment'
  /**
   * Allow clicking the highlighted target (spotlight passes clicks through).
   * Clicking the target advances the tour.
   */
  requireTargetClick?: boolean
}

/** @deprecated Use FollowOnTourStep */
export type InvoiceStatusTourStep = FollowOnTourStep

export type FollowOnTourKind = 'batch' | 'invoice'

/** Batches tour — upload → batch list → open → detail cards. */
export const BATCH_TOUR_STEPS: FollowOnTourStep[] = [
  {
    id: 'batchesNav',
    target: 'navBatches',
    title: 'Batches',
    body: 'When you upload your documents, a new batch is created and lives here under Batches.',
    navigateTo: '/client/batches?tab=view',
    deepLink: 'none',
  },
  {
    id: 'batches',
    target: 'tourBatchRow',
    title: 'First, a batch appears',
    body: 'Here’s your demo batch. Credyx creates the invoices from the paperwork you submit — a batch can hold more than one invoice, depending on how many documents you upload.',
    navigateTo: '/client/batches?tab=view',
    deepLink: 'batch',
  },
  {
    id: 'openBatch',
    target: 'tourBatchRow',
    title: 'Open the batch',
    body: 'Click this batch row to open it and see the paperwork Credyx is working on.',
    navigateTo: '/client/batches?tab=view',
    deepLink: 'batch',
    requireTargetClick: true,
  },
  {
    id: 'batchCardNumber',
    target: 'batchCardNumber',
    title: 'Batch number',
    body: 'Every submission gets a unique batch number so you can find it later.',
    navigateTo: '/client/batches?tab=view',
    deepLink: 'openBatch',
  },
  {
    id: 'batchCardStatus',
    target: 'batchCardStatus',
    title: 'Batch status',
    body: 'Status shows where Credyx is with this batch:\n• Processing — we’re building invoices from your docs\n• In review — we’re verifying paperwork\n• Posted — invoices are live and ready to track',
    navigateTo: '/client/batches?tab=view',
    deepLink: 'openBatch',
  },
  {
    id: 'batchCardInvoices',
    target: 'batchCardInvoices',
    title: 'Invoice count',
    body: 'How many invoices Credyx built from the documents in this batch.',
    navigateTo: '/client/batches?tab=view',
    deepLink: 'openBatch',
  },
  {
    id: 'batchCardAmount',
    target: 'batchCardAmount',
    title: 'Batch amount',
    body: 'Total dollar amount across all invoices in this batch.',
    navigateTo: '/client/batches?tab=view',
    deepLink: 'openBatch',
  },
  {
    id: 'batchCardSubmitted',
    target: 'batchCardSubmitted',
    title: 'Submitted date',
    body: 'When the batch was created — the date you uploaded the paperwork.',
    navigateTo: '/client/batches?tab=view',
    deepLink: 'openBatch',
  },
  {
    id: 'batchCardOutcome',
    target: 'batchCardOutcome',
    title: 'Outcome',
    body: 'After review: how many invoices were approved vs rejected.',
    navigateTo: '/client/batches?tab=view',
    deepLink: 'openBatch',
  },
  {
    id: 'batchInvoiceList',
    target: 'batchInvoiceList',
    title: 'Invoices in this batch',
    body: 'Below the cards, each invoice lists amount and status for this submission.',
    navigateTo: '/client/batches?tab=view',
    deepLink: 'openBatch',
  },
]

/** Invoice tour — Open → Hold → PPW → confirm payment → paid (+ remaining nav). */
export const INVOICE_STATUS_TOUR_STEPS: FollowOnTourStep[] = [
  {
    id: 'invoicesNav',
    target: 'navInvoices',
    title: 'Invoices tab',
    body: 'When the batch is processed, every invoice from it lives here under Invoices. That’s your home for Open, Hold, and Paid.',
    navigateTo: '/client/invoices?status=approved',
    deepLink: 'none',
  },
  {
    id: 'openList',
    target: 'tourInvoiceRow',
    title: 'Then the invoice shows as Open',
    body: 'Here’s your demo invoice under Open — submitted to the broker and waiting to be paid.',
    navigateTo: '/client/invoices?status=approved',
    deepLink: 'invoiceRow',
  },
  {
    id: 'openDetail',
    target: 'invoiceDetail',
    title: 'Open the invoice',
    body: 'This is an open invoice. From here you can track status, notes, and anything Credyx needs from you.',
    navigateTo: '/client/invoices?status=approved',
    deepLink: 'invoice',
  },
  {
    id: 'hold',
    target: 'invoiceHoldAction',
    title: 'If there’s an issue — Hold',
    body: 'Missing docs or a problem? The invoice moves to Hold. Open it to see Action required and what Credyx needs you to fix.',
    navigateTo: '/client/invoices?status=hold',
    deepLink: 'invoice',
  },
  {
    id: 'ppw',
    target: 'invoicePpwSent',
    title: 'No issues — PPW sent',
    body: 'When paperwork looks good, Credyx sends the invoice packet (PPW) to the broker. Look for PPW sent on the invoice — and the green check in the list.',
    navigateTo: '/client/invoices?status=approved',
    deepLink: 'invoice',
  },
  {
    id: 'awaiting',
    target: 'paymentsAwaitingFilter',
    title: 'Payment hits your account',
    body: 'When the broker pays and Credyx posts it, the payment waits for you to confirm you received the money.',
    navigateTo: '/client/payments?status=awaiting_receipt',
    deepLink: 'none',
  },
  {
    id: 'confirm',
    target: 'paymentConfirmBtn',
    title: 'Confirm you received it',
    body: 'Open the payment and tap Confirm received. That’s how you clear awaiting confirmation. Dispute if the funds never arrived.',
    navigateTo: '/client/payments?status=awaiting_receipt',
    deepLink: 'payment',
  },
  {
    id: 'paid',
    target: 'invoiceFilter-paid',
    title: 'Confirmed → Paid',
    body: 'After you confirm, the invoice moves to Paid — your record that collection is complete.',
    navigateTo: '/client/invoices?status=paid',
    deepLink: 'none',
  },
  // Remaining sidebar items — one at a time
  {
    id: 'navDocuments',
    target: 'navDocuments',
    title: 'Document Vault',
    body: 'Store carrier docs and setup paperwork here — your Document Vault.',
    navigateTo: '/client/documents',
    deepLink: 'none',
  },
  {
    id: 'navCollections',
    target: 'navCollections',
    title: 'Aging A/R',
    body: 'Aging A/R breaks open invoices into time buckets so you can see what’s aging out.',
    navigateTo: '/client/collections',
    deepLink: 'none',
  },
  {
    id: 'navBrokers',
    target: 'navBrokers',
    title: 'Brokers',
    body: 'Broker risk and payment habits live here — who pays on time vs who needs watching.',
    navigateTo: '/client/brokers',
    deepLink: 'none',
  },
  {
    id: 'navAssistant',
    target: 'navAssistant',
    title: 'Assistant',
    body: 'Ask the Assistant about invoices, holds, or what needs attention — your in-portal helper.',
    navigateTo: '/client/assistant',
    deepLink: 'none',
  },
  {
    id: 'navShortPayments',
    target: 'navShortPayments',
    title: 'Pay variances',
    body: 'Short pays and overpayments show up under Pay variances so you can resolve them.',
    navigateTo: '/client/short-payments',
    deepLink: 'none',
  },
  {
    id: 'navReports',
    target: 'navReports',
    title: 'Reports',
    body: 'Reports summarize invoiced vs collected over time when you need a wider view.',
    navigateTo: '/client/reports',
    deepLink: 'none',
  },
  {
    id: 'navSettings',
    target: 'navSettings',
    title: 'Settings & support',
    body: 'Account settings are here, and Support is always one click away if you need help.',
    navigateTo: '/client/settings',
    deepLink: 'none',
  },
]

/** Steps for the active follow-on tour kind. */
export function getFollowOnTourSteps(kind: FollowOnTourKind): FollowOnTourStep[] {
  return kind === 'batch' ? BATCH_TOUR_STEPS : INVOICE_STATUS_TOUR_STEPS
}
