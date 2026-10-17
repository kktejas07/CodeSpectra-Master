'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
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
import { Loader2, Newspaper, Plus, Trash2, Eye, Sparkles, ImageIcon, Globe } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { BLOG_CATEGORIES, type BlogCategoryId } from '@/lib/blog-categories'
import { SkeletonList } from '@/components/ui/skeleton-boneyard'
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'
import { FileText, CheckCircle2 } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

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

export default function AdminBlogPage() {
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

  /** Generate cover art — for an existing post (slug) or the create form (no slug). */
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
        body: JSON.stringify(
          slug ? { slug } : { title, excerpt, category },
        ),
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
      addToast({ type: 'success', title: 'Draft generated' })
    } catch (e) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'Generation failed' })
    } finally {
      setAiSlug(null)
    }
  }

  const [loadError, setLoadError] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/blog?status=all&limit=100', { cache: 'no-store' })
      if (!res.ok) throw new Error(`Failed to load posts (${res.status})`)
      const data = await res.json()
      setItems(data.items || [])
      setLoadError(false)
    } catch {
      setLoadError(true)
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
      <PageHeader
        illustration="inbox"
        title="Newsroom"
        description={
          <>
            Articles on the public{' '}
            <Link href="/blog" className="font-medium text-primary hover:underline" target="_blank">
              blog
            </Link>
            . Publish newsletters here too when they should stay readable for good.
          </>
        }
        icon={<Newspaper />}
        actions={
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
        }
      />

      {!loading && items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard label="Published" value={items.filter((p) => p.status === 'published').length} icon={<CheckCircle2 />} />
          <StatCard label="Drafts" value={items.filter((p) => p.status !== 'published').length} icon={<FileText />} />
        </div>
      )}

      {showForm && (
        <Panel className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="post-title">Title</Label>
              <Input id="post-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Article title" />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as BlogCategoryId)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BLOG_CATEGORIES.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="post-author">Author</Label>
              <Input id="post-author" value={authorName} onChange={(e) => setAuthorName(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="post-excerpt">Excerpt</Label>
              <Textarea id="post-excerpt" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={2} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="post-cover">Cover image</Label>
              <div className="flex gap-2">
                <Input
                  id="post-cover"
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
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverImage}
                  alt="Cover preview"
                  className="mt-1 h-32 w-full rounded-xl border border-border object-cover"
                />
              ) : null}
            </div>
            <div className="space-y-1.5 sm:col-span-2 mt-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <Label className="text-base flex items-center gap-2">
                    <Globe className="h-4 w-4" aria-hidden /> Live web research
                  </Label>
                  <p className="text-sm text-muted-foreground">Search the web for the latest breaking news on this topic before writing.</p>
                </div>
                <Switch checked={doResearch} onCheckedChange={setDoResearch} aria-label="Live web research" />
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
                  {aiSlug === '__body' && doResearch ? 'Researching and drafting…' : 'AI draft'}
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
      ) : loadError && items.length === 0 ? (
        <EmptyState illustration="error" title="Couldn't load posts" description="Check your connection and try again." actionLabel="Try again" onAction={() => void load()} />
      ) : items.length === 0 ? (
        <EmptyState illustration="inbox" title="No posts yet" description="Use New post to write your first article." />
      ) : (
        <div className="space-y-2">
          {items.map((p) => (
            <Panel key={p.id} className="flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center">
              <div className="flex flex-1 min-w-0 items-start sm:items-center gap-4">
                {p.cover_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.cover_image}
                    alt=""
                    className="h-14 w-24 shrink-0 rounded-lg border border-border object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-24 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
                    <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium text-foreground">{p.title}</p>
                    <Badge variant="secondary">{p.category}</Badge>
                    <Badge variant={p.status === 'published' ? 'default' : 'outline'} className="capitalize">{p.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground truncate">
                    /blog/{p.slug} · {p.read_minutes} min · {p.author_name}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 self-end sm:self-auto">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={aiSlug === p.slug}
                  onClick={() => void genCover(p.slug)}
                  title="Generate AI cover art from the article"
                >
                  {aiSlug === p.slug ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1 h-3.5 w-3.5 text-primary" />
                  )}
                  AI cover
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/blog/${p.slug}`} target="_blank">
                    <Eye className="mr-1 h-3.5 w-3.5" /> View
                  </Link>
                </Button>
                <Button variant="outline" size="sm" onClick={() => editPost(p)}>
                  Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void remove(p.slug)} aria-label={`Delete ${p.title}`} title="Delete">
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
