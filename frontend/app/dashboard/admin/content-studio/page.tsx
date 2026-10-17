'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Loader2,
  Newspaper,
  Radio,
  Plus,
  Trash2,
  Eye,
  Sparkles,
  ImageIcon,
  Globe,
  RefreshCw,
  Check,
  X,
  ExternalLink,
  Undo,
  FileText,
  Zap,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { BLOG_CATEGORIES, type BlogCategoryId } from '@/lib/blog-categories'
import { SkeletonList } from '@/components/ui/skeleton-boneyard'
import { EmptyState } from '@/components/ui/empty-state'

type Tab = 'newsroom' | 'signals'

type Post = {
  id: string
  slug: string
  title: string
  excerpt: string
  body: string
  category: string
  status: string
  author_name: string
  published_at?: string | null
  read_minutes: number
  cover_image?: string | null
}

type Draft = {
  id: string
  title: string
  excerpt: string
  body?: string
  category: string
  source_url: string
  source_feed: string
  angle?: string
  facts?: { claim: string; source_url: string; date?: string }[]
  source_urls?: string[]
  cover_image?: string | null
  status: string
  blog_slug?: string
  created_at: string
}

export default function ContentStudioPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [tab, setTab] = useState<Tab>('newsroom')

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Zap />}
        title="Content studio"
        description={
          <>
            Write original posts or turn RSS feeds into drafts for review. Everything publishes to{' '}
            <Link href="/blog" className="text-primary hover:underline" target="_blank">
              /blog
            </Link>
            .
          </>
        }
        className="mb-0"
      />

      {/* Tab Switcher */}
      <div className="flex gap-1 rounded-xl border border-border/60 bg-muted/40 p-1 w-fit">
        <button
          onClick={() => setTab('newsroom')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            tab === 'newsroom'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Newspaper className="h-4 w-4" />
          Newsroom
          <Badge variant="secondary" className="ml-1 text-xs">Manual</Badge>
        </button>
        <button
          onClick={() => setTab('signals')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            tab === 'signals'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Radio className="h-4 w-4" />
          Signals
          <Badge variant="secondary" className="ml-1 text-xs">Auto</Badge>
        </button>
      </div>

      {/* Tab Content */}
      {tab === 'newsroom' ? <NewsroomTab /> : <SignalsTab />}
    </div>
  )
}

/* ────────────────────────────────────────────────
   NEWSROOM TAB — Manual blog post creation
   ──────────────────────────────────────────────── */
