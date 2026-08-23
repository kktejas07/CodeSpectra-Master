'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Radio, Check, X, RefreshCw, ExternalLink, Eye } from 'lucide-react'
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

  const run = async (action: 'approve' | 'reject' | 'ingest', id?: string) => {
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
        addToast({ type: 'success', title: 'Published to Newsroom' })
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
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Radio className="h-6 w-6 text-teal-600" /> Signals
          </h1>
          <p className="text-sm text-muted-foreground">
            Public RSS → research pages → fact pack → draft → humanize → your approval →{' '}
            <Link href="/blog" className="text-teal-600 hover:underline" target="_blank">
              /blog
            </Link>
            . Fetch is free; LLM uses your platform AI keys. We do not scrape Unstop.
          </p>
        </div>
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
      </div>

      {loading ? (
        <Card className="flex h-28 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </Card>
      ) : items.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          No drafts yet. Click <strong>Run ingest</strong> to pull public feeds.
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{pending.length} pending · {items.length} total</p>
          {items.map((d) => (
            <Card key={d.id} className="space-y-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                {d.cover_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={d.cover_image}
                    alt=""
                    className="h-20 w-36 shrink-0 rounded-md border object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{d.title}</p>
                    <Badge variant="secondary">{d.category}</Badge>
                    <Badge variant={d.status === 'pending' ? 'default' : 'outline'}>{d.status}</Badge>
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
                          className="inline-flex items-center gap-0.5 text-teal-600 hover:underline"
                        >
                          source{d.source_urls && d.source_urls.length > 1 ? ` ${i + 1}` : ''}{' '}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </span>
                    ))}
                    {d.blog_slug ? (
                      <>
                        {' '}
                        ·{' '}
                        <Link href={`/blog/${d.blog_slug}`} className="text-teal-600 hover:underline">
                          /blog/{d.blog_slug}
                        </Link>
                      </>
                    ) : null}
                  </p>
                </div>
                {d.status === 'pending' && (
                  <div className="flex gap-2">
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
                  </div>
                )}
              </div>
            </Card>
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
                dangerouslySetInnerHTML={{ __html: previewDraft.body }}
              />
            ) : (
              <p className="text-muted-foreground italic">No body content generated.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
