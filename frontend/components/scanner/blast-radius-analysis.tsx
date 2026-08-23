'use client'

import { useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Zap, Database, Layers, ArrowRight, Target } from 'lucide-react'
import type { D3Component, D3Dependency } from './d3-force-graph'

interface BlastRadiusAnalysisProps {
  components: D3Component[]
  dependencies: D3Dependency[]
  selectedId: string | null
  onHighlightIds?: (ids: Set<string>) => void
}

interface BlastResult {
  affected: D3Component[]
  maxDepth: number
  cascadingPaths: Array<{ from: string; to: string; depth: number }>
  criticalCount: number
  warningCount: number
  healthBreakdown: { healthy: number; warning: number; critical: number }
}

function computeBlastRadius(
  components: D3Component[],
  dependencies: D3Dependency[],
  selectedId: string
): BlastResult {
  const compMap = new Map(components.map(c => [c.id, c]))
  const adj = new Map<string, Array<{ to: string; dep: D3Dependency }>>()
  for (const c of components) adj.set(c.id, [])
  for (const d of dependencies) {
    adj.get(d.from)?.push({ to: d.to, dep: d })
    adj.get(d.to)?.push({ to: d.from, dep: d })
  }

  const visited = new Set<string>()
  const queue: Array<{ id: string; depth: number; from: string }> = []
  const cascadingPaths: BlastResult['cascadingPaths'] = []

  queue.push({ id: selectedId, depth: 0, from: selectedId })
  const visitedOrder: string[] = []

  while (queue.length > 0) {
    const { id, depth, from } = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    visitedOrder.push(id)

    if (from !== id) {
      cascadingPaths.push({ from, to: id, depth })
    }

    for (const { to, dep } of adj.get(id) || []) {
      if (!visited.has(to)) {
        queue.push({ id: to, depth: depth + 1, from: id })
      }
    }
  }

  const affected = visitedOrder
    .filter(id => id !== selectedId)
    .map(id => compMap.get(id)!)
    .filter(Boolean)

  const maxDepth = cascadingPaths.length > 0
    ? Math.max(...cascadingPaths.map(p => p.depth))
    : 0

  return {
    affected,
    maxDepth,
    cascadingPaths,
    criticalCount: affected.filter(c => c.health === 'critical').length,
    warningCount: affected.filter(c => c.health === 'warning').length,
    healthBreakdown: {
      healthy: affected.filter(c => c.health === 'healthy').length,
      warning: affected.filter(c => c.health === 'warning').length,
      critical: affected.filter(c => c.health === 'critical').length,
    },
  }
}

function HealthBadge({ health }: { health: D3Component['health'] }) {
  const cls = health === 'critical'
    ? 'bg-red-500/20 text-red-400 border-red-500/30'
    : health === 'warning'
    ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    : 'bg-green-500/20 text-green-400 border-green-500/30'
  return <Badge variant="outline" className={`text-xs ${cls}`}>{health}</Badge>
}

export function BlastRadiusAnalysis({
  components,
  dependencies,
  selectedId,
  onHighlightIds,
}: BlastRadiusAnalysisProps) {
  const result = useMemo(() => {
    if (!selectedId) return null
    return computeBlastRadius(components, dependencies, selectedId)
  }, [components, dependencies, selectedId])

  if (!selectedId) {
    return (
      <Card className="p-6 border-dashed bg-card/30 text-center">
        <Target className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Select a node in the force graph to analyze its blast radius.</p>
      </Card>
    )
  }

  if (!result || result.affected.length === 0) {
    return (
      <Card className="p-6 bg-card/30">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-foreground">Blast Radius — {components.find(c => c.id === selectedId)?.name}</h3>
        </div>
        <p className="text-sm text-muted-foreground">No downstream dependencies — isolated component.</p>
      </Card>
    )
  }

  const byDepth = new Map<number, typeof result.cascadingPaths>()
  for (const p of result.cascadingPaths) {
    if (!byDepth.has(p.depth)) byDepth.set(p.depth, [])
    byDepth.get(p.depth)!.push(p)
  }

  return (
    <div className="space-y-4">
      <Card className="p-5 bg-linear-to-r from-primary/5 to-primary/10 border-primary/20">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-foreground">Blast Radius — {components.find(c => c.id === selectedId)?.name}</h3>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">{result.affected.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Affected components</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">{result.maxDepth}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Max cascade depth</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">{result.cascadingPaths.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Dependency edges</p>
          </div>
        </div>

        <div className="flex gap-2 mt-4 justify-center">
          <HealthBadge health="healthy" />
          <span className="text-xs text-muted-foreground">×{result.healthBreakdown.healthy}</span>
          <HealthBadge health="warning" />
          <span className="text-xs text-muted-foreground">×{result.healthBreakdown.warning}</span>
          <HealthBadge health="critical" />
          <span className="text-xs text-muted-foreground">×{result.healthBreakdown.critical}</span>
        </div>

        <Button
          size="sm"
          variant="outline"
          className="mt-3 w-full"
          onClick={() => onHighlightIds?.(new Set([selectedId, ...result.affected.map(a => a.id)]))}
        >
          Highlight all in graph
        </Button>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-muted-foreground" />
          <h4 className="text-sm font-semibold text-foreground">Cascade paths</h4>
        </div>
        <div className="space-y-3">
          {Array.from(byDepth.entries())
            .sort(([a], [b]) => a - b)
            .map(([depth, paths]) => {
              const fromComp = components.find(c => c.id === selectedId)
              const toIds = paths.map(p => p.to)
              const toComps = toIds.map(id => components.find(c => c.id === id)).filter(Boolean)
              return (
                <div key={depth} className="border-l-2 border-primary/30 pl-3">
                  <p className="text-xs font-semibold text-primary mb-1">Depth {depth} ({paths.length} edge{paths.length !== 1 ? 's' : ''})</p>
                  <div className="space-y-1">
                    {toComps.map(to => to && (
                      <div key={to.id} className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground font-medium">{fromComp?.name}</span>
                        <ArrowRight className="w-3 h-3 text-muted-foreground" />
                        <span className="text-foreground font-medium">{to.name}</span>
                        <HealthBadge health={to.health} />
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Database className="w-4 h-4 text-muted-foreground" />
          <h4 className="text-sm font-semibold text-foreground">All affected components</h4>
        </div>
        <div className="space-y-2">
          {result.affected.map(comp => (
            <div key={comp.id} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
              <div>
                <p className="text-sm font-medium text-foreground">{comp.name}</p>
                <p className="text-xs text-muted-foreground">{comp.files} files · {comp.linesOfCode.toLocaleString()} LOC</p>
              </div>
              <HealthBadge health={comp.health} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}