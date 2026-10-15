/**
 * Floating "Add step" bar on the canvas — Start / When / Wait / Then do / Done.
 * New cards link after the selected card when the connection rules allow it.
 */
import type { BlueprintNodeKind } from '../../types/blueprintGraph'
import { BLUEPRINT_NODE_KIND_LABELS } from '../../types/blueprintGraph'
import { reasonAddKindDisabled } from './blueprintConnectionRules'

const KINDS: BlueprintNodeKind[] = ['trigger', 'wait', 'if', 'action', 'stop']

const SHORT: Partial<Record<BlueprintNodeKind, string>> = {
  trigger: 'Start',
  if: 'When',
  wait: 'Wait',
  action: 'Then do',
  stop: 'Done',
}

interface BlueprintStepPaletteProps {
  tipKind?: BlueprintNodeKind | null
  onAdd: (kind: BlueprintNodeKind) => void
}

export default function BlueprintStepPalette({
  tipKind = null,
  onAdd,
}: BlueprintStepPaletteProps) {
  return (
    <div className="bp-palette" role="toolbar" aria-label="Add a step">
      <span className="bp-palette__head">Add step</span>
      {KINDS.map((kind) => {
        const disabledReason = reasonAddKindDisabled(tipKind, kind)
        const disabled = !!disabledReason
        return (
          <button
            key={kind}
            type="button"
            className={`bp-palette__chip bp-palette__chip--${kind}${disabled ? ' is-disabled' : ''}`}
            disabled={disabled}
            title={disabledReason ?? `Add “${BLUEPRINT_NODE_KIND_LABELS[kind]}” after the selected step`}
            onClick={() => {
              if (disabled) return
              onAdd(kind)
            }}
          >
            {SHORT[kind] ?? BLUEPRINT_NODE_KIND_LABELS[kind]}
          </button>
        )
      })}
    </div>
  )
}
