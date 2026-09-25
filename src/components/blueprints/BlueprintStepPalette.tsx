/**
 * Right-rail step palette — add Start / When / Wait / Then-do / Done
 * without right-click (screenshot-style builder).
 */
import type { BlueprintNodeKind } from '../../types/blueprintGraph'
import { BLUEPRINT_NODE_KIND_LABELS } from '../../types/blueprintGraph'
import { reasonAddKindDisabled } from './blueprintConnectionRules'

const GROUPS: { title: string; kinds: BlueprintNodeKind[] }[] = [
  { title: 'Entry', kinds: ['trigger'] },
  { title: 'Checks', kinds: ['if', 'wait'] },
  { title: 'Actions', kinds: ['action'] },
  { title: 'End', kinds: ['stop'] },
]

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
    <aside className="bp-palette" aria-label="Add blueprint steps">
      <div className="bp-palette__head">Steps</div>
      {GROUPS.map((group) => (
        <div key={group.title} className="bp-palette__group">
          <div className="bp-palette__group-title">{group.title}</div>
          <div className="bp-palette__chips">
            {group.kinds.map((kind) => {
              const disabledReason = reasonAddKindDisabled(tipKind, kind)
              const disabled = !!disabledReason
              return (
                <button
                  key={kind}
                  type="button"
                  className={`bp-palette__chip bp-palette__chip--${kind}${disabled ? ' is-disabled' : ''}`}
                  disabled={disabled}
                  title={disabledReason ?? BLUEPRINT_NODE_KIND_LABELS[kind]}
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
        </div>
      ))}
      <p className="bp-palette__hint">Click to add after the selected step. Or right‑click the canvas.</p>
    </aside>
  )
}
