import { createPortal } from 'react-dom'
import type { BlueprintNodeKind } from '../../types/blueprintGraph'
import { BLUEPRINT_NODE_KIND_LABELS } from '../../types/blueprintGraph'

export type BlueprintContextMenuState =
  | { kind: 'pane'; x: number; y: number; flowX: number; flowY: number }
  | { kind: 'node'; x: number; y: number; nodeId: string }

const ADD_KINDS: BlueprintNodeKind[] = [
  'trigger',
  'wait',
  'if',
  'action',
  'stop',
]

interface BlueprintContextMenuProps {
  menu: BlueprintContextMenuState
  onAdd: (kind: BlueprintNodeKind, flowX: number, flowY: number) => void
  onDuplicate: (nodeId: string) => void
  onDelete: (nodeId: string) => void
  onClose: () => void
}

function clampMenuPosition(x: number, y: number, width = 180, height = 220) {
  const pad = 8
  const maxX = window.innerWidth - width - pad
  const maxY = window.innerHeight - height - pad
  return {
    left: Math.max(pad, Math.min(x, maxX)),
    top: Math.max(pad, Math.min(y, maxY)),
  }
}

export default function BlueprintContextMenu({
  menu,
  onAdd,
  onDuplicate,
  onDelete,
  onClose,
}: BlueprintContextMenuProps) {
  const pos = clampMenuPosition(menu.x, menu.y)

  return createPortal(
    <div
      className="bp-ctx"
      style={{ left: pos.left, top: pos.top }}
      role="menu"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.kind === 'pane' ? (
        <>
          <div className="bp-ctx__title">Add a step</div>
          {ADD_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              className="bp-ctx__item"
              role="menuitem"
              onClick={() => {
                onAdd(kind, menu.flowX, menu.flowY)
                onClose()
              }}
            >
              {BLUEPRINT_NODE_KIND_LABELS[kind]}
            </button>
          ))}
        </>
      ) : (
        <>
          <div className="bp-ctx__title">This step</div>
          <button
            type="button"
            className="bp-ctx__item"
            role="menuitem"
            onClick={() => {
              onDuplicate(menu.nodeId)
              onClose()
            }}
          >
            Make a copy
          </button>
          <button
            type="button"
            className="bp-ctx__item bp-ctx__item--danger"
            role="menuitem"
            onClick={() => {
              onDelete(menu.nodeId)
              onClose()
            }}
          >
            Remove
          </button>
        </>
      )}
    </div>,
    document.body
  )
}
