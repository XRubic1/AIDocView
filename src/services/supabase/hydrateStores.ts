import { getSupabase, isSupabaseConfigured } from '../../lib/supabase'
import { hydrateInvoices } from '../../data/mockInvoices'
import { hydrateBatches } from '../../data/mockBatches'
import { hydratePayments } from '../../data/mockPayments'
import { hydrateBrokers } from '../../data/mockBrokers'
import { hydrateNotifications } from '../../data/mockNotifications'
import { hydrateClientDocuments } from '../../data/mockClientDocuments'
import { registerClientDocumentStoragePath } from '../clientDocumentService'
import {
  batchRowToBatch,
  invoiceRowToInvoice,
  paymentRowToPayment,
  type BatchRow,
  type InvoiceRow,
  type PaymentRow,
} from './tenantMappers'
import { brokerRowToBroker, type BrokerRow } from './brokerMappers'
import {
  auditLogRowToAuditLog,
  clientDocumentRowToClientDocument,
  notificationRowToNotification,
  type AuditLogRow,
  type ClientDocumentRow,
  type NotificationRow,
} from './platformMappers'
import { hydrateClientRegistry } from '../clientRegistry'

let hydratePromise: Promise<void> | null = null

/** Load all platform data from Supabase into in-memory stores. */
export async function hydrateAllStores(): Promise<void> {
  if (hydratePromise) return hydratePromise

  hydratePromise = (async () => {
    await hydrateClientRegistry()

    if (!isSupabaseConfigured()) return

    const supabase = getSupabase()
    if (!supabase) return

    const [
      invoicesRes,
      batchesRes,
      paymentsRes,
      brokersRes,
      notificationsRes,
      auditRes,
      documentsRes,
    ] = await Promise.all([
      supabase.from('invoices').select('*').order('created_at', { ascending: false }),
      supabase.from('batches').select('*').order('submitted_at', { ascending: false }),
      supabase.from('payments').select('*').order('received_date', { ascending: false }),
      supabase.from('brokers').select('*').order('name', { ascending: true }),
      supabase.from('notifications').select('*').order('timestamp', { ascending: false }),
      supabase.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(10000),
      supabase.from('client_documents').select('*').order('uploaded_at', { ascending: false }),
    ])

    if (!invoicesRes.error && invoicesRes.data) {
      hydrateInvoices((invoicesRes.data as InvoiceRow[]).map(invoiceRowToInvoice))
    }
    if (!batchesRes.error && batchesRes.data) {
      hydrateBatches((batchesRes.data as BatchRow[]).map(batchRowToBatch))
    }
    if (!paymentsRes.error && paymentsRes.data) {
      hydratePayments((paymentsRes.data as PaymentRow[]).map(paymentRowToPayment))
    }
    if (!brokersRes.error && brokersRes.data) {
      hydrateBrokers((brokersRes.data as BrokerRow[]).map(brokerRowToBroker))
    }
    if (!notificationsRes.error && notificationsRes.data) {
      hydrateNotifications(
        (notificationsRes.data as NotificationRow[]).map(notificationRowToNotification)
      )
    }
    if (!auditRes.error && auditRes.data) {
      const { setAuditLogsFromHydrate } = await import('../../utils/auditLogger')
      setAuditLogsFromHydrate((auditRes.data as AuditLogRow[]).map(auditLogRowToAuditLog))
    }
    if (!documentsRes.error && documentsRes.data) {
      const docs = (documentsRes.data as ClientDocumentRow[]).map(clientDocumentRowToClientDocument)
      hydrateClientDocuments(docs)
      for (const row of documentsRes.data as ClientDocumentRow[]) {
        if (row.storage_path) registerClientDocumentStoragePath(row.id, row.storage_path)
      }
    }
  })()

  try {
    await hydratePromise
  } finally {
    hydratePromise = null
  }
}

export const hydrateStores = hydrateAllStores
