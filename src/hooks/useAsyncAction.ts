import { useCallback, useRef, useState } from 'react'
import { useToast } from '../components/ui/ToastProvider'

interface UseAsyncActionOptions {
  successMessage?: string
  errorMessage?: string
  onSuccess?: () => void
  onError?: (err: unknown) => void
}

/**
 * Wraps an async mutation with pending state and toast feedback.
 * Prevents double-submit while `isPending` is true.
 */
export function useAsyncAction<T extends unknown[]>(
  action: (...args: T) => Promise<void> | void,
  options: UseAsyncActionOptions = {}
) {
  const { showToast } = useToast()
  const [isPending, setIsPending] = useState(false)
  const pendingRef = useRef(false)

  const run = useCallback(
    async (...args: T) => {
      if (pendingRef.current) return
      pendingRef.current = true
      setIsPending(true)
      try {
        await action(...args)
        if (options.successMessage) {
          showToast(options.successMessage, 'success')
        }
        options.onSuccess?.()
      } catch (err) {
        const message =
          options.errorMessage ??
          (err instanceof Error ? err.message : 'Something went wrong. Please try again.')
        showToast(message, 'error')
        options.onError?.(err)
      } finally {
        pendingRef.current = false
        setIsPending(false)
      }
    },
    [action, options, showToast]
  )

  return { run, isPending }
}
