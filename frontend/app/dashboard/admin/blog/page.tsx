'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
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
import { Loader2, Newspaper, Plus, Trash2, Eye, Sparkles, ImageIcon } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { BLOG_CATEGORIES, type BlogCategoryId } from '@/lib/blog-categories'

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
        body: JSON.stringify({ title, excerpt, category }),
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Newspaper className="h-6 w-6 text-teal-600" /> Newsroom
          </h1>
          <p className="text-sm text-muted-foreground">
            Public articles at{' '}
            <Link href="/blog" className="text-teal-600 hover:underline" target="_blank">
              /blog
            </Link>
            . Prefer publishing newsletters here when they should live forever.
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
        <Card className="space-y-4 p-5">
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
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
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
                    <Sparkles className="mr-1 h-4 w-4 text-teal-500" />
                  )}
                  Generate
                </Button>
              </div>
              {coverImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverImage}
                  alt="Cover preview"
                  className="mt-1 h-32 w-full rounded-md border object-cover"
                />
              ) : null}
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
                    <Sparkles className="mr-1 h-3.5 w-3.5 text-teal-500" />
                  )}
                  AI Draft
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
              {editingSlug ? 'Update & Publish' : 'Publish'}
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
        </Card>
      )}

      {loading ? (
        <Card className="flex h-28 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </Card>
      ) : items.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">No posts yet.</Card>
      ) : (
        <div className="space-y-2">
          {items.map((p) => (
            <Card key={p.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4">
              <div className="flex flex-1 min-w-0 items-start sm:items-center gap-4">
                {p.cover_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.cover_image}
                    alt=""
                    className="h-14 w-24 shrink-0 rounded-md border object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-24 shrink-0 items-center justify-center rounded-md border bg-muted/40">
                    <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">{p.title}</p>
                    <Badge variant="secondary">{p.category}</Badge>
                    <Badge variant={p.status === 'published' ? 'default' : 'outline'}>{p.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground truncate">
                    /blog/{p.slug} · {p.read_minutes} min · {p.author_name}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
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
                    <Sparkles className="mr-1 h-3.5 w-3.5 text-teal-500" />
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
                <Button variant="ghost" size="sm" onClick={() => void remove(p.slug)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
