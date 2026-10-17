/**
 * Supabase sends recovery / invite links to the project Site URL when the requested
 * redirect is not allow-listed — usually the site root. Move those landings to the
 * create-password page before supabase-js reads (and clears) the URL tokens.
 * Imported first in main.tsx so it runs before anything touches auth.
 */
const SETUP_PATH = '/client/setup-password'
const LINK_TYPES = new Set(['recovery', 'invite'])

if (typeof window !== 'undefined' && window.location.pathname !== SETUP_PATH) {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const query = new URLSearchParams(window.location.search)
  const type = hash.get('type') || query.get('type') || ''
  if (LINK_TYPES.has(type)) {
    window.history.replaceState(
      window.history.state,
      '',
      `${SETUP_PATH}${window.location.search}${window.location.hash}`
    )
  }
}

export {}
