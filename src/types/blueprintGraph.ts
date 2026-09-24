import type { Edge, Node } from '@xyflow/react'
import type { BlueprintSubject } from '../components/blueprints/blueprintCatalog'
import type { BlueprintActionTaskConfig } from '../components/blueprints/blueprintActionSetup'
import type {
  BlueprintTriggerEntry,
  BlueprintTriggerFilters,
} from '../components/blueprints/blueprintTriggerFilters'

/** Visual shell node kinds — not wired to a runtime engine yet. */
export type BlueprintNodeKind =
  | 'trigger'
  | 'if'
  | 'elseif'
  | 'branch_true'
  | 'branch_false'
  | 'action'
  | 'wait'
  | 'stop'

export interface BlueprintNodeData extends Record<string, unknown> {
  kind: BlueprintNodeKind
  label: string
  /** Start-with subject: brokers or invoices. */
  triggerSubject?: BlueprintSubject
  /** How records enter: match filters, or when an event happens. */
  triggerEntry?: BlueprintTriggerEntry
  /** Narrow who can enter (not “every open invoice”). */
  triggerFilters?: BlueprintTriggerFilters
  /** Catalog id for Wait until (clock). */
  waitUntilId?: string
  /**
   * Simple wait duration unit (`pause_days` only). Default days.
   * Hours/minutes wake at now + N (not local 09:00).
   */
  waitUnit?: 'days' | 'hours' | 'minutes'
  /** Catalog id for When (event). */
  checkId?: string
  /**
   * When polarity: `yes` = event is true (default); `no` = opposite
   * (e.g. on_hold + no → removed from hold).
   */
  whenMatch?: 'yes' | 'no'
  /** Catalog action id for Then do (legacy single — prefer actionIds). */
  actionId?: string
  /** Multiple Then-do tasks on one card (checklist). */
  actionIds?: string[]
  /** Per-task message / channel setup keyed by action id. */
  actionConfigs?: Record<string, BlueprintActionTaskConfig>
  /** Plain-English line on the card. */
  fieldKey?: string
  /** Day number for event checks that need days (rare). */
  fieldValue?: string
  /** Day number for Wait until clocks. */
  days?: string
  /** Plain-English outcome line for Then do (legacy / summary). */
  status?: string
  /** Id in the saved-card library when this step was saved. */
  libraryCardId?: string
}

export type BlueprintFlowNode = Node<BlueprintNodeData, 'blueprint'>
export type BlueprintFlowEdge = Edge

export interface SavedBlueprint {
  id: string
  name: string
  updatedAt: string
  nodes: BlueprintFlowNode[]
  edges: BlueprintFlowEdge[]
  /**
   * Higher runs first when several blueprints match the same event.
   * Default 0. Typical: hold / release 10–100, aging chase 0.
   */
  priority?: number
}

/** Effective priority for ordering (missing → 0). */
export function blueprintPriority(bp: Pick<SavedBlueprint, 'priority'>): number {
  const n = Number(bp.priority)
  return Number.isFinite(n) ? n : 0
}

/** Short badges — everyday words, not code. */
export const BLUEPRINT_NODE_KIND_LABELS: Record<BlueprintNodeKind, string> = {
  trigger: 'Start with',
  wait: 'Wait until',
  if: 'When',
  /** @deprecated kept so old saved graphs still open; shown as When */
  elseif: 'When',
  branch_true: 'True',
  branch_false: 'False',
  action: 'Then do',
  stop: 'Done',
}

type BlueprintNodeDefaults = {
  label: string
  triggerSubject?: BlueprintSubject
  triggerEntry?: BlueprintTriggerEntry
  waitUntilId?: string
  checkId?: string
  actionId?: string
  actionIds?: string[]
  fieldKey?: string
  fieldValue?: string
  days?: string
  status?: string
}

export const BLUEPRINT_NODE_KIND_DEFAULTS: Record<BlueprintNodeKind, BlueprintNodeDefaults> = {
  trigger: {
    label: 'Invoices that match',
    triggerSubject: 'invoices',
    triggerEntry: 'filter',
  },
  wait: {
    label: 'Pick when to continue',
    fieldKey: 'Choose a Wait until on the right',
    days: '',
  },
  if: {
    label: 'Pick what happened',
    fieldKey: 'Choose from the list on the right',
    fieldValue: '',
  },
  elseif: {
    label: 'Pick what happened',
    fieldKey: 'Choose from the list on the right',
    fieldValue: '',
  },
  /** @deprecated Prefer When + If true/false switch */
  branch_true: {
    label: 'True',
  },
  /** @deprecated Prefer When + If true/false switch */
  branch_false: {
    label: 'False',
  },
  action: {
    label: 'To-do list',
    status: 'Add tasks on the right',
    actionIds: [],
  },
  stop: { label: 'All done' },
}
