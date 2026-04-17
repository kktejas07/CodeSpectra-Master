'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Shield, Plus, Edit2, Trash2, Save, X } from 'lucide-react'

interface QualityGate {
  id: string
  name: string
  description: string
  conditions: GateCondition[]
  isActive: boolean
}

interface GateCondition {
  metric: string
  operator: 'greater_than' | 'less_than' | 'equals'
  value: number
  impact: 'pass' | 'fail' | 'warn'
}

interface QualityGateDashboardProps {
  gates?: QualityGate[]
  onSave?: (gate: QualityGate) => void
  onDelete?: (gateId: string) => void
}

const AVAILABLE_METRICS = [
  { value: 'quality_score', label: 'Quality Score', unit: '/100' },
  { value: 'bugs', label: 'Bugs Count', unit: '' },
  { value: 'vulnerabilities', label: 'Vulnerabilities', unit: '' },
  { value: 'code_smells', label: 'Code Smells', unit: '' },
  { value: 'complexity', label: 'Complexity Score', unit: '' },
  { value: 'duplicates', label: 'Duplicate Lines %', unit: '%' },
  { value: 'coverage', label: 'Test Coverage', unit: '%' },
]

export function QualityGateDashboard({
  gates = [],
  onSave,
  onDelete,
}: QualityGateDashboardProps) {
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newGate, setNewGate] = useState<Partial<QualityGate>>({
    name: '',
    description: '',
    conditions: [],
    isActive: true,
  })

  const handleAddCondition = () => {
    setNewGate((prev) => ({
      ...prev,
      conditions: [
        ...(prev.conditions || []),
        { metric: 'quality_score', operator: 'greater_than', value: 80, impact: 'pass' },
      ],
    }))
  }

  const handleSaveGate = () => {
    if (!newGate.name?.trim()) return

    const gate: QualityGate = {
      id: editingId || `gate-${Date.now()}`,
      name: newGate.name || '',
      description: newGate.description || '',
      conditions: newGate.conditions || [],
      isActive: newGate.isActive ?? true,
    }

    onSave?.(gate)
    setIsCreating(false)
    setEditingId(null)
    setNewGate({ name: '', description: '', conditions: [], isActive: true })
  }

  const getMetricLabel = (metricValue: string) => {
    return AVAILABLE_METRICS.find((m) => m.value === metricValue)?.label || metricValue
  }

  const getOperatorLabel = (op: string) => {
    const labels: Record<string, string> = {
      greater_than: '>',
      less_than: '<',
      equals: '=',
    }
    return labels[op] || op
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Quality Gates
          </h3>
          <p className="text-sm text-foreground/60">
            Define rules that code must pass to be considered deployable
          </p>
        </div>
        <Button
          onClick={() => setIsCreating(true)}
          className="gap-2"
          disabled={isCreating}
        >
          <Plus className="w-4 h-4" />
          New Gate
        </Button>
      </div>

      {/* Create/Edit Form */}
      {isCreating && (
        <Card className="bg-card/30 border border-border p-6 space-y-4">
          <h4 className="font-semibold text-foreground">
            {editingId ? 'Edit' : 'Create'} Quality Gate
          </h4>

          <div className="space-y-3">
            <input
              type="text"
              placeholder="Gate name (e.g., Production Ready)"
              value={newGate.name || ''}
              onChange={(e) => setNewGate((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 bg-background border border-border rounded text-foreground placeholder-foreground/40"
            />

            <textarea
              placeholder="Description"
              value={newGate.description || ''}
              onChange={(e) => setNewGate((prev) => ({ ...prev, description: e.target.value }))}
              className="w-full px-3 py-2 bg-background border border-border rounded text-foreground placeholder-foreground/40 text-sm"
              rows={2}
            />
          </div>

          {/* Conditions */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Conditions</p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddCondition}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add
              </Button>
            </div>

            {newGate.conditions?.map((condition, idx) => (
              <div key={idx} className="flex gap-2 items-center bg-background p-3 rounded border border-border">
                <select
                  value={condition.metric}
                  onChange={(e) => {
                    const newConditions = [...(newGate.conditions || [])]
                    newConditions[idx].metric = e.target.value
                    setNewGate((prev) => ({ ...prev, conditions: newConditions }))
                  }}
                  className="px-2 py-1 bg-card border border-border rounded text-sm text-foreground"
                >
                  {AVAILABLE_METRICS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>

                <select
                  value={condition.operator}
                  onChange={(e) => {
                    const newConditions = [...(newGate.conditions || [])]
                    newConditions[idx].operator = e.target.value as any
                    setNewGate((prev) => ({ ...prev, conditions: newConditions }))
                  }}
                  className="px-2 py-1 bg-card border border-border rounded text-sm text-foreground"
                >
                  <option value="greater_than">{">"}</option>
                  <option value="less_than">{"<"}</option>
                  <option value="equals">{"="}</option>
                </select>

                <input
                  type="number"
                  value={condition.value}
                  onChange={(e) => {
                    const newConditions = [...(newGate.conditions || [])]
                    newConditions[idx].value = parseInt(e.target.value)
                    setNewGate((prev) => ({ ...prev, conditions: newConditions }))
                  }}
                  className="w-20 px-2 py-1 bg-card border border-border rounded text-sm text-foreground"
                />

                <button
                  onClick={() => {
                    const newConditions = newGate.conditions?.filter((_, i) => i !== idx) || []
                    setNewGate((prev) => ({ ...prev, conditions: newConditions }))
                  }}
                  className="p-1 hover:bg-red-500/10 rounded text-red-600 hover:text-red-700 transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4 border-t border-border">
            <Button onClick={handleSaveGate} className="gap-2">
              <Save className="w-4 h-4" />
              Save Gate
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreating(false)
                setEditingId(null)
                setNewGate({ name: '', description: '', conditions: [], isActive: true })
              }}
              className="gap-2"
            >
              <X className="w-4 h-4" />
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {/* Existing Gates */}
      <div className="space-y-3">
        {gates.length === 0 ? (
          <Card className="bg-card/30 border border-border p-8 text-center">
            <p className="text-sm text-foreground/60">No quality gates configured</p>
          </Card>
        ) : (
          gates.map((gate) => (
            <Card key={gate.id} className="bg-card/30 border border-border p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-foreground">{gate.name}</h4>
                    <Badge className={gate.isActive ? 'bg-green-500/20 text-green-600' : 'bg-gray-500/20 text-gray-600'}>
                      {gate.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <p className="text-sm text-foreground/60">{gate.description}</p>

                  {/* Conditions Summary */}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {gate.conditions.map((cond, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {getMetricLabel(cond.metric)} {getOperatorLabel(cond.operator)} {cond.value}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingId(gate.id)}
                    className="p-2 hover:bg-background rounded text-foreground/60 hover:text-foreground transition"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDelete?.(gate.id)}
                    className="p-2 hover:bg-red-500/10 rounded text-red-600 hover:text-red-700 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
