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
  /** Short “what” headline */
  title: string
  /** Extra detail under the headline */
  detail: string
  /** When this step would fire on the timeline */
  whenLabel: string
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

type SimClock = { minutes: number }

function formatDurationParts(totalMinutes: number): string {
  if (totalMinutes <= 0) return 'Right away'
  const days = Math.floor(totalMinutes / (24 * 60))
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60)
  const mins = totalMinutes % 60
  const parts: string[] = []
  if (days > 0) parts.push(`${days} day${days === 1 ? '' : 's'}`)
  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`)
  if (mins > 0 && days === 0) parts.push(`${mins} min`)
  return `After ${parts.join(', ')}`
}

function waitDeltaMinutes(data: BlueprintNodeData): number | null {
  const wait = lookupWaitUntilById(data.waitUntilId)
  const id = wait?.id ?? data.waitUntilId
  if (id !== 'pause_days') return null
  const n = Math.max(0, Number(data.days) || 0)
  const unit = data.waitUnit || 'days'
  if (unit === 'minutes') return n
  if (unit === 'hours') return n * 60
  return n * 24 * 60
}

function waitUntilPlain(data: BlueprintNodeData): string {
  const wait = lookupWaitUntilById(data.waitUntilId)
  if (!wait) return data.fieldKey || 'wait condition not set'
  return formatCatalogCardLine(wait, data.days, data.waitUnit)
}

/**
 * Walk the graph from Start, using When assumptions to pick branches.
 * Pure simulation — no side effects. Each step gets a When + What.
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
    whenLabel: string,
    nodeId?: string
  ) => {
    step += 1
    log.push({ step, level, title, detail, whenLabel, nodeId })
  }

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const starts = nodes.filter((n) => n.data.kind === 'trigger')

  if (nodes.length === 0) {
    push(
      'warn',
      'Empty blueprint',
      'Add a Start card and connect steps, then Simulate again.',
      '—'
    )
    return log
  }

  if (starts.length === 0) {
    push(
      'warn',
      'No Start card',
      'Add a Start with (All invoices / All brokers) to begin.',
      '—'
    )
    return log
  }

  for (const start of starts) {
    if (starts.length > 1) {
      push(
        'info',
        `Path from “${nodeTitle(start.data)}”`,
        'This blueprint has more than one Start — simulating each path.',
        'Right away'
      )
    }

    let current: BlueprintFlowNode | null = start
    const visited = new Set<string>()
    let guard = 0
    let clock: SimClock = { minutes: 0 }

    while (current && guard < 80) {
      guard += 1
      if (visited.has(current.id)) {
        push(
          'warn',
          'Loop detected',
          `Stopped at “${nodeTitle(current.data)}” so it doesn’t repeat forever.`,
          formatDurationParts(clock.minutes),
          current.id
        )
        break
      }
      visited.add(current.id)

      const whenNow = formatDurationParts(clock.minutes)
      let whenMatched: boolean | null = null

      if (current.data.kind === 'trigger') {
        const line = formatTriggerCardLine(current.data)
        const entry = current.data.triggerEntry === 'event' ? 'event' : 'filter'
        push(
          'info',
          'Starts here',
          entry === 'event'
            ? `Would enroll when this event fires: ${line}.`
            : `Would enroll records that match: ${line}.`,
          'Right away',
          current.id
        )
      } else if (current.data.kind === 'wait') {
        const until = waitUntilPlain(current.data)
        const delta = waitDeltaMinutes(current.data)
        if (delta !== null) {
          push(
            'wait',
            'Pause the clock',
            `Would wait ${until.replace(/^Wait\s+/i, '')}, then continue.`,
            whenNow,
            current.id
          )
          clock = { minutes: clock.minutes + delta }
        } else {
          push(
            'wait',
            'Wait for a condition',
            `Would stay here until: ${until}. Next steps run only after that is true.`,
            whenNow,
            current.id
          )
        }
      } else if (isWhen(current.data)) {
        const checkId = current.data.checkId ?? ''
        const raw = checkId ? assumptions[checkId] === true : false
        whenMatched = whenNodePasses(current.data, raw)
        const eventLabel =
          lookupEventById(checkId)?.label ?? formatWhenCardLine(current.data)
        push(
          'branch',
          whenMatched ? 'When matches — continue' : 'When does not match — stop',
          whenMatched
            ? `Pretending “${eventLabel}” is YES. Path continues on the Yes branch.`
            : `Pretending “${eventLabel}” is NO. Path ends here (flip Yes/No above to try the other branch).`,
          whenNow,
          current.id
        )
      } else if (isBranchTrue(current.data) || isBranchFalse(current.data)) {
        push(
          'branch',
          isBranchTrue(current.data) ? 'Take Yes path' : 'Take No path',
          isBranchTrue(current.data)
            ? 'Following the Yes / True branch from the When above.'
            : 'Following the No / False branch from the When above.',
          whenNow,
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
              `Would skip: ${action?.defaultTitle ?? id}`,
              `Not set up yet — ${taskSetupHint(id)}. Open the task and finish setup.`,
              whenNow,
              current!.id
            )
            return
          }
          const bits: string[] = []
          if (cfg.templateId?.trim()) {
            const tpl = getDefaultEmailTemplate(cfg.templateId)
            bits.push(`template “${tpl?.name ?? cfg.templateId}”`)
          }
          if (cfg.message?.trim()) bits.push(`note: “${cfg.message.trim()}”`)
          if (cfg.channel) bits.push(channelLabel(cfg.channel))
          const from = cfg.fromEmails?.[0]
          if (from) {
            const cc = (cfg.fromEmails ?? []).slice(1)
            bits.push(
              cc.length > 0
                ? `from ${from} (CC ${cc.join(', ')})`
                : `from ${from}`
            )
          }
          push(
            'action',
            `Would: ${action?.defaultTitle ?? id}`,
            bits.length > 0
              ? bits.join(' · ')
              : action?.cardLine ?? 'This task would run.',
            whenNow,
            current!.id
          )
        }
        if (ids.length === 0) {
          push(
            'warn',
            'Empty Then-do card',
            'No tasks on this card yet — add one in the side panel.',
            whenNow,
            current.id
          )
        } else if (ids.length === 1) {
          logOne(ids[0])
        } else {
          push(
            'info',
            `Then-do · ${ids.length} tasks`,
            'These would run in order on this card:',
            whenNow,
            current.id
          )
          for (const id of ids) logOne(id)
        }
      } else if (current.data.kind === 'stop') {
        push(
          'done',
          'Path ends',
          'Done — nothing more runs on this branch.',
          whenNow,
          current.id
        )
        break
      } else {
        push('info', nodeTitle(current.data), '', whenNow, current.id)
      }

      if (current.data.kind === 'stop') break

      const outgoing = edges.filter((e) => e.source === current!.id)
      if (outgoing.length === 0) {
        push(
          'warn',
          'Dead end',
          `“${nodeTitle(current.data)}” has no next step. Connect another card or add Done.`,
          formatDurationParts(clock.minutes),
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
                ? 'Yes path is not connected — link When → Then do.'
                : 'No path is not connected — link the False branch or flip Match when.',
              formatDurationParts(clock.minutes),
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
              formatDurationParts(clock.minutes),
              current.id
            )
            break
          }
        } else {
          push(
            'warn',
            'When did not match',
            'Flip a Yes/No toggle above (or the Match when switch) and Simulate again.',
            formatDurationParts(clock.minutes),
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
            const id = s.node.data.checkId ?? ''
            const eventLabel =
              lookupEventById(id)?.label ?? formatWhenCardLine(s.node.data)
            push(
              'branch',
              `Skip: ${eventLabel}`,
              'This When is NO in the scenario — not taken.',
              formatDurationParts(clock.minutes),
              s.node.id
            )
          }

          if (matched.length === 0) {
            push(
              'warn',
              'No matching When',
              'None of the When cards match. Flip a Yes/No toggle and Simulate again.',
              formatDurationParts(clock.minutes),
              current.id
            )
            break
          }

          if (matched.length > 1) {
            push(
              'info',
              'Several Whens match',
              `Following “${nodeTitle(matched[0].node.data)}” first.`,
              formatDurationParts(clock.minutes),
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
            formatDurationParts(clock.minutes),
            otherTargets[0].node.id
          )
          next = otherTargets[0].node
        }
      }

      current = next
    }
  }

  push(
    'done',
    'End of preview',
    'Nothing was emailed or saved — this was a simulation only.',
    '—'
  )
  return log
}
