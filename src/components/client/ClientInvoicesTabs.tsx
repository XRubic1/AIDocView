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
 * Invoices page tabs: full list vs paperwork that needs documents.
 */
export default function ClientInvoicesTabs() {
  const { invoices: rawInvoices } = useClientDemoSnapshot()
  const attentionCount = useMemo(
    () =>
      mapClientVisibleInvoices(rawInvoices).filter(
        (inv) => isClientVisibleHold(inv) && !isReceiptDisputeHold(inv)
      ).length,
    [rawInvoices]
  )

  return (
    <div className="client-page-tabs-bar shrink-0 px-4 py-2">
      <div className="page-tabs flex flex-wrap gap-1" role="tablist" aria-label="Invoice views">
        <NavLink
          to={CLIENT_INVOICES_PATH}
          end
          role="tab"
          className={({ isActive }) => `page-tab ${isActive ? 'page-tab--active' : ''}`}
        >
          All invoices
        </NavLink>
        <NavLink
          to={CLIENT_INVOICES_ATTENTION_PATH}
          role="tab"
          className={({ isActive }) => `page-tab ${isActive ? 'page-tab--active' : ''}`}
        >
          Needs attention
          {attentionCount > 0 ? (
            <span className="page-tab__count tabular-nums">{attentionCount}</span>
          ) : null}
        </NavLink>
      </div>
    </div>
  )
}
