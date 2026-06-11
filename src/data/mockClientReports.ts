import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'

const CLIENT_ID = 'client-1'
const CLIENT_NAME = 'ABC Trucking'

/** ISO date string N days before today. */
function daysAgo(n: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

/** ISO date string N days after today. */
function daysFromNow(n: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function isoAt(daysOffset: number, hour = 10): string {
  const d = new Date()
  d.setHours(hour, 0, 0, 0)
  d.setDate(d.getDate() - daysOffset)
  return d.toISOString()
}

type BrokerRef = { id: string; name: string }

const BROKERS: Record<string, BrokerRef> = {
  tql: { id: 'broker-1', name: 'TQL' },
  chr: { id: 'broker-2', name: 'C.H. Robinson' },
  xpo: { id: 'broker-3', name: 'XPO Logistics' },
  ryder: { id: 'broker-4', name: 'Ryder System' },
  jb: { id: 'broker-5', name: 'J.B. Hunt' },
  fedex: { id: 'broker-6', name: 'FedEx Freight' },
  od: { id: 'broker-7', name: 'Old Dominion' },
  knight: { id: 'broker-8', name: 'Knight-Swift' },
  werner: { id: 'broker-9', name: 'Werner Enterprises' },
  swift: { id: 'broker-10', name: 'Swift Transportation' },
}

function baseInvoice(
  id: string,
  num: string,
  broker: BrokerRef,
  amount: number,
  invoiceDaysAgo: number,
  expectedDaysAgo: number,
  status: Invoice['status'],
  extra: Partial<Invoice> = {}
): Invoice {
  const invoice_date = daysAgo(invoiceDaysAgo)
  const due_date = daysFromNow(30 - invoiceDaysAgo)
  return {
    id,
    invoice_number: num,
    client_id: CLIENT_ID,
    client_name: CLIENT_NAME,
    broker_id: broker.id,
    broker_name: broker.name,
    amount,
    invoice_date,
    due_date,
    expected_payment_date: daysAgo(expectedDaysAgo),
    status,
    load_number: `LD-RPT-${num.slice(-3)}`,
    batch_id: 'batch-rpt-1',
    batch_number: 'BATCH-RPT-2026',
    created_at: isoAt(invoiceDaysAgo),
    documents_count: 2,
    broker_contacted: status === 'approved',
    ...extra,
  }
}

/**
 * Supplemental invoices for the client Reports page — dates are relative to today
 * so cash-flow, pipeline, and period filters always show a rich demo.
 */
export const mockClientReportInvoices: Invoice[] = [
  // Open A/R — spread across aging buckets
  baseInvoice('inv-rpt-01', 'INV-RPT-001', BROKERS.tql, 12_500, 165, 150, 'approved', {
    approved_at: isoAt(164),
    approved_by: 'Admin User',
    reviewed_at: isoAt(164),
    reviewed_by: 'Admin User',
  }),
  baseInvoice('inv-rpt-02', 'INV-RPT-002', BROKERS.chr, 9_800, 75, 60, 'approved', {
    approved_at: isoAt(74),
    approved_by: 'Admin User',
    reviewed_at: isoAt(74),
    reviewed_by: 'Admin User',
    disputes: [
      {
        id: 'dispute-rpt-1',
        reason: 'payment_delay',
        description: 'Payment not received past expected pay date.',
        status: 'open',
        created_by: CLIENT_NAME,
        created_at: isoAt(45),
      },
    ],
  }),
  baseInvoice('inv-rpt-03', 'INV-RPT-003', BROKERS.xpo, 11_200, 52, 37, 'approved', {
    approved_at: isoAt(51),
    approved_by: 'Admin User',
    reviewed_at: isoAt(51),
    reviewed_by: 'Admin User',
  }),
  baseInvoice('inv-rpt-04', 'INV-RPT-004', BROKERS.ryder, 8_600, 38, 23, 'approved', {
    approved_at: isoAt(37),
    approved_by: 'Admin User',
    reviewed_at: isoAt(37),
    reviewed_by: 'Admin User',
  }),
  baseInvoice('inv-rpt-05', 'INV-RPT-005', BROKERS.jb, 7_400, 25, 10, 'approved', {
    approved_at: isoAt(24),
    approved_by: 'Admin User',
    reviewed_at: isoAt(24),
    reviewed_by: 'Admin User',
  }),
  baseInvoice('inv-rpt-06', 'INV-RPT-006', BROKERS.fedex, 5_200, 12, 5, 'approved', {
    approved_at: isoAt(11),
    approved_by: 'Admin User',
    reviewed_at: isoAt(11),
    reviewed_by: 'Admin User',
  }),
  baseInvoice('inv-rpt-07', 'INV-RPT-007', BROKERS.od, 6_300, 8, -7, 'approved', {
    approved_at: isoAt(7),
    approved_by: 'Admin User',
    reviewed_at: isoAt(7),
    reviewed_by: 'Admin User',
  }),
  baseInvoice('inv-rpt-08', 'INV-RPT-008', BROKERS.knight, 9_100, 5, -14, 'approved', {
    approved_at: isoAt(4),
    approved_by: 'Admin User',
    reviewed_at: isoAt(4),
    reviewed_by: 'Admin User',
  }),

  // Pipeline — pending & hold
  baseInvoice('inv-rpt-09', 'INV-RPT-009', BROKERS.tql, 4_500, 3, 20, 'pending'),
  baseInvoice('inv-rpt-10', 'INV-RPT-010', BROKERS.chr, 5_800, 2, 18, 'pending'),
  baseInvoice('inv-rpt-11', 'INV-RPT-011', BROKERS.xpo, 4_200, 7, 14, 'hold', {
    hold_reason: 'Missing POD signature',
    notes: 'Broker requested signed POD before approval.',
  }),
  baseInvoice('inv-rpt-12', 'INV-RPT-012', BROKERS.ryder, 3_900, 4, 16, 'hold', {
    hold_reason: 'Rate confirmation mismatch',
    notes: 'Invoice amount differs from rate con.',
    disputes: [
      {
        id: 'dispute-rpt-2',
        reason: 'amount_discrepancy',
        description: 'Broker claims rate was $200 lower than invoiced.',
        status: 'under_review',
        created_by: CLIENT_NAME,
        created_at: isoAt(3),
      },
    ],
  }),
  baseInvoice('inv-rpt-18', 'INV-RPT-018', BROKERS.jb, 9_500, 20, 5, 'pending'),

  // Monthly invoicing — one batch per month for cash-flow chart (last 6 months)
  baseInvoice('inv-rpt-jan-1', 'INV-RPT-101', BROKERS.tql, 15_000, 152, 137, 'paid', {
    approved_at: isoAt(151),
    approved_by: 'Admin User',
  }),
  baseInvoice('inv-rpt-jan-2', 'INV-RPT-102', BROKERS.chr, 14_000, 148, 133, 'paid', {
    approved_at: isoAt(147),
    approved_by: 'Admin User',
  }),
  baseInvoice('inv-rpt-jan-3', 'INV-RPT-103', BROKERS.xpo, 16_000, 145, 130, 'paid', {
    approved_at: isoAt(144),
    approved_by: 'Admin User',
  }),

  baseInvoice('inv-rpt-feb-1', 'INV-RPT-201', BROKERS.ryder, 17_500, 122, 107, 'paid', {
    approved_at: isoAt(121),
    approved_by: 'Admin User',
  }),
  baseInvoice('inv-rpt-feb-2', 'INV-RPT-202', BROKERS.jb, 16_500, 118, 103, 'paid', {
    approved_at: isoAt(117),
    approved_by: 'Admin User',
  }),
  baseInvoice('inv-rpt-feb-3', 'INV-RPT-203', BROKERS.fedex, 18_000, 115, 100, 'paid', {
    approved_at: isoAt(114),
    approved_by: 'Admin User',
  }),

  baseInvoice('inv-rpt-mar-1', 'INV-RPT-301', BROKERS.od, 16_000, 92, 77, 'paid', {
    approved_at: isoAt(91),
    approved_by: 'Admin User',
  }),
  baseInvoice('inv-rpt-mar-2', 'INV-RPT-302', BROKERS.knight, 15_500, 88, 73, 'paid', {
    approved_at: isoAt(87),
    approved_by: 'Admin User',
  }),
  baseInvoice('inv-rpt-mar-3', 'INV-RPT-303', BROKERS.werner, 16_500, 85, 70, 'paid', {
    approved_at: isoAt(84),
    approved_by: 'Admin User',
  }),

  baseInvoice('inv-rpt-apr-1', 'INV-RPT-401', BROKERS.swift, 20_500, 62, 47, 'paid', {
    approved_at: isoAt(61),
    approved_by: 'Admin User',
  }),
  baseInvoice('inv-rpt-apr-2', 'INV-RPT-402', BROKERS.tql, 19_500, 58, 43, 'paid', {
    approved_at: isoAt(57),
    approved_by: 'Admin User',
  }),
  baseInvoice('inv-rpt-apr-3', 'INV-RPT-403', BROKERS.chr, 21_000, 55, 40, 'paid', {
    approved_at: isoAt(54),
    approved_by: 'Admin User',
  }),

  baseInvoice('inv-rpt-may-1', 'INV-RPT-501', BROKERS.xpo, 18_500, 32, 17, 'paid', {
    approved_at: isoAt(31),
    approved_by: 'Admin User',
  }),
  baseInvoice('inv-rpt-may-2', 'INV-RPT-502', BROKERS.ryder, 17_500, 28, 13, 'paid', {
    approved_at: isoAt(27),
    approved_by: 'Admin User',
  }),
  baseInvoice('inv-rpt-may-3', 'INV-RPT-503', BROKERS.jb, 19_000, 25, 10, 'paid', {
    approved_at: isoAt(24),
    approved_by: 'Admin User',
  }),

  baseInvoice('inv-rpt-jun-1', 'INV-RPT-601', BROKERS.fedex, 11_000, 10, -5, 'approved', {
    approved_at: isoAt(9),
    approved_by: 'Admin User',
    reviewed_at: isoAt(9),
    reviewed_by: 'Admin User',
  }),
  baseInvoice('inv-rpt-jun-2', 'INV-RPT-602', BROKERS.od, 10_500, 6, -9, 'approved', {
    approved_at: isoAt(5),
    approved_by: 'Admin User',
    reviewed_at: isoAt(5),
    reviewed_by: 'Admin User',
  }),
  baseInvoice('inv-rpt-jun-3', 'INV-RPT-603', BROKERS.knight, 10_500, 2, -13, 'pending'),
]

function payment(
  id: string,
  invoice: Invoice,
  receivedDaysAgo: number,
  method: Payment['payment_method'],
  status: Payment['status'] = 'confirmed',
  lagDays = 0
): Payment {
  const received = daysAgo(receivedDaysAgo)
  const paid = daysAgo(receivedDaysAgo + Math.max(0, lagDays))
  return {
    id,
    invoice_id: invoice.id,
    invoice_number: invoice.invoice_number,
    broker_name: invoice.broker_name,
    amount: invoice.amount,
    payment_date: paid,
    received_date: received,
    payment_method: method,
    payment_reference: `${method.toUpperCase()}-RPT-${id.slice(-3)}`,
    status,
    batch_id: invoice.batch_id,
    batch_number: invoice.batch_number,
    load_number: invoice.load_number,
  }
}

/** Confirmed payments tied to report demo invoices — spread across last 6 months. */
export const mockClientReportPayments: Payment[] = [
  // January collections (on-time wire / ACH)
  payment('pay-rpt-01', mockClientReportInvoices.find((i) => i.id === 'inv-rpt-jan-1')!, 140, 'wire', 'confirmed', 0),
  payment('pay-rpt-02', mockClientReportInvoices.find((i) => i.id === 'inv-rpt-jan-2')!, 135, 'ach', 'confirmed', 1),
  payment('pay-rpt-03', mockClientReportInvoices.find((i) => i.id === 'inv-rpt-jan-3')!, 132, 'check', 'confirmed', 3),

  // February (mix of on-time and slightly late)
  payment('pay-rpt-04', mockClientReportInvoices.find((i) => i.id === 'inv-rpt-feb-1')!, 108, 'wire', 'confirmed', 0),
  payment('pay-rpt-05', mockClientReportInvoices.find((i) => i.id === 'inv-rpt-feb-2')!, 102, 'ach', 'confirmed', 4),
  payment('pay-rpt-06', mockClientReportInvoices.find((i) => i.id === 'inv-rpt-feb-3')!, 98, 'wire', 'confirmed', 2),

  // March
  payment('pay-rpt-07', mockClientReportInvoices.find((i) => i.id === 'inv-rpt-mar-1')!, 78, 'ach', 'confirmed', 0),
  payment('pay-rpt-08', mockClientReportInvoices.find((i) => i.id === 'inv-rpt-mar-2')!, 74, 'wire', 'confirmed', 1),
  payment('pay-rpt-09', mockClientReportInvoices.find((i) => i.id === 'inv-rpt-mar-3')!, 71, 'check', 'confirmed', 5),

  // April (strong month)
  payment('pay-rpt-10', mockClientReportInvoices.find((i) => i.id === 'inv-rpt-apr-1')!, 48, 'wire', 'confirmed', 0),
  payment('pay-rpt-11', mockClientReportInvoices.find((i) => i.id === 'inv-rpt-apr-2')!, 44, 'ach', 'confirmed', 2),
  payment('pay-rpt-12', mockClientReportInvoices.find((i) => i.id === 'inv-rpt-apr-3')!, 41, 'wire', 'confirmed', 0),

  // May (collections up vs April)
  payment('pay-rpt-13', mockClientReportInvoices.find((i) => i.id === 'inv-rpt-may-1')!, 18, 'ach', 'confirmed', 0),
  payment('pay-rpt-14', mockClientReportInvoices.find((i) => i.id === 'inv-rpt-may-2')!, 14, 'wire', 'confirmed', 1),
  payment('pay-rpt-15', mockClientReportInvoices.find((i) => i.id === 'inv-rpt-may-3')!, 11, 'credit_card', 'confirmed', 0),

  // Recent partial June + late payments for lag stats
  payment('pay-rpt-16', mockClientReportInvoices.find((i) => i.id === 'inv-rpt-jun-1')!, 3, 'wire', 'confirmed', 0),
  payment('pay-rpt-17', mockClientReportInvoices.find((i) => i.id === 'inv-rpt-05')!, 8, 'ach', 'confirmed', 6),
  payment('pay-rpt-18', mockClientReportInvoices.find((i) => i.id === 'inv-rpt-04')!, 15, 'check', 'confirmed', 12),
  payment('pay-rpt-19', mockClientReportInvoices.find((i) => i.id === 'inv-rpt-03')!, 22, 'wire', 'confirmed', 18),
  payment('pay-rpt-20', mockClientReportInvoices.find((i) => i.id === 'inv-rpt-02')!, 35, 'ach', 'confirmed', 8),
]
