'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Plus, Eye, Trash2, Check } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { EbookCoverCard, type EbookCardData } from '@/components/resources/ebook-cover-card'

type AdminEbook = EbookCardData & { id: string; status: string }

export default function AdminResourcesPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [items, setItems] = useState<AdminEbook[]>([])
  const [loading, setLoading] = useState(true)
  const [topic, setTopic] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/resources/ebooks?all=1', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) =>
        setItems(
          (d.items || []).map((e: Record<string, unknown>) => ({
            id: String(e.id || ''),
            slug: String(e.slug || ''),
            title: String(e.title || ''),
            subtitle: e.subtitle ? String(e.subtitle) : undefined,
            topic: e.topic ? String(e.topic) : undefined,
            coverTheme: (e.coverTheme as EbookCardData['coverTheme']) || 'violet',
            readMinutes: typeof e.readMinutes === 'number' ? e.readMinutes : 5,
            status: String(e.status || 'draft'),
            pageCount: typeof e.pageCount === 'number' ? e.pageCount : undefined,
          })),
        ),
      )
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!gate.ready) return
    void load()
  }, [gate.ready, load])

  async function generate() {
    if (!topic.trim() || busy) return
    setBusy(true)
    try {
      const r = await csrfFetch('/api/resources/ebooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), title: title.trim() || undefined, useAi: true }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Generate failed')
      addToast({ type: 'success', title: d.usedAi ? 'Draft generated with AI' : 'Draft generated from template' })
      setTopic('')
      setTitle('')
      void load()
    } catch (e) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'Generate failed' })
    } finally {
      setBusy(false)
    }
  }

  async function setStatus(slug: string, status: 'published' | 'draft' | 'archived') {
    const r = await csrfFetch(`/api/resources/ebooks/${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      addToast({ type: 'error', title: d.error || 'Update failed' })
      return
    }
    addToast({ type: 'success', title: `Marked ${status}` })
    void load()
  }

  async function remove(slug: string) {
    if (!confirm(`Delete ebook “${slug}”?`)) return
    const r = await csrfFetch(`/api/resources/ebooks/${encodeURIComponent(slug)}`, { method: 'DELETE' })
    if (!r.ok) {
      addToast({ type: 'error', title: 'Delete failed' })
      return
    }
    addToast({ type: 'success', title: 'Deleted' })
    void load()
  }

  if (!gate.ready || loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading…
      </div>
    )
  }

  return (
    <div className="w-full space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Resources / Ebooks</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate original CodeSpectra pocket guides. Daily cron creates drafts — publish here.
        </p>
      </div>

      <Card className="space-y-4 p-4 md:p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <Plus className="h-4 w-4" /> Generate ebook
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="topic">Topic</Label>
            <Input
              id="topic"
              placeholder="e.g. Resume ATS basics"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="title">Title (optional)</Label>
            <Input
              id="title"
              placeholder="Override title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
        </div>
        <Button type="button" disabled={!topic.trim() || busy} onClick={() => void generate()}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Generate draft
        </Button>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((e) => (
          <div key={e.id || e.slug} className="space-y-2">
            <EbookCoverCard ebook={e} href={`/dashboard/resources/${e.slug}`} showStatus />
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline" className="capitalize">
                {e.status}
              </Badge>
              {e.pageCount != null ? <Badge variant="secondary">{e.pageCount} pages</Badge> : null}
            </div>
            <div className="flex flex-wrap gap-1">
              {e.status !== 'published' ? (
                <Button type="button" size="sm" variant="secondary" onClick={() => void setStatus(e.slug, 'published')}>
                  <Check className="mr-1 h-3.5 w-3.5" /> Publish
                </Button>
              ) : (
                <Button type="button" size="sm" variant="outline" onClick={() => void setStatus(e.slug, 'draft')}>
                  Unpublish
                </Button>
              )}
              <Button type="button" size="sm" variant="ghost" asChild>
                <Link href={`/dashboard/resources/${e.slug}`}>
                  <Eye className="h-3.5 w-3.5" />
                </Link>
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => void remove(e.slug)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
