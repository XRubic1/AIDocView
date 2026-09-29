/**
 * Packet creation used to move a batch to Packet Rework after ETA + 10 minutes.
 * That clock fired while DocSort was still working (rate-limit waits included)
 * and marked a healthy batch failed. There is no creation timeout anymore.
 */

export async function maybeTimeoutStuckAiBatch(_batchId: string): Promise<boolean> {
  return false
}

export async function sweepStuckAiBatchCreations(): Promise<string[]> {
  return []
}
