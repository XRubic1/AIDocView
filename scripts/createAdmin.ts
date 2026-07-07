/**
 * Create or promote a Supabase Auth user to Credyx admin.
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env (never commit this key).
 *
 * Usage:
 *   npx tsx scripts/createAdmin.ts
 *   npx tsx scripts/createAdmin.ts --email you@example.com --password 'secret'
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

function readArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag)
  if (idx < 0 || idx + 1 >= process.argv.length) return undefined
  return process.argv[idx + 1]
}

async function main(): Promise<void> {
  loadEnvFile()

  const url = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const email = readArg('--email') ?? process.env.ADMIN_EMAIL ?? 'admin@credyx.net'
  const password = readArg('--password') ?? process.env.ADMIN_PASSWORD

  if (!url) {
    console.error('Missing VITE_SUPABASE_URL in .env')
    process.exit(1)
  }
  if (!serviceKey) {
    console.error('Missing SUPABASE_SERVICE_ROLE_KEY in .env')
    console.error('Get it from Supabase Dashboard → Project Settings → API → service_role')
    process.exit(1)
  }
  if (!password) {
    console.error('Pass --password or set ADMIN_PASSWORD in .env')
    process.exit(1)
  }

  const endpoint = `${url.replace(/\/$/, '')}/auth/v1/admin/users`

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: 'admin' },
    }),
  })

  const body = await res.json().catch(() => ({}))

  if (res.ok) {
    console.log(`Admin user created: ${email}`)
    console.log(`User id: ${(body as { id?: string }).id ?? 'unknown'}`)
    return
  }

  const message = (body as { msg?: string; message?: string }).msg
    ?? (body as { message?: string }).message
    ?? res.statusText

  if (res.status === 422 || String(message).toLowerCase().includes('already')) {
    console.log(`User already exists (${email}). Promoting to admin…`)
    const listRes = await fetch(`${endpoint}?email=${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
    })
    const listBody = await listRes.json()
    const users = (listBody as { users?: { id: string }[] }).users ?? []
    const userId = users[0]?.id
    if (!userId) {
      console.error('Could not find existing user id:', listBody)
      process.exit(1)
    }

    const updateRes = await fetch(`${endpoint}/${userId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email_confirm: true,
        app_metadata: { role: 'admin' },
        password,
      }),
    })
    const updateBody = await updateRes.json().catch(() => ({}))
    if (!updateRes.ok) {
      console.error('Failed to promote user:', updateBody)
      process.exit(1)
    }
    console.log(`Admin role set for ${email} (user id: ${userId})`)
    return
  }

  console.error('Failed to create admin:', message, body)
  process.exit(1)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
