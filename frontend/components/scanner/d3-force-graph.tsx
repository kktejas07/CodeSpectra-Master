'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ZoomIn, ZoomOut, Maximize2, RotateCcw, Move3D, Circle, Zap, Target } from 'lucide-react'

export interface D3Component {
  id: string
  name: string
  type: 'service' | 'database' | 'library' | 'module'
  files: number
  linesOfCode: number
  health: 'healthy' | 'warning' | 'critical'
}

export interface D3Dependency {
  from: string
  to: string
  type: 'imports' | 'depends_on' | 'uses'
  strength: 'weak' | 'normal' | 'strong'
}

interface D3ForceGraphProps {
  components?: D3Component[]
  dependencies?: D3Dependency[]
  onSelectComponent?: (id: string | null) => void
  onSelectDependency?: (dep: D3Dependency | null) => void
  selectedId?: string | null
  highlightedIds?: Set<string>
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string
  name: string
  type: D3Component['type']
  health: D3Component['health']
  files: number
  linesOfCode: number
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  source: SimNode | string
  target: SimNode | string
  type: D3Dependency['type']
  strength: D3Dependency['strength']
}

const HEALTH_COLOR: Record<string, string> = {
  healthy: '#22c55e',
  warning: '#f59e0b',
  critical: '#ef4444',
}

const TYPE_ICON: Record<string, string> = {
  service: '⚙',
  database: '◉',
  library: '◎',
  module: '◇',
}

export function D3ForceGraph({
  components = [],
  dependencies = [],
  onSelectComponent,
  onSelectDependency,
  selectedId,
  highlightedIds,
}: D3ForceGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const simRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null)
  const [zoom, setZoom] = useState(100)
  const [legendExpanded, setLegendExpanded] = useState(false)

  const resetView = useCallback(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.transition().duration(500).call(
      d3.zoom<SVGSVGElement, unknown>().transform,
      d3.zoomIdentity
    )
    setZoom(100)
  }, [])

  const zoomIn = useCallback(() => setZoom(z => Math.min(200, z + 20)), [])
  const zoomOut = useCallback(() => setZoom(z => Math.max(30, z - 20)), [])

  useEffect(() => {
    if (!svgRef.current || components.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = svgRef.current.clientWidth || 800
    const height = svgRef.current.clientHeight || 500

    const nodes: SimNode[] = components.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      health: c.health,
      files: c.files,
      linesOfCode: c.linesOfCode,
    }))

    const nodeById = new Map(nodes.map(n => [n.id, n]))

    const links: SimLink[] = dependencies
      .filter(d => nodeById.has(d.from) && nodeById.has(d.to))
      .map(d => ({
        source: d.from,
        target: d.to,
        type: d.type,
        strength: d.strength,
      }))

    const g = svg.append('g').attr('class', 'graph-root')

    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
        setZoom(Math.round(event.transform.k * 100))
      })

    svg.call(zoomBehavior)
      .on('dblclick.zoom', null)

    const defs = svg.append('defs')

    defs.append('marker')
      .attr('id', 'd3-arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 22)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', 'hsl(var(--border))')

    defs.append('marker')
      .attr('id', 'd3-arrow-active')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 22)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', 'hsl(var(--primary))')

    const sim = d3.forceSimulation<SimNode>(nodes)
      .force('link', d3.forceLink<SimNode, SimLink>(links)
        .id(d => d.id)
        .distance(80)
        .strength(d => d.strength === 'strong' ? 0.8 : d.strength === 'weak' ? 0.3 : 0.5))
      .force('charge', d3.forceManyBody().strength(-250))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide(35))
      .alphaDecay(0.02)

    simRef.current = sim

