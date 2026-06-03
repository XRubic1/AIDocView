/**
 * Run async work over items with a fixed concurrency limit (e.g. parallel OpenAI calls).
 * Optional staggerStartMs delays each worker slot so parallel jobs don't spike TPM together.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  options?: { staggerStartMs?: number }
): Promise<R[]> {
  if (items.length === 0) return []

  const limit = Math.max(1, Math.min(concurrency, items.length))
  const results: R[] = new Array(items.length)
  let nextIndex = 0

  async function runWorker(workerSlot: number): Promise<void> {
    const staggerMs = options?.staggerStartMs ?? 0
    if (staggerMs > 0 && workerSlot > 0) {
      await new Promise((resolve) => setTimeout(resolve, staggerMs * workerSlot))
    }

    while (true) {
      const index = nextIndex
      nextIndex += 1
      if (index >= items.length) return
      results[index] = await worker(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: limit }, (_, slot) => runWorker(slot)))
  return results
}
