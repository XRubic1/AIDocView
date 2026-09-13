/**
 * Serial start-slot limiter so DocSort / batch AI stays under docs-per-minute.
 * Concurrent workers still share one timeline of start times.
 */
export class DocScanRateLimiter {
  private nextSlotMs = 0

  constructor(private readonly intervalMs: number) {}

  /** Wait until the next allowed start time, then reserve that slot. */
  async acquire(): Promise<void> {
    const interval = Math.max(0, this.intervalMs)
    const now = Date.now()
    const startAt = Math.max(now, this.nextSlotMs)
    this.nextSlotMs = startAt + interval
    const waitMs = startAt - now
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }
  }
}
