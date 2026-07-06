import { getSupabase } from '../../lib/supabase'
import type { Invoice } from '../../types/invoice'
import type { Payment } from '../../types/payment'
import type { Batch } from '../../data/mockBatches'
import { requireClientId } from './tenantScope'
import {
  batchRowToBatch,
  invoiceRowToInvoice,
  paymentRowToPayment,
  type BatchRow,
  type InvoiceRow,
  type PaymentRow,
} from './tenantMappers'

/** Per-client data loaded from Supabase — never mixed across clients. */
export interface ClientTenantData {
  clientId: string
  invoices: Invoice[]
  payments: Payment[]
  batches: Batch[]
}

/** Fetch invoices for one client only. */
export async function fetchClientInvoices(clientId: string): Promise<Invoice[]> {
  const id = requireClientId(clientId)
  const supabase = getSupabase()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('client_id', id)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data as InvoiceRow[]).map(invoiceRowToInvoice)
}

/** Fetch payments for one client only (via payments.client_id). */
export async function fetchClientPayments(clientId: string): Promise<Payment[]> {
  const id = requireClientId(clientId)
  const supabase = getSupabase()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('client_id', id)
    .order('received_date', { ascending: false })

  if (error) throw new Error(error.message)
  return (data as PaymentRow[]).map(paymentRowToPayment)
}

/** Fetch batches for one client only. */
export async function fetchClientBatches(clientId: string): Promise<Batch[]> {
  const id = requireClientId(clientId)
  const supabase = getSupabase()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('batches')
    .select('*')
    .eq('client_id', id)
    .order('submitted_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data as BatchRow[]).map(batchRowToBatch)
}

/** Load all tenant-scoped rows for a single client in parallel. */
export async function fetchClientTenantData(clientId: string): Promise<ClientTenantData> {
  const id = requireClientId(clientId)
  const [invoices, payments, batches] = await Promise.all([
    fetchClientInvoices(id),
    fetchClientPayments(id),
    fetchClientBatches(id),
  ])
  return { clientId: id, invoices, payments, batches }
}

/** Admin: list batches for a specific client (same query, explicit name). */
export const fetchBatchesForClient = fetchClientBatches

/** Admin: list invoices for a specific client. */
export const fetchInvoicesForClient = fetchClientInvoices

/** Admin: list payments for a specific client. */
export const fetchPaymentsForClient = fetchClientPayments