const link = g.append('g').attr('class', 'links')
      .selectAll<SVGLineElement, SimLink>('line')
      .data(links)
      .join('line')
      .attr('stroke', 'hsl(var(--border))')
      .attr('stroke-width', d => d.strength === 'strong' ? 2.5 : d.strength === 'weak' ? 1 : 1.5)
      .attr('stroke-dasharray', d => d.type === 'imports' ? '5,3' : 'none')
      .attr('marker-end', 'url(#d3-arrow)')
      .style('cursor', 'pointer')
      .on('click', (_, d) => {
        const src = typeof d.source === 'object' ? d.source.id : d.source
        const tgt = typeof d.target === 'object' ? d.target.id : d.target
        onSelectDependency?.({ from: src, to: tgt, type: d.type, strength: d.strength })
      })

    const nodeSelection = g.append('g').attr('class', 'nodes')
      .selectAll<SVGGElement, SimNode>('g')
      .data(nodes)
      .join('g')
      .attr('class', 'node')
      .style('cursor', 'pointer')

    nodeSelection.call(d3.drag<SVGGElement, SimNode>()
      .on('start', (event, d) => {
        if (!event.active) sim.alphaTarget(0.3).restart()
        d.fx = d.x
        d.fy = d.y
      })
      .on('drag', (event, d) => {
        d.fx = event.x
        d.fy = event.y
      })
      .on('end', (event, d) => {
        if (!event.active) sim.alphaTarget(0)
        d.fx = null
        d.fy = null
      }))

    nodeSelection.on('click', (_, d) => {
      onSelectComponent?.(selectedId === d.id ? null : d.id)
    })

    nodeSelection.append('circle')
      .attr('r', 22)
      .attr('fill', 'hsl(var(--card))')
      .attr('stroke', d => selectedId === d.id ? 'hsl(var(--primary))' : HEALTH_COLOR[d.health] || 'hsl(var(--border))')
      .attr('stroke-width', d => selectedId === d.id ? 3 : 1.5)

    nodeSelection.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 6)
      .attr('font-size', '14px')
      .text(d => TYPE_ICON[d.type] || '●')

    nodeSelection.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 38)
      .attr('font-size', '11px')
      .attr('fill', 'hsl(var(--foreground))')
      .text(d => d.name.length > 12 ? d.name.slice(0, 10) + '…' : d.name)

    sim.on('tick', () => {
      link
        .attr('x1', d => (d.source as SimNode).x ?? 0)
        .attr('y1', d => (d.source as SimNode).y ?? 0)
        .attr('x2', d => (d.target as SimNode).x ?? 0)
        .attr('y2', d => (d.target as SimNode).y ?? 0)

      nodeSelection.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })

    return () => {
      sim.stop()
    }
  }, [components, dependencies, selectedId, onSelectComponent, onSelectDependency])

  useEffect(() => {
    if (!svgRef.current) return
    const svgEl = d3.select(svgRef.current)
    const selId = selectedId
    const highlightColor = 'hsl(var(--primary))'

    svgEl.selectAll<SVGCircleElement, SimNode>('.node circle')
      .attr('stroke', function() {
        const parent = d3.select(this.parentNode as SVGGElement).datum() as SimNode
        return parent.id === selId ? highlightColor : HEALTH_COLOR[parent.health] || 'hsl(var(--border))'
      })
      .attr('stroke-width', function() {
        const parent = d3.select(this.parentNode as SVGGElement).datum() as SimNode
        return parent.id === selId ? 3 : 1.5
      })

    svgEl.selectAll<SVGLineElement, SimLink>('.links line')
      .attr('stroke', function() {
        const d = d3.select<SVGLineElement, SimLink>(this).datum()
        const src = typeof d.source === 'object' ? (d.source as SimNode).id : d.source
        const tgt = typeof d.target === 'object' ? (d.target as SimNode).id : d.target
        return (selId && (src === selId || tgt === selId)) ? highlightColor : 'hsl(var(--border))'
      })
      .attr('stroke-width', function() {
        const d = d3.select<SVGLineElement, SimLink>(this).datum()
        const src = typeof d.source === 'object' ? (d.source as SimNode).id : d.source
        const tgt = typeof d.target === 'object' ? (d.target as SimNode).id : d.target
        return (selId && (src === selId || tgt === selId)) ? 3 : d.strength === 'strong' ? 2.5 : d.strength === 'weak' ? 1 : 1.5
      })
      .attr('marker-end', function() {
        const d = d3.select<SVGLineElement, SimLink>(this).datum()
        const src = typeof d.source === 'object' ? (d.source as SimNode).id : d.source
        const tgt = typeof d.target === 'object' ? (d.target as SimNode).id : d.target
        return (selId && (src === selId || tgt === selId)) ? 'url(#d3-arrow-active)' : 'url(#d3-arrow)'
      })
  }, [selectedId])

  if (components.length === 0) {
    return (
      <Card className="flex items-center justify-center h-[420px] border-dashed">
        <div className="text-center text-muted-foreground">
          <Move3D className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No components to visualize. Add components to see the force graph.</p>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Zap className="w-4 h-4 text-primary" />
          <span>Drag nodes • Scroll to zoom • Click to select • Double-click dependency to inspect</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={zoomOut} title="Zoom out" aria-label="Zoom out">
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-xs font-mono text-muted-foreground w-12 text-center">{zoom}%</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={zoomIn} title="Zoom in" aria-label="Zoom in">
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={resetView} title="Reset view" aria-label="Reset view">
            <Maximize2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => simRef.current?.alpha(0.5).restart()} title="Re-shuffle" aria-label="Re-shuffle layout">
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setLegendExpanded(v => !v)}>
            {legendExpanded ? 'Hide' : 'Show'} legend
          </Button>
        </div>
      </div>

      <Card className="relative overflow-hidden backdrop-blur" style={{ height: 420 }}>
        <svg
          ref={svgRef}
          className="w-full h-full"
          style={{ cursor: 'grab' }}
        />
      </Card>

      {legendExpanded && (
        <Card className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <p className="font-semibold mb-2 text-foreground">Node health</p>
              {Object.entries(HEALTH_COLOR).map(([h, c]) => (
                <div key={h} className="flex items-center gap-2 mb-1">
                  <Circle className="w-3 h-3 fill-current" style={{ color: c }} />
                  <span className="capitalize text-muted-foreground">{h}</span>
                </div>
              ))}
            </div>
            <div>
              <p className="font-semibold mb-2 text-foreground">Node types</p>
              {Object.entries(TYPE_ICON).map(([t, icon]) => (
                <div key={t} className="flex items-center gap-2 mb-1">
                  <span>{icon}</span>
                  <span className="capitalize text-muted-foreground">{t}</span>
                </div>
              ))}
            </div>
            <div>
              <p className="font-semibold mb-2 text-foreground">Dependencies</p>
              <div className="space-y-1 text-muted-foreground">
                <div className="flex items-center gap-2"><span style={{ borderTop: '2px dashed hsl(var(--border))', width: 20, display: 'inline-block' }} />imports</div>
                <div className="flex items-center gap-2"><span style={{ borderTop: '2px solid hsl(var(--border))', width: 20, display: 'inline-block' }} />depends_on</div>
                <div className="flex items-center gap-2"><span style={{ borderTop: '2px solid hsl(var(--border))', width: 20, display: 'inline-block' }} />uses</div>
              </div>
            </div>
            <div>
              <p className="font-semibold mb-2 text-foreground">Strength</p>
              <div className="space-y-1 text-muted-foreground">
                <div className="flex items-center gap-2"><span style={{ borderTop: '3px solid hsl(var(--border))', width: 20, display: 'inline-block' }} />strong</div>
                <div className="flex items-center gap-2"><span style={{ borderTop: '2px solid hsl(var(--border))', width: 20, display: 'inline-block' }} />normal</div>
                <div className="flex items-center gap-2"><span style={{ borderTop: '1px solid hsl(var(--border))', width: 20, display: 'inline-block' }} />weak</div>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}