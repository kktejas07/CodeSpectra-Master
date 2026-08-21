'use client'

import React from 'react'
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'

interface TreeNode {
  id: string
  value: number
  x: number
  y: number
  parent?: string
}

interface TreeBuildSceneProps {
  nodes: TreeNode[]
  title: string
  highlightPath?: string[]
}

export const TreeBuildScene: React.FC<TreeBuildSceneProps> = ({ nodes, title, highlightPath = [] }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

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
    const pathIndex = highlightPath.indexOf(nodeId)
    if (pathIndex === -1) return { active: false, glow: 0 }
    const delay = 80 + pathIndex * 20
    const active = frame >= delay
    const glow = active ? spring({ frame: frame - delay, fps, config: { damping: 8 } }) : 0
    return { active, glow }
  }

  // Build edges from parent references
  const edges = nodes
    .filter(n => n.parent)
    .map(n => {
      const parent = nodes.find(p => p.id === n.parent)
      if (!parent) return null
      return { from: parent, to: n }
    })
    .filter(Boolean)

  // Current node in path being highlighted
  const currentPathIndex = Math.floor((frame - 80) / 20)
  const currentNodeId = currentPathIndex >= 0 && currentPathIndex < highlightPath.length
    ? highlightPath[currentPathIndex]
    : null

  // Explanation text
  const explanation = currentNodeId
    ? (() => {
        const node = nodes.find(n => n.id === currentNodeId)
        if (!node) return ''
        if (currentPathIndex === 0) return `Starting at root: ${node.value}`
        if (node.value < (nodes.find(n => n.id === highlightPath[currentPathIndex - 1])?.value || 0)) {
          return `${node.value} < parent — go left`
        }
        return `${node.value} > parent — go right`
      })()
    : frame >= 80 && highlightPath.length > 0
      ? `Tracing path: ${highlightPath.map(id => nodes.find(n => n.id === id)?.value).join(' → ')}`
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
              stroke={highlightPath.includes(edge.to.id) ? '#3b82f6' : '#475569'}
              strokeWidth={highlightPath.includes(edge.to.id) ? 4 : 3}
              strokeDasharray={highlightPath.includes(edge.to.id) ? '0' : '8 4'}
            />
          )
        })}

        {/* Nodes */}
        {nodes.map((node, index) => {
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
