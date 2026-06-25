import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Edit2, ZoomIn, ZoomOut } from 'lucide-react'

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
  const [zoom, setZoom] = useState(100)
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null)

  const getHealthColor = (health: string) => {
    const colors: Record<string, string> = {
      healthy: 'bg-green-500/20 text-green-600',
      warning: 'bg-yellow-500/20 text-yellow-600',
      critical: 'bg-red-500/20 text-red-600',
    }
    return colors[health] || 'bg-gray-500/20 text-gray-600'
  }

  const getComponentIcon = (type: string) => {
    const icons: Record<string, string> = {
      service: '🔧',
      database: '💾',
      library: '📚',
      module: '📦',
    }
    return icons[type] || '◯'
  }

  const getRelatedDependencies = (componentId: string) => {
    return dependencies.filter((dep) => dep.from === componentId || dep.to === componentId)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Architecture</h1>
        <p className="text-foreground/60">Visualize your codebase structure, components, and dependencies</p>
      </div>

      {/* Controls */}
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setZoom(Math.max(50, zoom - 10))}
            className="gap-2"
          >
            <ZoomOut className="w-4 h-4" />
            Zoom Out
          </Button>
          <div className="px-3 py-2 bg-card rounded border border-border text-sm font-medium">
            {zoom}%
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setZoom(Math.min(200, zoom + 10))}
            className="gap-2"
          >
            <ZoomIn className="w-4 h-4" />
            Zoom In
          </Button>
        </div>

        <Button onClick={onAddComponent} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Component
        </Button>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Components List */}
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
                  className={`p-4 cursor-pointer transition-all ${
                    selectedComponent === comp.id ? 'ring-2 ring-primary bg-primary/5' : 'hover:shadow-md'
                  }`}
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
                      <Badge className={getHealthColor(comp.health)}>
                        {comp.health}
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation()
                          onEditComponent?.(comp.id)
                        }}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation()
                          onDeleteComponent?.(comp.id)
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Dependencies */}
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
                        <Badge variant="outline" className="text-xs">
                          {dep.type}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            dep.strength === 'weak'
                              ? 'bg-green-500/20 text-green-600'
                              : dep.strength === 'normal'
                                ? 'bg-blue-500/20 text-blue-600'
                                : 'bg-red-500/20 text-red-600'
                          }`}
                        >
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
              <p className="text-sm text-foreground/60">Select a component to view its dependencies</p>
            </Card>
          )}
        </div>
      </div>

      {/* Architecture Stats */}
      <Card className="p-6 bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20">
        <h3 className="font-semibold text-foreground mb-4">Architecture Overview</h3>
        <div className="grid md:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">{components.length}</p>
            <p className="text-xs text-foreground/60 mt-1">Total Components</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">{dependencies.length}</p>
            <p className="text-xs text-foreground/60 mt-1">Dependencies</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">
              {components.reduce((sum, c) => sum + c.linesOfCode, 0).toLocaleString()}
            </p>
            <p className="text-xs text-foreground/60 mt-1">Total LOC</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">
              {Math.round(
                (components.filter((c) => c.health === 'healthy').length / components.length) * 100 || 0
              )}
              %
            </p>
            <p className="text-xs text-foreground/60 mt-1">Healthy</p>
          </div>
        </div>
      </Card>
    </div>
  )
}
