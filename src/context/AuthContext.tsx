import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { requireSupabase } from '../lib/supabase'
import {
  clearTenantStores,
  hydrateStoresForSession,
  HydrationError,
} from '../services/supabase/hydrateStores'
import { onAuthStateChange, resolveSession, type ResolvedSession } from '../services/sessionService'

export type HydrationPhase = 'session' | 'data' | 'ready'

interface AuthContextValue {
  session: Session | null
  resolved: ResolvedSession
  isReady: boolean
  hydrationPhase: HydrationPhase
  bootMessage: string
  hydrationError: string | null
  refreshSession: () => Promise<void>
}

const defaultResolved: ResolvedSession = {
  session: null,
  user: null,
  principal: 'none',
  clientId: null,
  isAdmin: false,
}

function bootMessageFor(phase: HydrationPhase, isReady: boolean): string {
  if (!isReady || phase === 'session') return 'Signing you in…'
  if (phase === 'data') return 'Loading your workspace…'
  return 'Almost ready…'
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Global auth + scoped data hydration. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [resolved, setResolved] = useState<ResolvedSession>(defaultResolved)
  const [isReady, setIsReady] = useState(false)
  const [hydrationPhase, setHydrationPhase] = useState<HydrationPhase>('session')
  const [hydrationError, setHydrationError] = useState<string | null>(null)

  const applySession = useCallback(async (next: Session | null) => {
    setSession(next)
    const r = resolveSession(next)
    setResolved(r)

    setHydrationPhase('data')
    try {
      await hydrateStoresForSession(next)
      setHydrationError(null)
    } catch (err: unknown) {
      if (err instanceof HydrationError) {
        const detail = err.details?.length ? ` (${err.details.join('; ')})` : ''
        setHydrationError(`${err.message}${detail}`)
      } else if (err instanceof Error) {
        setHydrationError(err.message)
      } else {
        setHydrationError('Failed to load application data.')
      }
    } finally {
      setHydrationPhase('ready')
    }
  }, [])

  const refreshSession = useCallback(async () => {
    const supabase = requireSupabase()
    const { data } = await supabase.auth.getSession()
    await applySession(data.session)
  }, [applySession])

  useEffect(() => {
    const supabase = requireSupabase()

    void (async () => {
      setHydrationPhase('session')
      const { data } = await supabase.auth.getSession()
      await applySession(data.session)
      setIsReady(true)
    })()

    const unsubscribe = onAuthStateChange(async (r: ResolvedSession) => {
      await applySession(r.session)
    })

    return () => {
      unsubscribe()
      clearTenantStores()
    }
  }, [applySession])

  const value = useMemo(
    () => ({
      session,
      resolved,
      isReady,
      hydrationPhase,
      bootMessage: bootMessageFor(hydrationPhase, isReady),
      hydrationError,
      refreshSession,
    }),
    [session, resolved, isReady, hydrationPhase, hydrationError, refreshSession]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
