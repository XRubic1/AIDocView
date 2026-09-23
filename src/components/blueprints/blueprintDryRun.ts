import type { Edge } from '@xyflow/react'
import type { BlueprintFlowNode, BlueprintNodeData } from '../../types/blueprintGraph'
import {
  formatCatalogCardLine,
  lookupActionById,
  lookupEventById,
  lookupWaitUntilById,
} from './blueprintCatalog'
import { getActionIds } from './blueprintSubject'
import {
  channelLabel,
  defaultTaskConfig,
  isTaskReady,
  taskSetupHint,
} from './blueprintActionSetup'
import { getDefaultEmailTemplate } from '../../config/emailTemplateDefaults'
import { formatTriggerCardLine } from './blueprintTriggerFilters'
import {
  formatWhenCardLine,
  whenNodePasses,
} from './blueprintWhenMatch'

export type DryRunLogLevel = 'info' | 'wait' | 'branch' | 'action' | 'warn' | 'done'

export type DryRunLogEntry = {
  step: number
  level: DryRunLogLevel
  title: string
  detail: string
  nodeId?: string
}

export type WhenEventOption = {
  checkId: string
  label: string
}

function isWhen(data: BlueprintNodeData): boolean {
  return data.kind === 'if' || data.kind === 'elseif'
}

function isBranchTrue(data: BlueprintNodeData): boolean {
  return data.kind === 'branch_true'
}

function isBranchFalse(data: BlueprintNodeData): boolean {
  return data.kind === 'branch_false'
}

function nodeTitle(data: BlueprintNodeData): string {
  return data.label?.trim() || '(untitled)'
}

/** Unique When events on the canvas (for scenario toggles). */
export function collectWhenEvents(nodes: BlueprintFlowNode[]): WhenEventOption[] {
  const seen = new Set<string>()
  const out: WhenEventOption[] = []
  for (const n of nodes) {
    if (!isWhen(n.data)) continue
    const id = n.data.checkId
    if (!id || seen.has(id)) continue
    seen.add(id)
    const event = lookupEventById(id)
    out.push({
      checkId: id,
      label: event?.label ?? n.data.label ?? id,
    })
  }
  return out
}

/** Sensible demo defaults: prefer “no reply” chase path when both exist. */
export function defaultWhenAssumptions(
  nodes: BlueprintFlowNode[]
): Record<string, boolean> {
  const events = collectWhenEvents(nodes)
  const assumptions: Record<string, boolean> = {}
  const ids = events.map((e) => e.checkId)
  if (ids.includes('no_reply') && ids.includes('broker_replied')) {
    assumptions.broker_replied = false
    assumptions.no_reply = true
    for (const id of ids) {
      if (id !== 'broker_replied' && id !== 'no_reply') assumptions[id] = false
    }
    return assumptions
  }
  ids.forEach((id, i) => {
    assumptions[id] = i === 0
  })
  return assumptions
}

function describeNode(data: BlueprintNodeData): { title: string; detail: string; level: DryRunLogLevel } {
  if (data.kind === 'trigger') {
    const line = formatTriggerCardLine(data)
    const entry = data.triggerEntry === 'event' ? 'event' : 'filter'
    return {
      level: 'info',
      title: nodeTitle(data),
      detail:
        entry === 'event'
          ? `Would wake when a matching event happens (${line}).`
          : `Would apply to records that match: ${line}.`,
    }
  }
  if (data.kind === 'wait') {
    const wait = lookupWaitUntilById(data.waitUntilId)
    const line = wait
      ? formatCatalogCardLine(wait, data.days)
      : data.fieldKey || 'Wait condition not set'
    return {
      level: 'wait',
      title: nodeTitle(data),
      detail: `${line}. Clock reached (pretend).`,
    }
  }
  if (isWhen(data)) {
    return {
      level: 'branch',
      title: nodeTitle(data),
      detail: formatWhenCardLine(data),
    }
  }
  if (isBranchTrue(data) || isBranchFalse(data)) {
    return {
      level: 'branch',
      title: nodeTitle(data),
      detail: isBranchTrue(data)
        ? 'Taking the True path.'
        : 'Taking the False path.',
    }
  }
  if (data.kind === 'action') {
    const ids = getActionIds(data)
    if (ids.length === 0) {
      return {
        level: 'action',
        title: nodeTitle(data),
        detail: 'No tasks on this card yet.',
      }
    }
    if (ids.length === 1) {
      const action = lookupActionById(ids[0])
      return {
        level: 'action',
        title: nodeTitle(data),
        detail: action?.cardLine ?? data.status ?? 'Action not set',
      }
    }
    return {
      level: 'action',
      title: nodeTitle(data),
      detail: `${ids.length} tasks on this card`,
    }
  }
  if (data.kind === 'stop') {
    return {
      level: 'done',
      title: nodeTitle(data),
      detail: 'Path ends here.',
    }
  }
  return {
    level: 'info',
    title: nodeTitle(data),
    detail: '',
  }
}