function NewsroomTab() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [items, setItems] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const [title, setTitle] = useState('')
  const [excerpt, setExcerpt] = useState('')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState<BlogCategoryId>('signals')
  const [authorName, setAuthorName] = useState('CodeSpectra Editorial')
  const [coverImage, setCoverImage] = useState('')
  const [doResearch, setDoResearch] = useState(true)
  const [aiSlug, setAiSlug] = useState<string | null>(null)
  const [editingSlug, setEditingSlug] = useState<string | null>(null)

  // Auto-draft state
  const [autoTopic, setAutoTopic] = useState('')
  const [autoCategory, setAutoCategory] = useState<BlogCategoryId>('signals')
  const [autoGenerating, setAutoGenerating] = useState(false)

  const genCover = async (slug?: string) => {
    if (!slug && !title.trim()) {
      addToast({ type: 'error', title: 'Add a title first' })
      return
    }
    setAiSlug(slug || '__form')
    try {
      const res = await csrfFetch('/api/admin/blog/ai-cover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slug ? { slug } : { title, excerpt, category }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Generation failed')
      if (slug) {
        addToast({ type: 'success', title: 'Cover art updated' })
        await load()
      } else {
        setCoverImage(data.cover_image || '')
        addToast({ type: 'success', title: 'Cover generated' })
      }
    } catch (e) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'Generation failed' })
    } finally {
      setAiSlug(null)
    }
  }

  const genBody = async () => {
    if (!title.trim()) {
      addToast({ type: 'error', title: 'Add a title first' })
      return
    }
    setAiSlug('__body')
    try {
      const res = await csrfFetch('/api/admin/blog/ai-write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, excerpt, category, research: doResearch }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Generation failed')
      setBody(data.html || '')
      addToast({
        type: 'success',
        title: `Draft generated${data.facts ? ` (${data.facts} facts, ${data.sources} sources)` : ''}`,
      })
    } catch (e) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'Generation failed' })
    } finally {
      setAiSlug(null)
    }
  }

  const autoGenerateDraft = async () => {
    if (!autoTopic.trim()) {
      addToast({ type: 'error', title: 'Enter a topic first' })
      return
    }
    setAutoGenerating(true)
    try {
      const res = await csrfFetch('/api/admin/blog/auto-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: autoTopic, category: autoCategory }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Auto-draft failed')
      addToast({
        type: 'success',
        title: 'Draft created!',
        message: `"${data.title}" saved as draft (${data.facts} facts, ${data.sources} sources)`,
      })
      setAutoTopic('')
      await load()
    } catch (e) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'Auto-draft failed' })
    } finally {
      setAutoGenerating(false)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/blog?status=all&limit=100', { cache: 'no-store' })
      const data = await res.json()
      setItems(data.items || [])
    } catch {
      addToast({ type: 'error', title: 'Failed to load posts' })
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    if (gate.ready) void load()
  }, [gate.ready, load])

  if (!gate.ready) return null

  const savePost = async (publish: boolean) => {
    if (!title.trim()) {
      addToast({ type: 'error', title: 'Title required' })
      return
    }
    setSaving(true)
    try {
      const isEdit = !!editingSlug
      const url = isEdit ? `/api/blog/${encodeURIComponent(editingSlug)}` : '/api/blog'
      const method = isEdit ? 'PATCH' : 'POST'
      const res = await csrfFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          excerpt,
          body: body || `<p>${excerpt || title}</p>`,
          category,
          author_name: authorName,
          cover_image: coverImage || undefined,
          publish,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      addToast({ type: 'success', title: publish ? 'Published' : 'Draft saved' })
      setShowForm(false)
      setEditingSlug(null)
      setTitle('')
      setExcerpt('')
      setBody('')
      setCoverImage('')
      await load()
    } catch (e) {
      addToast({ type: 'error', title: String(e) })
    } finally {
      setSaving(false)
    }
  }

  const editPost = (p: Post) => {
    setEditingSlug(p.slug)
    setTitle(p.title || '')
    setExcerpt(p.excerpt || '')
    setBody(p.body || '')
    setCategory((p.category as BlogCategoryId) || 'signals')
    setAuthorName(p.author_name || 'CodeSpectra Editorial')
    setCoverImage(p.cover_image || '')
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const remove = async (slug: string) => {
    if (!confirm('Delete this post?')) return
    const res = await csrfFetch(`/api/blog/${encodeURIComponent(slug)}`, { method: 'DELETE' })
    if (!res.ok) {
      addToast({ type: 'error', title: 'Delete failed' })
      return
    }
    addToast({ type: 'success', title: 'Deleted' })
    await load()
  }

  return (
    <div className="space-y-6">
      {/* Auto-Generate Draft Card */}
      <Panel className="p-5 border-primary/20 bg-primary/5">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-primary/10 text-primary">
            <Zap className="h-6 w-6" />
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <h3 className="font-semibold text-lg">Generate a draft</h3>
              <p className="text-sm text-muted-foreground">
                Enter a topic or paste a headline. We research it on the web, write an original post with a fresh title and save it as a draft for you to review.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Input
                value={autoTopic}
                onChange={(e) => setAutoTopic(e.target.value)}
                placeholder="e.g. Model Cascade making LLM classification cheaper"
                className="flex-1 min-w-0 sm:min-w-[300px]"
                aria-label="Draft topic"
                onKeyDown={(e) => e.key === 'Enter' && autoGenerateDraft()}
              />
              <Select value={autoCategory} onValueChange={(v) => setAutoCategory(v as BlogCategoryId)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BLOG_CATEGORIES.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={autoGenerateDraft}
                disabled={autoGenerating || !autoTopic.trim()}
              >
                {autoGenerating ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-1 h-4 w-4" />
                )}
                {autoGenerating ? 'Generating...' : 'Generate draft'}
              </Button>
            </div>
            {autoGenerating && (
              <p className="text-xs text-muted-foreground motion-safe:animate-pulse">
                Researching the topic, writing the post and saving it as a draft...
              </p>
            )}
          </div>
        </div>
      </Panel>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Newspaper className="h-5 w-5 text-primary" /> Newsroom
          </h2>
          <p className="text-sm text-muted-foreground">
            Or write a post yourself, with AI help for the draft and cover image.
          </p>
        </div>
        <Button onClick={() => {
          setEditingSlug(null)
          setTitle('')
          setExcerpt('')
          setBody('')
          setCoverImage('')
          setShowForm((v) => !v)
        }}>
          <Plus className="mr-1 h-4 w-4" /> New post
        </Button>
      </div>

      {showForm && (
        <Panel className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Article title" />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as BlogCategoryId)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BLOG_CATEGORIES.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Author</Label>
              <Input value={authorName} onChange={(e) => setAuthorName(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Excerpt</Label>
              <Textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={2} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Cover image</Label>
              <div className="flex gap-2">
                <Input
                  value={coverImage}
                  onChange={(e) => setCoverImage(e.target.value)}
                  placeholder="https://… (or generate AI art from the title)"
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={aiSlug === '__form' || !title.trim()}
                  onClick={() => void genCover()}
                >
                  {aiSlug === '__form' ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1 h-4 w-4 text-primary" />
                  )}
                  Generate
                </Button>
              </div>
              {coverImage ? (
                <img src={coverImage} alt="Cover preview" className="mt-1 h-32 w-full rounded-xl border border-border object-cover" />
              ) : null}
            </div>
            <div className="space-y-1.5 sm:col-span-2 mt-4 pt-4 border-t">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <Label className="text-base flex items-center gap-2">
                    <Globe className="h-4 w-4 text-primary" /> Live web research
                  </Label>
                  <p className="text-sm text-muted-foreground">Reads full source articles, pulls out the facts and credits each source in the draft.</p>
                </div>
                <Switch checked={doResearch} onCheckedChange={setDoResearch} />
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <div className="flex items-center justify-between">
                <Label>Body</Label>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={aiSlug === '__body' || !title.trim()}
                  onClick={() => void genBody()}
                >
                  {aiSlug === '__body' ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1 h-3.5 w-3.5 text-primary" />
                  )}
                  {aiSlug === '__body' && doResearch ? 'Researching and drafting...' : 'AI draft'}
                </Button>
              </div>
              <RichTextEditor
                value={body}
                onChange={setBody}
                placeholder="Write your article here..."
                minHeight={300}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={saving} onClick={() => void savePost(true)}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              {editingSlug ? 'Update and publish' : 'Publish'}
            </Button>
            <Button variant="outline" disabled={saving} onClick={() => void savePost(false)}>
              Save draft
            </Button>
            <Button variant="ghost" onClick={() => {
              setShowForm(false)
              setEditingSlug(null)
              setTitle('')
              setExcerpt('')
              setBody('')
              setCoverImage('')
            }}>
              Cancel
            </Button>
          </div>
        </Panel>
      )}

      {loading ? (
        <SkeletonList count={3} />
      ) : items.length === 0 ? (
        <EmptyState title="No posts yet" description="Select New post or generate a draft above to get started." />
      ) : (
        <div className="space-y-2">
          {items.map((p) => (
            <Panel key={p.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl p-4">
              <div className="flex flex-1 min-w-0 items-start sm:items-center gap-4">
                {p.cover_image ? (
                  <img src={p.cover_image} alt="" className="h-14 w-24 shrink-0 rounded-lg border border-border object-cover" />
                ) : (
                  <div className="flex h-14 w-24 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
                    <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">{p.title}</p>
                    <Badge variant="secondary">{p.category}</Badge>
                    <Badge variant={p.status === 'published' ? 'success' : 'outline'} className="capitalize">{p.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground truncate">
                    /blog/{p.slug} · {p.read_minutes} min · {p.author_name}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                <Button variant="outline" size="sm" disabled={aiSlug === p.slug} onClick={() => void genCover(p.slug)}>
                  {aiSlug === p.slug ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5 text-primary" />}
                  AI cover
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/blog/${p.slug}`} target="_blank">
                    <Eye className="mr-1 h-3.5 w-3.5" /> View
                  </Link>
                </Button>
                <Button variant="outline" size="sm" onClick={() => editPost(p)}>Edit</Button>
                <Button variant="ghost" size="sm" onClick={() => void remove(p.slug)} aria-label="Delete post">
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  )
}

/* ────────────────────────────────────────────────
   SIGNALS TAB — Automated RSS pipeline
   ──────────────────────────────────────────────── */
function SignalsTab() {
  const addToast = useToast()
  const [items, setItems] = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [previewDraft, setPreviewDraft] = useState<Draft | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ action: 'delete' | 'unpublish'; id: string; message: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/signals', { cache: 'no-store' })
      const data = await res.json()
      setItems(data.items || [])
    } catch {
      addToast({ type: 'error', title: 'Failed to load drafts' })
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void load()
  }, [load])

  const run = async (action: 'approve' | 'reject' | 'ingest' | 'unpublish' | 'delete', id?: string) => {
    setBusy(action + (id || ''))
    try {
      const res = await csrfFetch('/api/admin/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        addToast({ type: 'error', title: data.error || 'Action failed' })
        return
      }
      if (action === 'ingest') {
        addToast({ type: 'success', title: `Ingested ${data.created ?? 0} draft(s)` })
      } else if (action === 'approve') {
        addToast({ type: 'success', title: 'Published to newsroom' })
      } else if (action === 'unpublish') {
        addToast({ type: 'success', title: 'Unpublished' })
      } else if (action === 'delete') {
        addToast({ type: 'success', title: 'Deleted' })
      } else {
        addToast({ type: 'success', title: 'Rejected' })
      }
      await load()
    } catch {
      addToast({ type: 'error', title: 'Request failed' })
    } finally {
      setBusy(null)
    }
  }

  const pending = items.filter((i) => i.status === 'pending')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Radio className="h-5 w-5 text-primary" /> Signals
          </h2>
          <p className="text-sm text-muted-foreground">
            We read RSS feeds, pull the facts from each article and write a draft. Nothing is published until you approve it.
          </p>
        </div>
        <Button onClick={() => void run('ingest')} disabled={busy === 'ingest'}>
          {busy === 'ingest' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
          Run ingest
        </Button>
      </div>

      {loading ? (
        <SkeletonList count={3} />
      ) : items.length === 0 ? (
        <Panel className="p-10 text-center text-sm text-muted-foreground">
          No drafts yet. Select <strong className="text-foreground">Run ingest</strong> to pull the latest public feeds.
        </Panel>
      ) : (
        <div className="space-y-3">
          <p className="text-xs tabular-nums text-muted-foreground">{pending.length} pending · {items.length} total</p>
          {items.map((d) => (
            <Panel key={d.id} className="space-y-2 rounded-2xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                {d.cover_image ? (
                  <img src={d.cover_image} alt="" className="h-20 w-36 shrink-0 rounded-lg border border-border object-cover" />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{d.title}</p>
                    <Badge variant="secondary">{d.category}</Badge>
                    <Badge variant={d.status === 'pending' ? 'default' : 'outline'} className="capitalize">{d.status}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{d.excerpt}</p>
                  {d.angle ? <p className="mt-1 text-[11px] text-muted-foreground">Angle: {d.angle}</p> : null}
                  {d.facts && d.facts.length > 0 ? (
                    <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
                      {d.facts.slice(0, 6).map((f, i) => (
                        <li key={i}>{f.claim}{f.date ? ` (${f.date})` : ''}</li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {d.source_feed} ·{' '}
                    {(d.source_urls?.length ? d.source_urls : [d.source_url]).map((u, i) => (
                      <span key={u}>
                        {i > 0 ? ' · ' : null}
                        <a href={u} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
                          source{d.source_urls && d.source_urls.length > 1 ? ` ${i + 1}` : ''} <ExternalLink className="h-3 w-3" />
                        </a>
                      </span>
                    ))}
                    {d.blog_slug ? (
                      <> · <Link href={`/blog/${d.blog_slug}`} className="text-primary hover:underline">/blog/{d.blog_slug}</Link></>
                    ) : null}
                  </p>
                </div>
                {d.status === 'pending' ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" disabled={!!busy} onClick={() => setPreviewDraft(d)}>
                      <Eye className="mr-1 h-3.5 w-3.5" /> Preview
                    </Button>
                    <Button size="sm" disabled={!!busy} onClick={() => void run('approve', d.id)}>
                      <Check className="mr-1 h-3.5 w-3.5" /> Publish
                    </Button>
                    <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void run('reject', d.id)}>
                      <X className="mr-1 h-3.5 w-3.5" /> Reject
                    </Button>
                    <Button size="sm" variant="destructive" disabled={!!busy} onClick={() => setConfirmAction({ action: 'delete', id: d.id, message: 'Delete this signal?' })}>
                      <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    {d.status === 'published' && (
                      <Button size="sm" variant="outline" disabled={!!busy} onClick={() => setConfirmAction({ action: 'unpublish', id: d.id, message: 'Unpublish this signal?' })}>
                        <Undo className="mr-1 h-3.5 w-3.5" /> Unpublish
                      </Button>
                    )}
                    <Button size="sm" variant="destructive" disabled={!!busy} onClick={() => setConfirmAction({ action: 'delete', id: d.id, message: 'Delete this signal entirely?' })}>
                      <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                    </Button>
                  </div>
                )}
              </div>
            </Panel>
          ))}
        </div>
      )}

      <Dialog open={!!previewDraft} onOpenChange={(open) => !open && setPreviewDraft(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewDraft?.title}</DialogTitle>
            <DialogDescription>{previewDraft?.category} · {previewDraft?.source_feed}</DialogDescription>
          </DialogHeader>
          <div className="mt-4 text-sm space-y-4">
            {previewDraft?.body ? (
              <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: previewDraft.body }} />
            ) : (
              <p className="text-muted-foreground italic">No body content generated.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmAction}
        title="Confirm action"
        message={confirmAction?.message || ''}
        confirmLabel="Confirm"
        onConfirm={() => {
          if (confirmAction) void run(confirmAction.action, confirmAction.id)
          setConfirmAction(null)
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  )
}
