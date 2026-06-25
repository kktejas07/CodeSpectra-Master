'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, AlertCircle, Plus, Edit2, Trash2, BarChart3 } from 'lucide-react'

interface QualityGate {
  id: string
  name: string
  conditions: {
    securityIssues: number
    reliabilityIssues: number
    maintainabilityIssues: number
    coverage: number
    duplications: number
  }
  status: 'PASSED' | 'FAILED' | 'NOT_COMPUTED'
}

interface QualityGateDashboardProps {
  gates?: QualityGate[]
  onSave?: (gate: QualityGate) => void
  onDelete?: (id: string) => void
}

export function QualityGateDashboard({
  gates = [],
  onSave,
  onDelete,
}: QualityGateDashboardProps) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    conditions: {
      securityIssues: 0,
      reliabilityIssues: 0,
      maintainabilityIssues: 5,
      coverage: 80,
      duplications: 3,
    },
  })

  const handleSubmit = () => {
    if (!formData.name.trim()) return

    onSave?.({
      id: editingId || `gate-${Date.now()}`,
      name: formData.name,
      conditions: formData.conditions,
      status: 'NOT_COMPUTED',
    })

    setShowForm(false)
    setEditingId(null)
    setFormData({
      name: '',
      conditions: {
        securityIssues: 0,
        reliabilityIssues: 0,
        maintainabilityIssues: 5,
        coverage: 80,
        duplications: 3,
      },
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Quality Gates</h1>
        <p className="text-foreground/60">
          Define pass/fail criteria for code quality. Projects must satisfy all conditions to pass.
        </p>
      </div>

      {/* Add Button */}
      <div className="flex justify-end">
        <Button onClick={() => setShowForm(!showForm)} className="gap-2">
          <Plus className="w-4 h-4" />
          New Quality Gate
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <Card className="p-6 border-2 border-primary/50 bg-primary/5">
          <h2 className="text-xl font-bold mb-4">Create Quality Gate</h2>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-2">Gate Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Production Ready, Sonar Way"
                className="w-full px-4 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium block mb-2">Security Issues (max)</label>
                <input
                  type="number"
                  min="0"
                  value={formData.conditions.securityIssues}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      conditions: {
                        ...formData.conditions,
                        securityIssues: parseInt(e.target.value) || 0,
                      },
                    })
                  }
                  className="w-full px-4 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">Reliability Issues (max)</label>
                <input
                  type="number"
                  min="0"
                  value={formData.conditions.reliabilityIssues}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      conditions: {
                        ...formData.conditions,
                        reliabilityIssues: parseInt(e.target.value) || 0,
                      },
                    })
                  }
                  className="w-full px-4 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">Maintainability Issues (max)</label>
                <input
                  type="number"
                  min="0"
                  value={formData.conditions.maintainabilityIssues}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      conditions: {
                        ...formData.conditions,
                        maintainabilityIssues: parseInt(e.target.value) || 0,
                      },
                    })
                  }
                  className="w-full px-4 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">Code Coverage (min %)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={formData.conditions.coverage}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      conditions: {
                        ...formData.conditions,
                        coverage: parseFloat(e.target.value) || 0,
                      },
                    })
                  }
                  className="w-full px-4 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">Duplication (max %)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={formData.conditions.duplications}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      conditions: {
                        ...formData.conditions,
                        duplications: parseFloat(e.target.value) || 0,
                      },
                    })
                  }
                  className="w-full px-4 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-4 border-t border-border">
              <Button onClick={handleSubmit} className="flex-1">
                Save Gate
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowForm(false)
                  setEditingId(null)
                }}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Gates Grid */}
      <div className="grid gap-4">
        {gates.length === 0 ? (
          <Card className="p-12 text-center bg-card/30 border border-dashed border-border">
            <BarChart3 className="w-12 h-12 text-foreground/40 mx-auto mb-3" />
            <p className="text-foreground/60">No quality gates configured</p>
            <p className="text-sm text-foreground/50 mt-1">Create one to enforce code quality standards</p>
          </Card>
        ) : (
          gates.map((gate) => (
            <Card key={gate.id} className="p-6 hover:shadow-lg transition-shadow">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  {gate.status === 'PASSED' ? (
                    <CheckCircle2 className="w-6 h-6 text-green-500" />
                  ) : gate.status === 'FAILED' ? (
                    <AlertCircle className="w-6 h-6 text-red-500" />
                  ) : (
                    <AlertCircle className="w-6 h-6 text-yellow-500" />
                  )}

                  <div>
                    <h3 className="font-bold text-lg">{gate.name}</h3>
                    <Badge
                      variant="outline"
                      className={
                        gate.status === 'PASSED'
                          ? 'bg-green-500/20 text-green-600'
                          : gate.status === 'FAILED'
                            ? 'bg-red-500/20 text-red-600'
                            : 'bg-yellow-500/20 text-yellow-600'
                      }
                    >
                      {gate.status}
                    </Badge>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingId(gate.id)}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onDelete?.(gate.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Conditions */}
              <div className="grid md:grid-cols-5 gap-3">
                <div className="bg-muted/50 p-4 rounded-lg border border-border">
                  <p className="text-xs font-medium text-foreground/60 mb-1">Security</p>
                  <p className="text-2xl font-bold text-foreground">{gate.conditions.securityIssues}</p>
                  <p className="text-xs text-foreground/50">max issues</p>
                </div>

                <div className="bg-muted/50 p-4 rounded-lg border border-border">
                  <p className="text-xs font-medium text-foreground/60 mb-1">Reliability</p>
                  <p className="text-2xl font-bold text-foreground">{gate.conditions.reliabilityIssues}</p>
                  <p className="text-xs text-foreground/50">max issues</p>
                </div>

                <div className="bg-muted/50 p-4 rounded-lg border border-border">
                  <p className="text-xs font-medium text-foreground/60 mb-1">Maintainability</p>
                  <p className="text-2xl font-bold text-foreground">
                    {gate.conditions.maintainabilityIssues}
                  </p>
                  <p className="text-xs text-foreground/50">max issues</p>
                </div>

                <div className="bg-muted/50 p-4 rounded-lg border border-border">
                  <p className="text-xs font-medium text-foreground/60 mb-1">Coverage</p>
                  <p className="text-2xl font-bold text-foreground">{gate.conditions.coverage}%</p>
                  <p className="text-xs text-foreground/50">minimum</p>
                </div>

                <div className="bg-muted/50 p-4 rounded-lg border border-border">
                  <p className="text-xs font-medium text-foreground/60 mb-1">Duplication</p>
                  <p className="text-2xl font-bold text-foreground">{gate.conditions.duplications}%</p>
                  <p className="text-xs text-foreground/50">maximum</p>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
