import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const STAFF_ROLES = [
  'super_admin',
  'admin',
  'reports',
  'billing',
  'payment_posting',
] as const

type StaffRole = (typeof STAFF_ROLES)[number]

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === 'string' && (STAFF_ROLES as readonly string[]).includes(value)
}

function displayNameFromUser(user: {
  email?: string | null
  user_metadata?: Record<string, unknown> | null
}): string {
  const metaName = user.user_metadata?.full_name ?? user.user_metadata?.name
  if (typeof metaName === 'string' && metaName.trim()) return metaName.trim()
  return user.email?.split('@')[0] ?? 'Admin'
}

function mapStaffUser(user: {
  id: string
  email?: string | null
  created_at?: string
  last_sign_in_at?: string | null
  banned_until?: string | null
  app_metadata?: Record<string, unknown> | null
  user_metadata?: Record<string, unknown> | null
}) {
  const adminRole = isStaffRole(user.app_metadata?.admin_role)
    ? user.app_metadata?.admin_role
    : 'super_admin'

  return {
    id: user.id,
    email: user.email ?? '',
    name: displayNameFromUser(user),
    admin_role: adminRole,
    created_at: user.created_at ?? new Date().toISOString(),
    last_sign_in_at: user.last_sign_in_at ?? null,
    banned: Boolean(user.banned_until),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: userData, error: userError } = await supabaseUser.auth.getUser()
    if (userError || !userData.user) return json({ error: 'Unauthorized' }, 401)

    const callerMeta = userData.user.app_metadata ?? {}
    if (callerMeta.role !== 'admin') return json({ error: 'Forbidden' }, 403)

    const callerRole = isStaffRole(callerMeta.admin_role) ? callerMeta.admin_role : 'super_admin'
    if (callerRole !== 'super_admin') {
      return json({ error: 'Only Super Admins can manage users' }, 403)
    }

    const body = await req.json().catch(() => ({}))
    const action = typeof body.action === 'string' ? body.action : ''

    if (action === 'list') {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      })
      if (error) return json({ error: error.message }, 400)

      const users = (data.users ?? [])
        .filter((u) => u.app_metadata?.role === 'admin')
        .map(mapStaffUser)
        .sort((a, b) => a.email.localeCompare(b.email))

      return json({ ok: true, users })
    }

    if (action === 'create') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      const password = typeof body.password === 'string' ? body.password : ''
      const adminRole = body.admin_role

      if (!email || !password) {
        return json({ error: 'email and password are required' }, 400)
      }
      if (password.length < 8) {
        return json({ error: 'Password must be at least 8 characters' }, 400)
      }
      if (!isStaffRole(adminRole)) {
        return json({ error: 'Invalid admin_role' }, 400)
      }

      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: name ? { full_name: name } : undefined,
        app_metadata: {
          role: 'admin',
          admin_role: adminRole,
        },
      })

      if (createError) return json({ error: createError.message }, 400)
      if (!created.user) return json({ error: 'User id missing' }, 500)

      return json({ ok: true, user: mapStaffUser(created.user) })
    }

    if (action === 'update_role') {
      const userId = typeof body.userId === 'string' ? body.userId : ''
      const adminRole = body.admin_role
      if (!userId) return json({ error: 'userId is required' }, 400)
      if (!isStaffRole(adminRole)) return json({ error: 'Invalid admin_role' }, 400)

      if (userId === userData.user.id && adminRole !== 'super_admin') {
        return json({ error: 'You cannot remove your own Super Admin role' }, 400)
      }

      const { data: existing, error: getError } = await supabaseAdmin.auth.admin.getUserById(userId)
      if (getError || !existing.user) {
        return json({ error: getError?.message ?? 'User not found' }, 404)
      }
      if (existing.user.app_metadata?.role !== 'admin') {
        return json({ error: 'Target user is not a Credyx admin' }, 400)
      }

      const { data: updated, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        {
          app_metadata: {
            ...(existing.user.app_metadata ?? {}),
            role: 'admin',
            admin_role: adminRole,
          },
        }
      )

      if (updateError) return json({ error: updateError.message }, 400)
      if (!updated.user) return json({ error: 'Update failed' }, 500)

      return json({ ok: true, user: mapStaffUser(updated.user) })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500)
  }
})
