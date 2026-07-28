interface EnrollFieldProps {
  label: string
  children: React.ReactNode
  /** When false, shows an optional hint instead of a required asterisk. */
  required?: boolean
}

/** Labeled wrapper for enrollment / waitlist form inputs (clean light theme). */
export function EnrollField({ label, children, required = true }: EnrollFieldProps) {
  return (
    <div>
      <label className="cx-field-label">
        {label}{' '}
        {required ? <span className="req">*</span> : <span className="opt">(optional)</span>}
      </label>
      {children}
    </div>
  )
}

/** Shared input/select class: light field with navy focus ring. */
export const enrollInputClass = 'cx-input'
