/** Plain-English warnings for blueprint authoring (UI only). */

import type { Edge } from '@xyflow/react'
import type { BlueprintFlowNode } from '../../types/blueprintGraph'
import { getActionIds } from './blueprintSubject'
import { defaultTaskConfig, isTaskReady } from './blueprintActionSetup'
import { canConnectNodes } from './blueprintConnectionRules'

export function collectBlueprintWarnings(
  nodes: BlueprintFlowNode[],
  edges: Edge[],
  revealMissingSetup: boolean
): string[] {
  const warnings: string[] = []

  let incompleteTasks = 0
  let emptyActionCards = 0
  for (const n of nodes) {
    if (n.data.kind !== 'action') continue
    const ids = getActionIds(n.data)
    if (ids.length === 0) {
      emptyActionCards += 1
      continue
    }
    const configs = n.data.actionConfigs ?? {}
    for (const id of ids) {
      if (!isTaskReady(id, configs[id] ?? defaultTaskConfig(id))) incompleteTasks += 1
    }
  }

  if (revealMissingSetup && incompleteTasks > 0) {
    warnings.push(
      incompleteTasks === 1
        ? 'This blueprint will not run as expected — 1 Then-do task is not set up (needs a template or message).'
        : `This blueprint will not run as expected — ${incompleteTasks} Then-do tasks are not set up (need a template or message).`
    )
  } else if (revealMissingSetup && emptyActionCards > 0) {
    warnings.push(
      'This blueprint will not run as expected — a Then-do card has no tasks yet.'
    )
  }

  const start = nodes.find((n) => n.data.kind === 'trigger')
  if (start && start.data.triggerSubject === 'invoices') {
    const statuses = start.data.triggerFilters?.invoices?.statuses ?? []
    const broadStart =
      statuses.length > 1 || (statuses.length === 1 && statuses[0] !== 'hold')
    const outgoing = edges.filter((e) => e.source === start.id)
    const whenHold = outgoing.some((e) => {
      const t = nodes.find((n) => n.id === e.target)
      return (
        !!t &&
        (t.data.kind === 'if' || t.data.kind === 'elseif') &&
        t.data.checkId === 'on_hold'
      )
    })
    if (broadStart && whenHold) {
      warnings.push(
        'Only invoices that go on hold will continue past Start. Pending / approved invoices match the gate but wait at When until they are on hold.'
      )
    }
  }

  let badLinks = 0
  const byId = new Map(nodes.map((n) => [n.id, n]))
  for (const e of edges) {
    const source = byId.get(e.source)
    const target = byId.get(e.target)
    if (!source || !target) continue
    if (!canConnectNodes(source, target, nodes, edges).ok) badLinks += 1
  }
  if (badLinks === 1) {
    warnings.push(
      'One connection is not allowed (wrong card types or subject mismatch). Remove or redraw that link.'
    )
  } else if (badLinks > 1) {
    warnings.push(
      `${badLinks} connections are not allowed (wrong card types or subject mismatch). Remove or redraw those links.`
    )
  }

  return warnings
}
