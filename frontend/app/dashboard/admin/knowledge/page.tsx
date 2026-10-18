'use client'

/**
 * Knowledge sources for the admin copilot (lib/rag): what's indexed, upload
 * company documents, reindex, and try a search with citations.
 * Superadmin: whole platform. Company admins: their organisation only (APIs scope it).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  LibraryBig, RefreshCw, Upload, Search, Trash2, Loader2, FileText, Layers, Sparkles, Activity, ExternalLink,
} from 'lucide-react'
import { PageHeader, Panel, Section, StatCard } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { useConfirm } from '@/lib/confirm-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { SOURCE_TYPE_LABELS, TENANT_TYPES, type KnowledgeSourceType } from '@/lib/rag/types'
import { cn } from '@/lib/utils'
import { TenantPicker } from '@/components/agent/tenant-picker'

type Status = 'queued' | 'indexing' | 'ready' | 'failed'

interface SourceRow {
  id: string
  type: KnowledgeSourceType
  source_id: string
  tenant_id: string | null
  title: string
  url: string | null
  status: Status
  error: string | null
  chunk_count: number
  embedding_model: string | null
  embedding_missing: boolean
  updated_at: string
  indexed_at: string | null
  deletable: boolean
}

interface Stats {
  sources: number
  chunks: number
  embedded_chunks: number
  by_type: { type: KnowledgeSourceType; sources: number; chunks: number; ready: number; failed: number; queued: number }[]
  by_status: Record<string, number>
  models: string[]
  embedding_available: boolean
  vector_backend: 'atlas' | 'in_process'
  searches_7d: number
}

interface Hit {
  chunk_id: string
  source_type: KnowledgeSourceType
  source_id: string
  title: string
  url: string | null
  snippet: string
  score: number
}

const STATUS_LABEL: Record<Status, string> = { queued: 'Queued', indexing: 'Indexing', ready: 'Ready', failed: 'Failed' }
const STATUS_CLASS: Record<Status, string> = {
  queued: 'border-border bg-muted text-muted-foreground',
  indexing: 'border-primary/30 bg-primary/10 text-primary',
  ready: 'border-green-600/30 bg-green-500/10 text-green-700 dark:text-green-400',
  failed: 'border-red-600/30 bg-red-500/10 text-red-700 dark:text-red-400',
}
const UPLOAD_KINDS = [
  { value: 'jd', label: 'Job description' },
  { value: 'rubric', label: 'Rubric' },
  { value: 'policy', label: 'Policy' },
  { value: 'other', label: 'Other document' },
]
const ACCEPT = '.pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown'
const PAGE_SIZE = 25

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** Render **bold** markers from the snippet as <mark> without injecting HTML. */
function Snippet({ text }: { text: string }) {
  const parts = text.split(/\*\*/)
  return (
    <p className="text-sm leading-relaxed text-muted-foreground">
      {parts.map((p, i) => (i % 2 === 1
        ? <mark key={i} className="rounded bg-primary/15 px-0.5 font-medium text-foreground">{p}</mark>
        : <span key={i}>{p}</span>))}
    </p>
  )
}

function StatusPill({ status }: { status: Status }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', STATUS_CLASS[status])}>
      {status === 'indexing' && <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden />}
      {STATUS_LABEL[status]}
    </span>
  )
}

