import React from 'react'
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'

interface TreeNode {
  id: string
  value: number | string
  x: number
  y: number
  parent?: string
}

interface TreeBuildSceneProps {
  nodes?: TreeNode[]
  /** Slide-owned values: the scene builds a BST layout itself (preferred). */
  values?: Array<number | string>
  title: string
  highlightPath?: string[]
  /** Search target; defaults to the last value so the trace always resolves. */
  target?: number | string
}

type Link = { id: string; value: number | string; left: Link | null; right: Link | null; depth: number }

function compareValues(a: number | string, b: number | string): number {
  if (typeof a === 'number' && typeof b === 'number' && Number.isFinite(a) && Number.isFinite(b)) return a - b
  return String(a).localeCompare(String(b))
}

/** BST layout from slide-owned values. x = inorder rank, y scaled to fit, so
 * degenerate (sorted) input draws as a truthful diagonal, never offscreen. */
function layoutFromValues(values: Array<number | string>, target: number | string | undefined): { nodes: TreeNode[]; path: string[] } {
  const vals = (Array.isArray(values) ? values : []).slice(0, 9)
  if (!vals.length) return { nodes: [], path: [] }
  let root: Link | null = null
  const order: Link[] = []
  // NOTE: plain for..of (not forEach) so TS tracks the root assignment below.
  for (const [i, value] of vals.entries()) {
    const node: Link = { id: `n${i}`, value, left: null, right: null, depth: 0 }
    order.push(node)
    if (!root) { root = node; continue }
    let cur: Link = root
    for (;;) {
      if (compareValues(value, cur.value) < 0) {
        if (!cur.left) { cur.left = node; node.depth = cur.depth + 1; break }
        cur = cur.left
      } else {
        if (!cur.right) { cur.right = node; node.depth = cur.depth + 1; break }
        cur = cur.right
      }
    }
  }
  const rank = new Map<Link, number>()
  let xi = 0
  const inorder = (n: Link | null): void => { if (!n) return; inorder(n.left); rank.set(n, xi++); inorder(n.right) }
  inorder(root)
  const count = order.length
  const maxDepth = order.reduce((m, n) => Math.max(m, n.depth), 0)
  const nodes: TreeNode[] = order.map(n => {
    const parent = order.find(c => c.left === n || c.right === n)
    return {
      id: n.id,
      value: n.value,
      x: count > 1 ? 160 + ((rank.get(n) || 0) / (count - 1)) * 1600 : 960,
      y: 120 + (maxDepth > 0 ? (n.depth / maxDepth) * 380 : 0),
      parent: parent ? parent.id : undefined,
    }
  })
  // Search path for the target through the built tree (always connected).
  const goal = target !== undefined ? target : vals[vals.length - 1]
  const path: string[] = []
  let cur: Link | null = root
  while (cur) {
    path.push(cur.id)
    const c = compareValues(goal as number | string, cur.value)
    if (c === 0) break
    cur = c < 0 ? cur.left : cur.right
  }
  return { nodes, path }
}

