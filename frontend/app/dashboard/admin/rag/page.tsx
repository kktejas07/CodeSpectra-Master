'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import {
  Database, Search, RefreshCw, Loader2, Info, Play,
} from 'lucide-react'
import { SkeletonCard, SkeletonStats, SkeletonText } from '@/components/ui/skeleton-boneyard'

export default function RagAdminPage() {
  const gate = usePageGuard('superadmin')
  const toast = useToast()
  const [stats, setStats] = useState<{ total: number; bySource: Record<string, number> } | null>(null)
  const [loading, setLoading] = useState(true)
  const [indexing, setIndexing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Array<{ text: string; source: string; score: number }> | null>(null)
  const [searching, setSearching] = useState(false)
  const [statsError, setStatsError] = useState('')
  const [searchError, setSearchError] = useState('')

  const loadStats = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/rag/stats', { credentials: 'include' })
      const d = await r.json()
      if (!r.ok) { setStatsError(d.error || `Failed (${r.status})`); setStats(null); return }
      setStats(d)
      setStatsError('')
    } catch {
      toast({ type: 'error', title: 'Failed to load RAG stats' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    if (!gate.ready) return
    loadStats()
  }, [gate.ready, loadStats])

  const reindex = async () => {
    setIndexing(true)
    try {
      const r = await csrfFetch('/api/admin/rag/reindex', { method: 'POST', credentials: 'include' })
      const d = await r.json()
      toast({ type: d.ok ? 'success' : 'error', title: d.ok ? `Re-indexed: ${d.count} items` : `Re-index failed: ${d.error || ''}` })
      loadStats()
    } catch {
      toast({ type: 'error', title: 'Re-index request failed' })
    } finally {
      setIndexing(false)
    }
  }

  const search = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    setSearchResults(null)
    setSearchError('')
    try {
      const r = await csrfFetch('/api/admin/rag/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ query: searchQuery }),
      })
      const d = await r.json()
      if (!r.ok) { setSearchError(d.error || `Search failed (${r.status})`); return }
      setSearchResults(d.results || [])
    } catch {
      toast({ type: 'error', title: 'Search failed' })
    } finally {
      setSearching(false)
    }
  }

  if (!gate.ready || loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-8">
        <SkeletonText lines={2} />
        <SkeletonStats />
        <SkeletonCard />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-card"><Database className="h-5 w-5 text-primary" /></div>
          <div><h1 className="text-2xl font-bold">RAG & Embeddings</h1><p className="text-sm text-muted-foreground">Vector search for AI context retrieval</p></div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadStats} disabled={loading}><RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh</Button>
          <Button size="sm" onClick={reindex} disabled={indexing}>
            {indexing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1" />}
            Re-index
          </Button>
        </div>
      </div>

      {statsError && (
        <Card className="p-4 border-destructive/40 bg-destructive/5">
          <p className="text-sm text-destructive">{statsError}</p>
        </Card>
      )}

      {stats && (
        <Card className="p-6 border-border/60">
          <h2 className="text-sm font-semibold mb-4">Index Overview</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg bg-muted/30 p-4">
              <p className="text-xs text-muted-foreground">Total embeddings</p>
              <p className="text-2xl font-bold mt-1">{stats.total}</p>
            </div>
            {Object.entries(stats.bySource || {}).map(([source, count]) => (
              <div key={source} className="rounded-lg bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground capitalize">{source.replace(':', ' ')}</p>
                <p className="text-2xl font-bold mt-1">{count}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-6 border-border/60">
        <h2 className="text-sm font-semibold mb-4">Test Search</h2>
        <div className="flex gap-2 mb-4">
          <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search query..." onKeyDown={e => e.key === 'Enter' && search()} />
          <Button onClick={search} disabled={searching || !searchQuery.trim()}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
        {searchError && (
          <p className="mb-4 text-sm text-destructive bg-destructive/5 border border-destructive/30 rounded-lg px-3 py-2">{searchError}</p>
        )}
        {searchResults && (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {searchResults.length === 0 ? (
              <p className="text-sm text-muted-foreground">No matching results found.</p>
            ) : (
              searchResults.map((r, i) => (
                <div key={i} className="rounded-lg border border-border/60 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <Badge variant="outline" className="text-[10px]">{r.source}</Badge>
                    <span className="text-xs text-muted-foreground">{(r.score * 100).toFixed(0)}% match</span>
                  </div>
                  <p className="text-xs text-foreground line-clamp-3">{r.text}</p>
                </div>
              ))
            )}
          </div>
        )}
      </Card>

      <Card className="p-6 border-dashed border-muted-foreground/30">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground space-y-1">
            <p>RAG retrieves context from indexed problems, hackathons, and docs before each AI chat call. Embeddings use OpenAI <code className="bg-muted px-1 rounded">text-embedding-ada-002</code>.</p>
            <p>Configure your preferred AI model in <a href="/dashboard/admin/settings?section=llm" className="text-primary hover:underline">AI &amp; LLM Keys</a>. The selected model is used for all AI features.</p>
          </div>
        </div>
      </Card>
    </div>
  )
}
