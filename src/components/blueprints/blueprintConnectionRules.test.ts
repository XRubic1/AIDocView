import { describe, expect, it } from 'vitest'
import type { Edge } from '@xyflow/react'
import type { BlueprintFlowNode, BlueprintNodeData } from '../../types/blueprintGraph'
import {
  canConnectKinds,
  canConnectNodes,
  canInsertAfterTip,
  inferSubjectFromCardData,
  reasonAddKindDisabled,
} from './blueprintConnectionRules'

function node(
  id: string,
  data: Partial<BlueprintNodeData> & { kind: BlueprintNodeData['kind'] }
): BlueprintFlowNode {
  return {
    id,
    type: 'blueprint',
    position: { x: 0, y: 0 },
    data: { label: id, ...data },
  }
}

describe('canConnectKinds', () => {
  it('allows Start → Wait', () => {
    expect(canConnectKinds('trigger', 'wait').ok).toBe(true)
  })

  it('rejects Done → Wait', () => {
    const r = canConnectKinds('stop', 'wait')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/Done/i)
  })

  it('rejects Wait → Start', () => {
    const r = canConnectKinds('wait', 'trigger')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/Start with/i)
  })

  it('allows When → True', () => {
    expect(canConnectKinds('if', 'branch_true').ok).toBe(true)
  })

  it('allows Then-do → When', () => {
    expect(canConnectKinds('action', 'if').ok).toBe(true)
  })

  it('rejects Wait → True', () => {
    const r = canConnectKinds('wait', 'branch_true')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/True\/False|When/i)
  })
})

describe('reasonAddKindDisabled', () => {
  it('enables all kinds when no tip', () => {
    expect(reasonAddKindDisabled(null, 'trigger')).toBeNull()
    expect(reasonAddKindDisabled(null, 'wait')).toBeNull()
    expect(reasonAddKindDisabled(null, 'stop')).toBeNull()
  })

  it('disables Start after Wait', () => {
    expect(reasonAddKindDisabled('wait', 'trigger')).toMatch(/Start with/i)
  })

  it('disables everything after Done', () => {
    expect(reasonAddKindDisabled('stop', 'wait')).toMatch(/Done/i)
    expect(reasonAddKindDisabled('stop', 'action')).toMatch(/Done/i)
  })
})

describe('inferSubjectFromCardData', () => {
  it('reads Start triggerSubject', () => {
    expect(
      inferSubjectFromCardData({
        kind: 'trigger',
        label: 'Brokers',
        triggerSubject: 'brokers',
      })
    ).toBe('brokers')
  })

  it('infers invoice When from on_hold', () => {
    expect(
      inferSubjectFromCardData({
        kind: 'if',
        label: 'On hold',
        checkId: 'on_hold',
      })
    ).toBe('invoices')
  })

  it('infers broker When from broker_created', () => {
    expect(
      inferSubjectFromCardData({
        kind: 'if',
        label: 'New',
        checkId: 'broker_created',
      })
    ).toBe('brokers')
  })

  it('infers batches When from batch_processed', () => {
    expect(
      inferSubjectFromCardData({
        kind: 'if',
        label: 'Processed',
        checkId: 'batch_processed',
      })
    ).toBe('batches')
  })

  it('returns null for empty Wait (kind-only)', () => {
    expect(
      inferSubjectFromCardData({
        kind: 'wait',
        label: 'Wait',
      })
    ).toBeNull()
  })
})

describe('canConnectNodes subject', () => {
  const startBroker = node('s', {
    kind: 'trigger',
    label: 'Brokers',
    triggerSubject: 'brokers',
  })
  const whenHold = node('w', {
    kind: 'if',
    label: 'On hold',
    checkId: 'on_hold',
  })
  const whenCreated = node('c', {
    kind: 'if',
    label: 'Created',
    checkId: 'broker_created',
  })
  const emptyWait = node('v', { kind: 'wait', label: 'Wait' })
  const edges: Edge[] = []

  it('rejects broker Start → invoice on_hold When', () => {
    const nodes = [startBroker, whenHold]
    const r = canConnectNodes(startBroker, whenHold, nodes, edges)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/invoices|Brokers/i)
  })

  it('allows broker Start → broker_created When', () => {
    const nodes = [startBroker, whenCreated]
    expect(canConnectNodes(startBroker, whenCreated, nodes, edges).ok).toBe(
      true
    )
  })

  it('allows broker Start → empty Wait (subject unknown)', () => {
    const nodes = [startBroker, emptyWait]
    expect(canConnectNodes(startBroker, emptyWait, nodes, edges).ok).toBe(true)
  })
})

describe('canInsertAfterTip', () => {
  it('blocks library invoice When after broker tip', () => {
    const tip = node('s', {
      kind: 'trigger',
      label: 'Brokers',
      triggerSubject: 'brokers',
    })
    const r = canInsertAfterTip(
      tip,
      { kind: 'if', label: 'Hold', checkId: 'on_hold' },
      [tip],
      []
    )
    expect(r.ok).toBe(false)
  })

  it('allows empty Wait after Start', () => {
    const tip = node('s', {
      kind: 'trigger',
      label: 'Brokers',
      triggerSubject: 'brokers',
    })
    expect(
      canInsertAfterTip(tip, { kind: 'wait', label: 'Wait' }, [tip], []).ok
    ).toBe(true)
  })
})
