'use client'

/**
 * /dashboard/admin/learn — Learn hub admin: review queue (preview, edit,
 * rewrite a section, approve / schedule / publish / reject), topics manager,
 * research source allowlist, generator settings and stats.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { BarChart3, BookOpenText, Eye, Loader2, Plus, Share2, Sparkles, Trash2 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SkeletonList } from '@/components/ui/skeleton-boneyard'
import {
  LEARN_CATEGORIES, LEARN_LANGUAGES, LEARN_LEVELS, LEARN_STATUSES, SHARE_CHANNELS, categoryLabel,
  type LearnPostDoc, type LearnSettings, type LearnSourceDoc, type LearnTopicDoc,
} from '@/lib/learn/types'
import { SHARE_LABELS } from '@/lib/learn/share'
import { PostEditor, scoreVariant } from './post-editor'

type QueueItem = Omit<LearnPostDoc, 'body'>
type TopicRow = LearnTopicDoc & { post: { status: string; slug: string } | null }

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await csrfFetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((d as { error?: string }).error || 'Request failed')
  return d as T
}

// ─── Queue ──────────────────────────────────────────────────────────────────

function QueueTab() {
  const addToast = useToast()
  const [status, setStatus] = useState<string>('draft')
  const [q, setQ] = useState('')
  const [data, setData] = useState<{ items: QueueItem[]; counts: Record<string, number> } | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [count, setCount] = useState('1')
  const [next, setNext] = useState<Array<{ id: string; title: string; category: string }>>([])

  const load = useCallback(async () => {
    try {
      const d = await api<{ items: QueueItem[]; counts: Record<string, number> }>(`/api/learn/admin/posts?status=${status}&q=${encodeURIComponent(q)}`)
      setData(d)
    } catch (e) {
      addToast({ type: 'error', title: (e as Error).message })
      setData({ items: [], counts: {} })
    }
  }, [status, q, addToast])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    api<{ next: Array<{ id: string; title: string; category: string }> }>('/api/learn/admin/generate').then((d) => setNext(d.next)).catch(() => setNext([]))
  }, [])

  const generate = async () => {
    setGenerating(true)
    try {
      const d = await api<{ results: Array<{ ok: boolean; topic: string; error?: string; score?: number }> }>('/api/learn/admin/generate', { method: 'POST', body: JSON.stringify({ count: Number(count) }) })
      const ok = d.results.filter((r) => r.ok)
      const bad = d.results.filter((r) => !r.ok)
      if (ok.length) addToast({ type: 'success', title: `${ok.length} draft${ok.length > 1 ? 's' : ''} ready for review` })
      for (const b of bad) addToast({ type: 'error', title: `${b.topic}: ${b.error}` })
      setStatus('draft')
      await load()
    } catch (e) {
      addToast({ type: 'error', title: (e as Error).message })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-5">
      <Panel className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="font-semibold text-foreground">Generate now</p>
          <p className="text-sm text-muted-foreground">
            The bot writes the next topics in the plan as drafts. {next.length ? <>Next up: {next.slice(0, 3).map((n) => n.title).join(' · ')}</> : null}
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label htmlFor="gen-count" className="text-xs">Posts</Label>
            <Select value={count} onValueChange={setCount}>
              <SelectTrigger id="gen-count" className="w-20"><SelectValue /></SelectTrigger>
              <SelectContent>{['1', '2', '3'].map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button onClick={generate} disabled={generating}>
            {generating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="mr-1.5 h-4 w-4" aria-hidden />}
            {generating ? 'Writing… (up to a few minutes)' : 'Generate'}
          </Button>
        </div>
      </Panel>

      <div className="flex flex-wrap items-center gap-2">
        {[...LEARN_STATUSES, 'all'].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            aria-pressed={status === s}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm capitalize transition-colors ${status === s ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:border-primary/40'}`}
          >
            {s}
            {s !== 'all' && data?.counts[s] ? <span className="tabular-nums opacity-80">{data.counts[s]}</span> : null}
          </button>
        ))}
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles" className="ml-auto h-9 w-full sm:w-56" aria-label="Search titles" />
      </div>

      {!data ? (
        <SkeletonList />
      ) : data.items.length === 0 ? (
        <EmptyState
          illustration="inbox"
          title={status === 'draft' ? 'No drafts waiting' : `No ${status === 'all' ? '' : status + ' '}posts`}
          description={status === 'draft' ? 'New drafts from the bot appear here for review. Use Generate to write one now.' : 'Posts move here as you review them.'}
        />
      ) : (
        <ul className="space-y-3">
          {data.items.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setOpenId(p.id)} className="w-full rounded-2xl border border-border/70 bg-card p-4 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="outline" className="capitalize">{p.status}</Badge>
                  <Badge variant={scoreVariant(p.quality.score)}>Quality <span className="tabular-nums">{p.quality.score}</span></Badge>
                  <span className="text-primary">{categoryLabel(p.category)}</span>
                  <span className="capitalize text-muted-foreground">{p.level}</span>
                  {p.quality.flags.length ? <span className="text-amber-700 dark:text-amber-400">{p.quality.flags.length} to check</span> : null}
                  {p.status === 'published' ? <span className="ml-auto inline-flex items-center gap-3 text-muted-foreground"><span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" aria-hidden /><span className="tabular-nums">{p.stats?.views ?? 0}</span></span><span className="inline-flex items-center gap-1"><Share2 className="h-3.5 w-3.5" aria-hidden /><span className="tabular-nums">{p.stats?.share_total ?? 0}</span></span></span> : null}
                </div>
                <p className="mt-2 font-semibold text-foreground">{p.title}</p>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.summary}</p>
              </button>
            </li>
          ))}
        </ul>
      )}

      <PostEditor postId={openId} onClose={() => setOpenId(null)} onChanged={load} />
    </div>
  )
}

// ─── Topics ─────────────────────────────────────────────────────────────────

function TopicsTab() {
  const addToast = useToast()
  const [topics, setTopics] = useState<TopicRow[] | null>(null)
  const [series, setSeries] = useState<string[]>([])
  const [cat, setCat] = useState<string>('all')
  const [form, setForm] = useState({ title: '', category: 'dsa', level: 'beginner', tags: '', series: '', series_order: '', refs: '' })
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const d = await api<{ topics: TopicRow[]; series: string[] }>(`/api/learn/admin/topics${cat !== 'all' ? `?category=${cat}` : ''}`)
      setTopics(d.topics)
      setSeries(d.series)
    } catch (e) {
      addToast({ type: 'error', title: (e as Error).message })
      setTopics([])
    }
  }, [cat, addToast])
  useEffect(() => { void load() }, [load])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api('/api/learn/admin/topics', { method: 'POST', body: JSON.stringify(form) })
      addToast({ type: 'success', title: 'Topic added' })
      setForm((f) => ({ ...f, title: '', tags: '', refs: '', series_order: '' }))
      await load()
    } catch (err) {
      addToast({ type: 'error', title: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  const patch = async (id: string, body: Record<string, unknown>) => {
    try {
      await api('/api/learn/admin/topics', { method: 'PATCH', body: JSON.stringify({ id, ...body }) })
      await load()
    } catch (err) {
      addToast({ type: 'error', title: (err as Error).message })
    }
  }

  const writeNow = async (t: TopicRow) => {
    setBusyId(t.id)
    try {
      const d = await api<{ results: Array<{ ok: boolean; error?: string }> }>('/api/learn/admin/generate', { method: 'POST', body: JSON.stringify({ topic_id: t.id }) })
      const r = d.results[0]
      addToast(r?.ok ? { type: 'success', title: 'Draft ready in the review queue' } : { type: 'error', title: r?.error || 'Generation failed' })
      await load()
    } catch (err) {
      addToast({ type: 'error', title: (err as Error).message })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-5">
      <Panel className="p-5">
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <Label htmlFor="t-title">New topic</Label>
            <Input id="t-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Kadane's algorithm" maxLength={140} required />
          </div>
          <div>
            <Label htmlFor="t-cat">Category</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger id="t-cat"><SelectValue /></SelectTrigger>
              <SelectContent>{LEARN_CATEGORIES.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="t-level">Level</Label>
            <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v })}>
              <SelectTrigger id="t-level"><SelectValue /></SelectTrigger>
              <SelectContent>{LEARN_LEVELS.map((l) => <SelectItem key={l} value={l} className="capitalize">{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="t-tags">Practice tags</Label>
            <Input id="t-tags" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="arrays, dynamic programming" />
          </div>
          <div>
            <Label htmlFor="t-series">Series (optional)</Label>
            <Input id="t-series" list="learn-series" value={form.series} onChange={(e) => setForm({ ...form, series: e.target.value })} placeholder="e.g. Graph algorithms" />
            <datalist id="learn-series">{series.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
          <div>
            <Label htmlFor="t-order">Part number</Label>
            <Input id="t-order" type="number" min={1} value={form.series_order} onChange={(e) => setForm({ ...form, series_order: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="t-refs">Reference URLs (allowlisted)</Label>
            <Input id="t-refs" value={form.refs} onChange={(e) => setForm({ ...form, refs: e.target.value })} placeholder="https://en.wikipedia.org/wiki/…" />
          </div>
          <div className="flex items-end sm:col-span-2 lg:col-span-4">
            <Button type="submit" disabled={saving || !form.title.trim()}><Plus className="mr-1.5 h-4 w-4" aria-hidden />Add topic</Button>
            <p className="ml-3 text-xs text-muted-foreground">Near-duplicate titles in the same category are refused.</p>
          </div>
        </form>
      </Panel>

      <div className="flex items-center gap-2">
        <Label htmlFor="t-filter" className="text-sm">Show</Label>
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger id="t-filter" className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {LEARN_CATEGORIES.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {topics ? <span className="text-sm text-muted-foreground"><span className="tabular-nums">{topics.length}</span> topics</span> : null}
      </div>

      {!topics ? <SkeletonList /> : topics.length === 0 ? (
        <EmptyState illustration="courses" title="No topics here" description="Add a topic above and the bot will plan it in." compact />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr><th className="px-3 py-2 font-medium">Topic</th><th className="px-3 py-2 font-medium">Level</th><th className="px-3 py-2 font-medium">Series</th><th className="px-3 py-2 font-medium">Post</th><th className="px-3 py-2 font-medium">Priority</th><th className="px-3 py-2 font-medium">On</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody>
              {topics.map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="px-3 py-2"><p className="font-medium text-foreground">{t.title}</p><p className="text-xs text-muted-foreground">{categoryLabel(t.category)}{t.tags.length ? ` · ${t.tags.join(', ')}` : ''}</p></td>
                  <td className="px-3 py-2 capitalize">{t.level}</td>
                  <td className="px-3 py-2 text-muted-foreground">{t.series ? `${t.series}${t.series_order ? ` #${t.series_order}` : ''}` : '—'}</td>
                  <td className="px-3 py-2">{t.post ? (t.post.status === 'published' ? <Link className="text-primary hover:underline" href={`/learn/${t.post.slug}`}>published</Link> : <span className="capitalize">{t.post.status}</span>) : <span className="text-muted-foreground">not written</span>}</td>
                  <td className="px-3 py-2">
                    <Input type="number" min={-10} max={10} defaultValue={t.priority} aria-label={`Priority for ${t.title}`} className="h-8 w-16 tabular-nums" onBlur={(e) => { const v = Number(e.target.value); if (v !== t.priority) void patch(t.id, { priority: v }) }} />
                  </td>
                  <td className="px-3 py-2"><Switch checked={t.enabled} onCheckedChange={(v) => patch(t.id, { enabled: v })} aria-label={`Plan ${t.title}`} /></td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => writeNow(t)} disabled={!!busyId || (!!t.post && t.post.status !== 'rejected')}>
                      {busyId === t.id ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Writing" /> : 'Write now'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Sources ────────────────────────────────────────────────────────────────

function SourcesTab() {
  const addToast = useToast()
  const [sources, setSources] = useState<LearnSourceDoc[] | null>(null)
  const [domain, setDomain] = useState('')
  const [label, setLabel] = useState('')

  const load = useCallback(async () => {
    try {
      setSources((await api<{ sources: LearnSourceDoc[] }>('/api/learn/admin/sources')).sources)
    } catch (e) {
      addToast({ type: 'error', title: (e as Error).message })
      setSources([])
    }
  }, [addToast])
  useEffect(() => { void load() }, [load])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api('/api/learn/admin/sources', { method: 'POST', body: JSON.stringify({ domain, label }) })
      setDomain('')
      setLabel('')
      await load()
    } catch (err) {
      addToast({ type: 'error', title: (err as Error).message })
    }
  }
  const toggle = async (s: LearnSourceDoc, enabled: boolean) => {
    try { await api('/api/learn/admin/sources', { method: 'PATCH', body: JSON.stringify({ id: s.id, enabled }) }); await load() } catch (err) { addToast({ type: 'error', title: (err as Error).message }) }
  }
  const remove = async (s: LearnSourceDoc) => {
    try { await api(`/api/learn/admin/sources?id=${encodeURIComponent(s.id)}`, { method: 'DELETE' }); await load() } catch (err) { addToast({ type: 'error', title: (err as Error).message }) }
  }

  return (
    <div className="space-y-5">
      <p className="max-w-[70ch] text-sm text-muted-foreground">
        The bot only reads reference pages on these sites (subdomains included), and only cites links on them. It uses the
        pages to check facts and stores the URLs as citations — never their text.
      </p>
      <Panel className="p-5">
        <form onSubmit={add} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1"><Label htmlFor="s-domain">Domain</Label><Input id="s-domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="docs.python.org" required /></div>
          <div className="flex-1"><Label htmlFor="s-label">Name</Label><Input id="s-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Python docs" /></div>
          <Button type="submit" disabled={!domain.trim()}><Plus className="mr-1.5 h-4 w-4" aria-hidden />Add source</Button>
        </form>
      </Panel>
      {!sources ? <SkeletonList /> : sources.length === 0 ? (
        <EmptyState illustration="search" title="No sources yet" description="Add official documentation sites the bot may learn from." compact />
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border">
          {sources.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1"><p className="font-medium text-foreground">{s.label}</p><p className="font-mono text-xs text-muted-foreground">{s.domain}</p></div>
              <Switch checked={s.enabled} onCheckedChange={(v) => toggle(s, v)} aria-label={`Use ${s.label}`} />
              <Button size="sm" variant="ghost" onClick={() => remove(s)} aria-label={`Remove ${s.label}`}><Trash2 className="h-4 w-4" aria-hidden /></Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Settings ───────────────────────────────────────────────────────────────

function SettingsTab() {
  const addToast = useToast()
  const [s, setS] = useState<LearnSettings | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api<{ settings: LearnSettings }>('/api/learn/admin/settings').then((d) => setS(d.settings)).catch((e) => addToast({ type: 'error', title: (e as Error).message }))
  }, [addToast])

  if (!s) return <SkeletonList />
  const save = async () => {
    setSaving(true)
    try {
      const d = await api<{ settings: LearnSettings }>('/api/learn/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({ enabled: s.enabled, posts_per_day: s.posts_per_day, run_hour_utc: s.run_hour_utc, languages: s.languages, research_enabled: s.research_enabled, auto_approve: s.auto_approve, auto_approve_min_score: s.auto_approve_min_score }),
      })
      setS(d.settings)
      addToast({ type: 'success', title: 'Settings saved' })
    } catch (e) {
      addToast({ type: 'error', title: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }
  const toggleLang = (id: string) => setS({ ...s, languages: s.languages.includes(id as never) ? s.languages.filter((l) => l !== id) : [...s.languages, id as never] })

  return (
    <Panel className="max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div><Label htmlFor="st-enabled">Daily writing</Label><p className="text-sm text-muted-foreground">The bot writes drafts every day from the hour below (UTC).</p></div>
        <Switch id="st-enabled" checked={s.enabled} onCheckedChange={(v) => setS({ ...s, enabled: v })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor="st-ppd">Posts per day</Label><Input id="st-ppd" type="number" min={0} max={10} value={s.posts_per_day} onChange={(e) => setS({ ...s, posts_per_day: Number(e.target.value) })} /></div>
        <div><Label htmlFor="st-hour">Start hour (UTC)</Label><Input id="st-hour" type="number" min={0} max={23} value={s.run_hour_utc} onChange={(e) => setS({ ...s, run_hour_utc: Number(e.target.value) })} /></div>
      </div>
      <fieldset>
        <legend className="text-sm font-medium text-foreground">Code example languages</legend>
        <p className="text-sm text-muted-foreground">Pick two to four. Algorithm posts include one example per language.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {LEARN_LANGUAGES.map((l) => (
            <button key={l.id} type="button" aria-pressed={s.languages.includes(l.id)} onClick={() => toggleLang(l.id)} className={`min-h-9 rounded-full border px-3.5 text-sm transition-colors ${s.languages.includes(l.id) ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:border-primary/40'}`}>{l.label}</button>
          ))}
        </div>
      </fieldset>
      <div className="flex items-center justify-between gap-4">
        <div><Label htmlFor="st-research">Research step</Label><p className="text-sm text-muted-foreground">Read allowlisted reference pages to check facts and pick citations.</p></div>
        <Switch id="st-research" checked={s.research_enabled} onCheckedChange={(v) => setS({ ...s, research_enabled: v })} />
      </div>
      <div className="space-y-3 rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between gap-4">
          <div><Label htmlFor="st-auto">Auto-approve</Label><p className="text-sm text-muted-foreground">Off by default: every post waits for an admin. When on, only high-scoring posts with no copy flags publish by themselves.</p></div>
          <Switch id="st-auto" checked={s.auto_approve} onCheckedChange={(v) => setS({ ...s, auto_approve: v })} />
        </div>
        {s.auto_approve && (
          <div className="max-w-40"><Label htmlFor="st-min">Minimum quality score</Label><Input id="st-min" type="number" min={50} max={100} value={s.auto_approve_min_score} onChange={(e) => setS({ ...s, auto_approve_min_score: Number(e.target.value) })} /></div>
        )}
      </div>
      <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : null}Save settings</Button>
    </Panel>
  )
}

// ─── Stats ──────────────────────────────────────────────────────────────────

type Stats = { posts: number; views: number; shares: number; byChannel: Record<string, number>; top: Array<{ slug: string; title: string; stats?: { views?: number; share_total?: number } }> }

function StatsTab() {
  const addToast = useToast()
  const [s, setS] = useState<Stats | null>(null)
  useEffect(() => {
    api<Stats>('/api/learn/admin/stats').then(setS).catch((e) => addToast({ type: 'error', title: (e as Error).message }))
  }, [addToast])
  if (!s) return <SkeletonList />
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Published posts" value={s.posts} icon={<BookOpenText />} />
        <StatCard label="Views" value={s.views.toLocaleString()} icon={<Eye />} />
        <StatCard label="Shares" value={s.shares.toLocaleString()} icon={<Share2 />} />
      </div>
      <Panel className="p-5">
        <h3 className="font-semibold text-foreground">Shares by network</h3>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SHARE_CHANNELS.map((c) => (
            <div key={c} className="rounded-xl border border-border p-3"><dt className="text-xs text-muted-foreground">{SHARE_LABELS[c]}</dt><dd className="text-lg font-semibold tabular-nums text-foreground">{s.byChannel[c] ?? 0}</dd></div>
          ))}
        </dl>
      </Panel>
      <Panel className="p-5">
        <h3 className="font-semibold text-foreground">Most read</h3>
        {s.top.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Nothing published yet.</p> : (
          <ol className="mt-3 space-y-2">
            {s.top.map((t) => (
              <li key={t.slug} className="flex items-center gap-3 text-sm">
                <Link href={`/learn/${t.slug}`} className="min-w-0 flex-1 truncate text-primary hover:underline">{t.title}</Link>
                <span className="tabular-nums text-muted-foreground">{t.stats?.views ?? 0} views</span>
                <span className="tabular-nums text-muted-foreground">{t.stats?.share_total ?? 0} shares</span>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  )
}

export default function AdminLearnPage() {
  const gate = usePageGuard('superadmin')
  if (!gate.ready) return null
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Learn hub"
        description="The bot writes original explainers on coding topics; nothing goes live until you approve it."
        icon={<BookOpenText />}
        actions={<Link href="/learn" target="_blank" className="text-sm font-medium text-primary hover:underline">Open the public hub</Link>}
      />
      <Tabs defaultValue="queue">
        <TabsList className="mb-5 flex-wrap">
          <TabsTrigger value="queue">Review queue</TabsTrigger>
          <TabsTrigger value="topics">Topics</TabsTrigger>
          <TabsTrigger value="sources">Sources</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="stats"><BarChart3 className="mr-1 h-4 w-4" aria-hidden />Stats</TabsTrigger>
        </TabsList>
        <TabsContent value="queue"><QueueTab /></TabsContent>
        <TabsContent value="topics"><TopicsTab /></TabsContent>
        <TabsContent value="sources"><SourcesTab /></TabsContent>
        <TabsContent value="settings"><SettingsTab /></TabsContent>
        <TabsContent value="stats"><StatsTab /></TabsContent>
      </Tabs>
    </div>
  )
}
