import { useCallback, useMemo, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  MarkerType,
  useEdgesState,
  useNodesState,
  Handle,
  Position,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { listSavedBlueprints } from './blueprintStore'
import {
  getBlueprintHandoffMap,
  handoffLinkWouldCycle,
  type BlueprintHandoffLink,
} from './blueprintHandoffMap'
import { saveBlueprintHandoffMap } from '../../services/platformSettingsService'
import type { SavedBlueprint } from '../../types/blueprintGraph'

interface HandoffNodeData extends Record<string, unknown> {
  name: string
  priority: number
}

type HandoffRfNode = Node<HandoffNodeData, 'handoff'>

function HandoffNode({ data }: NodeProps<HandoffRfNode>) {
  return (
    <div className="bp-handoff-node">
      <Handle type="target" position={Position.Left} />
      <p className="bp-handoff-node__name">{data.name}</p>
      <p className="bp-handoff-node__meta">
        {data.priority > 0 ? `Priority ${data.priority}` : 'When this finishes, follow the line'}
      </p>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

const nodeTypes = { handoff: HandoffNode }

function layoutFor(blueprints: SavedBlueprint[]): HandoffRfNode[] {
  const map = getBlueprintHandoffMap()
  return blueprints.map((bp, index) => {
    const saved = map.positions[bp.id]
    const col = index % 3
    const row = Math.floor(index / 3)
    return {
      id: bp.id,
      type: 'handoff',
      position: saved ?? { x: 40 + col * 280, y: 40 + row * 140 },
      data: { name: bp.name, priority: Number(bp.priority) || 0 },
    }
  })
}

function edgesFor(links: BlueprintHandoffLink[], ids: Set<string>): Edge[] {
  return links
    .filter((link) => ids.has(link.fromId) && ids.has(link.toId))
    .map((link) => ({
      id: `${link.fromId}->${link.toId}`,
      source: link.fromId,
      target: link.toId,
      label: 'when done',
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      style: { stroke: '#1684FE', strokeWidth: 2 },
    }))
}

function BlueprintHandoffGridInner() {
  const blueprints = useMemo(() => listSavedBlueprints(), [])
  const ids = useMemo(() => new Set(blueprints.map((bp) => bp.id)), [blueprints])
  const [nodes, , onNodesChange] = useNodesState(layoutFor(blueprints))
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    edgesFor(getBlueprintHandoffMap().links, ids)
  )
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const persist = useCallback(
    async (links: BlueprintHandoffLink[], positions: BlueprintHandoffMapPositions) => {
      setSaving(true)
      try {
        await saveBlueprintHandoffMap({ links, positions })
        setNotice(null)
      } catch (err) {
        setNotice(err instanceof Error ? err.message : 'Could not save the grid.')
      } finally {
        setSaving(false)
      }
    },
    []
  )

  const positionsFrom = useCallback(
    (list: HandoffRfNode[]) => {
      const positions: Record<string, { x: number; y: number }> = {}
      for (const node of list) positions[node.id] = { x: node.position.x, y: node.position.y }
      return positions
    },
    []
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      const fromId = connection.source
      const toId = connection.target
      if (!fromId || !toId) return
      const currentLinks = getBlueprintHandoffMap().links
      if (handoffLinkWouldCycle(currentLinks, fromId, toId)) {
        setNotice('That line would loop back to the same blueprint.')
        return
      }
      const links = [
        ...currentLinks.filter(
          (link) => link.fromId !== fromId && ids.has(link.fromId) && ids.has(link.toId)
        ),
        { fromId, toId },
      ]
      setEdges(edgesFor(links, ids))
      setNotice(null)
      void persist(links, positionsFrom(nodes))
    },
    [ids, nodes, persist, positionsFrom, setEdges]
  )

  const onEdgesDelete = useCallback(
    (removed: Edge[]) => {
      const drop = new Set(removed.map((edge) => edge.id))
      const links = getBlueprintHandoffMap().links.filter(
        (link) => !drop.has(`${link.fromId}->${link.toId}`)
      )
      setEdges(edgesFor(links, ids))
      void persist(links, positionsFrom(nodes))
    },
    [ids, nodes, persist, positionsFrom, setEdges]
  )

  const onNodeDragStop = useCallback(
    (_event: unknown, node: HandoffRfNode) => {
      const links = getBlueprintHandoffMap().links.filter(
        (link) => ids.has(link.fromId) && ids.has(link.toId)
      )
      const positions = positionsFrom(nodes)
      positions[node.id] = { x: node.position.x, y: node.position.y }
      void persist(links, positions)
    },
    [ids, nodes, persist, positionsFrom]
  )

  if (blueprints.length === 0) {
    return (
      <div className="bp-handoff__empty">
        <p>Save a blueprint in the editor first, then connect it here.</p>
      </div>
    )
  }

  return (
    <div className="bp-handoff">
      <p className="bp-handoff__hint">
        Draw a line from the blueprint that finishes to the one that should start next. One line
        out of each card. Select a line and press Delete to remove it.
        {saving ? ' Saving…' : ''}
      </p>
      {notice ? <p className="bp-handoff__notice">{notice}</p> : null}
      <div className="bp-handoff__canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgesDelete={onEdgesDelete}
          onNodeDragStop={onNodeDragStop}
          fitView
          proOptions={{ hideAttribution: true }}
          deleteKeyCode={['Backspace', 'Delete']}
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
    </div>
  )
}

type BlueprintHandoffMapPositions = Record<string, { x: number; y: number }>

export default function BlueprintHandoffGrid() {
  return (
    <ReactFlowProvider>
      <BlueprintHandoffGridInner />
    </ReactFlowProvider>
  )
}
