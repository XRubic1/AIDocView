import { signOutClientAuth } from '../services/clientAuthService'
import { clearTenantStores } from '../services/supabase/hydrateStores'

/** Sign out client session and clear tenant caches. */
export async function clearClientSession(): Promise<void> {
  await signOutClientAuth()
  clearTenantStores()
}
