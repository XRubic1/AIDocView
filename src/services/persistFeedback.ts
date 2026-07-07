type PersistFailurePayload = {
  label: string
  error: string
}

type PersistFailureHandler = (payload: PersistFailurePayload) => void

let failureHandler: PersistFailureHandler | null = null

/** Register toast handler (called from ToastProvider on mount). */
export function setPersistFailureHandler(handler: PersistFailureHandler | null): void {
  failureHandler = handler
}

function emitPersistFailure(label: string, error: string): void {
  failureHandler?.({ label, error })
}

/**
 * Fire-and-forget persist with user-visible failure feedback.
 * Use for store-level writes that aren't in React components.
 */
export async function persistWithFeedback<T>(
  label: string,
  op: () => Promise<T>
): Promise<T | undefined> {
  try {
    return await op()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[persist] ${label}:`, message)
    emitPersistFailure(label, message)
    return undefined
  }
}
