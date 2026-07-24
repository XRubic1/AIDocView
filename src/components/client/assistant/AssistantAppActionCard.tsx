import { ArrowUpRight } from 'lucide-react'
import type { AssistantAppAction } from '../../../types/assistant'

interface AssistantAppActionCardProps {
  actions: AssistantAppAction[]
  onOpen: (action: AssistantAppAction) => void
  disabled?: boolean
}

/** Clickable in-app destinations — buddy hands you off to the right screen. */
export default function AssistantAppActionCard({
  actions,
  onOpen,
  disabled,
}: AssistantAppActionCardProps) {
  if (!actions.length) return null

  return (
    <div className="assistant-app-actions" role="list" aria-label="Open in Credyx">
      {actions.map((action) => (
        <button
          key={`${action.id}-${action.path}`}
          type="button"
          role="listitem"
          className="assistant-app-actions__btn"
          disabled={disabled}
          onClick={() => onOpen(action)}
        >
          <span className="assistant-app-actions__text">
            <span className="assistant-app-actions__label">{action.label}</span>
            {action.description ? (
              <span className="assistant-app-actions__desc">{action.description}</span>
            ) : null}
          </span>
          <ArrowUpRight className="assistant-app-actions__icon" aria-hidden />
        </button>
      ))}
    </div>
  )
}
