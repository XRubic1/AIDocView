import { useMemo } from 'react'
import {
  buildClientDashboardData,
  getClientInvoices,
  getClientPayments,
} from '../data/clientDemoData'
import { useClientSession } from './useClientSession'

/** Client-scoped invoices, payments, and dashboard derived from the unified demo store. */
export function useClientDemoSnapshot(refreshKey = 0) {
  const { clientId, clientName } = useClientSession()

  return useMemo(
    () => ({
      clientId,
      clientName,
      dashboard: buildClientDashboardData(clientId, clientName),
      invoices: getClientInvoices(clientId, clientName),
      payments: getClientPayments(clientId, clientName),
    }),
    [clientId, clientName, refreshKey]
  )
}
