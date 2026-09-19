import type { Session } from '@supabase/supabase-js'
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase'
import { hydrateInvoices, clearInvoices } from '../../data/mockInvoices'
import { hydrateBatches, clearBatches } from '../../data/mockBatches'
import { hydratePayments, clearPayments } from '../../data/mockPayments'
import { hydrateBrokers } from '../../data/mockBrokers'
import { clearBrokerRiskStore } from '../../data/brokerRiskStore'
import { hydrateNotifications, clearNotifications } from '../../data/mockNotifications'
import { hydrateClientDocuments, clearClientDocuments } from '../../data/mockClientDocuments'
import { hydrateBrokerRiskFromSupabase } from './brokerRiskPersist'
import { registerClientDocumentStoragePath } from '../clientDocumentService'
import {
  batchRowToBatch,
  invoiceRowToInvoice,
  paymentRowToPayment,
  type BatchRow,
  type InvoiceRow,
  type PaymentRow,
} from './tenantMappers'
import {
  brokerRowToBroker,
  brokerRowToPublicBroker,
  BROKER_PUBLIC_SELECT,
  type BrokerRow,
} from './brokerMappers'
import {
  auditLogRowToAuditLog,
  clientDocumentRowToClientDocument,
  notificationRowToNotification,
  type AuditLogRow,
  type ClientDocumentRow,
  type NotificationRow,
} from './platformMappers'
import { hydrateClientRegistry, resetClientRegistryCache, getClientById } from '../clientRegistry'
import { restoreAllDraftBatches, restoreClientDraftBatches } from '../clientBatchDraftService'
import { clearClientBills, hydrateClientBillsFromSupabase, refreshOverdueBillStatuses } from '../arBillingService'
import {
  clearReimbursementLedger,
  hydrateReimbursementLedgerFromSupabase,
} from '../reimbursementAccountService'
import { hydrateAdminNotifications } from '../adminNotificationService'
import {
  loadArPolicy,
  applyArPolicy,
  loadCollectionsPolicy,
  applyCollectionsPolicy,
  loadEmailLifecycleSettings,
  applyEmailLifecycleSettings,
  loadEmailMailboxes,
  applyEmailMailboxes,
} from '../platformSettingsService'
import { applyAiPolicy, loadAiPolicy } from '../aiSpendService'
import { resolveSession } from '../sessionService'
import {
  ensureTenantDataLiveSync,
  stopTenantDataLiveSync,
} from './tenantDataLiveSync'

export class HydrationError extends Error {
  constructor(
    message: string,
    public readonly details?: string[]
  ) {
    super(message)
    this.name = 'HydrationError'
  }
}

let lastHydratedPrincipal: 'admin' | 'client' | 'none' | null = null
let lastHydratedClientId: string | null = null

/** Clear in-memory tenant stores (on sign-out or principal change). */
export function clearTenantStores(): void {
  stopTenantDataLiveSync()
  clearInvoices()
  clearBatches()
  clearPayments()
  clearNotifications()
  clearClientDocuments()
  clearClientBills()
  clearReimbursementLedger()
  clearBrokerRiskStore()
  resetClientRegistryCache()
  lastHydratedPrincipal = null
  lastHydratedClientId = null
}

