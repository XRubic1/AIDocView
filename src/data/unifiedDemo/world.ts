import type { Batch } from '../mockBatches'
import type { Invoice } from '../../types/invoice'
import type { Payment } from '../../types/payment'

const C1 = { id: 'client-1', name: 'ABC Trucking' }
const C2 = { id: 'client-2', name: 'XYZ Logistics' }
const C3 = { id: 'client-3', name: 'Fast Freight Co' }
const C4 = { id: 'client-4', name: 'Premium Logistics' }
const C5 = { id: 'client-5', name: 'Express Freight' }

const B = {
  tql: { id: 'broker-1', name: 'TQL' },
  chr: { id: 'broker-2', name: 'C.H. Robinson' },
  xpo: { id: 'broker-3', name: 'XPO Logistics' },
  ryder: { id: 'broker-4', name: 'Ryder System' },
  jb: { id: 'broker-5', name: 'J.B. Hunt' },
} as const

export function daysAgo(n: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

export function daysFromNow(n: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function isoDaysAgo(n: number, hour = 10): string {
  const d = new Date()
  d.setHours(hour, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

type InvInput = {
  id: string
  num: string
  client: typeof C1
  broker: (typeof B)[keyof typeof B]
  amount: number
  invoiceDaysAgo: number
  expectedDaysAgo: number
  status: Invoice['status']
  batch: { id: string; num: string }
  extra?: Partial<Invoice>
}

function inv(input: InvInput): Invoice {
  const invoice_date = daysAgo(input.invoiceDaysAgo)
  return {
    id: input.id,
    invoice_number: input.num,
    client_id: input.client.id,
    client_name: input.client.name,
    broker_id: input.broker.id,
    broker_name: input.broker.name,
    amount: input.amount,
    invoice_date,
    due_date: daysFromNow(30 - input.invoiceDaysAgo),
    expected_payment_date: daysAgo(input.expectedDaysAgo),
    status: input.status,
    load_number: `LD-${input.id.slice(-4).toUpperCase()}`,
    batch_id: input.batch.id,
    batch_number: input.batch.num,
    created_at: isoDaysAgo(input.invoiceDaysAgo),
    documents_count: 2,
    broker_contacted: input.status === 'approved' || input.status === 'paid',
    days_since_expected: Math.max(0, input.expectedDaysAgo),
    ...input.extra,
  }
}

function pay(
  id: string,
  invoice: Invoice,
  amount: number,
  receivedDaysAgo: number,
  method: Payment['payment_method'],
  status: Payment['status'] = 'confirmed',
  extra?: Partial<Payment>
): Payment {
  const received_date = daysAgo(receivedDaysAgo)
  return {
    id,
    invoice_id: invoice.id,
    invoice_number: invoice.invoice_number,
    broker_name: invoice.broker_name,
    amount,
    payment_date: received_date,
    received_date,
    payment_method: method,
    status,
    batch_id: invoice.batch_id,
    batch_number: invoice.batch_number,
    load_number: invoice.load_number,
    ...extra,
  }
}

function batchSeed(
  id: string,
  batch_number: string,
  client: typeof C1,
  status: Batch['status'],
  submittedDaysAgo: number,
  extra: Partial<Batch> = {}
): Batch {
  return {
    id,
    batch_number,
    client_name: client.name,
    client_id: client.id,
    total_invoices: 0,
    total_amount: 0,
    minutes_since_submitted: submittedDaysAgo * 24 * 60,
    status,
    submitted_at: isoDaysAgo(submittedDaysAgo),
    in_use: false,
    ...extra,
  }
}

function syncBatchTotals(batches: Batch[], invoices: Invoice[]): void {
  for (const batch of batches) {
    const rows = invoices.filter((i) => i.batch_id === batch.id)
    if (rows.length === 0) continue
    batch.total_invoices = rows.length
    batch.total_amount = Math.round(rows.reduce((s, i) => s + i.amount, 0) * 100) / 100
  }
}

/** Build one coherent demo dataset shared across the portal. */
export function buildDemoWorld(): {
  invoices: Invoice[]
  payments: Payment[]
  batches: Batch[]
} {
  const B1 = { id: 'batch-1', num: 'BATCH-2025-001' }
  const B4 = { id: 'batch-4', num: 'BATCH-2025-004' }
  const BRPT = { id: 'batch-rpt-1', num: 'BATCH-RPT-2026' }

  const invoices: Invoice[] = [
    // —— batch-1: in review (not postable) ——
    inv({
      id: 'inv-1',
      num: 'INV-2025-001',
      client: C1,
      broker: B.tql,
      amount: 5000,
      invoiceDaysAgo: 14,
      expectedDaysAgo: 28,
      status: 'hold',
      batch: B1,
      extra: {
        hold_reason: 'Missing POD',
        notes_history: [
          {
            id: 'note-1',
            note: 'Waiting for POD',
            created_by: 'Admin User',
            created_at: isoDaysAgo(13),
            type: 'hold_reason',
          },
        ],
      },
    }),
    inv({
      id: 'c1-b1-02',
      num: 'INV-2025-002',
      client: C1,
      broker: B.chr,
      amount: 4800,
      invoiceDaysAgo: 12,
      expectedDaysAgo: 26,
      status: 'pending',
      batch: B1,
    }),
    inv({
      id: 'c1-b1-03',
      num: 'INV-2025-003',
      client: C1,
      broker: B.xpo,
      amount: 5200,
      invoiceDaysAgo: 11,
      expectedDaysAgo: 25,
      status: 'pending',
      batch: B1,
    }),
    inv({
      id: 'c1-b1-04',
      num: 'INV-2025-004',
      client: C1,
      broker: B.ryder,
      amount: 3900,
      invoiceDaysAgo: 10,
      expectedDaysAgo: 24,
      status: 'pending',
      batch: B1,
    }),
    inv({
      id: 'c1-b1-05',
      num: 'INV-2025-005',
      client: C1,
      broker: B.jb,
      amount: 4100,
      invoiceDaysAgo: 9,
      expectedDaysAgo: 23,
      status: 'pending',
      batch: B1,
    }),

    // —— batch-4: open A/R (postable) ——
    inv({
      id: 'c1-open-01',
      num: 'INV-2025-101',
      client: C1,
      broker: B.tql,
      amount: 5200,
      invoiceDaysAgo: 25,
      expectedDaysAgo: 8,
      status: 'approved',
      batch: B4,
      extra: { approved_at: isoDaysAgo(24), approved_by: 'Admin User' },
    }),
    inv({
      id: 'c1-open-02',
      num: 'INV-2025-102',
      client: C1,
      broker: B.chr,
      amount: 3800,
      invoiceDaysAgo: 32,
      expectedDaysAgo: 18,
      status: 'approved',
      batch: B4,
      extra: { approved_at: isoDaysAgo(31), approved_by: 'Admin User' },
    }),
    inv({
      id: 'c1-open-03',
      num: 'INV-2025-103',
      client: C1,
      broker: B.xpo,
      amount: 6100,
      invoiceDaysAgo: 20,
      expectedDaysAgo: 3,
      status: 'approved',
      batch: B4,
      extra: { approved_at: isoDaysAgo(19), approved_by: 'Admin User' },
    }),
    inv({
      id: 'c1-open-04',
      num: 'INV-2025-104',
      client: C1,
      broker: B.ryder,
      amount: 2900,
      invoiceDaysAgo: 55,
      expectedDaysAgo: 42,
      status: 'approved',
      batch: B4,
      extra: { approved_at: isoDaysAgo(54), approved_by: 'Admin User' },
    }),
    inv({
      id: 'c1-open-05',
      num: 'INV-2025-105',
      client: C1,
      broker: B.jb,
      amount: 8200,
      invoiceDaysAgo: 40,
      expectedDaysAgo: 28,
      status: 'approved',
      batch: B4,
      extra: { approved_at: isoDaysAgo(39), approved_by: 'Admin User' },
    }),

    // —— paid in full ——
    inv({
      id: 'c1-paid-01',
      num: 'INV-2025-110',
      client: C1,
      broker: B.tql,
      amount: 4500,
      invoiceDaysAgo: 45,
      expectedDaysAgo: 30,
      status: 'paid',
      batch: B4,
      extra: {
        paid_amount: 4500,
        approved_at: isoDaysAgo(44),
        approved_by: 'Admin User',
        days_since_expected: 0,
      },
    }),
    inv({
      id: 'c1-paid-02',
      num: 'INV-2025-111',
      client: C1,
      broker: B.chr,
      amount: 3600,
      invoiceDaysAgo: 38,
      expectedDaysAgo: 22,
      status: 'paid',
      batch: B4,
      extra: {
        paid_amount: 3600,
        approved_at: isoDaysAgo(37),
        approved_by: 'Admin User',
        days_since_expected: 0,
      },
    }),

    // —— short payments ——
    inv({
      id: 'inv-short-1',
      num: 'INV-2025-201',
      client: C1,
      broker: B.xpo,
      amount: 4850,
      invoiceDaysAgo: 60,
      expectedDaysAgo: 45,
      status: 'approved',
      batch: B4,
      extra: {
        approved_at: isoDaysAgo(59),
        approved_by: 'Admin User',
        notes_history: [
          {
            id: 'note-short-1',
            note: 'Broker short-paid check — $650 detention disputed',
            created_by: 'Robert Anderson',
            created_at: isoDaysAgo(40),
            type: 'client_note',
          },
        ],
      },
    }),
    inv({
      id: 'inv-short-2',
      num: 'INV-2025-202',
      client: C1,
      broker: B.tql,
      amount: 3200,
      invoiceDaysAgo: 70,
      expectedDaysAgo: 55,
      status: 'approved',
      batch: B4,
      extra: {
        paid_amount: 2650,
        approved_at: isoDaysAgo(69),
        approved_by: 'Admin User',
        notes_history: [
          {
            id: 'note-short-2',
            note: 'Payment confirmed — received $2,650.00 (short by $550.00)',
            created_by: 'Robert Anderson',
            created_at: isoDaysAgo(50),
            type: 'client_note',
          },
        ],
      },
    }),
    inv({
      id: 'inv-short-3',
      num: 'INV-2025-203',
      client: C1,
      broker: B.jb,
      amount: 6100,
      invoiceDaysAgo: 90,
      expectedDaysAgo: 75,
      status: 'force_closed',
      batch: B4,
      extra: {
        paid_amount: 5600,
        approved_at: isoDaysAgo(89),
        approved_by: 'Admin User',
        updated_at: isoDaysAgo(45),
        days_since_expected: 0,
        notes_history: [
          {
            id: 'note-short-3-close',
            note: 'Closed as uncollectable — received $5,600.00, write-off $500.00.',
            created_by: 'Robert Anderson',
            created_at: isoDaysAgo(45),
            type: 'client_note',
          },
        ],
      },
    }),

    // —— overpayments ——
    inv({
      id: 'inv-over-1',
      num: 'INV-2025-301',
      client: C1,
      broker: B.chr,
      amount: 2750,
      invoiceDaysAgo: 50,
      expectedDaysAgo: 35,
      status: 'paid',
      batch: B4,
      extra: {
        paid_amount: 3100,
        approved_at: isoDaysAgo(49),
        approved_by: 'Admin User',
        days_since_expected: 0,
        notes_history: [
          {
            id: 'note-over-1',
            note: 'Payment confirmed — received $3,100.00 (over by $350.00)',
            created_by: 'Robert Anderson',
            created_at: isoDaysAgo(30),
            type: 'client_note',
          },
        ],
      },
    }),
    inv({
      id: 'inv-over-2',
      num: 'INV-2025-302',
      client: C1,
      broker: B.ryder,
      amount: 4200,
      invoiceDaysAgo: 65,
      expectedDaysAgo: 50,
      status: 'paid',
      batch: B4,
      extra: {
        paid_amount: 4475,
        overpayment_accepted_at: isoDaysAgo(40),
        approved_at: isoDaysAgo(64),
        approved_by: 'Admin User',
        updated_at: isoDaysAgo(40),
        days_since_expected: 0,
        notes_history: [
          {
            id: 'note-over-2-accept',
            note: 'Overpayment accepted — excess $275.00 (detention on remittance).',
            created_by: 'Robert Anderson',
            created_at: isoDaysAgo(40),
            type: 'client_note',
          },
        ],
      },
    }),
    inv({
      id: 'inv-over-3',
      num: 'INV-2025-303',
      client: C1,
      broker: B.tql,
      amount: 3800,
      invoiceDaysAgo: 15,
      expectedDaysAgo: 5,
      status: 'approved',
      batch: B4,
      extra: { approved_at: isoDaysAgo(14), approved_by: 'Admin User' },
    }),

    // —— report history (6 months, relative dates) ——
    ...[140, 108, 78, 48, 18, 3].flatMap((invoiceDaysAgo, monthIdx) => {
      const brokers = [B.tql, B.chr, B.xpo] as const
      const month = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN'][monthIdx]
      return brokers.map((broker, i) =>
        inv({
          id: `inv-rpt-${month.toLowerCase()}-${i + 1}`,
          num: `INV-RPT-${month}-${i + 1}`,
          client: C1,
          broker,
          amount: 2800 + monthIdx * 400 + i * 150,
          invoiceDaysAgo,
          expectedDaysAgo: invoiceDaysAgo - 14,
          status: monthIdx >= 4 ? 'approved' : 'paid',
          batch: BRPT,
          extra:
            monthIdx < 4
              ? {
                  paid_amount: 2800 + monthIdx * 400 + i * 150,
                  days_since_expected: 0,
                  approved_at: isoDaysAgo(invoiceDaysAgo - 1),
                  approved_by: 'Admin User',
                }
              : {
                  approved_at: isoDaysAgo(invoiceDaysAgo - 1),
                  approved_by: 'Admin User',
                },
        })
      )
    }),

    // —— other clients (minimal) ——
    inv({
      id: 'c2-inv-01',
      num: 'INV-2025-501',
      client: C2,
      broker: B.chr,
      amount: 7500,
      invoiceDaysAgo: 20,
      expectedDaysAgo: 10,
      status: 'hold',
      batch: { id: 'batch-2', num: 'BATCH-2025-002' },
    }),
    inv({
      id: 'c3-inv-01',
      num: 'INV-2025-601',
      client: C3,
      broker: B.xpo,
      amount: 3200,
      invoiceDaysAgo: 18,
      expectedDaysAgo: 8,
      status: 'pending',
      batch: { id: 'batch-3', num: 'BATCH-2025-003' },
    }),
    inv({
      id: 'c4-inv-01',
      num: 'INV-2025-701',
      client: C4,
      broker: B.ryder,
      amount: 6500,
      invoiceDaysAgo: 8,
      expectedDaysAgo: 20,
      status: 'pending',
      batch: { id: 'batch-5', num: 'BATCH-2025-005' },
    }),
    inv({
      id: 'c5-inv-01',
      num: 'INV-2025-801',
      client: C5,
      broker: B.jb,
      amount: 4200,
      invoiceDaysAgo: 12,
      expectedDaysAgo: 24,
      status: 'pending',
      batch: { id: 'batch-approval-1', num: 'BATCH-2025-011' },
    }),
  ]

  const paid01 = invoices.find((i) => i.id === 'c1-paid-01')!
  const paid02 = invoices.find((i) => i.id === 'c1-paid-02')!
  const short1 = invoices.find((i) => i.id === 'inv-short-1')!
  const short3 = invoices.find((i) => i.id === 'inv-short-3')!
  const over1 = invoices.find((i) => i.id === 'inv-over-1')!
  const over2 = invoices.find((i) => i.id === 'inv-over-2')!
  const over3 = invoices.find((i) => i.id === 'inv-over-3')!

  const payments: Payment[] = [
    pay('pay-c1-01', paid01, 4500, 20, 'wire', 'confirmed', {
      payment_reference: 'WIRE-4500',
      notes: 'Paid in full',
    }),
    pay('pay-c1-02', paid02, 3600, 15, 'ach', 'confirmed', {
      payment_reference: 'ACH-3600',
    }),
    pay('pay-short-1', short1, 4200, 40, 'check', 'confirmed', {
      payment_reference: 'CHK-4200',
      notes: 'Short payment — detention deducted',
    }),
    pay('pay-over-3', over3, 4050, 2, 'ach', 'confirmed', {
      payment_reference: 'ACH-4050',
      notes: 'Overpayment — includes detention',
    }),
    pay('pay-over-1', over1, 3100, 30, 'wire', 'confirmed', {
      payment_reference: 'WIRE-3100',
    }),
    pay('pay-over-2', over2, 4475, 42, 'check', 'confirmed', {
      payment_reference: 'CHK-4475',
    }),
    pay('pay-short-3', short3, 5600, 45, 'ach', 'confirmed', {
      payment_reference: 'ACH-5600',
    }),
    pay(
      'pay-pending-01',
      invoices.find((i) => i.id === 'c1-open-05')!,
      8200,
      0,
      'check',
      'pending',
      {
        payment_reference: 'CHK-PENDING',
        notes: 'Payment initiated, awaiting confirmation',
      }
    ),
    // Report history payments (paid months only)
    ...invoices
      .filter((i) => i.id.startsWith('inv-rpt-') && i.status === 'paid')
      .map((invoice, idx) =>
        pay(
          `pay-rpt-${idx + 1}`,
          invoice,
          invoice.amount,
          Math.max(1, parseInt(invoice.invoice_date.slice(8, 10), 10) % 28),
          idx % 2 === 0 ? 'ach' : 'wire',
          'confirmed'
        )
      ),
    pay('pay-c2-01', invoices.find((i) => i.id === 'c2-inv-01')!, 7500, 5, 'wire', 'pending'),
  ]

  // short-2 uses paid_amount only (no separate payment row until client posts)

  const batches: Batch[] = [
    batchSeed('batch-1', 'BATCH-2025-001', C1, 'ready_to_post', 2, {
      in_use: true,
      in_use_by: 'John Smith',
      upload_mode: 'ai',
    }),
    batchSeed('batch-4', 'BATCH-2025-004', C1, 'verification', 1, {
      in_use: true,
      in_use_by: 'Sarah Johnson',
      upload_mode: 'manual',
    }),
    batchSeed('batch-rpt-1', 'BATCH-RPT-2026', C1, 'submitted', 120, {
      reviewed_at: isoDaysAgo(119),
      reviewed_by: 'Admin User',
      approved_count: 18,
    }),
    batchSeed('batch-2', 'BATCH-2025-002', C2, 'ready_to_post', 3),
    batchSeed('batch-3', 'BATCH-2025-003', C3, 'ready_to_post', 4),
    batchSeed('batch-5', 'BATCH-2025-005', C4, 'ready_to_post', 2),
    batchSeed('batch-approval-1', 'BATCH-2025-011', C5, 'approval', 10, {
      reviewed_at: isoDaysAgo(9),
      reviewed_by: 'Admin User',
      approved_count: 1,
    }),
    // Admin pipeline demos (other clients, no linked invoices)
    batchSeed('batch-submitted-1', 'BATCH-2025-013', C2, 'submitted', 20, {
      reviewed_at: isoDaysAgo(19),
      reviewed_by: 'Admin User',
      approved_count: 20,
      total_invoices: 20,
      total_amount: 95000,
    }),
    batchSeed('batch-submitted-2', 'BATCH-2025-014', C3, 'submitted', 25, {
      reviewed_at: isoDaysAgo(24),
      reviewed_by: 'Admin User',
      approved_count: 8,
      total_invoices: 8,
      total_amount: 42000,
    }),
    batchSeed('batch-processing-1', 'BATCH-2025-015', C4, 'processing', 30, {
      reviewed_at: isoDaysAgo(29),
      reviewed_by: 'Admin User',
      approved_count: 12,
      total_invoices: 12,
      total_amount: 68000,
    }),
  ]

  syncBatchTotals(batches, invoices)

  return { invoices, payments, batches }
}

export const DEMO_WORLD = buildDemoWorld()
