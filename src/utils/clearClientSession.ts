import { CLIENT_ID_STORAGE_KEY } from '../services/clientRegistry'
import { signOutClientAuth } from '../services/clientAuthService'

/** Remove client portal auth keys from localStorage. */
export function clearClientSession(): void {
  localStorage.removeItem('clientAuthenticated')
  localStorage.removeItem('clientEmail')
  localStorage.removeItem('clientRole')
  localStorage.removeItem(CLIENT_ID_STORAGE_KEY)
  void signOutClientAuth()
}
