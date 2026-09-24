import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { BlueprintNodeData } from '../../types/blueprintGraph'
import { BLUEPRINT_NODE_KIND_LABELS } from '../../types/blueprintGraph'
import {
  formatCatalogCardLine,
  lookupActionById,
  lookupWaitUntilById,
} from './blueprintCatalog'
import { getActionIds } from './blueprintSubject'
import { defaultTaskConfig, isTaskReady, taskSetupHint } from './blueprintActionSetup'
import { getDefaultEmailTemplate } from '../../config/emailTemplateDefaults'
import { useRevealMissingSetup } from './blueprintSetupUi'
import { formatTriggerCardLine } from './blueprintTriggerFilters'
import { formatWhenCardLine } from './blueprintWhenMatch'

type BlueprintRfNode = Node<BlueprintNodeData, 'blueprint'>

type ActionTodoLine = { id: string; line: string; ready: boolean; hint: string }

function actionLines(data: BlueprintNodeData): ActionTodoLine[] {
  const ids = getActionIds(data)
  if (ids.length === 0) {
    const fallback = data.status?.trim()
    return fallback
      ? [{ id: 'fallback', line: fallback, ready: false, hint: 'Add a task' }]
      : []
  }
  const configs = data.actionConfigs ?? {}
  return ids.map((id) => {
    const action = lookupActionById(id)
    const cfg = configs[id] ?? defaultTaskConfig(id)
    const base = action?.label ?? id
    let line = action?.cardLine ?? base
    if (cfg.templateId?.trim()) {
      const tpl = getDefaultEmailTemplate(cfg.templateId)
      line = `${base}: ${tpl?.name ?? cfg.templateId}`
    } else if (cfg.message.trim()) {
      const short =
        cfg.message.length > 36 ? `${cfg.message.slice(0, 36)}…` : cfg.message
      line = `${base}: “${short}”`
    }
    return {
      id,
      line,
      ready: isTaskReady(id, cfg),
      hint: taskSetupHint(id),
    }
  })
}

function cardFailMessage(todos: ActionTodoLine[]): string {
  const missing = todos.filter((t) => !t.ready)
  if (missing.length === 0) return ''
  if (todos.length === 0) return 'Add at least one task before this can run.'
  if (missing.length === 1) {
    const name = lookupActionById(missing[0].id)?.label ?? 'This task'
    return `${name}: ${missing[0].hint.toLowerCase()}.`
  }
  return `${missing.length} tasks are not set up — open each and finish setup.`
}

function subtitle(data: BlueprintNodeData): string {
  if (data.kind === 'trigger') {
    return formatTriggerCardLine(data)
  }
  if (data.kind === 'wait') {
    const wait = lookupWaitUntilById(data.waitUntilId)
    if (wait) return formatCatalogCardLine(wait, data.days, data.waitUnit)
    return data.fieldKey?.trim() || 'Choose when to continue…'
  }
  if (data.kind === 'if' || data.kind === 'elseif') {
    return formatWhenCardLine(data)
  }
  if (data.kind === 'branch_true' || data.kind === 'branch_false') {
    return ''
  }
  if (data.kind === 'action') {
    return ''
  }
  return ''
}

function BlueprintNodeComponent({ data, selected }: NodeProps<BlueprintRfNode>) {
  const revealMissing = useRevealMissingSetup()
  const nodeData = data
  const kind = nodeData.kind
  const showTarget = kind !== 'trigger'
  const showSource = kind !== 'stop'
  const sub = subtitle(nodeData)
  const todos = kind === 'action' ? actionLines(nodeData) : []
  const failed =
    kind === 'action' &&
    revealMissing &&
    (todos.length === 0 || todos.some((t) => !t.ready))
  const failMsg = failed ? cardFailMessage(todos) : ''

  return (
    <div
      className={`bp-node bp-node--${kind}${selected ? ' bp-node--selected' : ''}${todos.length > 1 ? ' bp-node--multi' : ''}${failed ? ' bp-node--failed' : ''}`}
    >
      {failed ? (
        <div className="bp-node__fail-chip" title={failMsg}>
          <span className="bp-node__fail-chip-mark" aria-hidden>
            !
          </span>
          <span className="bp-node__fail-chip-label">Failed</span>
          <span className="bp-node__fail-tip" role="tooltip">
            {failMsg}
          </span>
        </div>
      ) : null}
      {showTarget ? (
        <Handle type="target" position={Position.Left} className="bp-node__handle" />
      ) : null}
      {kind === 'branch_true' || kind === 'branch_false' ? null : (
        <div className="bp-node__kind">{BLUEPRINT_NODE_KIND_LABELS[kind]}</div>
      )}
      <div className="bp-node__label">{nodeData.label || 'Untitled'}</div>
      {sub ? <div className="bp-node__sub">{sub}</div> : null}
      {todos.length > 0 ? (
        <ul className="bp-node__todos">
          {todos.map((todo, i) => {
            const missing = !todo.ready && revealMissing
            return (
              <li key={`${todo.id}-${i}`}>
                <span
                  className={`bp-node__todo-check${
                    todo.ready
                      ? ' bp-node__todo-check--on'
                      : missing
                        ? ' bp-node__todo-check--fail'
                        : ''
                  }`}
                  aria-hidden
                />
                {todo.line}
              </li>
            )
          })}
        </ul>
      ) : kind === 'action' ? (
        <div className="bp-node__sub">Add tasks on the right…</div>
      ) : null}
      {showSource ? (
        <Handle type="source" position={Position.Right} className="bp-node__handle" />
      ) : null}
    </div>
  )
}

export default memo(BlueprintNodeComponent)
