import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Resolve public Supabase credentials from either VITE_* or plain SUPABASE_* names.
 * Vercel often uses SUPABASE_URL / SUPABASE_ANON_KEY; Vite only auto-exposes VITE_*.
 * We inject the resolved values at build time so both naming styles work.
 */
function resolveSupabaseEnv(mode: string) {
  const env = loadEnv(mode, process.cwd(), '')
  const url = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').trim()
  const key = (
    env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    env.SUPABASE_PUBLISHABLE_KEY ||
    env.VITE_SUPABASE_ANON_KEY ||
    env.SUPABASE_ANON_KEY ||
    ''
  ).trim()
  return { url, key }
}

/**
 * Vite inlines every VITE_* value into the client bundle, so an OpenAI key under
 * that prefix is readable by anyone who loads the app. Fail the build instead.
 */
function guardServerSecrets(mode: string, command: 'build' | 'serve') {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  if (!env.VITE_OPENAI_API_KEY?.trim()) return
  const message =
    '[vite] VITE_OPENAI_API_KEY is set. It would ship in the browser bundle. Remove it from .env / Vercel and keep OPENAI_API_KEY only as a Supabase secret for openai-proxy.'
  if (command === 'build') throw new Error(message)
  console.warn(message)
}

// https://vitejs.dev/config/
export default defineConfig(({ mode, command }) => {
  guardServerSecrets(mode, command)
  const { url, key } = resolveSupabaseEnv(mode)

  if (!url || !key) {
    console.warn(
      '[vite] Supabase env incomplete at build time. Set SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY (or VITE_*) on Vercel / in .env, then rebuild.'
    )
  }

  return {
    plugins: [react()],
    // Keep default VITE_ exposure for other client settings.
    define: {
      // Build-time injection — works with Vercel SUPABASE_* or local VITE_*.
      __CREDYX_SUPABASE_URL__: JSON.stringify(url),
      __CREDYX_SUPABASE_KEY__: JSON.stringify(key),
    },
    server: {
      port: 3000,
      // Bind IPv4 so http://localhost:3000 and http://127.0.0.1:3000 both work
      // (Node otherwise listens on ::1 only, and browsers hang on 127.0.0.1).
      host: '127.0.0.1',
      strictPort: true,
      open: true,
    },
    // Do not manually split React / Recharts — that caused production boot to hang with:
    // Cannot read properties of undefined (reading 'forwardRef') in vendor-charts-*.js
    build: {
      chunkSizeWarningLimit: 1600,
    },
  }
})
