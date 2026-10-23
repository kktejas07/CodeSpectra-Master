'use client'

import { useCallback, useEffect, useState } from 'react'
import { sanitizeArticleHtml } from '@/lib/safe-html'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Radio, Check, X, RefreshCw, ExternalLink, Eye, Trash2, Undo, ShieldCheck, Sparkles, AlertTriangle, Gauge } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { newsTopicLabel } from '@/lib/signals/feeds'
import type { SignalSettings } from '@/lib/signals/settings'
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
import { useAdminT } from '@/lib/i18n/admin'

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
  topic?: string
  trusted?: boolean
  auto_published?: boolean
  ai_rewritten?: boolean
  flags?: string[]
  fact_check?: { ok: boolean; numbers: string[]; names: string[]; claims: string[] }
  created_at: string
}

type Feed = {
  id: string; name: string; url: string; topic: string; trusted: boolean; default_trusted: boolean; enabled: boolean
  last_run_at: string | null; last_ok_at: string | null; last_error: string | null
}
type Usage = { day: string | null; day_count: number; month: string | null; month_cost_usd: number } | null

export default function AdminSignalsPage() {
  const { t: tx } = useAdminT()
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [items, setItems] = useState<Draft[]>([])
  const [feeds, setFeeds] = useState<Feed[]>([])
  const [settings, setSettings] = useState<SignalSettings | null>(null)
  const [usage, setUsage] = useState<Usage>(null)
  const [budget, setBudget] = useState<{ items: number; blocked?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [previewDraft, setPreviewDraft] = useState<Draft | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ action: 'delete' | 'unpublish', id: string, message: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/signals', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setItems(data.items || [])
      setFeeds(data.feeds || [])
      setSettings(data.settings || null)
      setUsage(data.usage || null)
      setBudget(data.budget || null)
    } catch {
      addToast({ type: 'error', title: tx('signals.failedToLoadDrafts') })
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    if (gate.ready) void load()
  }, [gate.ready, load])

  if (!gate.ready) return null

  const post = async (key: string, payload: Record<string, unknown>, ok: string) => {
    setBusy(key)
    try {
      const res = await csrfFetch('/api/admin/signals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.error) { addToast({ type: 'error', title: data.error || 'Action failed' }); return }
      addToast({ type: 'success', title: ok })
      await load()
    } catch {
      addToast({ type: 'error', title: tx('signals.requestFailed') })
    } finally {
      setBusy(null)
    }
  }

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
          type: data.blocked && !data.created ? 'info' : 'success',
          title: `Ingested ${data.created ?? 0} item(s), ${data.published ?? 0} auto-published`,
          message: data.blocked || undefined,
        })
      } else if (action === 'approve') {
        addToast({ type: 'success', title: tx('signals.publishedToNews') })
      } else if (action === 'unpublish') {
        addToast({ type: 'success', title: tx('signals.unpublished') })
      } else if (action === 'delete') {
        addToast({ type: 'success', title: tx('signals.deleted') })
      } else {
        addToast({ type: 'success', title: tx('signals.rejected') })
      }
      await load()
    } catch {
      addToast({ type: 'error', title: tx('signals.requestFailed') })
    } finally {
      setBusy(null)
    }
  }

  const pending = items.filter((i) => i.status === 'pending')

  return (
    <div className="space-y-6">
      <PageHeader
        illustration="inbox"
        title={tx('signals.signals')}
        description={
          <>
            Tech news written from public RSS feeds and checked against their sources. Items from trusted feeds (official vendor,
            language and advisory blogs) go live on{' '}
            <Link href="/news" className="font-medium text-primary hover:underline" target="_blank">
              {tx('signals.news')}
            </Link>{' '}
            automatically; the rest wait for you. Writing uses your platform AI keys within the caps below. Unstop is never scraped.
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
            {tx('signals.runIngest')}
          </Button>
        }
      />

      {!loading && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label={tx('signals.waitingForReview')} value={pending.length} icon={<Clock />} />
          <StatCard label={tx('signals.autoPublished')} value={items.filter((i) => i.auto_published && i.status === 'published').length} hint={tx('signals.latest100Items')} icon={<Sparkles />} />
          <StatCard label={tx('signals.aiRewritesToday')} value={usage && usage.day === new Date().toISOString().slice(0, 10) ? usage.day_count : 0} hint={settings ? `Cap ${settings.daily_ai_cap} a day` : undefined} icon={<Gauge />} />
          <StatCard label={tx('signals.aiSpendThisMonth')} value={`$${(usage && usage.month === new Date().toISOString().slice(0, 7) ? usage.month_cost_usd : 0).toFixed(2)}`} hint={settings ? `Cap $${settings.monthly_cost_cap_usd.toFixed(2)}` : undefined} icon={<FileText />} />
        </div>
      )}
      {budget?.blocked && (
        <Panel className="flex items-start gap-2 p-4 text-sm text-amber-800 dark:text-amber-300" role="status">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {budget.blocked}. New items wait until the cap resets or you raise it in Settings.
        </Panel>
      )}

      <Tabs defaultValue="queue" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="queue">{tx('signals.queue')}</TabsTrigger>
          <TabsTrigger value="feeds">{tx('signals.feeds')}</TabsTrigger>
          <TabsTrigger value="settings">{tx('signals.settings')}</TabsTrigger>
        </TabsList>
        <TabsContent value="feeds"><FeedsTab feeds={feeds} busy={busy} post={post} /></TabsContent>
        <TabsContent value="settings">{settings ? <SettingsTab settings={settings} busy={busy} post={post} /> : <SkeletonList count={2} />}</TabsContent>
        <TabsContent value="queue">

      {loading ? (
        <SkeletonList count={3} />
      ) : items.length === 0 ? (
        <Panel className="p-10 text-center text-sm text-muted-foreground">
          No news items yet. Click <strong className="text-foreground">{tx('signals.runIngest')}</strong> to pull the latest public feeds.
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
                    {d.topic && <Badge variant="outline">{newsTopicLabel(d.topic)}</Badge>}
                    {d.auto_published && d.status === 'published' && <Badge className="gap-1 bg-primary text-primary-foreground"><Sparkles className="h-3 w-3" aria-hidden /> {tx('signals.autoPublished')}</Badge>}
                    {d.trusted && <Badge variant="outline" className="gap-1"><ShieldCheck className="h-3 w-3" aria-hidden /> {tx('signals.trustedFeed')}</Badge>}
                    {d.ai_rewritten === false && <Badge variant="outline">{tx('signals.noAiPass')}</Badge>}
                    {d.flags && d.flags.length > 0 && <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400" title={d.flags.join(', ')}><AlertTriangle className="h-3 w-3" aria-hidden /> {tx('signals.sourceTextFlagged')}</Badge>}
                    {d.fact_check && !d.fact_check.ok && <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400" title={[...d.fact_check.numbers, ...d.fact_check.names, ...d.fact_check.claims].join(', ')}><AlertTriangle className="h-3 w-3" aria-hidden /> {tx('signals.factsUnverified')}</Badge>}
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
                        <Link href={`/news/${d.blog_slug}`} className="text-primary hover:underline">
                          /news/{d.blog_slug}
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
                        onClick={() => setConfirmAction({ action: 'unpublish', id: d.id, message: 'Unpublish this item? It leaves /news and goes back to the review queue.' })}
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

        </TabsContent>
      </Tabs>

      <Dialog open={!!previewDraft} onOpenChange={(open) => !open && setPreviewDraft(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
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
              <p className="text-muted-foreground italic">{tx('signals.noBodyContentGenerated')}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmAction}
        title={tx('signals.areYouSure')}
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


type PostFn = (key: string, payload: Record<string, unknown>, ok: string) => Promise<void>

function FeedsTab({ feeds, busy, post }: { feeds: Feed[]; busy: string | null; post: PostFn }) {
  const { t: tx } = useAdminT()
  if (!feeds.length) return <Panel className="p-10 text-center text-sm text-muted-foreground">{tx('signals.noFeedsConfigured')}</Panel>
  return (
    <Panel className="overflow-x-auto p-0">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="border-b border-border text-left text-xs text-muted-foreground">
          <tr><th className="p-4 font-medium">{tx('signals.feed')}</th><th className="p-4 font-medium">{tx('signals.topic')}</th><th className="p-4 font-medium">{tx('signals.lastRun')}</th><th className="p-4 font-medium">{tx('signals.trustedAutoPublish')}</th><th className="p-4 font-medium">{tx('signals.on')}</th></tr>
        </thead>
        <tbody>
          {feeds.map((f) => (
            <tr key={f.id} className="border-b border-border/60 align-top last:border-0">
              <td className="p-4">
                <div className="font-medium text-foreground">{f.name}</div>
                <a href={f.url} target="_blank" rel="noreferrer" className="break-all font-mono text-xs text-muted-foreground hover:text-primary">{f.url}</a>
              </td>
              <td className="p-4 text-xs text-muted-foreground">{newsTopicLabel(f.topic)}</td>
              <td className="p-4 text-xs">
                <div className="text-foreground">{f.last_run_at ? new Date(f.last_run_at).toLocaleString() : 'Never'}</div>
                {f.last_error ? <div className="mt-1 text-destructive">{f.last_error}</div> : f.last_ok_at ? <div className="mt-1 text-green-700 dark:text-green-400">OK</div> : null}
              </td>
              <td className="p-4">
                <div className="flex items-center gap-2">
                  <Switch checked={f.trusted} disabled={busy === `trust:${f.id}`} aria-label={`Auto-publish items from ${f.name}`}
                    onCheckedChange={(v) => void post(`trust:${f.id}`, { action: 'feed', id: f.id, trusted: v === f.default_trusted ? null : v }, v ? `${f.name}: items auto-publish` : `${f.name}: items need review`)} />
                  {f.trusted !== f.default_trusted && <span className="text-[11px] text-muted-foreground">changed</span>}
                </div>
              </td>
              <td className="p-4">
                <Switch checked={f.enabled} disabled={busy === `feed:${f.id}`} aria-label={`Turn ${f.name} on or off`}
                  onCheckedChange={(v) => void post(`feed:${f.id}`, { action: 'feed', id: f.id, enabled: v }, v ? `${f.name} turned on` : `${f.name} turned off`)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}

function SettingsTab({ settings, busy, post }: { settings: SignalSettings; busy: string | null; post: PostFn }) {
  const { t: tx } = useAdminT()
  const [s, setS] = useState(settings)
  useEffect(() => setS(settings), [settings])
  const num = (k: keyof SignalSettings, label: string, hint: string, step = 1) => (
    <div className="space-y-1">
      <Label htmlFor={`sig-${k}`}>{label}</Label>
      <Input id={`sig-${k}`} type="number" step={step} min={0} value={String(s[k])} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })} className="h-10 w-40" />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )
  return (
    <Panel className="space-y-6">
      <label className="flex items-start gap-3">
        <Switch checked={s.auto_publish_trusted} onCheckedChange={(v) => setS({ ...s, auto_publish_trusted: v })} aria-label={tx('signals.autoPublishTrustedFeeds')} />
        <span className="text-sm"><span className="font-medium text-foreground">{tx('signals.autoPublishTrustedFeeds')}</span><br /><span className="text-muted-foreground">{tx('signals.itemsWhoseAiPassFailed')}</span></span>
      </label>
      <div className="grid gap-5 sm:grid-cols-3">
        {num('daily_ai_cap', 'AI rewrites a day', 'Each item uses three model calls. 0 stops ingest.')}
        {num('monthly_cost_cap_usd', 'Monthly AI cap (USD)', 'Estimated from token usage.', 0.5)}
        {num('items_per_feed', 'Items per feed per run', 'Between 1 and 5.')}
      </div>
      <div className="space-y-4 border-t border-border pt-5">
        <label className="flex items-start gap-3">
          <Switch checked={s.digest_enabled} onCheckedChange={(v) => setS({ ...s, digest_enabled: v })} aria-label={tx('signals.dailyNewsDigest')} />
          <span className="text-sm"><span className="font-medium text-foreground">{tx('signals.dailyNewsDigest')}</span><br /><span className="text-muted-foreground">{tx('signals.emailAndWhatsappToPeople')}</span></span>
        </label>
        <div className="grid gap-5 sm:grid-cols-3">
          {num('digest_hour', 'Send at (hour, 0–23)', 'Local time in the zone below.')}
          <div className="space-y-1">
            <Label htmlFor="sig-tz">{tx('signals.timeZone')}</Label>
            <Input id="sig-tz" value={s.digest_timezone} onChange={(e) => setS({ ...s, digest_timezone: e.target.value })} className="h-10" />
            <p className="text-xs text-muted-foreground">{tx('signals.ianaNameEGAsia')}</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="sig-tpl">{tx('signals.whatsappTemplate')}</Label>
            <Input id="sig-tpl" value={s.whatsapp_template_digest} onChange={(e) => setS({ ...s, whatsapp_template_digest: e.target.value })} className="h-10" placeholder="daily_news" />
            <p className="text-xs text-muted-foreground">Approved Meta template ({'{{1}}'} headlines, {'{{2}}'} link) for people outside the 24-hour window.</p>
          </div>
        </div>
      </div>
      <Button disabled={busy === 'settings'} onClick={() => void post('settings', { action: 'settings', patch: s }, 'Settings saved')} className="h-11 rounded-xl">
        {busy === 'settings' && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />} Save settings
      </Button>
    </Panel>
  )
}
