/** Await a persist operation; rethrow on failure for caller error handling. */
export async function persistOrThrow<T>(label: string, op: () => Promise<T>): Promise<T> {
  try {
    return await op()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`${label}: ${message}`)
  }
}
