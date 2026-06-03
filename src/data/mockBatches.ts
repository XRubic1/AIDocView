import { PendingBatch } from '../types/admin'

interface Batch extends PendingBatch {
  reviewed_at?: string
  reviewed_by?: string
  approved_count?: number
  rejected_count?: number
}

// In-memory storage for batches (in a real app, this would be a database)
let batchesData: Batch[] = [
    {
      id: 'batch-1',
      batch_number: 'BATCH-2025-001',
      client_name: 'ABC Trucking',
      client_id: 'client-1',
      total_invoices: 5,
      total_amount: 25000.0,
      minutes_since_submitted: 120,
      status: 'ready_to_post',
      submitted_at: '2025-11-29T10:00:00Z',
      in_use: true,
      in_use_by: 'John Smith',
    },
    {
      id: 'batch-2',
      batch_number: 'BATCH-2025-002',
      client_name: 'XYZ Logistics',
      client_id: 'client-2',
      total_invoices: 8,
      total_amount: 45000.0,
      minutes_since_submitted: 45,
      status: 'ready_to_post',
      submitted_at: '2025-11-29T12:15:00Z',
      in_use: false,
    },
    {
      id: 'batch-3',
      batch_number: 'BATCH-2025-003',
      client_name: 'Fast Freight Co',
      client_id: 'client-3',
      total_invoices: 3,
      total_amount: 12000.0,
      minutes_since_submitted: 780,
      status: 'ready_to_post',
      submitted_at: '2025-11-28T20:00:00Z',
      in_use: false,
    },
    {
      id: 'batch-4',
      batch_number: 'BATCH-2025-004',
      client_name: 'ABC Trucking',
      client_id: 'client-1',
      total_invoices: 12,
      total_amount: 68000.0,
      minutes_since_submitted: 30,
      status: 'verification',
      submitted_at: '2025-11-29T13:00:00Z',
      in_use: true,
      in_use_by: 'Sarah Johnson',
    },
    {
      id: 'batch-5',
      batch_number: 'BATCH-2025-005',
      client_name: 'Premium Logistics',
      client_id: 'client-4',
      total_invoices: 6,
      total_amount: 35000.0,
      minutes_since_submitted: 60,
      status: 'ready_to_post',
      submitted_at: '2025-11-29T11:30:00Z',
      in_use: false,
    },
    {
      id: 'batch-verification-1',
      batch_number: 'BATCH-2025-010',
      client_name: 'Premium Logistics',
      client_id: 'client-4',
      total_invoices: 10,
      total_amount: 55000.0,
      minutes_since_submitted: 2880,
      status: 'verification',
      submitted_at: '2025-11-27T10:00:00Z',
      reviewed_at: '2025-11-28T14:30:00Z',
      reviewed_by: 'Admin User',
      approved_count: 10,
      rejected_count: 0,
      in_use: false,
    },
    {
      id: 'batch-approval-1',
      batch_number: 'BATCH-2025-011',
      client_name: 'Express Freight',
      client_id: 'client-5',
      total_invoices: 7,
      total_amount: 32000.0,
      minutes_since_submitted: 4320,
      status: 'approval',
      submitted_at: '2025-11-26T08:00:00Z',
      reviewed_at: '2025-11-27T09:15:00Z',
      reviewed_by: 'Admin User',
      approved_count: 6,
      rejected_count: 1,
      in_use: true,
      in_use_by: 'Mike Davis',
    },
    {
      id: 'batch-approval-2',
      batch_number: 'BATCH-2025-012',
      client_name: 'ABC Trucking',
      client_id: 'client-1',
      total_invoices: 15,
      total_amount: 75000.0,
      minutes_since_submitted: 5000,
      status: 'approval',
      submitted_at: '2025-11-25T09:00:00Z',
      reviewed_at: '2025-11-26T10:00:00Z',
      reviewed_by: 'Admin User',
      approved_count: 15,
      rejected_count: 0,
      in_use: false,
      fee_calculation: {
        fee_type: 'percentage',
        fee_percentage: 2.5,
        total_fee: 1875.0,
        net_amount: 73125.0,
      },
    },
    {
      id: 'batch-submitted-1',
      batch_number: 'BATCH-2025-013',
      client_name: 'XYZ Logistics',
      client_id: 'client-2',
      total_invoices: 20,
      total_amount: 95000.0,
      minutes_since_submitted: 10080,
      status: 'submitted',
      submitted_at: '2025-11-20T08:00:00Z',
      reviewed_at: '2025-11-21T10:00:00Z',
      reviewed_by: 'Admin User',
      approved_count: 20,
      rejected_count: 0,
      in_use: false,
      fee_calculation: {
        fee_type: 'percentage',
        fee_percentage: 3.0,
        total_fee: 2850.0,
        net_amount: 92150.0,
      },
    },
    {
      id: 'batch-submitted-2',
      batch_number: 'BATCH-2025-014',
      client_name: 'Fast Freight Co',
      client_id: 'client-3',
      total_invoices: 8,
      total_amount: 42000.0,
      minutes_since_submitted: 14400,
      status: 'submitted',
      submitted_at: '2025-11-15T10:00:00Z',
      reviewed_at: '2025-11-16T14:00:00Z',
      reviewed_by: 'Admin User',
      approved_count: 8,
      rejected_count: 0,
      in_use: false,
      fee_calculation: {
        fee_type: 'flat',
        flat_fee_amount: 500.0,
        total_fee: 500.0,
        net_amount: 41500.0,
      },
    },
    {
      id: 'batch-processing-1',
      batch_number: 'BATCH-2025-015',
      client_name: 'Premium Logistics',
      client_id: 'client-4',
      total_invoices: 12,
      total_amount: 68000.0,
      minutes_since_submitted: 20160,
      status: 'processing',
      submitted_at: '2025-11-10T09:00:00Z',
      reviewed_at: '2025-11-11T11:00:00Z',
      reviewed_by: 'Admin User',
      approved_count: 12,
      rejected_count: 0,
      in_use: false,
      fee_calculation: {
        fee_type: 'percentage',
        fee_percentage: 2.0,
        total_fee: 1360.0,
        net_amount: 66640.0,
      },
    },
  ]

// Shared batches data source for all batch tabs
export const getAllBatches = (): Batch[] => {
  return batchesData
}

// Function to update batch status
export const updateBatchStatus = (batchId: string, newStatus: Batch['status']): void => {
  const batch = batchesData.find((b) => b.id === batchId)
  if (batch) {
    batch.status = newStatus
  }
}

// Function to add a new batch
export const addBatch = (batchData: Omit<Batch, 'id' | 'minutes_since_submitted'>): Batch => {
  const submittedDate = new Date(batchData.submitted_at)
  const now = new Date()
  const minutesSinceSubmitted = Math.floor((now.getTime() - submittedDate.getTime()) / (1000 * 60))

  const newBatch: Batch = {
    ...batchData,
    id: `batch-${Date.now()}`,
    minutes_since_submitted: minutesSinceSubmitted,
    in_use: false,
  }

  batchesData.unshift(newBatch) // Add to the beginning for easier viewing
  return newBatch
}

