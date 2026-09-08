import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { setPersistFailureHandler } from '../../services/persistFeedback'

export type ToastVariant = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  message: string
  variant: ToastVariant
}

interface ToastContextValue {
  toasts: Toast[]
  showToast: (message: string, variant?: ToastVariant) => void
  dismissToast: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

/** Lightweight toast notifications without external dependencies. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback(
    (message: string, variant: ToastVariant = 'info') => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      setToasts((prev) => [...prev, { id, message, variant }])
      window.setTimeout(() => dismissToast(id), variant === 'error' ? 14000 : 5000)
    },
    [dismissToast]
  )

  const value = useMemo(() => ({ toasts, showToast, dismissToast }), [toasts, showToast, dismissToast])

  useEffect(() => {
    setPersistFailureHandler(({ label, error }) => {
      showToast(`${label}: change couldn't be saved — ${error}`, 'error')
    })
    return () => setPersistFailureHandler(null)
  }, [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`rounded-lg px-4 py-3 text-sm shadow-lg border toast-enter ${
              toast.variant === 'error'
                ? 'bg-red-50 text-red-800 border-red-200'
                : toast.variant === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-white text-slate-800 border-slate-200'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <span>{toast.message}</span>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="text-slate-400 hover:text-slate-600 shrink-0"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
