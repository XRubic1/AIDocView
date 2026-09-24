import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Connection,
  type OnConnect,
  type Node,
  type Edge,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import BlueprintNode from './BlueprintNode'
import BlueprintContextMenu, {
  type BlueprintContextMenuState,
} from './BlueprintContextMenu'
import BlueprintSidePanel from './BlueprintSidePanel'
import {
  BLUEPRINT_NODE_KIND_DEFAULTS,
  type BlueprintFlowNode,
  type BlueprintNodeData,
  type BlueprintNodeKind,
} from '../../types/blueprintGraph'
import { defaultTriggerFilters } from './blueprintTriggerFilters'
import type { SavedBlueprintCard } from './blueprintCardLibrary'
import {
  canConnectNodes,
  canInsertAfterTip,
} from './blueprintConnectionRules'

const nodeTypes = { blueprint: BlueprintNode }

function newNodeId(): string {
  return `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

interface BlueprintCanvasInnerProps {
  initialNodes: BlueprintFlowNode[]
  initialEdges: Edge[]
  graphKey: string
  onGraphChange: (nodes: BlueprintFlowNode[], edges: Edge[]) => void
  pendingInsertCard?: SavedBlueprintCard | null
  onPendingInsertConsumed?: () => void
}

function BlueprintCanvasInner({
  initialNodes,
  initialEdges,
  graphKey,
  onGraphChange,
  pendingInsertCard,
  onPendingInsertConsumed,
}: BlueprintCanvasInnerProps) {
  const { screenToFlowPosition } = useReactFlow()
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [menu, setMenu] = useState<BlueprintContextMenuState | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const onGraphChangeRef = useRef(onGraphChange)
  onGraphChangeRef.current = onGraphChange
  const skipNotifyRef = useRef(true)
  /** Tip of the chain — last card we added or last one the user selected. */
  const chainTipIdRef = useRef<string | null>(null)

  // Reload only when blueprint selection changes (keyed remount also covers this)
  useEffect(() => {
    skipNotifyRef.current = true
    setNodes(initialNodes)
    setEdges(initialEdges)
    setSelectedId(null)
    setMenu(null)
    chainTipIdRef.current = null
    // initialNodes/Edges captured for this graphKey only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphKey, setNodes, setEdges])

  useEffect(() => {
    if (skipNotifyRef.current) {
      skipNotifyRef.current = false
      onGraphChangeRef.current(nodes as BlueprintFlowNode[], edges)
      return
    }
    onGraphChangeRef.current(nodes as BlueprintFlowNode[], edges)
  }, [nodes, edges])

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      const sourceId = connection.source
      const targetId = connection.target
      if (!sourceId || !targetId) return false
      const source = (nodes as BlueprintFlowNode[]).find((n) => n.id === sourceId)
      const target = (nodes as BlueprintFlowNode[]).find((n) => n.id === targetId)
      if (!source || !target) return false
      return canConnectNodes(
        source,
        target,
        nodes as BlueprintFlowNode[],
        edges
      ).ok
    },
    [nodes, edges]
  )

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      const source = (nodes as BlueprintFlowNode[]).find(
        (n) => n.id === connection.source
      )
      const target = (nodes as BlueprintFlowNode[]).find(
        (n) => n.id === connection.target
      )
      if (!source || !target) return
      if (
        !canConnectNodes(source, target, nodes as BlueprintFlowNode[], edges).ok
      ) {
        return
      }
      setEdges((eds) => addEdge({ ...connection, animated: false }, eds))
    },
    [nodes, edges, setEdges]
  )

  const selectedNode =
    (nodes as BlueprintFlowNode[]).find((n) => n.id === selectedId) ?? null

  useEffect(() => {
    if (selectedId) chainTipIdRef.current = selectedId
  }, [selectedId])

  const linkFromTip = useCallback(
    (node: BlueprintFlowNode) => {
      const fromId = selectedId ?? chainTipIdRef.current
      const fromNode = fromId
        ? (nodes as BlueprintFlowNode[]).find((n) => n.id === fromId)
        : null
      const canLink =
        !!fromNode &&
        fromNode.id !== node.id &&
        canInsertAfterTip(
          fromNode,
          node.data,
          nodes as BlueprintFlowNode[],
          edges
        ).ok

      setNodes((nds) => [...nds, node])
      if (canLink && fromId) {
        setEdges((eds) =>
          addEdge(
            {
              id: `e-${fromId}-${node.id}`,
              source: fromId,
              target: node.id,
              animated: false,
            },
            eds
          )
        )
      }
      chainTipIdRef.current = node.id
      setSelectedId(node.id)
    },
    [selectedId, nodes, edges, setNodes, setEdges]
  )

  const addNode = useCallback(
    (kind: BlueprintNodeKind, flowX: number, flowY: number) => {
      const defaults = BLUEPRINT_NODE_KIND_DEFAULTS[kind]
      const data: BlueprintNodeData = {
        kind,
        label: defaults.label,
        triggerSubject: defaults.triggerSubject,
        triggerEntry: defaults.triggerEntry,
        triggerFilters:
          kind === 'trigger' ? defaultTriggerFilters() : undefined,
        waitUntilId: defaults.waitUntilId,
        checkId: defaults.checkId,
        actionId: defaults.actionId,
        actionIds: defaults.actionIds ? [...defaults.actionIds] : undefined,
        fieldKey: defaults.fieldKey,
        fieldValue: defaults.fieldValue,
        days: defaults.days,
        status: defaults.status,
      }
      linkFromTip({
        id: newNodeId(),
        type: 'blueprint',
        position: { x: flowX, y: flowY },
        data,
      })
    },
    [linkFromTip]
  )

  const addSavedCard = useCallback(
    (card: SavedBlueprintCard, flowX: number, flowY: number) => {
      linkFromTip({
        id: newNodeId(),
        type: 'blueprint',
        position: { x: flowX, y: flowY },
        data: {
          ...card.data,
          kind: card.kind,
          libraryCardId: card.id,
          label: card.name || card.data.label,
        },
      })
    },
    [linkFromTip]
  )

  useEffect(() => {
    if (!pendingInsertCard) return
    const tip = selectedId
      ? (nodes as BlueprintFlowNode[]).find((n) => n.id === selectedId)
      : null
    const x = (tip?.position.x ?? 80) + 240
    const y = tip?.position.y ?? 160
    addSavedCard(pendingInsertCard, x, y)
    onPendingInsertConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingInsertCard])

  const duplicateNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => {
        const src = nds.find((n) => n.id === nodeId) as BlueprintFlowNode | undefined
        if (!src) return nds
        const copy: BlueprintFlowNode = {
          ...src,
          id: newNodeId(),
          position: { x: src.position.x + 40, y: src.position.y + 40 },
          selected: true,
          data: { ...src.data },
        }
        setSelectedId(copy.id)
        return [
          ...nds.map((n) => ({ ...n, selected: false })),
          copy,
        ]
      })
    },
    [setNodes]
  )

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId))
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId))
      setSelectedId((id) => (id === nodeId ? null : id))
    },
    [setNodes, setEdges]
  )

  const patchNode = useCallback(
    (nodeId: string, patch: Partial<BlueprintNodeData>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...(n.data as BlueprintNodeData), ...patch } }
            : n
        )
      )
    },
    [setNodes]
  )

  const onPaneContextMenu = useCallback(
    (event: ReactMouseEvent | MouseEvent) => {
      event.preventDefault()
      const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      setMenu({
        kind: 'pane',
        x: event.clientX,
        y: event.clientY,
        flowX: pos.x,
        flowY: pos.y,
      })
    },
    [screenToFlowPosition]
  )

  const onNodeContextMenu = useCallback((event: ReactMouseEvent, node: Node) => {
    event.preventDefault()
    setMenu({
      kind: 'node',
      x: event.clientX,
      y: event.clientY,
      nodeId: node.id,
    })
    setSelectedId(node.id)
  }, [])

  useEffect(() => {
    if (!menu) return
    let remove: (() => void) | undefined
    const t = window.setTimeout(() => {
      const close = () => setMenu(null)
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') close()
      }
      window.addEventListener('click', close)
      window.addEventListener('contextmenu', close)
      window.addEventListener('keydown', onKey)
      remove = () => {
        window.removeEventListener('click', close)
        window.removeEventListener('contextmenu', close)
        window.removeEventListener('keydown', onKey)
      }
    }, 0)
    return () => {
      window.clearTimeout(t)
      remove?.()
    }
  }, [menu])

  return (
    <div className="bp-canvas-row">
      <div className="bp-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          nodeTypes={nodeTypes}
          onPaneContextMenu={onPaneContextMenu}
          onNodeContextMenu={onNodeContextMenu}
          onNodeClick={(_, node) => setSelectedId(node.id)}
          onPaneClick={() => {
            setSelectedId(null)
            setMenu(null)
          }}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          deleteKeyCode={['Backspace', 'Delete']}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
        {menu ? (
          <BlueprintContextMenu
            menu={menu}
            tipKind={selectedNode?.data.kind ?? null}
            onAdd={addNode}
            onDuplicate={duplicateNode}
            onDelete={deleteNode}
            onClose={() => setMenu(null)}
          />
        ) : null}
      </div>
      <BlueprintSidePanel
        node={selectedNode}
        nodes={nodes as BlueprintFlowNode[]}
        edges={edges}
        onChange={patchNode}
        onClose={() => setSelectedId(null)}
      />
    </div>
  )
}

interface BlueprintCanvasProps {
  initialNodes: BlueprintFlowNode[]
  initialEdges: Edge[]
  graphKey: string
  onGraphChange: (nodes: BlueprintFlowNode[], edges: Edge[]) => void
  /** When set, insert this saved card once onto the canvas. */
  pendingInsertCard?: SavedBlueprintCard | null
  onPendingInsertConsumed?: () => void
}

export default function BlueprintCanvas(props: BlueprintCanvasProps) {
  return (
    <ReactFlowProvider>
      <BlueprintCanvasInner {...props} />
    </ReactFlowProvider>
  )
}
