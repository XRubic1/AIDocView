type SimpleWelcomeBarProps = {
  carrierName: string
  /** One-line “since you were away” summary. */
  awaySummary: string
  loading?: boolean
  /**
   * Show “Welcome back…” on the page. Greeting lives in the topbar;
   * this page strip is the “since you were away” line (desktop only).
   */
  showGreeting?: boolean
}

/**
 * Compact activity strip under the navbar (desktop). Hidden on phones.
 */
export default function SimpleWelcomeBar({
  carrierName,
  awaySummary,
  loading = false,
  showGreeting = false,
}: SimpleWelcomeBarProps) {
  if (loading) {
    return (
      <header className="cdv2-welcome is-loading" aria-label="Activity summary">
        {showGreeting ? <p className="cdv2-welcome__title">—</p> : null}
        <p className="cdv2-welcome__away">…</p>
      </header>
    )
  }

  const awayText = awaySummary || 'No new activity since your last visit'

  return (
    <header className="cdv2-welcome">
      {showGreeting ? (
        <h1 className="cdv2-welcome__title">Welcome back, {carrierName}</h1>
      ) : null}
      <p className="cdv2-welcome__away">{awayText}</p>
    </header>
  )
}
