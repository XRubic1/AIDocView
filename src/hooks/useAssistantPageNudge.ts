import { useEffect, useRef, useState } from 'react'
import {
  getAssistantPageHelp,
  type AssistantPageHelp,
  type AssistantPageMode,
} from '../utils/assistantPageContext'

const STORAGE_KEY = 'credyx-assistant-nudges'
/** Let the page settle before the buddy speaks. */
const SHOW_DELAY_MS = 1200
/** Auto-hide so the nudge never becomes clutter. */
const VISIBLE_MS = 9000

/** Page ids already nudged in this browser session. */
function readSeen(): string[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function markSeen(id: string): void {
  try {
    const seen = new Set(readSeen())
    seen.add(id)
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...seen]))
  } catch {
    // Session storage unavailable (private mode) — nudge just repeats.
  }
}

interface UseAssistantPageNudgeOptions {
  pathname: string
  mode: AssistantPageMode
  /** False while the chat is open or on the full Assistant page. */
  enabled: boolean
}

/**
 * Decides when the floating buddy proactively offers page-specific help.
 * Shows at most once per page per session, then auto-hides.
 */
export function useAssistantPageNudge({
  pathname,
  mode,
  enabled,
}: UseAssistantPageNudgeOptions): {
  nudge: AssistantPageHelp | null
  dismiss: () => void
} {
  const [nudge, setNudge] = useState<AssistantPageHelp | null>(null)
  const dismissedRef = useRef<string | null>(null)

  useEffect(() => {
    setNudge(null)
    if (!enabled) return

    const help = getAssistantPageHelp(pathname, mode)
    if (!help) return
    if (dismissedRef.current === help.id) return
    if (readSeen().includes(help.id)) return

    const showTimer = window.setTimeout(() => {
      setNudge(help)
      markSeen(help.id)
    }, SHOW_DELAY_MS)
    const hideTimer = window.setTimeout(() => {
      setNudge(null)
    }, SHOW_DELAY_MS + VISIBLE_MS)

    return () => {
      window.clearTimeout(showTimer)
      window.clearTimeout(hideTimer)
    }
  }, [pathname, mode, enabled])

  const dismiss = () => {
    if (nudge) dismissedRef.current = nudge.id
    setNudge(null)
  }

  return { nudge, dismiss }
}
