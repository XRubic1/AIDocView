import type { RealtimeChannel } from '@supabase/supabase-js'
import { mergeBatch, removeBatchFromStore } from '../../data/mockBatches'
import { mergeInvoice, removeInvoiceFromStore } from '../../data/mockInvoices'
import { mergePayment, removePaymentFromStore } from '../../data/mockPayments'
import { refreshClientTenantCacheFromStores } from '../../data/clientDemoData'
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase'
import {
  batchRowToBatch,
  invoiceRowToInvoice,
  paymentRowToPayment,
  type BatchRow,
  type InvoiceRow,
  type PaymentRow,
} from './tenantMappers'

export const TENANT_DATA_UPDATED_EVENT = 'credyx-tenant-data-updated'

export type TenantDataTable = 'batches' | 'payments' | 'invoices'

const POLL_INTERVAL_MS = 45_000

type SyncScope = {
  principal: 'admin' | 'client'
  clientId: string | null
}

let syncScope: SyncScope | null = null
let realtimeChannel: RealtimeChannel | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

function emitTenantDataUpdated(tables: TenantDataTable[], clientId?: string | null): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(TENANT_DATA_UPDATED_EVENT, {
      detail: { tables, clientId: clientId ?? null },
    })
  )
}

function touchClientCache(clientId: string | null | undefined): void {
  if (clientId) refreshClientTenantCacheFromStores(clientId)
}

/**
 * Notify open client/admin UIs after a local store mutation (e.g. Process batch).
 * Realtime handlers already emit; call this for same-session / mock writes.
 */
export function notifyTenantDataUpdated(
  tables: TenantDataTable[],
  clientId?: string | null
): void {
  emitTenantDataUpdated(tables, clientId)
  touchClientCache(clientId)
}

function handleBatchChange(
  eventType: string,
  row: BatchRow | null,
  oldRow: BatchRow | null
): void {
  if (eventType === 'DELETE') {
    const id = oldRow?.id
    if (!id) return
    removeBatchFromStore(id)
    emitTenantDataUpdated(['batches'], oldRow?.client_id)
    touchClientCache(oldRow?.client_id)
    return
  }

  if (!row?.id) return
  mergeBatch(batchRowToBatch(row))
  emitTenantDataUpdated(['batches'], row.client_id)
  touchClientCache(row.client_id)
}

function handlePaymentChange(
  eventType: string,
  row: PaymentRow | null,
  oldRow: PaymentRow | null
): void {
  if (eventType === 'DELETE') {
    const id = oldRow?.id
    if (!id) return
    removePaymentFromStore(id)
    emitTenantDataUpdated(['payments'], oldRow?.client_id)
    touchClientCache(oldRow?.client_id)
    return
  }

  if (!row?.id) return
  mergePayment(paymentRowToPayment(row))
  emitTenantDataUpdated(['payments'], row.client_id)
  touchClientCache(row.client_id)
}

function handleInvoiceChange(
  eventType: string,
  row: InvoiceRow | null,
  oldRow: InvoiceRow | null
): void {
  if (eventType === 'DELETE') {
    const id = oldRow?.id
    if (!id) return
    removeInvoiceFromStore(id)
    emitTenantDataUpdated(['invoices'], oldRow?.client_id)
    touchClientCache(oldRow?.client_id)
    return
  }

  if (!row?.id) return
  mergeInvoice(invoiceRowToInvoice(row))
  emitTenantDataUpdated(['invoices'], row.client_id)
  touchClientCache(row.client_id)
}

