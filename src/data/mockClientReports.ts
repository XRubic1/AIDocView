/**
 * @deprecated Report demo rows now live in unifiedDemo/world.ts.
 * Re-exports kept for any legacy imports.
 */
import { DEMO_WORLD } from './unifiedDemo'

export const mockClientReportInvoices = DEMO_WORLD.invoices.filter(
  (inv) => inv.client_id === 'client-1' && inv.batch_id === 'batch-rpt-1'
)

export const mockClientReportPayments = DEMO_WORLD.payments.filter((pay) =>
  mockClientReportInvoices.some((inv) => inv.id === pay.invoice_id)
)
