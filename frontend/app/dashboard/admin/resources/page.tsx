'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Plus, Eye, Trash2, Check, Sparkles } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EbookCoverCard, type EbookCardData } from '@/components/resources/ebook-cover-card'
import { EbookOutlineReview } from '@/components/resources/ebook-outline-review'
import { SkeletonCard, SkeletonList, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'
import { BookOpen, FileText } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

type AdminEbook = EbookCardData & { id: string; status: string }

export default function AdminResourcesPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [items, setItems] = useState<AdminEbook[]>([])
  const [loading, setLoading] = useState(true)
  const [topic, setTopic] = useState('')
  const [title, setTitle] = useState('')
  const [pageCount, setPageCount] = useState(12)
  const [busy, setBusy] = useState(false)
  const [coverBusy, setCoverBusy] = useState<string | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; slug: string | null }>({ open: false, slug: null })
  // AUTO-086: the daily AI draft is off until switched on here.
  const [autoDraft, setAutoDraft] = useState<boolean | null>(null)
  const [autoBusy, setAutoBusy] = useState(false)
  useEffect(() => {
    if (!gate.ready) return
    fetch('/api/resources/ebooks/settings', { credentials: 'include', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setAutoDraft(d?.settings?.auto_draft_enabled === true))
      .catch(() => setAutoDraft(false))
  }, [gate.ready])
  async function toggleAutoDraft(next: boolean) {
    setAutoBusy(true)
    try {
      const r = await csrfFetch('/api/resources/ebooks/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ auto_draft_enabled: next }) })
      if (!r.ok) throw new Error('Could not save the setting')
      setAutoDraft(next)
      addToast({ type: 'success', title: next ? 'Daily AI draft turned on' : 'Daily AI draft turned off' })
    } catch (e) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'Could not save the setting' })
    } finally {
      setAutoBusy(false)
    }
  }

  // Outline review state
  const [outlineReview, setOutlineReview] = useState<{
    show: boolean
    topic: string
    outline: Array<{ id: string; title: string; type: string; description: string }>
  } | null>(null)

  /** Regenerate AI cover art for an ebook (topic/title → 3D illustration). */
  async function regenCover(slug: string) {
    setCoverBusy(slug)
    try {
      const r = await csrfFetch(`/api/resources/ebooks/${encodeURIComponent(slug)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'regenerate-cover' }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Generation failed')
      addToast({ type: 'success', title: 'New cover generated' })
      void load()
    } catch (e) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'Generation failed' })
    } finally {
      setCoverBusy(null)
    }
  }

  const [loadError, setLoadError] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setLoadError(false)
    fetch('/api/resources/ebooks?all=1', { credentials: 'include', cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .then((d) =>
        setItems(
          (d.items || []).map((e: Record<string, unknown>) => ({
            id: String(e.id || ''),
            slug: String(e.slug || ''),
            title: String(e.title || ''),
            subtitle: e.subtitle ? String(e.subtitle) : undefined,
            topic: e.topic ? String(e.topic) : undefined,
            coverTheme: (e.coverTheme as EbookCardData['coverTheme']) || 'violet',
            coverImageUrl: (e.coverImageUrl as string | undefined) || undefined,
            readMinutes: typeof e.readMinutes === 'number' ? e.readMinutes : 5,
            status: String(e.status || 'draft'),
            pageCount: typeof e.pageCount === 'number' ? e.pageCount : undefined,
          })),
        ),
      )
      .catch(() => { setItems([]); setLoadError(true) })
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
      // First, generate outline for review
      const outlineRes = await csrfFetch('/api/resources/ebooks/outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), title: title.trim() || undefined, pageCount }),
      })
      const outlineData = await outlineRes.json().catch(() => ({}))
      if (!outlineRes.ok) throw new Error(outlineData.error || 'Outline generation failed')

      // Show outline review
      setOutlineReview({
        show: true,
        topic: topic.trim(),
        outline: outlineData.outline || [],
      })
    } catch (e) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'Outline generation failed' })
    } finally {
      setBusy(false)
    }
  }

  async function confirmOutline(outline: Array<{ id: string; title: string; type: string; description: string }>) {
    if (!outlineReview) return
    setBusy(true)
    try {
      const r = await csrfFetch('/api/resources/ebooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: outlineReview.topic,
          title: title.trim() || undefined,
          useAi: true,
          pageCount,
          outline,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Generate failed')
      addToast({ type: 'success', title: d.usedAi ? `Draft generated with AI (${pageCount} pages)` : 'Draft generated from template' })
      setTopic('')
      setTitle('')
      setOutlineReview(null)
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

  function confirmDelete(slug: string) {
    setDeleteDialog({ open: true, slug })
  }

  async function remove() {
    if (!deleteDialog.slug) return
    const slug = deleteDialog.slug
    setDeleteDialog({ open: false, slug: null })
    try {
      const r = await csrfFetch(`/api/resources/ebooks/${encodeURIComponent(slug)}`, { method: 'DELETE' })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        addToast({ type: 'error', title: d.error || 'Delete failed' })
        return
      }
      addToast({ type: 'success', title: 'Deleted' })
      void load()
    } catch (e) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'Delete failed' })
    }
  }

  if (!gate.ready || loading) {
    return (
      <div className="w-full space-y-8">
        <SkeletonText lines={2} />
        <SkeletonCard />
        <SkeletonList count={3} />
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      <PageHeader
        illustration="courses"
        title="Resources and ebooks"
        description="Short CodeSpectra guides for candidates. Generate drafts (or turn on the daily AI draft), then review and publish them here."
        icon={<BookOpen />}
      />

      <Panel className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="font-semibold text-foreground">Daily AI draft</h2>
          <p className="text-sm text-muted-foreground">Creates one draft ebook with an AI cover every day at 07:00 UTC. Uses your AI budget.</p>
        </div>
        <Button
          type="button"
          variant={autoDraft ? 'outline' : 'default'}
          disabled={autoDraft === null || autoBusy}
          aria-pressed={autoDraft === true}
          onClick={() => void toggleAutoDraft(!autoDraft)}
        >
          {autoBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
          {autoDraft ? 'Turn off' : 'Turn on'}
        </Button>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Ebooks" value={items.length} icon={<BookOpen />} />
        <StatCard label="Published" value={items.filter((e) => e.status === 'published').length} icon={<Check />} />
        <StatCard label="Drafts" value={items.filter((e) => e.status === 'draft').length} icon={<FileText />} />
      </div>

      <Panel className="space-y-4">
        <h2 className="flex items-center gap-2 font-semibold text-foreground">
          <Plus className="h-4 w-4 text-primary" aria-hidden /> Generate an ebook
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
          <div className="space-y-1.5">
            <Label htmlFor="pageCount">Pages</Label>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Number of pages">
              {[6, 12, 16, 24, 50].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPageCount(n)}
                  aria-pressed={pageCount === n}
                  className={`min-w-10 rounded-lg px-3 py-2 text-xs font-medium tabular-nums transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-primary ${
                    pageCount === n
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
        <Button type="button" disabled={!topic.trim() || busy} onClick={() => void generate()}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {busy ? `Generating outline...` : `Generate ${pageCount}-page ebook`}
        </Button>
      </Panel>

      {/* Outline Review Modal */}
      <Dialog open={!!outlineReview?.show} onOpenChange={(open) => { if (!open && !busy) setOutlineReview(null) }}>
        {outlineReview?.show && (
          <DialogContent showCloseButton={false} className="block max-h-[90vh] overflow-y-auto border-0 bg-transparent p-0 shadow-none sm:max-w-2xl">
            <DialogTitle className="sr-only">Review the ebook outline</DialogTitle>
            <EbookOutlineReview
              topic={outlineReview.topic}
              outline={outlineReview.outline}
              onConfirm={confirmOutline}
              onCancel={() => setOutlineReview(null)}
              loading={busy}
            />
          </DialogContent>
        )}
      </Dialog>

      {loadError && items.length === 0 && (
        <EmptyState illustration="error" title="Couldn't load ebooks" description="Check your connection and try again." actionLabel="Try again" onAction={load} />
      )}
      {!loadError && items.length === 0 && (
        <EmptyState illustration="courses" variant="courses" title="No ebooks yet" description="Enter a topic above to generate your first one." />
      )}

      <div className="cs-stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((e) => (
          <div key={e.id || e.slug} className="space-y-2">
            <EbookCoverCard ebook={e} href={`/dashboard/resources/${e.slug}`} showStatus />
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline" className="capitalize">
                {e.status}
              </Badge>
              {e.pageCount != null ? <Badge variant="secondary" className="tabular-nums">{e.pageCount} pages</Badge> : null}
            </div>
            <div className="flex flex-wrap gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={coverBusy === e.slug}
                onClick={() => void regenCover(e.slug)}
                title="Generate new AI cover art from the topic"
              >
                {coverBusy === e.slug ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-1 h-3.5 w-3.5 text-primary" />
                )}
                AI cover
              </Button>
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
                <Link href={`/dashboard/resources/${e.slug}`} aria-label={`Open ${e.title}`} title="Open">
                  <Eye className="h-3.5 w-3.5" />
                </Link>
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => confirmDelete(e.slug)} aria-label={`Delete ${e.title}`} title="Delete">
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={deleteDialog.open}
        title="Delete ebook?"
        message={`Are you sure you want to delete "${deleteDialog.slug}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={() => void remove()}
        onCancel={() => setDeleteDialog({ open: false, slug: null })}
      />
    </div>
  )
}
