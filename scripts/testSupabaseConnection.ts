/**
 * Smoke-test Supabase URL + publishable key from .env
 * Usage: npx tsx scripts/testSupabaseConnection.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

function loadEnvFile(): void {
  const envPath = resolve(process.cwd(), '.env')
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
}

async function main(): Promise<void> {
  loadEnvFile()

  const url = process.env.VITE_SUPABASE_URL
  const key =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY

  if (!url) {
    console.error('Missing VITE_SUPABASE_URL in .env')
    process.exit(1)
  }
  if (!key) {
    console.error('Missing VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY in .env')
    process.exit(1)
  }

  if (url.includes('/rest/v1')) {
    console.error('VITE_SUPABASE_URL should be the base URL only (no /rest/v1)')
    process.exit(1)
  }

  console.log('Supabase connection test')
  console.log(`  URL: ${url}`)
  console.log(`  Key: ${key.slice(0, 20)}…`)

  const supabase = createClient(url, key)

  const { data: health, error: healthError } = await supabase.auth.getSession()
  if (healthError) {
    console.error('\nConnection failed (auth endpoint):', healthError.message)
    process.exit(1)
  }

  console.log('\nAuth endpoint: OK (no active session — expected)')

  const tableNames = [
    'clients',
    'brokers',
    'batches',
    'invoices',
    'payments',
    'notifications',
    'audit_logs',
    'client_documents',
  ] as const
  for (const table of tableNames) {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true })
    if (error) {
      console.error(`\nTable "${table}" check failed:`, error.message)
      process.exit(1)
    }
    console.log(`  ${table}: ${count ?? 0} rows`)
  }

  const { error: restError } = await supabase.from('_credyx_connection_probe').select('*').limit(1)
  if (restError) {
    const code = (restError as { code?: string }).code
    if (code === 'PGRST205' || restError.message.includes('Could not find the table')) {
      console.log('REST API: OK (all core tables reachable)')
    } else if (code === '42P01') {
      console.log('REST API: OK (all core tables reachable)')
    } else {
      console.error('\nREST API error:', restError.message)
      process.exit(1)
    }
  } else {
    console.log('REST API: OK')
  }

  void health
  console.log('\nSupabase connection successful.')
}

main().catch((err) => {
  console.error('\nUnexpected error:', err instanceof Error ? err.message : err)
  process.exit(1)
})
