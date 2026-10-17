'use client'

/**
 * Visual workflow builder powered by @xyflow/react.
 *
 * Renders the same `{nodes, edges}` shape that the JSON editor + run engine
 * already understand. Two-way sync is intentional: changes here mutate the
 * `onChange` callback with the canonical workflow shape, and changes from
 * the JSON editor (via the `value` prop) rehydrate the canvas.
 *
 * Node payload: `WorkflowNode.config` is edited via the right-side
 * inspector panel. Edges are simple (no labels, no conditions yet — those
 * are on the engine roadmap).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type Connection,
  type OnNodesChange,
  type OnEdgesChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Trash2, LayoutGrid } from 'lucide-react'
import { useTheme } from 'next-themes'

export interface WorkflowDsl {
  nodes: Array<{
    id: string
    type: string
    label?: string
    config?: Record<string, unknown>
  }>
  edges: Array<{ from: string; to: string }>
}

interface Props {
  value: WorkflowDsl
  onChange: (next: WorkflowDsl) => void
}

const NODE_TYPES = [
  'trigger.manual',
  'http.request',
  'ai.complete',
  'mongo.find',
  'log',
  'delay',
] as const

// Category accents for node borders; edges use the brand blue.
const EDGE_COLOR = '#2f5be7'
const NODE_COLOR: Record<string, string> = {
  'trigger.manual': '#2f5be7',
  'http.request': '#0ea5e9',
  'ai.complete': '#a855f7',
  'mongo.find': '#f59e0b',
  log: '#94a3b8',
  delay: '#64748b',
}

/**
 * Layout constants — kept in module scope so `addNode` + the auto-arrange
 * routine produce identical, deterministic positions.
 */
const GRID_X = 240
const GRID_Y = 130
const ORIGIN_X = 60
const ORIGIN_Y = 60
const COLS = 4

function gridPos(index: number): { x: number; y: number } {
  return {
    x: ORIGIN_X + (index % COLS) * GRID_X,
    y: ORIGIN_Y + Math.floor(index / COLS) * GRID_Y,
  }
}

function dslToFlow(dsl: WorkflowDsl): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = dsl.nodes.map((n, i) => ({
    id: n.id,
    position: gridPos(i),
    data: {
      label: `${n.label || n.type}\n${n.type}`,
      __node: n,
    },
    style: {
      background: 'hsl(var(--card))',
      color: 'hsl(var(--card-foreground))',
      border: `2px solid ${NODE_COLOR[n.type] || '#64748b'}`,
      borderRadius: 10,
      padding: 8,
      fontSize: 11,
      minWidth: 160,
      whiteSpace: 'pre-line',
    },
  }))
  const edges: Edge[] = dsl.edges.map((e, i) => ({
    id: `e-${i}-${e.from}-${e.to}`,
    source: e.from,
    target: e.to,
    animated: true,
    style: { stroke: EDGE_COLOR },
  }))
  return { nodes, edges }
}

/**
 * Topological-style layered layout. Nodes are placed in columns based on
 * their longest-path depth from any source (no-incoming-edges) node, then
 * within each column they are stacked vertically. This produces a stable,
 * readable graph for the typical "trigger → step → step" workflow shape.
 */
function autoArrangePositions(
  dsl: WorkflowDsl,
): Record<string, { x: number; y: number }> {
  const incomingCount = new Map<string, number>()
  const outgoing = new Map<string, string[]>()
  for (const n of dsl.nodes) {
    incomingCount.set(n.id, 0)
    outgoing.set(n.id, [])
  }
  for (const e of dsl.edges) {
    incomingCount.set(e.to, (incomingCount.get(e.to) || 0) + 1)
    outgoing.get(e.from)?.push(e.to)
  }

  const depth = new Map<string, number>()
  // BFS from each source so we get the *longest* path depth.
  const sources = dsl.nodes.filter((n) => (incomingCount.get(n.id) || 0) === 0)
  for (const s of sources) depth.set(s.id, 0)
  let changed = true
  let iterations = 0
  while (changed && iterations < dsl.nodes.length + 1) {
    changed = false
    iterations += 1
    for (const e of dsl.edges) {
      const d = (depth.get(e.from) ?? 0) + 1
      if (d > (depth.get(e.to) ?? -1)) {
        depth.set(e.to, d)
        changed = true
      }
    }
  }
  // Any node still undepth-ed (cycle / orphan) → push to the end.
  let maxDepth = 0
  for (const d of depth.values()) maxDepth = Math.max(maxDepth, d)
  for (const n of dsl.nodes) {
    if (!depth.has(n.id)) depth.set(n.id, maxDepth + 1)
  }

  // Group by column.
  const cols = new Map<number, string[]>()
  for (const n of dsl.nodes) {
    const d = depth.get(n.id) || 0
    if (!cols.has(d)) cols.set(d, [])
    cols.get(d)!.push(n.id)
  }

  const positions: Record<string, { x: number; y: number }> = {}
  const sortedDepths = [...cols.keys()].sort((a, b) => a - b)
  for (const d of sortedDepths) {
    const col = cols.get(d)!
    col.forEach((id, row) => {
      positions[id] = {
        x: ORIGIN_X + d * GRID_X,
        y: ORIGIN_Y + row * GRID_Y,
      }
    })
  }
  return positions
}