/** Load platform data scoped to the authenticated principal. */
export async function hydrateStoresForSession(session: Session | null): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new HydrationError('Supabase is required but not configured.')
  }

  const supabase = getSupabase()
  if (!supabase) {
    throw new HydrationError('Supabase client could not be initialized.')
  }

  const resolved = resolveSession(session)
  const { principal, clientId } = resolved

  if (principal === lastHydratedPrincipal && clientId === lastHydratedClientId) {
    return
  }

  clearTenantStores()

  if (principal === 'none') {
    lastHydratedPrincipal = 'none'
    lastHydratedClientId = null
    return
  }

  const errors: string[] = []

  if (principal === 'admin') {
    await hydrateClientRegistry({ scope: 'admin' })

    const [
      invoicesRes,
      batchesRes,
      paymentsRes,
      brokersRes,
      notificationsRes,
      documentsRes,
    ] = await Promise.all([
      supabase.from('invoices').select('*').order('created_at', { ascending: false }),
      supabase.from('batches').select('*').order('submitted_at', { ascending: false }),
      supabase.from('payments').select('*').order('received_date', { ascending: false }),
      supabase.from('brokers').select('*').order('name', { ascending: true }),
      supabase.from('notifications').select('*').order('timestamp', { ascending: false }),
      supabase.from('client_documents').select('*').order('uploaded_at', { ascending: false }),
    ])

    if (invoicesRes.error) errors.push(`invoices: ${invoicesRes.error.message}`)
    else if (invoicesRes.data) {
      hydrateInvoices((invoicesRes.data as InvoiceRow[]).map(invoiceRowToInvoice))
    }

    if (batchesRes.error) errors.push(`batches: ${batchesRes.error.message}`)
    else if (batchesRes.data) {
      hydrateBatches((batchesRes.data as BatchRow[]).map(batchRowToBatch))
    }

    if (paymentsRes.error) errors.push(`payments: ${paymentsRes.error.message}`)
    else if (paymentsRes.data) {
      hydratePayments((paymentsRes.data as PaymentRow[]).map(paymentRowToPayment))
    }

    if (brokersRes.error) errors.push(`brokers: ${brokersRes.error.message}`)
    else if (brokersRes.data) {
      hydrateBrokers((brokersRes.data as BrokerRow[]).map(brokerRowToBroker))
    }

    if (notificationsRes.error) errors.push(`notifications: ${notificationsRes.error.message}`)
    else if (notificationsRes.data) {
      hydrateNotifications(
        (notificationsRes.data as NotificationRow[]).map(notificationRowToNotification)
      )
    }

    if (documentsRes.error) errors.push(`client_documents: ${documentsRes.error.message}`)
    else if (documentsRes.data) {
      const docs = (documentsRes.data as ClientDocumentRow[]).map(clientDocumentRowToClientDocument)
      hydrateClientDocuments(docs)
      for (const row of documentsRes.data as ClientDocumentRow[]) {
        if (row.storage_path) registerClientDocumentStoragePath(row.id, row.storage_path)
      }
    }

    try {
      await hydrateClientBillsFromSupabase()
      refreshOverdueBillStatuses()
    } catch (err) {
      errors.push(`client_bills: ${err instanceof Error ? err.message : String(err)}`)
    }

    try {
      await hydrateReimbursementLedgerFromSupabase()
    } catch (err) {
      errors.push(`reimbursement_ledger: ${err instanceof Error ? err.message : String(err)}`)
    }

    try {
      await hydrateAdminNotifications()
    } catch (err) {
      errors.push(`admin_notifications: ${err instanceof Error ? err.message : String(err)}`)
    }

    try {
      await hydrateBrokerRiskFromSupabase()
    } catch (err) {
      errors.push(`broker_risk: ${err instanceof Error ? err.message : String(err)}`)
    }

    try {
      const policy = await loadArPolicy()
      applyArPolicy(policy)
    } catch (err) {
      errors.push(`ar_policy: ${err instanceof Error ? err.message : String(err)}`)
    }

    try {
      const collectionsPolicy = await loadCollectionsPolicy()
      applyCollectionsPolicy(collectionsPolicy)
    } catch (err) {
      errors.push(`collections_policy: ${err instanceof Error ? err.message : String(err)}`)
    }

    try {
      const emailLifecycle = await loadEmailLifecycleSettings()
      applyEmailLifecycleSettings(emailLifecycle)
    } catch (err) {
      errors.push(`email_lifecycle: ${err instanceof Error ? err.message : String(err)}`)
    }

    try {
      const mailboxes = await loadEmailMailboxes()
      applyEmailMailboxes(mailboxes)
    } catch (err) {
      errors.push(`email_mailboxes: ${err instanceof Error ? err.message : String(err)}`)
    }

    try {
      const aiPolicy = await loadAiPolicy()
      applyAiPolicy(aiPolicy)
    } catch (err) {
      errors.push(`ai_policy: ${err instanceof Error ? err.message : String(err)}`)
    }

    try {
      const { loadAdminCustomRoles } = await import('../adminCustomRoleService')
      await loadAdminCustomRoles()
    } catch (err) {
      errors.push(`admin_custom_roles: ${err instanceof Error ? err.message : String(err)}`)
    }

    try {
      const { hydrateEmailInboxFromSupabase } = await import('../emailLifecycleService')
      await hydrateEmailInboxFromSupabase()
    } catch (err) {
      errors.push(`email_inbox: ${err instanceof Error ? err.message : String(err)}`)
    }

    try {
      // Merge any IndexedDB-only draft shells (files stay local; rows may also exist in Supabase).
      await restoreAllDraftBatches((id) => getClientById(id)?.name ?? 'Client')
    } catch (err) {
      errors.push(`draft_batches: ${err instanceof Error ? err.message : String(err)}`)
    }
  } else if (principal === 'client' && clientId) {
    await hydrateClientRegistry({ scope: 'client', clientId })

    const [
      invoicesRes,
      batchesRes,
      paymentsRes,
      brokersRes,
      notificationsRes,
      documentsRes,
    ] = await Promise.all([
      supabase.from('invoices').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
      supabase.from('batches').select('*').eq('client_id', clientId).order('submitted_at', { ascending: false }),
      supabase.from('payments').select('*').eq('client_id', clientId).order('received_date', { ascending: false }),
      supabase.from('brokers').select(BROKER_PUBLIC_SELECT).order('name', { ascending: true }),
      supabase.from('notifications').select('*').eq('client_id', clientId).order('timestamp', { ascending: false }),
      supabase.from('client_documents').select('*').eq('client_id', clientId).order('uploaded_at', { ascending: false }),
    ])

    if (invoicesRes.error) errors.push(`invoices: ${invoicesRes.error.message}`)
    else if (invoicesRes.data) {
      hydrateInvoices((invoicesRes.data as InvoiceRow[]).map(invoiceRowToInvoice))
    }

    if (batchesRes.error) errors.push(`batches: ${batchesRes.error.message}`)
    else if (batchesRes.data) {
      hydrateBatches((batchesRes.data as BatchRow[]).map(batchRowToBatch))
    }

    if (paymentsRes.error) errors.push(`payments: ${paymentsRes.error.message}`)
    else if (paymentsRes.data) {
      hydratePayments((paymentsRes.data as PaymentRow[]).map(paymentRowToPayment))
    }

    if (brokersRes.error) errors.push(`brokers: ${brokersRes.error.message}`)
    else if (brokersRes.data) {
      // Carriers never receive Broker.notes (internal Credyx warnings).
      hydrateBrokers((brokersRes.data as BrokerRow[]).map(brokerRowToPublicBroker))
    }

    if (notificationsRes.error) errors.push(`notifications: ${notificationsRes.error.message}`)
    else if (notificationsRes.data) {
      hydrateNotifications(
        (notificationsRes.data as NotificationRow[]).map(notificationRowToNotification)
      )
    }

    if (documentsRes.error) errors.push(`client_documents: ${documentsRes.error.message}`)
    else if (documentsRes.data) {
      const docs = (documentsRes.data as ClientDocumentRow[]).map(clientDocumentRowToClientDocument)
      hydrateClientDocuments(docs)
      for (const row of documentsRes.data as ClientDocumentRow[]) {
        if (row.storage_path) registerClientDocumentStoragePath(row.id, row.storage_path)
      }
    }

    try {
      await hydrateClientBillsFromSupabase(clientId)
      refreshOverdueBillStatuses()
    } catch (err) {
      errors.push(`client_bills: ${err instanceof Error ? err.message : String(err)}`)
    }

    try {
      await hydrateReimbursementLedgerFromSupabase(clientId)
    } catch (err) {
      errors.push(`reimbursement_ledger: ${err instanceof Error ? err.message : String(err)}`)
    }

    try {
      await hydrateBrokerRiskFromSupabase(clientId)
    } catch (err) {
      errors.push(`broker_risk: ${err instanceof Error ? err.message : String(err)}`)
    }

    try {
      const aiPolicy = await loadAiPolicy()
      applyAiPolicy(aiPolicy)
    } catch (err) {
      errors.push(`ai_policy: ${err instanceof Error ? err.message : String(err)}`)
    }

    try {
      const client = getClientById(clientId)
      await restoreClientDraftBatches(clientId, client?.name ?? 'Client')
    } catch (err) {
      errors.push(`draft_batches: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  lastHydratedPrincipal = principal
  lastHydratedClientId = clientId

  if (principal === 'admin') {
    ensureTenantDataLiveSync('admin', null)
  } else if (principal === 'client' && clientId) {
    ensureTenantDataLiveSync('client', clientId)
  }

  if (errors.length > 0) {
    throw new HydrationError('Some data failed to load.', errors)
  }
}

/** Lazy-load audit logs when the Audit page opens (not during boot hydration). */
export async function hydrateAuditLogsFromSupabase(): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new HydrationError('Supabase is required but not configured.')
  }

  const supabase = getSupabase()
  if (!supabase) {
    throw new HydrationError('Supabase client could not be initialized.')
  }

  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(10000)

  if (error) {
    throw new HydrationError(`audit_logs: ${error.message}`)
  }

  const { setAuditLogsFromHydrate } = await import('../../utils/auditLogger')
  setAuditLogsFromHydrate((data as AuditLogRow[]).map(auditLogRowToAuditLog))
}

/** @deprecated Use hydrateStoresForSession after auth resolves. */
export async function hydrateAllStores(): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  const { data } = await supabase.auth.getSession()
  await hydrateStoresForSession(data.session)
}

export const hydrateStores = hydrateAllStores
