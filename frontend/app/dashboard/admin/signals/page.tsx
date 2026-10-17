'use client'

import { useCallback, useEffect, useState } from 'react'
import { sanitizeArticleHtml } from '@/lib/safe-html'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Radio, Check, X, RefreshCw, ExternalLink, Eye, Trash2, Undo } from 'lucide-react'
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
import { SkeletonList } from '@/components/ui/skeleton-boneyard'
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'
import { Clock, FileText } from 'lucide-react'

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

export default function AdminSignalsPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [items, setItems] = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [previewDraft, setPreviewDraft] = useState<Draft | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ action: 'delete' | 'unpublish', id: string, message: string } | null>(null)

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
    if (gate.ready) void load()
  }, [gate.ready, load])

  if (!gate.ready) return null

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
        addToast({
          type: 'success',
          title: `Ingested ${data.created ?? 0} draft(s)`,
        })
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
      <PageHeader
        illustration="inbox"
        title="Signals"
        description={
          <>
            Draft news posts written from public RSS feeds and checked against their sources. Nothing goes live on the{' '}
            <Link href="/blog" className="font-medium text-primary hover:underline" target="_blank">
              blog
            </Link>{' '}
            until you approve it. Reading feeds is free; writing uses your platform AI keys. Unstop is never scraped.
          </>
        }
        icon={<Radio />}
        actions={
          <Button
            onClick={() => void run('ingest')}
            disabled={busy === 'ingest'}
          >
            {busy === 'ingest' ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-4 w-4" />
            )}
            Run ingest
          </Button>
        }
      />

      {!loading && items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard label="Waiting for review" value={pending.length} icon={<Clock />} />
          <StatCard label="All drafts" value={items.length} icon={<FileText />} />
        </div>
      )}

      {loading ? (
        <SkeletonList count={3} />
      ) : items.length === 0 ? (
        <Panel className="p-10 text-center text-sm text-muted-foreground">
          No drafts yet. Click <strong className="text-foreground">Run ingest</strong> to pull the latest public feeds.
        </Panel>
      ) : (
        <div className="space-y-3">
          {items.map((d) => (
            <Panel key={d.id} className="space-y-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                {d.cover_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={d.cover_image}
                    alt=""
                    className="h-20 w-36 shrink-0 rounded-xl border border-border object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground">{d.title}</p>
                    <Badge variant="secondary">{d.category}</Badge>
                    <Badge variant={d.status === 'pending' ? 'default' : 'outline'} className="capitalize">{d.status}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{d.excerpt}</p>
                  {d.angle ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Angle: {d.angle}
                    </p>
                  ) : null}
                  {d.facts && d.facts.length > 0 ? (
                    <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
                      {d.facts.slice(0, 6).map((f, i) => (
                        <li key={i}>
                          {f.claim}
                          {f.date ? ` (${f.date})` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {d.source_feed} ·{' '}
                    {(d.source_urls?.length ? d.source_urls : [d.source_url]).map((u, i) => (
                      <span key={u}>
                        {i > 0 ? ' · ' : null}
                        <a
                          href={u}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 text-primary hover:underline"
                        >
                          source{d.source_urls && d.source_urls.length > 1 ? ` ${i + 1}` : ''}{' '}
                          <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                      </span>
                    ))}
                    {d.blog_slug ? (
                      <>
                        {' '}
                        ·{' '}
                        <Link href={`/blog/${d.blog_slug}`} className="text-primary hover:underline">
                          /blog/{d.blog_slug}
                        </Link>
                      </>
                    ) : null}
                  </p>
                </div>
                {d.status === 'pending' ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!!busy}
                      onClick={() => setPreviewDraft(d)}
                    >
                      <Eye className="mr-1 h-3.5 w-3.5" /> Preview
                    </Button>
                    <Button
                      size="sm"
                      disabled={!!busy}
                      onClick={() => void run('approve', d.id)}
                    >
                      <Check className="mr-1 h-3.5 w-3.5" /> Publish
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!!busy}
                      onClick={() => void run('reject', d.id)}
                    >
                      <X className="mr-1 h-3.5 w-3.5" /> Reject
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={!!busy}
                      onClick={() => setConfirmAction({ action: 'delete', id: d.id, message: 'Delete this signal?' })}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {d.status === 'published' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!busy}
                        onClick={() => setConfirmAction({ action: 'unpublish', id: d.id, message: 'Unpublish this signal?' })}
                      >
                        <Undo className="mr-1 h-3.5 w-3.5" /> Unpublish
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={!!busy}
                      onClick={() => setConfirmAction({ action: 'delete', id: d.id, message: 'Delete this signal entirely?' })}
                    >
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
            <DialogDescription>
              {previewDraft?.category} · {previewDraft?.source_feed}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 text-sm space-y-4">
            {previewDraft?.body ? (
              <div
                className="prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(previewDraft.body) }}
              />
            ) : (
              <p className="text-muted-foreground italic">No body content generated.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmAction}
        title="Are you sure?"
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
