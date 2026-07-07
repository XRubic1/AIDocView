interface EnrollFieldProps {
  label: string
  children: React.ReactNode
}

/** Labeled wrapper for enrollment form inputs (clean light theme). */
export function EnrollField({ label, children }: EnrollFieldProps) {
  return (
    <div>
      <label className="cx-field-label">
        {label} <span className="req">*</span>
      </label>
      {children}
    </div>
  )
}

/** Shared input/select class: light field with navy focus ring. */
export const enrollInputClass = 'cx-input'