/**
 * Walk the graph from Start, using When assumptions to pick branches.
 * Pure simulation — no side effects.
 */
export function runBlueprintDryRun(
  nodes: BlueprintFlowNode[],
  edges: Edge[],
  assumptions: Record<string, boolean>
): DryRunLogEntry[] {
  const log: DryRunLogEntry[] = []
  let step = 0
  const push = (
    level: DryRunLogLevel,
    title: string,
    detail: string,
    nodeId?: string
  ) => {
    step += 1
    log.push({ step, level, title, detail, nodeId })
  }

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const starts = nodes.filter((n) => n.data.kind === 'trigger')

  if (nodes.length === 0) {
    push('warn', 'Empty blueprint', 'Add a Start with card and connect steps, then Run again.')
    return log
  }

  if (starts.length === 0) {
    push('warn', 'No Start with card', 'Add a Start with (All invoices / All brokers) to begin.')
    return log
  }

  const assumptionSummary = Object.entries(assumptions)
    .map(([id, v]) => {
      const ev = lookupEventById(id)
      return `${ev?.label ?? id} = ${v ? 'YES' : 'NO'}`
    })
    .join(' · ')

  push(
    'info',
    'Dry run started',
    assumptionSummary
      ? `Using: ${assumptionSummary}`
      : 'No When forks — one straight path.'
  )

  for (const start of starts) {
    if (starts.length > 1) {
      push('info', `Path from “${nodeTitle(start.data)}”`, 'Multiple Start cards — simulating each.')
    }

    let current: BlueprintFlowNode | null = start
    const visited = new Set<string>()
    let guard = 0

    while (current && guard < 80) {
      guard += 1
      if (visited.has(current.id)) {
        push(
          'warn',
          'Loop detected',
          `Stopped at “${nodeTitle(current.data)}” to avoid repeating forever.`,
          current.id
        )
        break
      }
      visited.add(current.id)

      const desc = describeNode(current.data)
      let whenMatched: boolean | null = null
      if (isWhen(current.data)) {
        const checkId = current.data.checkId ?? ''
        const raw = checkId ? assumptions[checkId] === true : false
        whenMatched = whenNodePasses(current.data, raw)
        push(
          'branch',
          desc.title,
          whenMatched
            ? `${desc.detail} → matched — continue.`
            : `${desc.detail} → did not match — path ends (flip Match when or scenario).`,
          current.id
        )
      } else if (current.data.kind === 'action') {
        const ids = getActionIds(current.data)
        const logOne = (id: string) => {
          const action = lookupActionById(id)
          const cfg =
            current!.data.actionConfigs?.[id] ?? defaultTaskConfig(id)
          if (!isTaskReady(id, cfg)) {
            push(
              'warn',
              action?.defaultTitle ?? id,
              `Not set up — ${taskSetupHint(id)}. Open the task and finish setup before this can run.`,
              current!.id
            )
            return
          }
          const bits = [action?.cardLine ?? 'Task']
          if (cfg.templateId?.trim()) {
            const tpl = getDefaultEmailTemplate(cfg.templateId)
            bits.push(`template: ${tpl?.name ?? cfg.templateId}`)
          }
          if (cfg.message?.trim()) bits.push(`“${cfg.message.trim()}”`)
          if (cfg.channel) bits.push(channelLabel(cfg.channel))
          push('action', action?.defaultTitle ?? id, bits.join(' · '), current!.id)
        }
        if (ids.length === 0) {
          push(desc.level, desc.title, desc.detail, current.id)
        } else if (ids.length === 1) {
          logOne(ids[0])
        } else {
          push(
            'info',
            desc.title,
            `Running ${ids.length} tasks on this card:`,
            current.id
          )
          for (const id of ids) logOne(id)
        }
      } else {
        push(desc.level, desc.title, desc.detail, current.id)
      }

      if (current.data.kind === 'stop') break

      const outgoing = edges.filter((e) => e.source === current!.id)
      if (outgoing.length === 0) {
        push(
          'warn',
          'Dead end',
          `“${nodeTitle(current.data)}” has no next step. Connect another card or add Done.`,
          current.id
        )
        break
      }

      let next: BlueprintFlowNode | null = null

      if (whenMatched !== null) {
        const targets = outgoing
          .map((e) => byId.get(e.target))
          .filter((n): n is BlueprintFlowNode => !!n)
        const trueCard = targets.find((n) => isBranchTrue(n.data))
        const falseCard = targets.find((n) => isBranchFalse(n.data))
        if (trueCard || falseCard) {
          if (whenMatched && trueCard) next = trueCard
          else if (!whenMatched && falseCard) next = falseCard
          else if (whenMatched) {
            next = targets.find((n) => !isBranchFalse(n.data)) ?? targets[0] ?? null
          }
          if (!next) {
            push(
              'warn',
              'Branch missing',
              whenMatched
                ? 'Legacy True card missing — or connect When → Then do.'
                : 'Legacy False card missing — or use Match when · False on the When card.',
              current.id
            )
            break
          }
        } else if (whenMatched) {
          next = targets[0] ?? null
          if (!next) {
            push(
              'warn',
              'Dead end',
              'Connect When → Then do (or Done).',
              current.id
            )
            break
          }
        } else {
          push(
            'warn',
            'When did not match',
            'This When’s Match when switch did not match the scenario. Flip the scenario toggle or the Match when switch.',
            current.id
          )
          break
        }
      } else {
        const targets = outgoing
          .map((e) => ({ edge: e, node: byId.get(e.target) }))
          .filter((t): t is { edge: Edge; node: BlueprintFlowNode } => !!t.node)

        const whenTargets = targets.filter((t) => isWhen(t.node.data))
        const otherTargets = targets.filter((t) => !isWhen(t.node.data))

        if (whenTargets.length > 0) {
          const matched = whenTargets.filter((t) => {
            const id = t.node.data.checkId ?? ''
            const raw = id ? assumptions[id] === true : false
            return whenNodePasses(t.node.data, raw)
          })
          const skipped = whenTargets.filter((t) => !matched.includes(t))

          for (const s of skipped) {
            push(
              'branch',
              `Skipped · ${nodeTitle(s.node.data)}`,
              `${formatWhenCardLine(s.node.data)} did not match this scenario.`,
              s.node.id
            )
          }

          if (matched.length === 0) {
            push(
              'warn',
              'No matching When',
              'None of the When cards match this scenario. Path ends here. Flip a scenario toggle and Run again.',
              current.id
            )
            break
          }

          if (matched.length > 1) {
            push(
              'warn',
              'Multiple When cards matched',
              `Following “${nodeTitle(matched[0].node.data)}” first.`,
              matched[0].node.id
            )
          }

          next = matched[0].node
        } else if (otherTargets.length === 1) {
          next = otherTargets[0].node
        } else if (otherTargets.length > 1) {
          push(
            'info',
            'Multiple next steps',
            `Following “${nodeTitle(otherTargets[0].node.data)}” (${otherTargets.length} options).`,
            otherTargets[0].node.id
          )
          next = otherTargets[0].node
        }
      }

      current = next
    }
  }

  push('done', 'Finished', 'Preview only — nothing was emailed or saved.')
  return log
}
