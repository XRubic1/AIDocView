/**
 * Invoice details panel V2 — Credyx-branded chrome around the existing panel.
 * Keeps all V1 behavior; visual skin lives under `.civ2-detail` in clientInvoicesV2.css.
 */
import InvoiceDetailPanel, {
  type InvoiceDetailPanelProps,
} from '../InvoiceDetailPanel'

export type InvoiceDetailPanelV2Props = InvoiceDetailPanelProps

export default function InvoiceDetailPanelV2(props: InvoiceDetailPanelV2Props) {
  return (
    <div
      className={`civ2-detail civ2-detail--${props.variant}`}
      data-skin="invoices-v2"
    >
      <InvoiceDetailPanel {...props} />
    </div>
  )
}

export type { InvoiceDetailPanelProps }