export const TreeBuildScene: React.FC<TreeBuildSceneProps> = ({ nodes, values, title, highlightPath, target }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  // Prefer slide-owned values; explicit nodes remain supported (backward-compat).
  const fromValues = (values || []).length ? layoutFromValues(values || [], target) : null
  const active = fromValues ? fromValues.nodes : (nodes || [])
  const path = highlightPath || (fromValues ? fromValues.path : [])

  // Title animation
  const titleOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' })

  // Nodes appear one by one
  const nodeAppear = (index: number) => {
    const delay = 15 + index * 12
    return spring({ frame: frame - delay, fps, config: { damping: 10 } })
  }

  // Edges draw after nodes appear
  const edgeAppear = (index: number) => {
    const delay = 30 + index * 12
    return interpolate(frame - delay, [0, 15], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' })
  }

  // Path highlight animation
  const pathHighlight = (nodeId: string) => {
    const pathIndex = path.indexOf(nodeId)
    if (pathIndex === -1) return { active: false, glow: 0 }
    const delay = 80 + pathIndex * 20
    const active = frame >= delay
    const glow = active ? spring({ frame: frame - delay, fps, config: { damping: 8 } }) : 0
    return { active, glow }
  }

  // Build edges from parent references
  const edges = active
    .filter(n => n.parent)
    .map(n => {
      const parent = active.find(p => p.id === n.parent)
      if (!parent) return null
      return { from: parent, to: n }
    })
    .filter(Boolean)

  // Current node in path being highlighted
  const currentPathIndex = Math.floor((frame - 80) / 20)
  const currentNodeId = currentPathIndex >= 0 && currentPathIndex < path.length
    ? path[currentPathIndex]
    : null

  // Explanation text
  const explanation = currentNodeId
    ? (() => {
        const node = active.find(n => n.id === currentNodeId)
        if (!node) return ''
        if (currentPathIndex === 0) return `Starting at root: ${node.value}`
        const parentVal = active.find(n => n.id === path[currentPathIndex - 1])?.value
        if (parentVal === undefined) return `${node.value}`
        return compareValues(node.value, parentVal) < 0
          ? `${node.value} < parent — go left`
          : `${node.value} > parent — go right`
      })()
    : frame >= 80 && path.length > 0
      ? `Tracing path: ${path.map(id => active.find(n => n.id === id)?.value).join(' → ')}`
      : ''

  const explanationOpacity = interpolate(frame, [80, 95], [0, 1], { extrapolateRight: 'clamp' })

  return (
    <div style={{
      width: '100%', height: '100%',
      backgroundColor: '#0f172a',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif',
    }}>
      {/* Title */}
      <div style={{
        position: 'absolute',
        top: 40,
        fontSize: 42, fontWeight: 'bold', color: '#f8fafc',
        opacity: titleOpacity,
        textAlign: 'center',
      }}>
        {title}
      </div>

      {/* Tree SVG */}
      <svg
        width={1920}
        height={700}
        style={{ position: 'absolute', top: 150 }}
      >
        {/* Edges */}
        {edges.map((edge, index) => {
          if (!edge) return null
          const progress = edgeAppear(index)
          const dx = edge.to.x - edge.from.x
          const dy = edge.to.y - edge.from.y
          const length = Math.sqrt(dx * dx + dy * dy)

          return (
            <line
              key={`edge-${index}`}
              x1={edge.from.x}
              y1={edge.from.y + 30}
              x2={edge.from.x + dx * progress}
              y2={edge.from.y + 30 + dy * progress}
              stroke={path.includes(edge.to.id) ? '#3b82f6' : '#475569'}
              strokeWidth={path.includes(edge.to.id) ? 4 : 3}
              strokeDasharray={path.includes(edge.to.id) ? '0' : '8 4'}
            />
          )
        })}

        {/* Nodes */}
        {active.map((node, index) => {
          const appear = nodeAppear(index)
          const path = pathHighlight(node.id)
          const isCurrent = node.id === currentNodeId
          const radius = 35

          return (
            <g key={node.id}>
              {/* Glow effect for highlighted nodes */}
              {path.active && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={radius + 15}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth={3}
                  opacity={path.glow * 0.5}
                />
              )}

              {/* Node circle */}
              <circle
                cx={node.x}
                cy={node.y}
                r={radius * appear}
                fill={isCurrent ? '#3b82f6' : path.active ? '#1e3a5f' : '#1e293b'}
                stroke={isCurrent ? '#60a5fa' : path.active ? '#3b82f6' : '#475569'}
                strokeWidth={isCurrent ? 4 : 3}
              />

              {/* Node value */}
              <text
                x={node.x}
                y={node.y + 6}
                textAnchor="middle"
                fill={isCurrent ? '#ffffff' : '#e2e8f0'}
                fontSize={24}
                fontWeight="bold"
                fontFamily="system-ui, sans-serif"
                opacity={appear}
              >
                {node.value}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Explanation */}
      <div style={{
        position: 'absolute',
        bottom: 80,
        fontSize: 28,
        color: currentNodeId ? '#60a5fa' : '#94a3b8',
        fontWeight: currentNodeId ? 'bold' : 'normal',
        opacity: explanationOpacity,
        textAlign: 'center',
      }}>
        {explanation}
      </div>

      {/* Legend */}
      <div style={{
        position: 'absolute',
        bottom: 30,
        display: 'flex', gap: 30,
        fontSize: 16, color: '#64748b',
      }}>
        <span>● Unvisited</span>
        <span style={{ color: '#3b82f6' }}>● On path</span>
        <span style={{ color: '#60a5fa' }}>● Current</span>
      </div>
    </div>
  )
}
