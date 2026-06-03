import { Notification } from '../types/notification'

export const mockNotifications: Notification[] = [
  {
    id: 'notif-1',
    type: 'invoice_approved',
    title: 'Invoice Approved',
    message: 'Invoice INV-2025-001 has been approved and is ready for payment',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    read: false,
    link: '/client/invoices',
    link_label: 'View Invoice',
    invoice_id: 'inv-1',
    invoice_number: 'INV-2025-001',
  },
  {
    id: 'notif-2',
    type: 'payment_received',
    title: 'Payment Received',
    message: 'Payment of $5,000.00 received for invoice INV-2025-001',
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
    read: false,
    link: '/client/payments',
    link_label: 'View Payment',
    invoice_id: 'inv-1',
    invoice_number: 'INV-2025-001',
    payment_id: 'pay-1',
  },
  {
    id: 'notif-3',
    type: 'invoice_on_hold',
    title: 'Invoice On Hold',
    message: 'Invoice INV-2025-004 has been placed on hold. Missing documentation required.',
    timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    read: false,
    link: '/client/invoices',
    link_label: 'View Invoice',
    invoice_id: 'inv-4',
    invoice_number: 'INV-2025-004',
  },
  {
    id: 'notif-4',
    type: 'batch_submitted',
    title: 'Batch Submitted',
    message: 'Batch BATCH-2025-001 has been submitted for review',
    timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    read: true,
    link: '/client/batches',
    link_label: 'View Batch',
    batch_id: 'batch-1',
    batch_number: 'BATCH-2025-001',
  },
  {
    id: 'notif-5',
    type: 'payment_received',
    title: 'Payment Received',
    message: 'Payment of $3,200.00 received for invoice INV-2025-002',
    timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
    read: true,
    link: '/client/payments',
    link_label: 'View Payment',
    invoice_id: 'inv-2',
    invoice_number: 'INV-2025-002',
    payment_id: 'pay-2',
  },
  {
    id: 'notif-6',
    type: 'overdue_alert',
    title: 'Overdue Invoice Alert',
    message: 'Invoice INV-2025-010 is now overdue. Please follow up with the broker.',
    timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), // 4 days ago
    read: false,
    link: '/client/invoices',
    link_label: 'View Invoice',
    invoice_id: 'inv-10',
    invoice_number: 'INV-2025-010',
  },
  {
    id: 'notif-7',
    type: 'invoice_approved',
    title: 'Invoice Approved',
    message: 'Invoice INV-2025-003 has been approved and is ready for payment',
    timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
    read: true,
    link: '/client/invoices',
    link_label: 'View Invoice',
    invoice_id: 'inv-3',
    invoice_number: 'INV-2025-003',
  },
  {
    id: 'notif-8',
    type: 'batch_reviewed',
    title: 'Batch Reviewed',
    message: 'Batch BATCH-2025-002 has been reviewed and approved',
    timestamp: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(), // 6 days ago
    read: true,
    link: '/client/batches',
    link_label: 'View Batch',
    batch_id: 'batch-2',
    batch_number: 'BATCH-2025-002',
  },
]


