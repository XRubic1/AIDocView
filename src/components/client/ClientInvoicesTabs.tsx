import { NavLink } from 'react-router-dom'
import { useMemo } from 'react'
import { useClientDemoSnapshot } from '../../hooks/useClientDemoSnapshot'
import { mapClientVisibleInvoices, isClientVisibleHold } from '../../utils/clientInvoiceView'
import { isReceiptDisputeHold } from '../../services/paymentReceiptConfirmationService'
import {
  CLIENT_INVOICES_ATTENTION_PATH,
  CLIENT_INVOICES_PATH,
} from '../../utils/carrierAttentionLink'

/**
 * Compact All / Needs switcher — sits in the invoices toolbar, not a full-width tab bar.
 */
export default function ClientInvoicesTabs({ className = '' }: { className?: string }) {
  const { invoices: rawInvoices } = useClientDemoSnapshot()
  const attentionCount = useMemo(
    () =>
      mapClientVisibleInvoices(rawInvoices).filter(
        (inv) => isClientVisibleHold(inv) && !isReceiptDisputeHold(inv)
      ).length,
    [rawInvoices]
  )

  return (
    <div
      className={`client-segmented-control shrink-0 ${className}`.trim()}
      role="tablist"
      aria-label="Invoice views"
    >
      <NavLink
        to={CLIENT_INVOICES_PATH}
        end
        role="tab"
        aria-label="All invoices"
        className={({ isActive }) =>
          `client-segmented-control__btn ${
            isActive ? 'client-segmented-control__btn--active' : ''
          }`
        }
      >
        All
      </NavLink>
      <NavLink
        to={CLIENT_INVOICES_ATTENTION_PATH}
        role="tab"
        aria-label="Needs attention"
        className={({ isActive }) =>
          `client-segmented-control__btn ${
            isActive ? 'client-segmented-control__btn--active' : ''
          }`
        }
      >
        Needs
        {attentionCount > 0 ? (
          <span className="client-segmented-control__count tabular-nums">{attentionCount}</span>
        ) : null}
      </NavLink>
    </div>
  )
}
