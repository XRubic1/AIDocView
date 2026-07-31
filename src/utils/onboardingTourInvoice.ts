/**
 * Session-local demo batch + invoice for the invoice-status onboarding tour.
 * Never persists to Supabase.
 */
import { mergeBatch, removeBatchFromStore, type Batch } from '../data/mockBatches'
import {
  addInvoice,
  getInvoiceById,
  removeInvoiceFromStore,
} from '../data/mockInvoices'
import {
  addPayment,
  getPaymentById,
  getPaymentsByInvoiceId,
  removePaymentFromStore,
} from '../data/mockPayments'
import { notifyTenantDataUpdated } from '../services/supabase/tenantDataLiveSync'
import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'

export type TourInvoiceStage =
  | 'batch'
  | 'open'
  | 'hold'
  | 'ppw'
  | 'awaiting'
  | 'paid'

const TOUR_INV_PREFIX = 'inv-onboard-tour'
const TOUR_PAY_PREFIX = 'pay-onboard-tour'
const TOUR_BATCH_PREFIX = 'batch-onboard-tour'
const TOUR_LOAD = 'TOUR-1001'
const TOUR_AMOUNT = 2450
const TOUR_BROKER_ID = 'broker-onboard-tour'
const TOUR_BROKER_NAME = 'Horizon Freight LLC'

/** Stable tour invoice id for a client. */
export function tourInvoiceId(clientId: string): string {
  return `${TOUR_INV_PREFIX}-${clientId}`
}

/** True if this invoice id belongs to the onboarding status tour. */
export function isTourInvoiceId(invoiceId: string): boolean {
  return invoiceId.startsWith(`${TOUR_INV_PREFIX}-`)
}

/** Stable tour payment id for a client. */
export function tourPaymentId(clientId: string): string {
  return `${TOUR_PAY_PREFIX}-${clientId}`
}

/** Stable tour batch id for a client. */
export function tourBatchId(clientId: string): string {
  return `${TOUR_BATCH_PREFIX}-${clientId}`
}

/** True if this batch id belongs to the onboarding status tour. */
export function isTourBatchId(batchId: string): boolean {
  return batchId.startsWith(`${TOUR_BATCH_PREFIX}-`)
}

