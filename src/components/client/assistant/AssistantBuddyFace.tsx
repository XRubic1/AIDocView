/**
 * Credyx Assistant buddy — branded PNG faces by mood.
 * Moods: idle (neutral), happy (waving), listening (thinking).
 */

export type AssistantBuddyMood = 'idle' | 'happy' | 'listening'

interface AssistantBuddyFaceProps {
  size?: number
  className?: string
  mood?: AssistantBuddyMood
  /** Soft idle bob (FAB / header). */
  animated?: boolean
}

/** Mood → public asset (waitlist / portal share the same buddy set). */
const BUDDY_SRC: Record<AssistantBuddyMood, string> = {
  idle: '/credyx-buddy-idle.png',
  happy: '/credyx-buddy-waving.png',
  listening: '/credyx-buddy-thinking.png',
}

/** Soft bobbing buddy headshot for FAB, header, and chat chrome. */
export default function AssistantBuddyFace({
  size = 40,
  className,
  mood = 'idle',
  animated = true,
}: AssistantBuddyFaceProps) {
  const classes = [
    'assistant-buddy',
    `assistant-buddy--${mood}`,
    animated ? 'assistant-buddy--animated' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={classes} style={{ width: size, height: size }} aria-hidden>
      <img
        src={BUDDY_SRC[mood]}
        alt=""
        className="assistant-buddy__img"
        width={size}
        height={size}
        draggable={false}
        decoding="async"
      />
    </span>
  )
}
