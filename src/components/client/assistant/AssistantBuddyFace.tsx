/**
 * Cute animated buddy face for the Credyx Assistant.
 * Moods: idle (blink + soft bob), happy (bigger smile), listening (attentive eyes).
 */

export type AssistantBuddyMood = 'idle' | 'happy' | 'listening'

interface AssistantBuddyFaceProps {
  size?: number
  className?: string
  mood?: AssistantBuddyMood
  /** Extra lively motion (FAB). */
  animated?: boolean
}

/** Soft round buddy with blink, blush, sparkles, and idle motion. */
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

  // Unique gradient ids so multiple faces on one page don't clash.
  const gid = `buddy-${size}-${mood}`

  return (
    <span className={classes} style={{ width: size, height: size }} aria-hidden>
      <svg
        className="assistant-buddy__svg"
        viewBox="0 0 80 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
      >
        <defs>
          <linearGradient
            id={`${gid}-head`}
            x1="20"
            y1="12"
            x2="58"
            y2="68"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#FFFFFF" />
            <stop offset="1" stopColor="#F1F5F9" />
          </linearGradient>
          <radialGradient
            id={`${gid}-glow`}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(40 40) rotate(90) scale(36)"
          >
            <stop stopColor="#FBBF24" stopOpacity="0.55" />
            <stop offset="1" stopColor="#FBBF24" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle
          className="assistant-buddy__glow-fill"
          cx="40"
          cy="40"
          r="36"
          fill={`url(#${gid}-glow)`}
        />

        <circle cx="40" cy="40" r="30" fill={`url(#${gid}-head)`} />
        <circle cx="40" cy="40" r="30" stroke="#E2E8F0" strokeWidth="1.5" />

        <ellipse className="assistant-buddy__blush" cx="24" cy="44" rx="5.5" ry="3.2" />
        <ellipse className="assistant-buddy__blush" cx="56" cy="44" rx="5.5" ry="3.2" />

        <g className="assistant-buddy__eyes">
          <g className="assistant-buddy__eye assistant-buddy__eye--left">
            <ellipse
              className="assistant-buddy__pupil"
              cx="30"
              cy="36"
              rx="5.2"
              ry="6"
              fill="#0F172A"
            />
            <circle cx="31.6" cy="34.2" r="1.7" fill="#fff" />
          </g>
          <g className="assistant-buddy__eye assistant-buddy__eye--right">
            <ellipse
              className="assistant-buddy__pupil"
              cx="50"
              cy="36"
              rx="5.2"
              ry="6"
              fill="#0F172A"
            />
            <circle cx="51.6" cy="34.2" r="1.7" fill="#fff" />
          </g>
        </g>

        <path
          className="assistant-buddy__smile"
          d="M29 48c3.2 6.2 9.5 9 11 9s7.8-2.8 11-9"
          stroke="#0F172A"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />

        <g className="assistant-buddy__sparkles">
          <path
            className="assistant-buddy__sparkle assistant-buddy__sparkle--a"
            d="M64 18l1.4 3.2L68.6 22.6 65.4 24l-1.4 3.2L62.6 24 59.4 22.6l3.2-1.4L64 18z"
            fill="#FBBF24"
          />
          <path
            className="assistant-buddy__sparkle assistant-buddy__sparkle--b"
            d="M14 22l1 2.2L17.4 25.2 15 26.2l-1 2.2-.9-2.2-2.4-1 2.4-1L14 22z"
            fill="#38BDF8"
          />
        </g>
      </svg>
    </span>
  )
}
