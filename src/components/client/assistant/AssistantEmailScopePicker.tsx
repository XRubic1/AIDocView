import type { AssistantEmailScopeOption } from '../../../types/assistant'

interface AssistantEmailScopePickerProps {
  options: AssistantEmailScopeOption[]
  disabled?: boolean
  onSelect: (option: AssistantEmailScopeOption) => void
  onCancel?: () => void
  /** Override the picker heading (email vs note). */
  label?: string
}

/** Pick one invoice / all holds / broker before drafting an email or note. */
export default function AssistantEmailScopePicker({
  options,
  disabled,
  onSelect,
  onCancel,
  label = 'Draft an email for…',
}: AssistantEmailScopePickerProps) {
  return (
    <div className="assistant-scope" role="group" aria-label={label}>
      <p className="assistant-scope__label">{label}</p>
      <div className="assistant-scope__chips">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className="assistant-scope__chip"
            disabled={disabled}
            onClick={() => onSelect(opt)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {onCancel ? (
        <button
          type="button"
          className="assistant-scope__cancel"
          disabled={disabled}
          onClick={onCancel}
        >
          Cancel
        </button>
      ) : null}
    </div>
  )
}