function flowToDsl(
  nodes: Node[],
  edges: Edge[],
  prev: WorkflowDsl,
): WorkflowDsl {
  const dslNodes = nodes.map((n) => {
    const base =
      (n.data as { __node?: WorkflowDsl['nodes'][number] } | undefined)?.__node
    return (
      base ?? {
        id: n.id,
        type: 'log',
        label: String((n.data as { label?: string } | undefined)?.label || n.id),
      }
    )
  })
  const dslEdges = edges.map((e) => ({ from: e.source, to: e.target }))
  return { ...prev, nodes: dslNodes, edges: dslEdges }
}

export default function WorkflowBuilder({ value, onChange }: Props) {
  return (
    <ReactFlowProvider>
      <BuilderInner value={value} onChange={onChange} />
    </ReactFlowProvider>
  )
}

function BuilderInner({ value, onChange }: Props) {
  const { resolvedTheme } = useTheme()
  const initial = useMemo(() => dslToFlow(value), [value])
  const [nodes, setNodes] = useState<Node[]>(initial.nodes)
  const [edges, setEdges] = useState<Edge[]>(initial.edges)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Rehydrate when value changes from outside (e.g. JSON editor save).
  useEffect(() => {
    const next = dslToFlow(value)
    setNodes(next.nodes)
    setEdges(next.edges)
  }, [value])

  const emit = useCallback(
    (ns: Node[], es: Edge[]) => {
      onChange(flowToDsl(ns, es, value))
    },
    [onChange, value],
  )

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      setNodes((prev) => {
        const next = applyNodeChanges(changes, prev)
        emit(next, edges)
        return next
      })
    },
    [edges, emit],
  )

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      setEdges((prev) => {
        const next = applyEdgeChanges(changes, prev)
        emit(nodes, next)
        return next
      })
    },
    [nodes, emit],
  )

  const onConnect = useCallback(
    (conn: Connection) => {
      setEdges((prev) => {
        const next = addEdge({ ...conn, animated: true, style: { stroke: EDGE_COLOR } }, prev)
        emit(nodes, next)
        return next
      })
    },
    [emit, nodes],
  )

  function addNode(type: string) {
    const id = `n_${Math.random().toString(36).slice(2, 8)}`
    const node = {
      id,
      type,
      label: type,
      config: defaultConfigFor(type),
    }
    // Deterministic placement: next free cell after the last existing node.
    const pos = gridPos(nodes.length)
    const flowNode: Node = {
      id,
      position: pos,
      data: { label: `${type}\n${type}`, __node: node },
      style: {
        background: 'hsl(var(--card))',
        color: 'hsl(var(--card-foreground))',
        border: `2px solid ${NODE_COLOR[type] || '#64748b'}`,
        borderRadius: 10,
        padding: 8,
        fontSize: 11,
        minWidth: 160,
        whiteSpace: 'pre-line',
      },
    }
    setNodes((prev) => {
      const next = [...prev, flowNode]
      emit(next, edges)
      return next
    })
  }

  function autoArrange() {
    const dsl = flowToDsl(nodes, edges, value)
    const positions = autoArrangePositions(dsl)
    setNodes((prev) => {
      const next = prev.map((n) => ({
        ...n,
        position: positions[n.id] || n.position,
      }))
      emit(next, edges)
      return next
    })
  }

  function removeSelected() {
    if (!selectedId) return
    setNodes((prev) => {
      const next = prev.filter((n) => n.id !== selectedId)
      setEdges((eprev) => {
        const enext = eprev.filter(
          (e) => e.source !== selectedId && e.target !== selectedId,
        )
        emit(next, enext)
        return enext
      })
      return next
    })
    setSelectedId(null)
  }

  const selected = nodes.find((n) => n.id === selectedId)
  const selectedDsl = (selected?.data as { __node?: WorkflowDsl['nodes'][number] } | undefined)
    ?.__node

  function patchSelected(patch: Partial<WorkflowDsl['nodes'][number]>) {
    if (!selectedId) return
    setNodes((prev) => {
      const next = prev.map((n) => {
        if (n.id !== selectedId) return n
        const cur = (n.data as { __node: WorkflowDsl['nodes'][number] }).__node
        const merged = { ...cur, ...patch, config: { ...(cur.config || {}), ...(patch.config || {}) } }
        return {
          ...n,
          data: {
            ...n.data,
            __node: merged,
            label: `${merged.label || merged.type}\n${merged.type}`,
          },
        }
      })
      emit(next, edges)
      return next
    })
  }

  return (
    <div className="grid gap-3 md:h-[520px] md:grid-cols-[1fr_280px]" data-testid="workflow-builder">
      <div className="relative h-[420px] overflow-hidden rounded-2xl border border-border/70 bg-card md:h-auto">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, n) => setSelectedId(n.id)}
          onPaneClick={() => setSelectedId(null)}
          fitView
          colorMode={resolvedTheme === 'light' ? 'light' : 'dark'}
        >
          <Background gap={16} size={1} />
          <Controls />
          <MiniMap pannable zoomable className="!bg-card" />
        </ReactFlow>
        <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-1">
          {NODE_TYPES.map((t) => (
            <Button
              key={t}
              size="sm"
              variant="secondary"
              onClick={() => addNode(t)}
              className="h-7 px-2 font-mono text-[11px]"
              data-testid={`add-node-${t}`}
            >
              <Plus className="mr-0.5 h-3 w-3" /> {t}
            </Button>
          ))}
          <Button
            size="sm"
            variant="default"
            onClick={autoArrange}
            className="h-7 px-2 text-[11px]"
            data-testid="builder-auto-arrange"
          >
            <LayoutGrid className="mr-0.5 h-3 w-3" /> Auto arrange
          </Button>
        </div>
      </div>

      <aside className="overflow-y-auto rounded-2xl border border-border/70 bg-card p-3">
        {!selectedDsl ? (
          <p className="text-xs text-muted-foreground">
            Select a step to edit it, or click <strong className="font-mono text-foreground">+ trigger.manual</strong> to begin.
            Drag from a node’s right edge onto another node to wire them.
          </p>
        ) : (
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-foreground">
                Step
              </p>
              <Button
                onClick={removeSelected}
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-destructive"
                data-testid="builder-delete-node"
                title="Delete"
                aria-label="Delete step"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Type</p>
              <p className="font-mono">{selectedDsl.type}</p>
            </div>
            <div>
              <label htmlFor="builder-node-label" className="text-xs font-medium text-muted-foreground">Label</label>
              <Input
                id="builder-node-label"
                value={selectedDsl.label || ''}
                onChange={(e) => patchSelected({ label: e.target.value })}
                className="h-7 text-xs"
                data-testid="builder-node-label"
              />
            </div>
            <div>
              <label htmlFor="builder-node-config" className="text-xs font-medium text-muted-foreground">Config (JSON)</label>
              <Textarea
                id="builder-node-config"
                rows={8}
                value={JSON.stringify(selectedDsl.config || {}, null, 2)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value)
                    patchSelected({ config: parsed })
                  } catch {
                    /* ignore until valid */
                  }
                }}
                className="font-mono text-[11px]"
                data-testid="builder-node-config"
              />
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}

function defaultConfigFor(type: string): Record<string, unknown> {
  switch (type) {
    case 'http.request':
      return { url: 'https://httpbin.org/get', method: 'GET' }
    case 'ai.complete':
      return { system: 'You are a helpful assistant.', prompt: 'Say hi.' }
    case 'mongo.find':
      return { collection: 'problems', filter: { is_published: true }, limit: 5 }
    case 'log':
      return { message: 'Hello from CodeSpectra!' }
    case 'delay':
      return { ms: 500 }
    case 'trigger.manual':
      return {}
    default:
      return {}
  }
}
