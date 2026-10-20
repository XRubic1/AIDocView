import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useClientTheme } from '../../theme/ThemeContext'
import { stashPaymentRestoreTarget } from '../../utils/paymentRestoreTarget'

export type ClientReturnToState = {
  to: string
  label?: string
  /** Re-open this payment detail when returning to payments. */
  paymentId?: string
  invoiceId?: string
}

/** Location state passed when deep-linking away from a context (e.g. payment → invoice). */
export type WithClientReturnTo = {
  returnTo?: ClientReturnToState
}

/** Compact back bar when navigated here with `location.state.returnTo`. */
export default function ClientReturnBanner() {
  const c = useClientTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = (location.state as WithClientReturnTo | null)?.returnTo

  if (!returnTo?.to) return null

  return (
    <div
      className="client-return-banner shrink-0 border-b"
      style={{ borderColor: c.border, backgroundColor: c.card }}
    >
      <button
        type="button"
        className="client-return-banner__btn"
        onClick={() => {
          if (!returnTo.paymentId) {
            navigate(returnTo.to)
            return
          }
          if (returnTo.paymentId) {
            stashPaymentRestoreTarget({
              paymentId: returnTo.paymentId,
              invoiceId: returnTo.invoiceId,
            })
          }
          const params = new URLSearchParams()
          if (returnTo.paymentId) params.set('paymentId', returnTo.paymentId)
          const search = params.toString()
          navigate(
            {
              pathname: '/client/payments',
              search: search ? `?${search}` : undefined,
            },
            {
              state: {
                restorePaymentId: returnTo.paymentId,
                restoreInvoiceId: returnTo.invoiceId,
              },
            }
          )
        }}
        style={{ color: c.info }}
      >
        <ArrowLeft className="w-3.5 h-3.5 shrink-0" aria-hidden />
        <span>{returnTo.label || 'Go back'}</span>
      </button>
    </div>
  )
}