export default function KnowledgePage() {
  const gate = usePageGuard('/dashboard/admin/knowledge')
  const addToast = useToast()
  const confirm = useConfirm()
  const isSuper = gate.user?.role === 'superadmin'
  /** Superadmin only: narrow sources, search, reindex and uploads to one organisation (null = whole platform). */
  const [scopeTenant, setScopeTenant] = useState<string | null>(null)
  const tenantParam = isSuper && scopeTenant ? scopeTenant : null

  const [stats, setStats] = useState<Stats | null>(null)
  const [rows, setRows] = useState<SourceRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [titleFilter, setTitleFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [reindexing, setReindexing] = useState(false)

  const [query, setQuery] = useState('')
  const [searchType, setSearchType] = useState<string>('all')
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')

  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [upTitle, setUpTitle] = useState('')
  const [upKind, setUpKind] = useState('jd')
  const [upTags, setUpTags] = useState('')
  const [upFile, setUpFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadStats = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/knowledge/stats', { credentials: 'include' })
      if (r.ok) setStats(await r.json())
    } catch { /* stats are optional */ }
  }, [])

  const loadSources = useCallback(async () => {
    setLoading(true)
    try {
      const sp = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
      if (typeFilter !== 'all') sp.set('type', typeFilter)
      if (statusFilter !== 'all') sp.set('status', statusFilter)
      if (titleFilter.trim()) sp.set('q', titleFilter.trim())
      if (tenantParam) sp.set('tenant', tenantParam)
      const r = await fetch(`/api/admin/knowledge/sources?${sp}`, { credentials: 'include' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Couldn't load sources (${r.status})`)
      setRows(d.rows || [])
      setTotal(d.total || 0)
      setLoadError('')
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load sources")
    } finally {
      setLoading(false)
    }
  }, [page, typeFilter, statusFilter, titleFilter, tenantParam])

  useEffect(() => {
    if (!gate.ready) return
    void loadStats()
  }, [gate.ready, loadStats])

  useEffect(() => {
    if (!gate.ready) return
    const t = setTimeout(() => { void loadSources() }, titleFilter ? 300 : 0)
    return () => clearTimeout(t)
  }, [gate.ready, loadSources, titleFilter])

  // While anything is queued or indexing, refresh every 10 s.
  const pending = (stats?.by_status.queued ?? 0) + (stats?.by_status.indexing ?? 0)
  useEffect(() => {
    if (!gate.ready || pending === 0) return
    const t = setInterval(() => { void loadStats(); void loadSources() }, 10_000)
    return () => clearInterval(t)
  }, [gate.ready, pending, loadStats, loadSources])

  const reindexAll = async () => {
    const ok = await confirm({
      title: isSuper ? (tenantParam ? 'Reindex this organisation?' : 'Reindex all knowledge?') : 'Reindex your organisation?',
      description: isSuper && !tenantParam
        ? 'Every source on the platform is queued. Unchanged content is skipped, so this mostly costs database reads.'
        : "Your organisation's tests, results, events, uploads and candidate summaries are queued. Unchanged content is skipped.",
      confirmText: 'Reindex',
    })
    if (!ok) return
    setReindexing(true)
    try {
      const r = await csrfFetch('/api/admin/knowledge/reindex', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tenantParam ? { tenant: tenantParam } : {}),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Reindex failed')
      addToast({ type: 'success', title: `Queued ${d.queued ?? 0} sources`, message: 'They update over the next few minutes.' })
      void loadStats()
      void loadSources()
    } catch (e) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'Reindex failed' })
    } finally {
      setReindexing(false)
    }
  }

  const reindexOne = async (row: SourceRow) => {
    setBusyId(row.id)
    try {
      const r = await csrfFetch(`/api/admin/knowledge/sources/${encodeURIComponent(row.id)}`, { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Reindex failed')
      addToast({ type: 'success', title: d.chunks ? `Reindexed: ${d.chunks} chunks` : 'Source removed — it no longer exists' })
      void loadSources()
      void loadStats()
    } catch (e) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'Reindex failed' })
    } finally {
      setBusyId(null)
    }
  }

  const deleteOne = async (row: SourceRow) => {
    const ok = await confirm({
      title: 'Delete this document?',
      description: `“${row.title}” and its search index are removed. The copilot won't use it any more.`,
      confirmText: 'Delete',
      destructive: true,
    })
    if (!ok) return
    setBusyId(row.id)
    try {
      const r = await csrfFetch(`/api/admin/knowledge/sources/${encodeURIComponent(row.id)}`, { method: 'DELETE' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Delete failed')
      addToast({ type: 'success', title: 'Document deleted' })
      setRows((prev) => prev.filter((x) => x.id !== row.id))
      void loadStats()
    } catch (e) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'Delete failed' })
    } finally {
      setBusyId(null)
    }
  }

  const runSearch = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setSearchError('')
    try {
      const r = await csrfFetch('/api/admin/knowledge/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit: 8, ...(searchType !== 'all' ? { types: [searchType] } : {}), ...(tenantParam ? { tenant: tenantParam } : {}) }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Search failed')
      setHits(d.hits || [])
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed')
      setHits(null)
    } finally {
      setSearching(false)
    }
  }

  const resetUpload = () => {
    setUpTitle(''); setUpKind('jd'); setUpTags(''); setUpFile(null); setUploadError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const submitUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!upFile) { setUploadError('Choose a file to upload.'); return }
    if (upFile.size > 10 * 1024 * 1024) { setUploadError('Files can be up to 10 MB.'); return }
    setUploading(true)
    setUploadError('')
    try {
      const fd = new FormData()
      fd.set('file', upFile)
      fd.set('title', upTitle)
      fd.set('kind', upKind)
      fd.set('tags', upTags)
      if (tenantParam) fd.set('tenant', tenantParam)
      const r = await csrfFetch('/api/admin/knowledge/upload', { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Upload failed')
      addToast({
        type: 'success',
        title: d.status === 'ready' ? `Uploaded and indexed (${d.chunks} chunks)` : 'Uploaded — indexing shortly',
        ...(d.prompt_flags?.length ? { message: 'Some text looks like instructions to an AI. The copilot treats it as plain document text.' } : {}),
      })
      setUploadOpen(false)
      resetUpload()
      void loadSources()
      void loadStats()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const allTypes = Object.keys(SOURCE_TYPE_LABELS) as KnowledgeSourceType[]
  // Tenant admins search public help/library content too, but only list their own organisation's sources.
  const searchTypeOptions = useMemo(() => allTypes.filter((t) => isSuper || t !== 'question'), [isSuper]) // eslint-disable-line react-hooks/exhaustive-deps
  const typeOptions = useMemo(() => (isSuper ? allTypes : TENANT_TYPES), [isSuper]) // eslint-disable-line react-hooks/exhaustive-deps
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const coverage = stats && stats.chunks > 0 ? Math.round((stats.embedded_chunks / stats.chunks) * 100) : null
  const filtersActive = typeFilter !== 'all' || statusFilter !== 'all' || !!titleFilter.trim()

  if (!gate.ready) return null

  return (
    <div className="space-y-8">
      <PageHeader
        icon={<LibraryBig />}
        title="Knowledge"
        description={isSuper
          ? 'What the AI copilot can look up: platform content, help pages and every organisation’s data. Results always stay within the asker’s organisation.'
          : 'What the AI copilot can look up for your organisation: your tests, results, events, candidates and the documents you upload, plus public help pages.'}
        actions={
          <>
            {isSuper && (
              <TenantPicker
                id="knowledge-scope"
                value={scopeTenant}
                onChange={(t) => { setScopeTenant(t); setPage(1); setHits(null) }}
              />
            )}
            <Button variant="outline" onClick={reindexAll} disabled={reindexing}>
              {reindexing ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <RefreshCw aria-hidden />}
              {isSuper ? (tenantParam ? 'Reindex organisation' : 'Reindex everything') : 'Reindex my organisation'}
            </Button>
            <Button onClick={() => { resetUpload(); setUploadOpen(true) }} className="min-h-11 sm:min-h-9">
              <Upload aria-hidden /> Upload document
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Sources" value={stats ? stats.sources.toLocaleString() : '—'} icon={<FileText />} hint={pending ? `${pending} waiting to index` : undefined} />
        <StatCard label="Searchable chunks" value={stats ? stats.chunks.toLocaleString() : '—'} icon={<Layers />} />
        <StatCard
          label="Semantic coverage"
          value={coverage === null ? '—' : `${coverage}%`}
          icon={<Sparkles />}
          hint={stats ? (stats.embedding_available ? `${stats.vector_backend === 'atlas' ? 'Atlas vector search' : 'In-app vector search'}` : 'No embedding key — keyword search only') : undefined}
        />
        <StatCard label="Searches, last 7 days" value={stats ? stats.searches_7d.toLocaleString() : '—'} icon={<Activity />} />
      </div>

      <Panel>
        <Section title="Try a search" description="See what the copilot would find. Results respect your access, and each one links to its source.">
          <form onSubmit={runSearch} className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. what does our backend rubric say about code quality?"
                aria-label="Search knowledge"
                className="pl-9"
                maxLength={500}
              />
            </div>
            <Select value={searchType} onValueChange={setSearchType}>
              <SelectTrigger className="sm:w-48" aria-label="Limit to a type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {searchTypeOptions.map((t) => <SelectItem key={t} value={t}>{SOURCE_TYPE_LABELS[t]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="submit" disabled={searching || !query.trim()} className="min-h-11 sm:min-h-9">
              {searching ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Search aria-hidden />} Search
            </Button>
          </form>
          {searchError && <p className="text-sm text-red-700 dark:text-red-400" role="alert">{searchError}</p>}
          {hits && hits.length === 0 && (
            <EmptyState compact illustration="search" title="Nothing found" description="Try other words, or check that the content is indexed below." />
          )}
          {hits && hits.length > 0 && (
            <ol className="space-y-3">
              {hits.map((h, i) => (
                <li key={h.chunk_id} className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold tabular-nums text-muted-foreground">[{i + 1}]</span>
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{SOURCE_TYPE_LABELS[h.source_type]}</span>
                    {h.url ? (
                      <Link href={h.url} className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary hover:underline">
                        {h.title} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      </Link>
                    ) : (
                      <span className="font-medium text-foreground">{h.title}</span>
                    )}
                  </div>
                  <Snippet text={h.snippet} />
                </li>
              ))}
            </ol>
          )}
        </Section>
      </Panel>

      {stats && stats.by_type.length > 0 && (
        <Section title="Coverage" description="Indexed sources by type.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {stats.by_type.map((t) => (
              <button
                key={t.type}
                type="button"
                onClick={() => { setTypeFilter(t.type); setPage(1) }}
                className="rounded-2xl border border-border/70 bg-card p-4 text-left transition-colors duration-200 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <p className="text-sm font-medium text-muted-foreground">{SOURCE_TYPE_LABELS[t.type]}</p>
                <p className="text-xl font-bold tabular-nums text-foreground">{t.sources.toLocaleString()}</p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {t.chunks.toLocaleString()} chunks
                  {t.queued ? ` · ${t.queued} waiting` : ''}
                  {t.failed ? <span className="text-red-700 dark:text-red-400"> · {t.failed} failed</span> : null}
                </p>
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section title="Sources">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            value={titleFilter}
            onChange={(e) => { setTitleFilter(e.target.value); setPage(1) }}
            placeholder="Filter by title"
            aria-label="Filter by title"
            className="sm:max-w-xs"
          />
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1) }}>
            <SelectTrigger className="sm:w-48" aria-label="Type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {typeOptions.map((t) => <SelectItem key={t} value={t}>{SOURCE_TYPE_LABELS[t]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
            <SelectTrigger className="sm:w-40" aria-label="Status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              {(Object.keys(STATUS_LABEL) as Status[]).map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={() => { setTypeFilter('all'); setStatusFilter('all'); setTitleFilter(''); setPage(1) }}>
              Clear filters
            </Button>
          )}
        </div>

        {loadError && <p className="text-sm text-red-700 dark:text-red-400" role="alert">{loadError}</p>}

        {!loading && !loadError && rows.length === 0 ? (
          filtersActive ? (
            <EmptyState illustration="search" title="No sources match" description="Try another type or status, or clear the filters." actionLabel="Clear filters" onAction={() => { setTypeFilter('all'); setStatusFilter('all'); setTitleFilter('') }} />
          ) : (
            <EmptyState
              illustration="upload"
              title="Nothing indexed yet"
              description={isSuper
                ? 'Reindex to pull in problems, courses, help pages and organisation data, or upload a document.'
                : 'Reindex to pull in your tests, results and events, or upload a job description, rubric or policy.'}
              actionLabel="Reindex now"
              onAction={reindexAll}
            />
          )
        ) : (
          <Panel className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3">Title</th>
                    <th scope="col" className="px-4 py-3">Type</th>
                    <th scope="col" className="px-4 py-3">Status</th>
                    <th scope="col" className="px-4 py-3 text-right">Chunks</th>
                    <th scope="col" className="px-4 py-3">Updated</th>
                    <th scope="col" className="px-4 py-3 text-right"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading && rows.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin motion-reduce:animate-none" aria-label="Loading" /></td></tr>
                  )}
                  {rows.map((r) => (
                    <tr key={r.id} className="align-top">
                      <td className="max-w-[360px] px-4 py-3">
                        {r.url ? (
                          <Link href={r.url} className="font-medium text-foreground hover:text-primary hover:underline">{r.title}</Link>
                        ) : (
                          <span className="font-medium text-foreground">{r.title}</span>
                        )}
                        {isSuper && r.tenant_id && <p className="font-mono text-xs text-muted-foreground">Org {r.tenant_id}</p>}
                        {r.error && <p className="mt-1 text-xs text-red-700 dark:text-red-400">{r.error}</p>}
                        {r.embedding_missing && !r.error && <p className="mt-1 text-xs text-muted-foreground">Keyword search only (no embedding key when indexed)</p>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{SOURCE_TYPE_LABELS[r.type] ?? r.type}</td>
                      <td className="px-4 py-3"><StatusPill status={r.status} /></td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.chunk_count}</td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">{formatDate(r.indexed_at ?? r.updated_at)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="inline-flex gap-1">
                          <Button variant="ghost" size="icon-sm" onClick={() => reindexOne(r)} disabled={busyId === r.id} aria-label={`Reindex ${r.title}`} title="Reindex">
                            {busyId === r.id ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <RefreshCw aria-hidden />}
                          </Button>
                          {r.deletable && (
                            <Button variant="ghost" size="icon-sm" onClick={() => deleteOne(r)} disabled={busyId === r.id} aria-label={`Delete ${r.title}`} title="Delete" className="text-red-700 hover:text-red-700 dark:text-red-400">
                              <Trash2 aria-hidden />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
                <span className="tabular-nums">Page {page} of {pages} · {total.toLocaleString()} sources</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </Panel>
        )}
      </Section>

      <Dialog open={uploadOpen} onOpenChange={(o) => { if (!uploading) setUploadOpen(o) }}>
        <DialogContent>
          <form onSubmit={submitUpload} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Upload a document</DialogTitle>
              <DialogDescription>
                PDF, DOCX, TXT or Markdown, up to 10 MB. Files are virus-scanned, and only {isSuper ? (tenantParam ? 'that organisation’s admins' : 'the platform team') : 'your organisation’s admins'} can search them.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="kn-file">File</Label>
              <Input id="kn-file" ref={fileRef} type="file" accept={ACCEPT} onChange={(e) => setUpFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="kn-title">Title</Label>
              <Input id="kn-title" value={upTitle} onChange={(e) => setUpTitle(e.target.value)} placeholder="Defaults to the file name" maxLength={200} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="kn-kind">Kind</Label>
                <Select value={upKind} onValueChange={setUpKind}>
                  <SelectTrigger id="kn-kind"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UPLOAD_KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="kn-tags">Tags</Label>
                <Input id="kn-tags" value={upTags} onChange={(e) => setUpTags(e.target.value)} placeholder="backend, senior" maxLength={300} />
              </div>
            </div>
            {uploadError && <p className="text-sm text-red-700 dark:text-red-400" role="alert">{uploadError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setUploadOpen(false)} disabled={uploading}>Cancel</Button>
              <Button type="submit" disabled={uploading || !upFile} className="min-h-11 sm:min-h-9">
                {uploading ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Upload aria-hidden />}
                {uploading ? 'Uploading…' : 'Upload'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
