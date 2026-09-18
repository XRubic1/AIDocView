import { getSupabase, isSupabaseConfigured } from '../../lib/supabase'

/** Full processing-job row for admin batch debugging. */
export type BatchProcessingJobDebug = {
  id: string
  batch_id: string
  client_id: string | null
  kind: string
  status: string
  attempts: number
  max_attempts: number
  last_error: string | null
  locked_at: string | null
  locked_by: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string | null
}

function mapJobRow(row: Record<string, unknown>): BatchProcessingJobDebug {
  return {
    id: String(row.id),
    batch_id: String(row.batch_id),
    client_id: row.client_id != null ? String(row.client_id) : null,
    kind: String(row.kind ?? 'verify_only'),
    status: String(row.status ?? 'pending'),
    attempts: Number(row.attempts ?? 0),
    max_attempts: Number(row.max_attempts ?? 5),
    last_error: row.last_error != null ? String(row.last_error) : null,
    locked_at: row.locked_at != null ? String(row.locked_at) : null,
    locked_by: row.locked_by != null ? String(row.locked_by) : null,
    started_at: row.started_at != null ? String(row.started_at) : null,
    finished_at: row.finished_at != null ? String(row.finished_at) : null,
    created_at: String(row.created_at ?? ''),
    updated_at: row.updated_at != null ? String(row.updated_at) : null,
  }
}

/** All processing jobs for one batch (newest first). Empty when offline / no rows. */
export async function fetchBatchProcessingJobsForDebug(
  batchId: string
): Promise<BatchProcessingJobDebug[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = getSupabase()
  if (!supabase) return []

  try {
    const { data, error } = await supabase
      .from('batch_processing_jobs')
      .select(
        'id, batch_id, client_id, kind, status, attempts, max_attempts, last_error, locked_at, locked_by, started_at, finished_at, created_at, updated_at'
      )
      .eq('batch_id', batchId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error || !data?.length) return []
    return data.map((row) => mapJobRow(row as Record<string, unknown>))
  } catch (err) {
    console.warn('[fetchBatchProcessingJobsForDebug]', err)
    return []
  }
}
