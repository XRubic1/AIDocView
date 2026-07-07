import { useEffect, useMemo, useRef, useState } from 'react'
import {
  buildClientDashboardData,
  loadClientTenantData,
} from '../data/clientDemoData'
import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import type { Batch } from '../data/mockBatches'
import { useClientSession } from './useClientSession'

/** Client-scoped invoices, payments, batches, and dashboard — one client at a time. */
export function useClientDemoSnapshot(refreshKey = 0) {
  const { clientId, clientName } = useClientSession()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [staleError, setStaleError] = useState<string | null>(null)
  const hasLoadedRef = useRef(false)

  const [focusRefresh, setFocusRefresh] = useState(0)

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setFocusRefresh((n) => n + 1)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  useEffect(() => {
    if (!clientId) {
      setInvoices([])
      setPayments([])
      setBatches([])
      setLoading(false)
      hasLoadedRef.current = false
      setStaleError(null)
      return
    }

    let cancelled = false
    void (async () => {
      setLoading(true)
      setStaleError(null)
      try {
        const data = await loadClientTenantData(clientId, clientName)
        if (!cancelled) {
          setInvoices(data.invoices)
          setPayments(data.payments)
          setBatches(data.batches)
          hasLoadedRef.current = true
        }
      } catch (err) {
        console.error('[useClientDemoSnapshot] load failed:', err)
        if (!cancelled) {
          if (hasLoadedRef.current) {
            setStaleError('Data may be out of date. Try refreshing the page.')
          } else {
            setInvoices([])
            setPayments([])
            setBatches([])
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [clientId, clientName, refreshKey, focusRefresh])

  const dashboard = useMemo(
    () => buildClientDashboardData(clientId, clientName, invoices, payments),
    [clientId, clientName, invoices, payments]
  )

  return {
    clientId,
    clientName,
    dashboard,
    invoices,
    payments,
    batches,
    loading,
    isInitialLoad: loading && !hasLoadedRef.current,
    isRefreshing: loading && hasLoadedRef.current,
    staleError,
    dismissStaleError: () => setStaleError(null),
  }
}
