import { useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { getAdminCapabilities } from '../utils/adminCapabilities'

/** Admin portal capability flags for the signed-in user. */
export function useAdminCapabilities() {
  const { resolved } = useAuth()
  const capabilities = useMemo(
    () => getAdminCapabilities(resolved.user),
    [resolved.user]
  )
  return { capabilities }
}
