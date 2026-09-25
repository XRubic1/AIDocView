import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { User } from 'lucide-react'
import type { BlueprintNodeData } from '../../types/blueprintGraph'
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
  if (data.kind === 'trigger') return formatTriggerCardLine(data)
  if (data.kind === 'wait') {
    const wait = lookupWaitUntilById(data.waitUntilId)
    if (wait) return formatCatalogCardLine(wait, data.days, data.waitUnit)
    return data.fieldKey?.trim() || 'Choose when…'
  }
  if (data.kind === 'if' || data.kind === 'elseif') return formatWhenCardLine(data)
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
  const isCapsule =
    kind === 'trigger' ||
    kind === 'wait' ||
    kind === 'if' ||
    kind === 'elseif' ||
    kind === 'stop' ||
    kind === 'branch_true' ||
    kind === 'branch_false'
  const showUserIcon = kind === 'action' || kind === 'branch_true' || kind === 'branch_false'
  const failed =
    kind === 'action' &&
    revealMissing &&
    (todos.length === 0 || todos.some((t) => !t.ready))
  const failMsg = failed ? cardFailMessage(todos) : ''
  // Capsules: title only (screenshot style). Then-do keeps description / todos.
  const showSub = kind === 'action' && Boolean(sub)

  return (
    <div
      className={`bp-node bp-node--${kind}${isCapsule ? ' bp-node--capsule' : ' bp-node--card'}${selected ? ' bp-node--selected' : ''}${todos.length > 1 ? ' bp-node--multi' : ''}${failed ? ' bp-node--failed' : ''}`}
    >
      {failed ? (
        <div className="bp-node__fail-chip" title={failMsg}>
          <span className="bp-node__fail-chip-mark" aria-hidden>
            !
          </span>
          <span className="bp-node__fail-chip-label">Setup</span>
          <span className="bp-node__fail-tip" role="tooltip">
            {failMsg}
          </span>
        </div>
      ) : null}
      {showTarget ? (
        <Handle type="target" position={Position.Left} className="bp-node__handle" />
      ) : null}

      <div className="bp-node__body">
        {showUserIcon ? (
          <span className="bp-node__icon" aria-hidden>
            <User size={12} strokeWidth={2.25} />
          </span>
        ) : null}
        <div className="bp-node__text">
          <div
            className="bp-node__label"
            title={isCapsule && sub ? sub : undefined}
          >
            {nodeData.label || 'Untitled'}
          </div>
          {showSub ? <div className="bp-node__sub">{sub}</div> : null}
        </div>
      </div>

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
