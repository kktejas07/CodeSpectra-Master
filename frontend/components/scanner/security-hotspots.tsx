'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Shield, AlertCircle, CheckCircle2, Eye, Code } from 'lucide-react'

interface SecurityHotspot {
  id: string
  file: string
  line: number
  rule: string
  message: string
  codeSnippet: string
  category: 'Authentication' | 'Cryptography' | 'Injection' | 'Weak Cryptography' | 'Encryption'
  priority: 'High' | 'Medium' | 'Low'
  status: 'To Review' | 'Fixed' | 'Safe'
}

interface SecurityHotspotsProps {
  hotspots?: SecurityHotspot[]
  onReview?: (id: string) => void
  onMarkSafe?: (id: string) => void
  onMarkFixed?: (id: string) => void
}

export function SecurityHotspots({
  hotspots = [],
  onReview,
  onMarkSafe,
  onMarkFixed,
}: SecurityHotspotsProps) {
  const [filter, setFilter] = useState<'all' | 'to-review' | 'fixed' | 'safe'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const filtered = hotspots.filter((h) => {
    if (filter === 'all') return true
    if (filter === 'to-review') return h.status === 'To Review'
    if (filter === 'fixed') return h.status === 'Fixed'
    if (filter === 'safe') return h.status === 'Safe'
    return true
  })

  const stats = {
    toReview: hotspots.filter((h) => h.status === 'To Review').length,
    fixed: hotspots.filter((h) => h.status === 'Fixed').length,
    safe: hotspots.filter((h) => h.status === 'Safe').length,
  }

  const getPriorityColor = (priority: string) => {
    if (priority === 'High') return 'bg-red-500/20 text-red-600'
    if (priority === 'Medium') return 'bg-orange-500/20 text-orange-600'
    return 'bg-yellow-500/20 text-yellow-600'
  }

  const getStatusIcon = (status: string) => {
    if (status === 'Fixed') return <CheckCircle2 className="w-4 h-4 text-green-500" />
    if (status === 'Safe') return <CheckCircle2 className="w-4 h-4 text-blue-500" />
    return <AlertCircle className="w-4 h-4 text-yellow-500" />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
          <Shield className="w-8 h-8 text-primary" />
          Security Hotspots
        </h1>
        <p className="text-foreground/60">
          Review security-sensitive code that requires attention. {hotspots.length} total hotspots
        </p>
      </div>

      {/* Stats */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card className="p-4 bg-card/30 border border-border">
          <p className="text-sm text-foreground/60 mb-2">To Review</p>
          <p className="text-3xl font-bold text-yellow-500">{stats.toReview}</p>
        </Card>
        <Card className="p-4 bg-card/30 border border-border">
          <p className="text-sm text-foreground/60 mb-2">Fixed</p>
          <p className="text-3xl font-bold text-green-500">{stats.fixed}</p>
        </Card>
        <Card className="p-4 bg-card/30 border border-border">
          <p className="text-sm text-foreground/60 mb-2">Safe</p>
          <p className="text-3xl font-bold text-blue-500">{stats.safe}</p>
        </Card>
        <Card className="p-4 bg-card/30 border border-border">
          <p className="text-sm text-foreground/60 mb-2">Reviewed</p>
          <p className="text-3xl font-bold">{stats.fixed + stats.safe}</p>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-border">
        {['all', 'to-review', 'fixed', 'safe'].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status as any)}
            className={`px-4 py-3 font-medium border-b-2 transition-colors ${
              filter === status
                ? 'border-primary text-primary'
                : 'border-transparent text-foreground/60 hover:text-foreground'
            }`}
          >
            {status === 'all' && `All (${hotspots.length})`}
            {status === 'to-review' && `To Review (${stats.toReview})`}
            {status === 'fixed' && `Fixed (${stats.fixed})`}
            {status === 'safe' && `Safe (${stats.safe})`}
          </button>
        ))}
      </div>

      {/* Hotspots List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card className="p-8 text-center bg-card/30 border border-dashed border-border">
            <Shield className="w-12 h-12 text-foreground/40 mx-auto mb-3" />
            <p className="text-foreground/60">No security hotspots {filter !== 'all' ? `with status "${filter}"` : ''}</p>
          </Card>
        ) : (
          filtered.map((hotspot) => (
            <Card
              key={hotspot.id}
              className={`p-4 border cursor-pointer transition-all hover:shadow-lg ${
                selectedId === hotspot.id ? 'border-primary bg-primary/5' : 'border-border'
              }`}
              onClick={() => setSelectedId(selectedId === hotspot.id ? null : hotspot.id)}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3 flex-1">
                  {getStatusIcon(hotspot.status)}
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground">{hotspot.rule}</h3>
                    <p className="text-sm text-foreground/60 mt-1">{hotspot.message}</p>
                    <div className="flex gap-2 mt-2">
                      <Badge variant="outline">{hotspot.file}</Badge>
                      <Badge variant="outline">Line {hotspot.line}</Badge>
                      <Badge variant="outline">{hotspot.category}</Badge>
                      <Badge className={getPriorityColor(hotspot.priority)}>{hotspot.priority}</Badge>
                      <Badge
                        className={
                          hotspot.status === 'Fixed'
                            ? 'bg-green-500/20 text-green-600'
                            : hotspot.status === 'Safe'
                              ? 'bg-blue-500/20 text-blue-600'
                              : 'bg-yellow-500/20 text-yellow-600'
                        }
                      >
                        {hotspot.status}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              {/* Code Snippet */}
              {selectedId === hotspot.id && (
                <div className="space-y-3 pt-3 border-t border-border">
                  <div className="bg-background rounded-lg p-4 font-mono text-sm">
                    <pre className="whitespace-pre-wrap break-words text-foreground/70">{hotspot.codeSnippet}</pre>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    {hotspot.status === 'To Review' && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => onMarkSafe?.(hotspot.id)}
                          className="gap-2 bg-blue-500 hover:bg-blue-600"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Mark as Safe
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => onMarkFixed?.(hotspot.id)}
                          className="gap-2 bg-green-500 hover:bg-green-600"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Mark as Fixed
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onReview?.(hotspot.id)}
                      className="gap-2"
                    >
                      <Eye className="w-4 h-4" />
                      Review Details
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
