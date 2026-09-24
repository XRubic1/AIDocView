import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { SavedBlueprint } from '../../types/blueprintGraph'
import type { BlueprintRunRow } from '../../components/blueprints/blueprintRuns'
import {
  savedBlueprintToRow,
  blueprintRowToSaved,
  blueprintRunToRow,
  blueprintRunRowToApp,
} from '../../services/supabase/blueprintPersist'

describe('blueprintPersist mappers', () => {
  it('round-trips SavedBlueprint', () => {
    const bp: SavedBlueprint = {
      id: 'bp-1',
      name: 'Test',
      priority: 10,
      updatedAt: '2026-09-24T12:00:00.000Z',
      nodes: [
        {
          id: 'n1',
          type: 'blueprint',
          position: { x: 0, y: 0 },
          data: { kind: 'trigger', label: 'Start' },
        },
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'n1' }],
    }
    const row = savedBlueprintToRow(bp)
    expect(row.id).toBe('bp-1')
    expect(row.priority).toBe(10)
    expect(row.updated_at).toBe(bp.updatedAt)
    const back = blueprintRowToSaved(row)
    expect(back.id).toBe(bp.id)
    expect(back.name).toBe(bp.name)
    expect(back.nodes).toHaveLength(1)
    expect(back.edges).toHaveLength(1)
  })

  it('round-trips BlueprintRunRow', () => {
    const run: BlueprintRunRow = {
      id: 'run-1',
      subject: 'invoice',
      subjectId: 'inv-1',
      subjectLabel: 'INV-1',
      clientLabel: 'Carrier',
      blueprintId: 'bp-1',
      blueprintName: 'Chase',
      status: 'waiting',
      currentStep: 'Wait',
      currentNodeId: 'n-wait',
      waitUntil: '2026-09-25T07:00:00.000Z',
      startedAt: '2026-09-24T12:00:00.000Z',
      updatedAt: '2026-09-24T12:00:00.000Z',
    }
    const row = blueprintRunToRow(run)
    expect(row.subject_id).toBe('inv-1')
    expect(row.wait_until).toBe(run.waitUntil)
    const back = blueprintRunRowToApp(row)
    expect(back.subjectId).toBe('inv-1')
    expect(back.status).toBe('waiting')
    expect(back.currentNodeId).toBe('n-wait')
  })
})

describe('persistBlueprint no-op without Supabase', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns without throwing when Supabase is not configured', async () => {
    vi.doMock('../../lib/supabase', () => ({
      isSupabaseConfigured: () => false,
      getSupabase: () => null,
    }))
    const { persistBlueprint: persist } = await import(
      '../../services/supabase/blueprintPersist'
    )
    await expect(
      persist({
        id: 'bp-x',
        name: 'X',
        updatedAt: new Date().toISOString(),
        nodes: [],
        edges: [],
      })
    ).resolves.toBeUndefined()
  })
})