function isoDateOffset(days: number): string {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function invoiceNumberFor(clientId: string): string {
  const tail = clientId.replace(/\D/g, '').slice(-4) || '1001'
  return `TOUR-${tail}`
}

function batchNumberFor(clientId: string): string {
  const year = new Date().getFullYear()
  const tail = clientId.replace(/\D/g, '').slice(-3) || '001'
  return `${year}-TOUR${tail}`
}

/** Patch invoice in memory only. */
function patchTourInvoiceLocal(
  invoiceId: string,
  patch: Partial<Invoice>,
  clearKeys: (keyof Invoice)[] = []
): void {
  const inv = getInvoiceById(invoiceId)
  if (!inv) return
  Object.assign(inv, patch, { updated_at: new Date().toISOString() })
  for (const key of clearKeys) {
    delete inv[key]
  }
}

/** Ensure a local-only tour batch exists (submitted / in review). */
export function ensureTourBatch(clientId: string, clientName: string): Batch {
  const id = tourBatchId(clientId)
  const batch: Batch = {
    id,
    batch_number: batchNumberFor(clientId),
    client_id: clientId,
    client_name: clientName,
    total_invoices: 1,
    total_amount: TOUR_AMOUNT,
    minutes_since_submitted: 12,
    status: 'processing',
    submitted_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    upload_mode: 'handoff',
  }
  mergeBatch(batch)
  return batch
}

/** Ensure the tour invoice exists (linked to the tour batch). */
export function ensureTourInvoice(clientId: string, clientName: string): Invoice {
  const id = tourInvoiceId(clientId)
  const existing = getInvoiceById(id)
  if (existing) return existing

  const batch = ensureTourBatch(clientId, clientName)
  return addInvoice(
    {
      id,
      invoice_number: invoiceNumberFor(clientId),
      client_id: clientId,
      client_name: clientName,
      broker_id: TOUR_BROKER_ID,
      broker_name: TOUR_BROKER_NAME,
      amount: TOUR_AMOUNT,
      invoice_date: isoDateOffset(-3),
      due_date: isoDateOffset(27),
      expected_payment_date: isoDateOffset(12),
      status: 'approved',
      load_number: TOUR_LOAD,
      batch_id: batch.id,
      batch_number: batch.batch_number,
      approved_by: 'Credyx',
      approved_at: new Date().toISOString(),
      documents_count: 2,
      notes: 'Onboarding tour demo invoice — safe to ignore.',
    },
    { deferPersist: true }
  )
}

function clearTourPayment(clientId: string): void {
  const invId = tourInvoiceId(clientId)
  const payId = tourPaymentId(clientId)
  for (const p of getPaymentsByInvoiceId(invId)) {
    removePaymentFromStore(p.id)
  }
  removePaymentFromStore(payId)
}

function upsertTourPayment(
  clientId: string,
  invoice: Invoice,
  status: Payment['status']
): Payment {
  const payId = tourPaymentId(clientId)
  const existing =
    getPaymentById(payId) ?? getPaymentsByInvoiceId(invoice.id).find((p) => p.id === payId)
  const today = isoDateOffset(0)
  const base: Omit<Payment, 'id'> & { id: string } = {
    id: payId,
    invoice_id: invoice.id,
    invoice_number: invoice.invoice_number,
    broker_name: invoice.broker_name,
    amount: invoice.amount,
    payment_date: today,
    received_date: today,
    payment_method: 'ach',
    payment_reference: 'TOUR-ACH-001',
    status,
    posted_by: 'Credyx',
    posted_source: 'credyx',
    client_confirmation_deadline: isoDateOffset(3),
    load_number: invoice.load_number,
  }

  if (status === 'confirmed') {
    base.confirmed_at = new Date().toISOString()
    base.confirmed_by = 'Credyx'
    base.client_confirmed_at = new Date().toISOString()
    base.client_confirmed_by = 'Tour'
  }

  if (existing) {
    Object.assign(existing, base)
    if (status !== 'confirmed') {
      delete existing.confirmed_at
      delete existing.confirmed_by
      delete existing.client_confirmed_at
      delete existing.client_confirmed_by
    }
    return existing
  }
  return addPayment(base, { deferPersist: true })
}

/**
 * Move the tour invoice into the stage for the active status-tour step.
 */
export function applyTourInvoiceStage(
  clientId: string,
  clientName: string,
  stage: TourInvoiceStage
): { invoiceId: string; paymentId: string | null; batchId: string } {
  ensureTourBatch(clientId, clientName)
  const id = tourInvoiceId(clientId)
  let invoice = getInvoiceById(id)
  if (!invoice) {
    invoice = ensureTourInvoice(clientId, clientName)
  }

  const batchId = tourBatchId(clientId)
  const tables: Array<'invoices' | 'payments' | 'batches'> = ['invoices', 'batches']

  switch (stage) {
    case 'batch': {
      // Batch in review; invoice not live as Open yet.
      clearTourPayment(clientId)
      ensureTourBatch(clientId, clientName)
      patchTourInvoiceLocal(
        id,
        {
          status: 'pending',
          batch_id: batchId,
          batch_number: batchNumberFor(clientId),
        },
        ['hold_reason', 'days_since_expected', 'paid_amount', 'document_send_history', 'approved_at', 'approved_by']
      )
      tables.push('payments')
      break
    }
    case 'open': {
      clearTourPayment(clientId)
      patchTourInvoiceLocal(
        id,
        {
          status: 'approved',
          expected_payment_date: isoDateOffset(12),
          due_date: isoDateOffset(27),
          approved_by: 'Credyx',
          approved_at: new Date().toISOString(),
          batch_id: batchId,
          batch_number: batchNumberFor(clientId),
        },
        ['hold_reason', 'days_since_expected', 'paid_amount', 'document_send_history']
      )
      tables.push('payments')
      break
    }
    case 'hold': {
      clearTourPayment(clientId)
      patchTourInvoiceLocal(
        id,
        {
          status: 'hold',
          hold_reason: 'Missing POD page — please re-upload the signed delivery copy.',
          expected_payment_date: isoDateOffset(12),
          approved_by: 'Credyx',
          approved_at: invoice.approved_at ?? new Date().toISOString(),
        },
        ['days_since_expected', 'paid_amount', 'document_send_history']
      )
      tables.push('payments')
      break
    }
    case 'ppw': {
      clearTourPayment(clientId)
      patchTourInvoiceLocal(
        id,
        {
          status: 'approved',
          expected_payment_date: isoDateOffset(12),
          due_date: isoDateOffset(27),
          approved_by: 'Credyx',
          approved_at: invoice.approved_at ?? new Date().toISOString(),
          document_send_history: [
            {
              email_address: 'ap@horizonfreight.example',
              sent_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
              sent_by: 'Credyx',
              status: 'delivered',
              documents_sent: ['Invoice', 'POD', 'Rate confirmation'],
              note: 'Tour demo — PPW sent to broker',
            },
          ],
        },
        ['hold_reason', 'days_since_expected', 'paid_amount']
      )
      tables.push('payments')
      break
    }
    case 'awaiting': {
      patchTourInvoiceLocal(
        id,
        {
          status: 'approved',
          expected_payment_date: isoDateOffset(-2),
          due_date: isoDateOffset(5),
          document_send_history: [
            {
              email_address: 'ap@horizonfreight.example',
              sent_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
              sent_by: 'Credyx',
              status: 'delivered',
              documents_sent: ['Invoice', 'POD', 'Rate confirmation'],
            },
          ],
        },
        ['hold_reason', 'days_since_expected', 'paid_amount']
      )
      upsertTourPayment(clientId, getInvoiceById(id) ?? invoice, 'awaiting_receipt')
      tables.push('payments')
      break
    }
    case 'paid': {
      patchTourInvoiceLocal(
        id,
        {
          status: 'paid',
          expected_payment_date: isoDateOffset(-5),
          paid_amount: TOUR_AMOUNT,
          document_send_history: [
            {
              email_address: 'ap@horizonfreight.example',
              sent_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
              sent_by: 'Credyx',
              status: 'delivered',
              documents_sent: ['Invoice', 'POD', 'Rate confirmation'],
            },
          ],
        },
        ['hold_reason', 'days_since_expected']
      )
      upsertTourPayment(clientId, getInvoiceById(id) ?? invoice, 'confirmed')
      tables.push('payments')
      break
    }
  }

  notifyTenantDataUpdated(tables, clientId)
  return {
    invoiceId: id,
    paymentId: stage === 'awaiting' || stage === 'paid' ? tourPaymentId(clientId) : null,
    batchId,
  }
}

/** Map a status-tour step id to a lifecycle stage. */
export function stageForStatusTourStep(stepId: string): TourInvoiceStage | null {
  switch (stepId) {
    case 'batchesNav':
    case 'batches':
    case 'openBatch':
    case 'batchCardNumber':
    case 'batchCardStatus':
    case 'batchCardInvoices':
    case 'batchCardAmount':
    case 'batchCardSubmitted':
    case 'batchCardOutcome':
    case 'batchInvoiceList':
      return 'batch'
    case 'navInvoices':
    case 'invoicesNav':
    case 'openList':
    case 'openDetail':
      return 'open'
    case 'hold':
      return 'hold'
    case 'ppw':
      return 'ppw'
    case 'awaiting':
    case 'confirm':
      return 'awaiting'
    case 'paid':
      return 'paid'
    default:
      // Navbar intro steps — no invoice mutation.
      return null
  }
}

/** Build the navigate URL for a status-tour step (deep links included). */
export function buildStatusTourNavigateTo(
  step: { id: string; navigateTo?: string; deepLink?: string },
  clientId: string
): string | null {
  if (!step.navigateTo) return null
  const inv = tourInvoiceId(clientId)
  const pay = tourPaymentId(clientId)
  const batch = tourBatchId(clientId)
  const params = new URLSearchParams()
  // Preserve existing query from navigateTo.
  const [path, query = ''] = step.navigateTo.split('?')
  new URLSearchParams(query).forEach((v, k) => params.set(k, v))
  params.set('tour_step', step.id)

  const deep = step.deepLink ?? 'none'
  if (deep === 'invoice') {
    params.set('highlight_invoice', inv)
  } else if (deep === 'invoiceRow') {
    // Flash the list row only — do not open the detail panel.
    params.set('highlight_invoice', inv)
    params.set('row_only', '1')
  } else if (deep === 'payment') {
    params.set('paymentId', pay)
  } else if (deep === 'batch') {
    params.set('highlight_batch', batch)
  } else if (deep === 'openBatch') {
    params.set('batch', batch)
    params.set('highlight_batch', batch)
  }

  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

/** Remove tour batch, invoice, and payment from memory. */
export function cleanupTourInvoice(clientId: string): void {
  const id = tourInvoiceId(clientId)
  clearTourPayment(clientId)
  if (getInvoiceById(id)) {
    removeInvoiceFromStore(id)
  }
  removeBatchFromStore(tourBatchId(clientId))
  notifyTenantDataUpdated(['invoices', 'payments', 'batches'], clientId)
}
