import { Loader2 } from 'lucide-react'

const sizeMap = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-8 h-8',
} as const

interface SpinnerProps {
  size?: keyof typeof sizeMap
  className?: string
  label?: string
}

/** Shared loading spinner — replaces ad-hoc Loader2 / border-spin patterns. */
export default function Spinner({ size = 'md', className = '', label }: SpinnerProps) {
  return (
    <Loader2
      className={`animate-spin ${sizeMap[size]} ${className}`.trim()}
      aria-hidden={label ? undefined : true}
      aria-label={label}
    />
  )
}
