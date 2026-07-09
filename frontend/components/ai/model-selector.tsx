'use client'

import { useEffect, useState } from 'react'
import { Sparkles, Zap, DollarSign } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import type { UserAISettings } from '@/lib/ai/model-options'

interface ModelOption {
  id: string
  label: string
  provider: string
  model: string
  role: string
  free: boolean
}

interface ModelSelectorProps {
  feature: keyof UserAISettings
  label?: string
  onChange?: (modelId: string) => void
}

export function ModelSelector({ feature, label, onChange }: ModelSelectorProps) {
  const [models, setModels] = useState<ModelOption[]>([])
  const [current, setCurrent] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/user/ai-settings')
      .then((r) => r.json())
      .then((d) => {
        setModels(d.models || [])
        setCurrent(d.settings?.[feature] || '')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [feature])

  const handleChange = async (val: string) => {
    setCurrent(val)
    onChange?.(val)
    await fetch('/api/user/ai-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [feature]: val }),
    })
  }

  if (loading) return <div className="h-9 w-48 rounded-md bg-muted animate-pulse" />

  return (
    <div className="space-y-1">
      {label && <label className="text-xs font-medium text-muted-foreground">{label}</label>}
      <Select value={current} onValueChange={handleChange}>
        <SelectTrigger className="w-48 h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {models.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              <span className="flex items-center gap-2">
                {m.free ? <Zap className="h-3 w-3 text-green-500" /> : <DollarSign className="h-3 w-3 text-amber-500" />}
                {m.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
