import { useEffect, useState } from 'react'
import { subscribeTenantDataUpdates } from '../services/supabase/tenantDataLiveSync'

/** Bump when batches, payments, invoices, or broker risk change via live sync. */
export function useTenantDataRevision(): number {
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    return subscribeTenantDataUpdates(() => {
      setRevision((n) => n + 1)
    })
  }, [])

  return revision
}
