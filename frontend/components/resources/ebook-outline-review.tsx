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
    cover: 'bg-primary/10 text-primary',
    toc: 'bg-primary/10 text-primary',
    section: 'bg-muted text-muted-foreground',
    infographic: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
    code: 'bg-muted text-foreground',
    quiz: 'bg-primary/10 text-primary',
    timeline: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    callout: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    journey: 'bg-primary/10 text-primary',
    tips: 'bg-primary/10 text-primary',
    compare: 'bg-muted text-foreground',
    stats: 'bg-primary/10 text-primary',
  }

  return (
    <Card className="rounded-3xl border-border/70 p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-foreground">Review outline</h3>
          <p className="text-sm text-muted-foreground">
            Review and edit the chapter outline for "{topic}" before generating content.
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0 tabular-nums">{outline.length} chapters</Badge>
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {outline.map((item, idx) => (
          <div key={item.id} className="flex items-start gap-3 p-3 rounded-xl border border-border/60 bg-card/50">
            <GripVertical className="h-4 w-4 text-muted-foreground mt-1 shrink-0 cursor-move" aria-hidden />
            <div className="flex-1 min-w-0">
              {editingId === item.id ? (
                <div className="space-y-2">
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="h-8 text-sm"
                    placeholder="Chapter title"
                    aria-label="Chapter title"
                  />
                  <Input
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="h-8 text-sm"
                    placeholder="Brief description"
                    aria-label="Chapter description"
                  />
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={saveEditing} aria-label="Save chapter">
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancelEditing} aria-label="Cancel editing">
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs tabular-nums text-muted-foreground">{idx + 1}.</span>
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    <Badge variant="outline" className={`text-[10px] ${typeColors[item.type] || ''}`}>{item.type}</Badge>
                  </div>
                  {item.description && (
                    <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-1 shrink-0">
              <Button size="sm" variant="ghost" onClick={() => startEditing(item)} aria-label={`Edit ${item.title}`}>
                <Edit2 className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => removeItem(item.id)} aria-label={`Remove ${item.title}`}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-border">
        <Button variant="outline" size="sm" onClick={addItem}>
          <Plus className="h-3 w-3 mr-1" /> Add chapter
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={() => onConfirm(outline)} disabled={loading || outline.length === 0}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Generate ebook
          </Button>
        </div>
      </div>
    </Card>
  )
}
