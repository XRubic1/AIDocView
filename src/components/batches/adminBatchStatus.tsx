/** Admin batch status pills — shared across batch list views. */
export function getAdminBatchStatusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    ready_to_post: { label: 'Ready to Post', className: 'status-pill--pending-batch' },
    verification: { label: 'Verification', className: 'status-pill--review' },
    approval: { label: 'Approval', className: 'status-pill--review' },
    submitted: { label: 'Submitted', className: 'status-pill--submitted' },
    processing: { label: 'Processing', className: 'status-pill--approved' },
    approved: { label: 'Approved', className: 'status-pill--approved' },
    rejected: { label: 'Rejected', className: 'status-pill--overdue' },
    documents_uploaded: { label: 'Docs received', className: 'status-pill--pending-batch' },
    draft: { label: 'Draft', className: 'status-pill--pending' },
  }
  const config = map[status] ?? {
    label: status.replace(/_/g, ' '),
    className: 'status-pill--pending-batch',
  }
  return (
    <span className={`inline-flex items-center status-pill ${config.className}`}>{config.label}</span>
  )
}
