import { useEffect, useState } from 'react'
import { subscribeTenantDataUpdates } from '../services/supabase/tenantDataLiveSync'

/** Bump when batches, payments, or invoices change via Supabase realtime. */
export function useTenantDataRevision(): number {
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    return subscribeTenantDataUpdates(() => {
      setRevision((n) => n + 1)
    })
  }, [])

  return revision
}
