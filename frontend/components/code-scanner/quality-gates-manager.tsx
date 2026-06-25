'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import {
  Settings,
  Plus,
  Trash2,
  Shield,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react'

interface QualityGate {
  id: string
  name: string
  description: string
  minQualityScore: number
  maxBugs: number
  maxVulnerabilities: number
  maxCodeSmells: number
  minTestCoverage: number
  isDefault: boolean
}

interface QualityGatesManagerProps {
  gates?: QualityGate[]
  onSave?: (gate: QualityGate) => void
}

export function QualityGatesManager({ gates = [], onSave }: QualityGatesManagerProps) {
  const [allGates, setAllGates] = useState<QualityGate[]>(gates)
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<Partial<QualityGate>>({
    name: '',
    description: '',
    minQualityScore: 70,
    maxBugs: 0,
    maxVulnerabilities: 0,
    maxCodeSmells: 10,
    minTestCoverage: 50,
    isDefault: false,
  })

  const handleCreate = () => {
    setIsCreating(true)
    setFormData({
      name: '',
      description: '',
      minQualityScore: 70,
      maxBugs: 0,
      maxVulnerabilities: 0,
      maxCodeSmells: 10,
      minTestCoverage: 50,
      isDefault: false,
    })
  }

  const handleEdit = (gate: QualityGate) => {
    setEditingId(gate.id)
    setFormData(gate)
  }

  const handleSave = async () => {
    if (!formData.name) {
      alert('Gate name is required')
      return
    }

    const newGate: QualityGate = {
      id: editingId || `gate_${Date.now()}`,
      name: formData.name || '',
      description: formData.description || '',
      minQualityScore: formData.minQualityScore || 70,
      maxBugs: formData.maxBugs || 0,
      maxVulnerabilities: formData.maxVulnerabilities || 0,
      maxCodeSmells: formData.maxCodeSmells || 10,
      minTestCoverage: formData.minTestCoverage || 50,
      isDefault: formData.isDefault || false,
    }

    if (editingId) {
      setAllGates(prev => prev.map(g => (g.id === editingId ? newGate : g)))
    } else {
      setAllGates(prev => [...prev, newGate])
    }

    onSave?.(newGate)
    setIsCreating(false)
    setEditingId(null)
    setFormData({})
  }

  const handleDelete = (id: string) => {
    setAllGates(prev => prev.filter(g => g.id !== id))
  }

  const handleCancel = () => {
    setIsCreating(false)
    setEditingId(null)
    setFormData({})
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <h2 className="text-2xl font-bold text-foreground">Quality Gates</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Define standards that your code must meet before approval
        </p>
      </div>

      {/* Create/Edit Form */}
      {(isCreating || editingId) && (
        <Card className="p-6 bg-primary/5 border-primary/20 space-y-4">
          <h3 className="font-semibold text-foreground">
            {editingId ? 'Edit Quality Gate' : 'Create New Quality Gate'}
          </h3>

          <div className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Gate Name</label>
              <Input
                placeholder="e.g., Production Standard"
                value={formData.name || ''}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="bg-card border-border"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Description</label>
              <Input
                placeholder="What is this gate for?"
                value={formData.description || ''}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                className="bg-card border-border"
              />
            </div>

            {/* Threshold Settings */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Min Quality Score</label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={formData.minQualityScore || 70}
                  onChange={e =>
                    setFormData(prev => ({ ...prev, minQualityScore: parseInt(e.target.value) }))
                  }
                  className="bg-card border-border"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Max Bugs</label>
                <Input
                  type="number"
                  min="0"
                  value={formData.maxBugs || 0}
                  onChange={e =>
                    setFormData(prev => ({ ...prev, maxBugs: parseInt(e.target.value) }))
                  }
                  className="bg-card border-border"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Max Vulnerabilities</label>
                <Input
                  type="number"
                  min="0"
                  value={formData.maxVulnerabilities || 0}
                  onChange={e =>
                    setFormData(prev => ({ ...prev, maxVulnerabilities: parseInt(e.target.value) }))
                  }
                  className="bg-card border-border"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Max Code Smells</label>
                <Input
                  type="number"
                  min="0"
                  value={formData.maxCodeSmells || 10}
                  onChange={e =>
                    setFormData(prev => ({ ...prev, maxCodeSmells: parseInt(e.target.value) }))
                  }
                  className="bg-card border-border"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Min Test Coverage %</label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={formData.minTestCoverage || 50}
                  onChange={e =>
                    setFormData(prev => ({ ...prev, minTestCoverage: parseInt(e.target.value) }))
                  }
                  className="bg-card border-border"
                />
              </div>
            </div>

            {/* Default Checkbox */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.isDefault || false}
                onChange={e => setFormData(prev => ({ ...prev, isDefault: e.target.checked }))}
                className="w-4 h-4 rounded border-border"
              />
              <label className="text-sm font-medium text-foreground">
                Use as default gate for new scans
              </label>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-2 justify-end pt-4">
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              {editingId ? 'Update Gate' : 'Create Gate'}
            </Button>
          </div>
        </Card>
      )}

      {/* Gates List */}
      <div className="space-y-3">
        {allGates.length === 0 ? (
          <div className="text-center py-12 bg-card border-2 border-dashed border-border rounded-lg">
            <Settings className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">No quality gates defined yet</p>
            <Button onClick={handleCreate} className="gap-2">
              <Plus className="w-4 h-4" />
              Create First Gate
            </Button>
          </div>
        ) : (
          allGates.map(gate => (
            <Card key={gate.id} className="p-4 bg-card border-border hover:border-primary/30 transition-colors">
              <div className="space-y-3">
                {/* Gate Header */}
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <h3 className="font-semibold text-foreground">{gate.name}</h3>
                    <p className="text-sm text-muted-foreground">{gate.description}</p>
                  </div>
                  {gate.isDefault && (
                    <span className="text-xs px-2 py-1 bg-primary/10 border border-primary/20 text-primary rounded font-medium">
                      Default
                    </span>
                  )}
                </div>

                {/* Thresholds */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                  <div className="bg-background/50 p-2 rounded">
                    <p className="text-muted-foreground">Quality Score</p>
                    <p className="font-semibold text-foreground">{gate.minQualityScore}+</p>
                  </div>
                  <div className="bg-background/50 p-2 rounded">
                    <p className="text-muted-foreground">Max Bugs</p>
                    <p className="font-semibold text-foreground">{gate.maxBugs}</p>
                  </div>
                  <div className="bg-background/50 p-2 rounded">
                    <p className="text-muted-foreground">Max Vulns</p>
                    <p className="font-semibold text-foreground">{gate.maxVulnerabilities}</p>
                  </div>
                  <div className="bg-background/50 p-2 rounded">
                    <p className="text-muted-foreground">Max Smells</p>
                    <p className="font-semibold text-foreground">{gate.maxCodeSmells}</p>
                  </div>
                  <div className="bg-background/50 p-2 rounded">
                    <p className="text-muted-foreground">Min Coverage</p>
                    <p className="font-semibold text-foreground">{gate.minTestCoverage}%</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 justify-end pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(gate)}
                    className="gap-1"
                  >
                    <Settings className="w-3 h-3" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(gate.id)}
                    className="gap-1 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Create Button */}
      {!isCreating && !editingId && (
        <Button onClick={handleCreate} className="w-full gap-2">
          <Plus className="w-4 h-4" />
          Add Quality Gate
        </Button>
      )}
    </div>
  )
}
