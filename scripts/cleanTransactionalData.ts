/**
 * Wipe Credyx transactional A/R data; keep carrier accounts (clients) and auth.
 *
 * Deletes: payments, invoices, batches, client_documents, reimbursement_ledger,
 * invoice action/calendar rows, notifications, and document storage objects.
 *
 * Keeps: clients, brokers, client_auth_links, email_templates, platform_settings,
 * client_bills, admin_notifications, audit_logs (unless --purge-audit).
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + VITE_SUPABASE_URL in .env
 * (or run equivalent SQL via Supabase MCP / SQL editor).
 *
 * Usage:
 *   npx tsx scripts/cleanTransactionalData.ts
 *   npx tsx scripts/cleanTransactionalData.ts --dry-run
 *   npx tsx scripts/cleanTransactionalData.ts --purge-audit
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

function loadEnvFile(): void {
  const envPath = resolve(process.cwd(), '.env')
  try {
    const raw = readFileSync(envPath, 'utf8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq <= 0) continue
      const key = trimmed.slice(0, eq).trim()
      const value = trimmed.slice(eq + 1).trim()
      if (!process.env[key]) process.env[key] = value
    }
  } catch {
    /* .env optional if vars set in shell */
  }
}

const COUNT_TABLES = [
  'clients',
  'brokers',
  'client_auth_links',
  'batches',
  'invoices',
  'payments',
  'client_documents',
  'notifications',
  'reimbursement_ledger',
  'invoice_action_plans',
  'invoice_calendar_events',
  'invoice_action_notifications',
] as const

async function countRows(
  supabase: ReturnType<typeof createClient>,
  table: string,
): Promise<number | string> {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true })
  if (error) return `error: ${error.message}`
  return count ?? 0
}

/** Recursively list + remove all objects under a storage path (folders included). */
async function removeBucketRecursive(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  prefix = '',
): Promise<number> {
  const { data: entries, error } = await supabase.storage.from(bucket).list(prefix, {
    limit: 1000,
  })
  if (error) throw new Error(`storage list ${bucket}/${prefix}: ${error.message}`)
  if (!entries?.length) return 0

  let removed = 0
  const filePaths: string[] = []

  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    // Folders have null id in Supabase Storage listing
    if (entry.id === null) {
      removed += await removeBucketRecursive(supabase, bucket, path)
    } else {
      filePaths.push(path)
    }
  }

  if (filePaths.length > 0) {
    const { error: rmErr } = await supabase.storage.from(bucket).remove(filePaths)
    if (rmErr) throw new Error(`storage remove ${bucket}: ${rmErr.message}`)
    removed += filePaths.length
  }

  return removed
}

async function main(): Promise<void> {
  loadEnvFile()

  const dryRun = process.argv.includes('--dry-run')
  const purgeAudit = process.argv.includes('--purge-audit')

  const url = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    console.error('Missing VITE_SUPABASE_URL in .env')
    process.exit(1)
  }
  if (!serviceKey) {
    console.error('Missing SUPABASE_SERVICE_ROLE_KEY in .env')
    console.error('Get it from Supabase Dashboard → Project Settings → API → service_role')
    process.exit(1)
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log(dryRun ? 'Dry run — counts only\n' : 'Cleaning transactional data…\n')

  console.log('Before:')
  for (const table of COUNT_TABLES) {
    console.log(`  ${table}: ${await countRows(supabase, table)}`)
  }

  if (dryRun) {
    console.log('\nDry run complete. Re-run without --dry-run to delete.')
    return
  }

  // Prefer one SQL transaction via RPC-less PostgREST deletes in FK-safe order.
  // Self-refs on payments must be cleared first.
  const { error: unlinkErr } = await supabase
    .from('payments')
    .update({
      parent_payment_id: null,
      moved_to_payment_id: null,
      moved_from_payment_id: null,
    })
    .not('id', 'is', null)
  if (unlinkErr) {
    console.warn('Payment unlink warning:', unlinkErr.message)
  }

  const deleteAll = async (table: string): Promise<void> => {
    // PostgREST requires a filter; match all non-null ids
    const { error } = await supabase.from(table).delete().neq('id', '')
    if (error) throw new Error(`${table}: ${error.message}`)
    console.log(`  deleted ${table}`)
  }

  console.log('\nDeleting…')
  await deleteAll('reimbursement_ledger')
  await deleteAll('invoice_action_notifications')
  await deleteAll('invoice_calendar_events')
  await deleteAll('invoice_action_plans')
  await deleteAll('payments')
  await deleteAll('invoices')
  await deleteAll('batches')
  await deleteAll('client_documents')
  await deleteAll('notifications')

  if (purgeAudit) {
    await deleteAll('audit_logs')
  }

  // Wipe nested document files via Storage API (SQL DELETE on storage.objects is blocked).
  for (const bucket of ['batch-documents', 'client-documents'] as const) {
    const removed = await removeBucketRecursive(supabase, bucket)
    console.log(`  storage ${bucket}: removed ${removed} object(s)`)
  }

  console.log('\nAfter:')
  for (const table of COUNT_TABLES) {
    console.log(`  ${table}: ${await countRows(supabase, table)}`)
  }
  console.log('\nDone. Accounts (clients) preserved.')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
