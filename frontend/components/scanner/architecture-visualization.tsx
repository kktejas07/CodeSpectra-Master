'use client'

import { useState, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Edit2, ZoomIn, ZoomOut, Maximize2, Wrench, Database, Library, Package, Circle, Zap, GitBranch } from 'lucide-react'
import { D3ForceGraph } from './d3-force-graph'
import { BlastRadiusAnalysis } from './blast-radius-analysis'
import { computeHealthScoreSummary, HEALTH_GRADE_COLORS, HEALTH_GRADE_LABELS } from '@/lib/health-score'
import type { D3Component, D3Dependency } from './d3-force-graph'

type ViewMode = 'circular' | 'force'

interface Component {
  id: string
  name: string
  type: 'service' | 'database' | 'library' | 'module'
  files: number
  linesOfCode: number
  health: 'healthy' | 'warning' | 'critical'
}

interface Dependency {
  from: string
  to: string
  type: 'imports' | 'depends_on' | 'uses'
  strength: 'weak' | 'normal' | 'strong'
}

interface ArchitectureVisualizationProps {
  components?: Component[]
  dependencies?: Dependency[]
  onAddComponent?: () => void
  onEditComponent?: (id: string) => void
  onDeleteComponent?: (id: string) => void
}

export function ArchitectureVisualization({
  components = [],
  dependencies = [],
  onAddComponent,
  onEditComponent,
  onDeleteComponent,
}: ArchitectureVisualizationProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('circular')
  const [zoom, setZoom] = useState(100)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null)
  const [hoveredComponent, setHoveredComponent] = useState<string | null>(null)
  const [selectedDep, setSelectedDep] = useState<D3Dependency | null>(null)
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set())

  const healthSummary = computeHealthScoreSummary(components)

  const getHealthColor = (health: string) => {
    const colors: Record<string, string> = {
      healthy: 'bg-green-500/20 text-green-500 border-green-500/30',
      warning: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
      critical: 'bg-red-500/20 text-red-500 border-red-500/30',
    }
    return colors[health] || 'bg-gray-500/20 text-gray-500'
  }

  const getComponentIcon = (type: string) => {
    const icons: Record<string, React.ReactNode> = {
      service: <Wrench className="w-4 h-4" />,
      database: <Database className="w-4 h-4" />,
      library: <Library className="w-4 h-4" />,
      module: <Package className="w-4 h-4" />,
    }
    return icons[type] || <Circle className="w-4 h-4" />
  }

  // Pre-calculate circular node layout positions for interactive graph view
  const width = 600
  const height = 400
  const cx = width / 2
  const cy = height / 2
  const radius = Math.min(width, height) * 0.35

  const nodePositions = components.reduce<Record<string, { x: number; y: number }>>((acc, comp, index) => {
    const angle = (2 * Math.PI * index) / (components.length || 1)
    acc[comp.id] = {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    }
    return acc
  }, {})

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
  }

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragStart) return
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    })
  }

  const handleMouseUp = () => {
    setDragStart(null)
  }

  const resetView = () => {
    setZoom(100)
    setPan({ x: 0, y: 0 })
  }

  const getRelatedDependencies = (componentId: string) => {
    return dependencies.filter((dep) => dep.from === componentId || dep.to === componentId)
  }

  const handleForceSelect = useCallback((id: string | null) => {
    setSelectedComponent(id)
  }, [])

  const handleHighlightIds = useCallback((ids: Set<string>) => {
    setHighlightedIds(ids)
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2">Architecture Map</h1>
          <p className="text-foreground/60">Visualize, interact with, and analyze project component relationships.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-muted/50 rounded-md border border-border p-1">
            <Button
              size="sm"
              variant={viewMode === 'circular' ? 'default' : 'ghost'}
              className="h-7 text-xs"
              onClick={() => setViewMode('circular')}
            >
              <Circle className="w-3 h-3 mr-1" /> Circular
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'force' ? 'default' : 'ghost'}
              className="h-7 text-xs"
              onClick={() => setViewMode('force')}
            >
              <GitBranch className="w-3 h-3 mr-1" /> Force
            </Button>
          </div>
          <Button onClick={onAddComponent} className="gap-2 shrink-0">
            <Plus className="w-4 h-4" />
            Add Component
          </Button>
        </div>
      </div>

      {viewMode === 'force' ? (
        <>
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <D3ForceGraph
                components={components as D3Component[]}
                dependencies={dependencies as D3Dependency[]}
                selectedId={selectedComponent}
                highlightedIds={highlightedIds}
                onSelectComponent={handleForceSelect}
                onSelectDependency={setSelectedDep}
              />
              {selectedDep && (
                <Card className="p-4 bg-primary/5 border-primary/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Dependency: <span className="font-mono text-xs">{selectedDep.from}</span>
                        <span className="text-muted-foreground mx-1">→</span>
                        <span className="font-mono text-xs">{selectedDep.to}</span>
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">{selectedDep.type}</Badge>
                        <Badge variant="outline" className="text-xs">{selectedDep.strength}</Badge>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedDep(null)}>Dismiss</Button>
                  </div>
                </Card>
              )}
            </div>
            <div className="space-y-4">
              <BlastRadiusAnalysis
                components={components as D3Component[]}
                dependencies={dependencies as D3Dependency[]}
                selectedId={selectedComponent}
                onHighlightIds={handleHighlightIds}
              />
            </div>
          </div>
        </>
      ) : (
        <>
          {/* SVG Canvas Card — Circular view */}
          <Card className="relative overflow-hidden bg-card/50 backdrop-blur border border-border/80 h-[400px]">
            <div className="absolute top-4 left-4 z-10 flex gap-1 bg-background/80 backdrop-blur rounded-md border border-border p-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(Math.max(50, zoom - 15))}>
                <ZoomOut className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={resetView}>
                <Maximize2 className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(Math.min(200, zoom + 15))}>
                <ZoomIn className="w-4 h-4" />
              </Button>
            </div>
            <div className="absolute top-4 right-4 z-10 bg-background/80 backdrop-blur rounded border border-border px-3 py-1 text-xs font-mono text-muted-foreground">
              Zoom: {zoom}%
            </div>

            <svg
              className="w-full h-full cursor-grab active:cursor-grabbing select-none"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="18" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--muted-foreground))" opacity="0.6" />
                </marker>
                <marker id="arrow-active" viewBox="0 0 10 10" refX="18" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--primary))" />
                </marker>
              </defs>

              <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom / 100})`}>
                {dependencies.map((dep, idx) => {
                  const start = nodePositions[dep.from]
                  const end = nodePositions[dep.to]
                  if (!start || !end) return null
                  const isHighlighted =
                    selectedComponent === dep.from ||
                    selectedComponent === dep.to ||
                    hoveredComponent === dep.from ||
                    hoveredComponent === dep.to ||
                    highlightedIds.has(dep.from) ||
                    highlightedIds.has(dep.to)
                  return (
                    <line
                      key={`line-${idx}`}
                      x1={start.x} y1={start.y} x2={end.x} y2={end.y}
                      stroke={isHighlighted ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
                      strokeWidth={isHighlighted ? 2.5 : 1}
                      strokeDasharray={dep.type === 'imports' ? '5,5' : undefined}
                      markerEnd={isHighlighted ? 'url(#arrow-active)' : 'url(#arrow)'}
                      className="transition-all duration-300"
                    />
                  )
                })}

                {components.map((comp) => {
                  const pos = nodePositions[comp.id]
                  if (!pos) return null
                  const isSelected = selectedComponent === comp.id
                  const isHovered = hoveredComponent === comp.id
                  const isHighlighted = highlightedIds.has(comp.id)
                  return (
                    <g
                      key={`node-${comp.id}`}
                      transform={`translate(${pos.x}, ${pos.y})`}
                      className="cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); setSelectedComponent(comp.id === selectedComponent ? null : comp.id) }}
                      onMouseEnter={() => setHoveredComponent(comp.id)}
                      onMouseLeave={() => setHoveredComponent(null)}
                    >
                      <circle
                        r="24"
                        fill="hsl(var(--card))"
                        stroke={isSelected || isHovered || isHighlighted ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
                        strokeWidth={isSelected ? 3 : 1.5}
                        className="transition-all duration-200 drop-shadow-md"
                      />
                      <foreignObject x="-12" y="-12" width="24" height="24">
                        <div className="flex items-center justify-center w-full h-full select-none pointer-events-none">
                          {getComponentIcon(comp.type)}
                        </div>
                      </foreignObject>
                      <text dy="38" textAnchor="middle" className="text-xs font-semibold fill-foreground select-none pointer-events-none drop-shadow-sm">
                        {comp.name}
                      </text>
                    </g>
                  )
                })}
              </g>
            </svg>
          </Card>

          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <h2 className="text-xl font-bold">Components</h2>
              {components.length === 0 ? (
                <Card className="p-8 text-center border-dashed">
                  <p className="text-foreground/60">No components yet. Add your first component to get started.</p>
                </Card>
              ) : (
                <div className="grid gap-3">
                  {components.map((comp) => (
                    <Card
                      key={comp.id}
                      className={`p-4 cursor-pointer transition-all ${selectedComponent === comp.id ? 'ring-2 ring-primary bg-primary/5' : 'hover:shadow-md'}`}
                      onClick={() => setSelectedComponent(comp.id)}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1">
                          <span className="text-2xl">{getComponentIcon(comp.type)}</span>
                          <div className="flex-1">
                            <h3 className="font-semibold text-foreground">{comp.name}</h3>
                            <p className="text-xs text-foreground/60 mt-1">
                              {comp.files} files • {comp.linesOfCode.toLocaleString()} LOC
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={getHealthColor(comp.health)}>{comp.health}</Badge>
                          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onEditComponent?.(comp.id) }}>
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onDeleteComponent?.(comp.id) }}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <h2 className="text-xl font-bold">Dependencies</h2>
              {selectedComponent ? (
                <div className="space-y-3">
                  {getRelatedDependencies(selectedComponent).length === 0 ? (
                    <Card className="p-4 text-center bg-card/30 border-dashed">
                      <p className="text-sm text-foreground/60">No dependencies</p>
                    </Card>
                  ) : (
                    getRelatedDependencies(selectedComponent).map((dep, idx) => (
                      <Card key={idx} className="p-3 bg-card/30">
                        <div className="text-xs space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">{dep.from}</span>
                            <span className="text-foreground/40">→</span>
                            <span className="font-medium text-foreground">{dep.to}</span>
                          </div>
                          <div className="flex justify-between">
                            <Badge variant="outline" className="text-xs">{dep.type}</Badge>
                            <Badge variant="outline" className={`text-xs ${dep.strength === 'weak' ? 'bg-green-500/20 text-green-600' : dep.strength === 'normal' ? 'bg-blue-500/20 text-blue-600' : 'bg-red-500/20 text-red-600'}`}>
                              {dep.strength}
                            </Badge>
                          </div>
                        </div>
                      </Card>
                    ))
                  )}
                </div>
              ) : (
                <Card className="p-4 text-center bg-card/30 border-dashed">
                  <p className="text-sm text-foreground/60">Select a component node in the map to view dependencies</p>
                </Card>
              )}
            </div>
          </div>
        </>
      )}

      <div className="grid md:grid-cols-5 gap-4">
        <Card className="p-5 bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
          <p className="text-xs text-foreground/60 mb-1">Overall Grade</p>
          <p className="text-3xl font-bold" style={{ color: HEALTH_GRADE_COLORS[healthSummary.overallGrade] }}>
            {healthSummary.overallGrade}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{HEALTH_GRADE_LABELS[healthSummary.overallGrade]}</p>
        </Card>
        <Card className="p-5">
          <h3 className="font-semibold text-foreground mb-4">Architecture Overview</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">{components.length}</p>
              <p className="text-xs text-foreground/60">Total Components</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">{dependencies.length}</p>
              <p className="text-xs text-foreground/60">Dependencies</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">
                {components.reduce((sum, c) => sum + c.linesOfCode, 0).toLocaleString()}
              </p>
              <p className="text-xs text-foreground/60">Total LOC</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">
                {Math.round((components.filter((c) => c.health === 'healthy').length / components.length) * 100 || 0)}%
              </p>
              <p className="text-xs text-foreground/60">Healthy</p>
            </div>
          </div>
        </Card>
        <Card className="p-5 col-span-3">
          <h3 className="font-semibold text-foreground mb-3">Health Grade Distribution</h3>
          <div className="flex items-end gap-2 h-16">
            {(['A','B','C','D','F'] as const).map(grade => {
              const count = healthSummary.gradeDistribution[grade]
              const pct = components.length > 0 ? (count / components.length) * 100 : 0
              return (
                <div key={grade} className="flex flex-col items-center gap-1 flex-1">
                  <div
                    className="w-full rounded-t transition-all duration-300"
                    style={{
                      height: `${Math.max(pct, 4)}%`,
                      backgroundColor: HEALTH_GRADE_COLORS[grade],
                      minHeight: 4,
                    }}
                  />
                  <span className="text-xs font-bold" style={{ color: HEALTH_GRADE_COLORS[grade] }}>{grade}</span>
                  <span className="text-xs text-muted-foreground">{count}</span>
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    </div>
  )
}