async function refreshTenantDataFromServer(scope: SyncScope): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabase()
  if (!supabase) return

  const tables: TenantDataTable[] = []

  if (scope.principal === 'admin') {
    const [batchesRes, paymentsRes, invoicesRes] = await Promise.all([
      supabase.from('batches').select('*').order('submitted_at', { ascending: false }),
      supabase.from('payments').select('*').order('received_date', { ascending: false }),
      supabase.from('invoices').select('*').order('created_at', { ascending: false }),
    ])

    if (batchesRes.data) {
      for (const row of batchesRes.data as BatchRow[]) mergeBatch(batchRowToBatch(row))
      tables.push('batches')
    }
    if (paymentsRes.data) {
      for (const row of paymentsRes.data as PaymentRow[]) mergePayment(paymentRowToPayment(row))
      tables.push('payments')
    }
    if (invoicesRes.data) {
      for (const row of invoicesRes.data as InvoiceRow[]) mergeInvoice(invoiceRowToInvoice(row))
      tables.push('invoices')
    }
  } else if (scope.clientId) {
    const clientId = scope.clientId
    const [batchesRes, paymentsRes, invoicesRes] = await Promise.all([
      supabase.from('batches').select('*').eq('client_id', clientId).order('submitted_at', { ascending: false }),
      supabase.from('payments').select('*').eq('client_id', clientId).order('received_date', { ascending: false }),
      supabase.from('invoices').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
    ])

    if (batchesRes.data) {
      for (const row of batchesRes.data as BatchRow[]) mergeBatch(batchRowToBatch(row))
      tables.push('batches')
    }
    if (paymentsRes.data) {
      for (const row of paymentsRes.data as PaymentRow[]) mergePayment(paymentRowToPayment(row))
      tables.push('payments')
    }
    if (invoicesRes.data) {
      for (const row of invoicesRes.data as InvoiceRow[]) mergeInvoice(invoiceRowToInvoice(row))
      tables.push('invoices')
    }
    refreshClientTenantCacheFromStores(clientId)
  }

  if (tables.length > 0) {
    emitTenantDataUpdated(tables, scope.clientId)
  }
}

function startPolling(scope: SyncScope): void {
  if (pollTimer || typeof window === 'undefined') return
  pollTimer = setInterval(() => {
    void refreshTenantDataFromServer(scope)
  }, POLL_INTERVAL_MS)
}

function stopPolling(): void {
  if (!pollTimer) return
  clearInterval(pollTimer)
  pollTimer = null
}

/**
 * Subscribe to batches, payments, and invoices for live cross-session sync.
 * Admin sees all tenants; client sessions are filtered by client_id.
 */
export function ensureTenantDataLiveSync(
  principal: 'admin' | 'client',
  clientId: string | null
): void {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabase()
  if (!supabase) return

  if (principal === 'client' && !clientId) return

  const nextScope: SyncScope = { principal, clientId }
  if (
    syncScope?.principal === nextScope.principal &&
    syncScope?.clientId === nextScope.clientId &&
    realtimeChannel
  ) {
    return
  }

  stopTenantDataLiveSync()

  syncScope = nextScope
  const channelName =
    principal === 'admin' ? 'tenant-data-admin' : `tenant-data-client-${clientId}`

  const channel = supabase.channel(channelName)

  const batchFilter =
    principal === 'client' && clientId ? { filter: `client_id=eq.${clientId}` } : {}
  const paymentFilter =
    principal === 'client' && clientId ? { filter: `client_id=eq.${clientId}` } : {}
  const invoiceFilter =
    principal === 'client' && clientId ? { filter: `client_id=eq.${clientId}` } : {}

  channel
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'batches', ...batchFilter },
      (payload) => {
        handleBatchChange(
          payload.eventType,
          payload.new as BatchRow | null,
          payload.old as BatchRow | null
        )
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'payments', ...paymentFilter },
      (payload) => {
        handlePaymentChange(
          payload.eventType,
          payload.new as PaymentRow | null,
          payload.old as PaymentRow | null
        )
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'invoices', ...invoiceFilter },
      (payload) => {
        handleInvoiceChange(
          payload.eventType,
          payload.new as InvoiceRow | null,
          payload.old as InvoiceRow | null
        )
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        stopPolling()
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        startPolling(nextScope)
      }
    })

  realtimeChannel = channel
  startPolling(nextScope)
}

/** Tear down tenant realtime subscriptions (sign-out / principal change). */
export function stopTenantDataLiveSync(): void {
  stopPolling()
  if (realtimeChannel) {
    const supabase = getSupabase()
    if (supabase) void supabase.removeChannel(realtimeChannel)
    realtimeChannel = null
  }
  syncScope = null
}

/** Subscribe to tenant data updates (batches, payments, invoices). */
export function subscribeTenantDataUpdates(onUpdate: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  const handler = () => onUpdate()
  window.addEventListener(TENANT_DATA_UPDATED_EVENT, handler)
  return () => window.removeEventListener(TENANT_DATA_UPDATED_EVENT, handler)
}
