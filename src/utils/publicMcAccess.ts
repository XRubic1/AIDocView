/** Session gate for the public /MC site — carrier must enter their MC first. */

export const PUBLIC_MC_ACCESS_KEY = 'credyx_public_mc_access'

export type PublicMcAccess = {
  visitorId: string | null
  mcDigits: string
  companyName: string | null
  unlockedAt: string
  /** Show welcome once after a first-time unlock in this tab. */
  showWelcome: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function readPublicMcAccess(): PublicMcAccess | null {
  try {
    if (typeof sessionStorage === 'undefined') return null
    const raw = sessionStorage.getItem(PUBLIC_MC_ACCESS_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return null
    const mcDigits = typeof parsed.mcDigits === 'string' ? parsed.mcDigits.replace(/\D/g, '') : ''
    if (mcDigits.length < 4) return null
    return {
      visitorId: typeof parsed.visitorId === 'string' ? parsed.visitorId : null,
      mcDigits,
      companyName: typeof parsed.companyName === 'string' ? parsed.companyName : null,
      unlockedAt:
        typeof parsed.unlockedAt === 'string' ? parsed.unlockedAt : new Date().toISOString(),
      showWelcome: parsed.showWelcome === true,
    }
  } catch {
    return null
  }
}

export function writePublicMcAccess(
  access: Omit<PublicMcAccess, 'unlockedAt' | 'showWelcome'> & {
    unlockedAt?: string
    showWelcome?: boolean
  }
): void {
  try {
    if (typeof sessionStorage === 'undefined') return
    const payload: PublicMcAccess = {
      visitorId: access.visitorId,
      mcDigits: access.mcDigits.replace(/\D/g, ''),
      companyName: access.companyName,
      unlockedAt: access.unlockedAt ?? new Date().toISOString(),
      showWelcome: access.showWelcome === true,
    }
    sessionStorage.setItem(PUBLIC_MC_ACCESS_KEY, JSON.stringify(payload))
  } catch {
    // Private browsing can block sessionStorage.
  }
}

export function clearPublicMcAccess(): void {
  try {
    if (typeof sessionStorage === 'undefined') return
    sessionStorage.removeItem(PUBLIC_MC_ACCESS_KEY)
  } catch {
    // ignore
  }
}

export function clearPublicMcWelcome(): void {
  const current = readPublicMcAccess()
  if (!current?.showWelcome) return
  writePublicMcAccess({ ...current, showWelcome: false })
}

export function formatCarrierMcLabel(digits: string): string {
  const cleaned = digits.replace(/\D/g, '')
  return cleaned ? `MC-${cleaned}` : 'MC'
}
