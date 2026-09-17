import { useMemo, useSyncExternalStore } from 'react'
import { useAuth } from '../context/AuthContext'
import { getAdminCapabilities } from '../utils/adminCapabilities'
import {
  getAdminCustomRolesVersion,
  subscribeAdminCustomRoles,
} from '../data/adminCustomRoleStore'

/** Admin portal capability flags for the signed-in user. */
export function useAdminCapabilities() {
  const { resolved } = useAuth()
  const rolesVersion = useSyncExternalStore(
    subscribeAdminCustomRoles,
    getAdminCustomRolesVersion,
    getAdminCustomRolesVersion
  )
  const capabilities = useMemo(
    () => getAdminCapabilities(resolved.user),
    [resolved.user, rolesVersion]
  )
  return { capabilities }
}
