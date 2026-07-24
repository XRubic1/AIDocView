import type { AssistantFollowUp } from '../../../types/assistant'

interface AssistantFollowUpBarProps {
  followUps: AssistantFollowUp[]
  disabled?: boolean
  onSelect: (followUp: AssistantFollowUp) => void
}

/** Selectable follow-up questions under an assistant reply. */
export default function AssistantFollowUpBar({
  followUps,
  disabled,
  onSelect,
}: AssistantFollowUpBarProps) {
  if (!followUps.length) return null

  return (
    <div className="assistant-followups" role="group" aria-label="Follow-up questions">
      <p className="assistant-followups__label">Next</p>
      <div className="assistant-followups__chips">
        {followUps.map((fu) => (
          <button
            key={fu.id}
            type="button"
            className="assistant-followups__chip"
            disabled={disabled}
            onClick={() => onSelect(fu)}
          >
            {fu.label}
          </button>
        ))}
      </div>
    </div>
  )
}
