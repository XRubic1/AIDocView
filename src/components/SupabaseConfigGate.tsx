import type { ReactNode } from 'react'
import { getSupabaseConfigError } from '../lib/supabase'

/** Blocks the app when required Supabase env vars are missing. */
export default function SupabaseConfigGate({ children }: { children: ReactNode }) {
  const configError = getSupabaseConfigError()

  if (configError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full rounded-lg border border-red-200 bg-white p-8 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900 mb-2">Configuration required</h1>
          <p className="text-sm text-slate-600 mb-4">
            Credyx requires Supabase to run. Set these in Vercel Environment Variables
            (Production), then <strong>redeploy</strong> — they are read at build time:
          </p>
          <pre className="text-xs bg-slate-100 rounded p-3 overflow-x-auto text-slate-800 mb-4">
{`SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-anon-or-publishable-key

# Also accepted:
# SUPABASE_ANON_KEY=...
# VITE_SUPABASE_URL=...
# VITE_SUPABASE_PUBLISHABLE_KEY=...`}
          </pre>
          <p className="text-sm text-red-600">{configError}</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
