import { Navigate, useSearchParams } from 'react-router-dom'
import { CLIENT_INVOICES_ATTENTION_PATH } from '../utils/carrierAttentionLink'

/** Old email links used /client/attention — keep them working. */
export default function LegacyClientAttentionRedirect() {
  const [params] = useSearchParams()
  const qs = params.toString()
  return (
    <Navigate
      to={`${CLIENT_INVOICES_ATTENTION_PATH}${qs ? `?${qs}` : ''}`}
      replace
    />
  )
}
