'use client'

import { useEffect, useState, useCallback } from 'react'
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
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'
import { isSubmitEnter } from '@/lib/keyboard'

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
      <div className="space-y-8">
        <SkeletonText lines={2} />
        <SkeletonStats />
        <SkeletonCard />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        illustration="ai"
        title="AI search index"
        description="The content AI features look up before they answer: problems, hackathons and docs."
        icon={<Database />}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={loadStats} disabled={loading}><RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh</Button>
            <Button size="sm" onClick={reindex} disabled={indexing}>
              {indexing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1" />}
              Re-index
            </Button>
          </>
        }
      />

      {statsError && (
        <Panel className="border-destructive/40 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">{statsError}</p>
        </Panel>
      )}

      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Indexed items" value={stats.total} icon={<Database />} />
          {Object.entries(stats.bySource || {}).map(([source, count]) => (
            <StatCard key={source} label={<span className="capitalize">{source.replace(':', ' ')}</span>} value={count} />
          ))}
        </div>
      )}

      <Panel>
        <h2 className="mb-1 text-base font-semibold text-foreground">Try a search</h2>
        <p className="mb-4 text-sm text-muted-foreground">See what the AI would find for a question.</p>
        <div className="flex gap-2 mb-4">
          <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search query..." aria-label="Search query" onKeyDown={e => isSubmitEnter(e) && search()} />
          <Button onClick={search} disabled={searching || !searchQuery.trim()} aria-label="Search">
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
                <div key={i} className="rounded-xl border border-border/70 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <Badge variant="outline" className="text-[10px]">{r.source}</Badge>
                    <span className="text-xs tabular-nums text-muted-foreground">{(r.score * 100).toFixed(0)}% match</span>
                  </div>
                  <p className="text-xs text-foreground line-clamp-3">{r.text}</p>
                </div>
              ))
            )}
          </div>
        )}
      </Panel>

      <Panel className="border-dashed bg-muted/30 shadow-none">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" aria-hidden />
          <div className="text-sm text-muted-foreground space-y-1">
            <p>Before each AI chat reply, the platform looks up related problems, hackathons and docs from this index. Items are indexed with OpenAI <code className="bg-muted px-1 rounded">text-embedding-ada-002</code>.</p>
            <p>Choose the AI model in <a href="/dashboard/admin/settings?section=llm" className="text-primary hover:underline">AI and LLM keys</a>. That model is used for every AI feature.</p>
          </div>
        </div>
      </Panel>
    </div>
  )
}
