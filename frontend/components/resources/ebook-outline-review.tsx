'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { GripVertical, Plus, Trash2, Edit2, Check, X, Loader2 } from 'lucide-react'

interface OutlineItem {
  id: string
  title: string
  type: string
  description: string
}

interface EbookOutlineReviewProps {
  topic: string
  outline: OutlineItem[]
  onConfirm: (outline: OutlineItem[]) => void
  onCancel: () => void
  loading?: boolean
}

export function EbookOutlineReview({ topic, outline: initialOutline, onConfirm, onCancel, loading }: EbookOutlineReviewProps) {
  const [outline, setOutline] = useState<OutlineItem[]>(initialOutline)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')

  const updateItem = (id: string, updates: Partial<OutlineItem>) => {
    setOutline(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item))
  }

  const removeItem = (id: string) => {
    setOutline(prev => prev.filter(item => item.id !== id))
  }

  const addItem = () => {
    const newId = `new-${Date.now()}`
    setOutline(prev => [...prev, {
      id: newId,
      title: 'New Section',
      type: 'section',
      description: 'Describe this section...',
    }])
    setEditingId(newId)
    setEditTitle('New Section')
    setEditDescription('Describe this section...')
  }

  const startEditing = (item: OutlineItem) => {
    setEditingId(item.id)
    setEditTitle(item.title)
    setEditDescription(item.description)
  }

  const saveEditing = () => {
    if (editingId) {
      updateItem(editingId, { title: editTitle, description: editDescription })
      setEditingId(null)
    }
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditTitle('')
    setEditDescription('')
  }

  const typeColors: Record<string, string> = {
    cover: 'bg-purple-500/10 text-purple-600',
    toc: 'bg-blue-500/10 text-blue-600',
    section: 'bg-green-500/10 text-green-600',
    infographic: 'bg-orange-500/10 text-orange-600',
    code: 'bg-cyan-500/10 text-cyan-600',
    quiz: 'bg-pink-500/10 text-pink-600',
    timeline: 'bg-amber-500/10 text-amber-600',
    callout: 'bg-red-500/10 text-red-600',
    journey: 'bg-indigo-500/10 text-indigo-600',
    tips: 'bg-emerald-500/10 text-emerald-600',
    compare: 'bg-violet-500/10 text-violet-600',
    stats: 'bg-teal-500/10 text-teal-600',
  }

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold">Review Outline</h3>
          <p className="text-sm text-muted-foreground">
            Review and edit the chapter outline for "{topic}" before generating content.
          </p>
        </div>
        <Badge variant="secondary">{outline.length} chapters</Badge>
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {outline.map((item, idx) => (
          <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-card/50">
            <GripVertical className="h-4 w-4 text-muted-foreground mt-1 shrink-0 cursor-move" />
            <div className="flex-1 min-w-0">
              {editingId === item.id ? (
                <div className="space-y-2">
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="h-8 text-sm"
                    placeholder="Chapter title"
                  />
                  <Input
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="h-8 text-sm"
                    placeholder="Brief description"
                  />
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={saveEditing}>
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancelEditing}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{idx + 1}.</span>
                    <p className="text-sm font-medium">{item.title}</p>
                    <Badge variant="outline" className={`text-[10px] ${typeColors[item.type] || ''}`}>{item.type}</Badge>
                  </div>
                  {item.description && (
                    <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-1 shrink-0">
              <Button size="sm" variant="ghost" onClick={() => startEditing(item)}>
                <Edit2 className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => removeItem(item.id)}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-4 border-t">
        <Button variant="outline" size="sm" onClick={addItem}>
          <Plus className="h-3 w-3 mr-1" /> Add Chapter
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={() => onConfirm(outline)} disabled={loading || outline.length === 0}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Generate Ebook
          </Button>
        </div>
      </div>
    </Card>
  )
}
