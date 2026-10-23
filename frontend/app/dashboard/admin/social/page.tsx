'use client'

/**
 * Admin → Social studio. Everything newly published on CodeSpectra (events,
 * news, Learn, contests, hackathons, codeathons, certifications, company
 * tests) lands in a queue; the owner drafts captions, downloads share cards
 * and posts by hand through the networks' own share pages. Nothing is posted
 * automatically. Superadmin only.
 */
import { useCallback, useEffect, useState } from 'react'
import { Check, ExternalLink, Loader2, RefreshCw, Search, Share2 } from 'lucide-react'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonList } from '@/components/ui/skeleton-boneyard'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useAdminT } from '@/lib/i18n/admin'
import { PLATFORM_LABELS, SOCIAL_ITEM_TYPES, SOCIAL_PLATFORMS, type SocialQueueDoc } from '@/lib/social/types'
import { SocialComposer, cardUrl } from './composer'
import { SocialRoundup } from './roundup'
import { SocialStats } from './stats'
import { SocialPack } from './pack'

type ListItem = Omit<SocialQueueDoc, 'captions'>
type Filters = { type: string; status: 'all' | 'not_posted' | 'posted'; platform: string; q: string; from: string; to: string }
const NO_FILTERS: Filters = { type: '', status: 'not_posted', platform: '', q: '', from: '', to: '' }

export default function AdminSocialStudioPage() {
  const { t, td, fmt } = useAdminT()
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [tab, setTab] = useState('queue')
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<ListItem[]>([])
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  // ?tab=pack opens Today's pack (link from the social pack notification).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('tab')
    if (q === 'pack' || q === 'roundup' || q === 'stats' || q === 'posted') setTab(q)
  }, [])

  const effective: Filters = tab === 'posted' ? { ...filters, status: 'posted' } : filters

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const sp = new URLSearchParams({ page: String(page) })
      for (const [k, v] of Object.entries(effective)) if (v) sp.set(k, v)
      const r = await fetch(`/api/admin/social?${sp}`, { cache: 'no-store' })
      const d = await r.json().catch(() => null)
      if (!r.ok || !d) throw new Error('load')
      setItems(d.items || [])
      setPages(d.pages || 1)
      setTotal(d.total || 0)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `effective` is derived from these
  }, [page, tab, filters.type, filters.status, filters.platform, filters.q, filters.from, filters.to])

  useEffect(() => {
    if (gate.allowed && (tab === 'queue' || tab === 'posted')) void load()
  }, [gate.allowed, load, tab])

  const set = (patch: Partial<Filters>) => { setFilters((f) => ({ ...f, ...patch })); setPage(1) }

  const sync = async () => {
    setSyncing(true)
    try {
      const r = await csrfFetch('/api/admin/social', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync' }) })
      const d = await r.json().catch(() => null)
      if (!r.ok) throw new Error('sync')
      addToast({ type: 'success', title: t('social.synced', { count: d?.created ?? 0 }) })
      void load()
    } catch {
      addToast({ type: 'error', title: t('social.err.sync') })
    } finally {
      setSyncing(false)
    }
  }

  const onChanged = useCallback((it: SocialQueueDoc) => {
    setItems((list) => list.map((x) => (x.id === it.id ? { ...x, posts: it.posts, posted_count: it.posted_count, last_posted_at: it.last_posted_at } : x)))
  }, [])

  if (gate.loading) return <SkeletonList count={6} />

  const list = (
    <div className="space-y-4">
      <Panel className="p-4">
        <form className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6" onSubmit={(e) => { e.preventDefault(); set({ q: query.trim() }) }}>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="social-q">{t('common.search')}</Label>
            <div className="flex gap-2">
              <Input id="social-q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('social.searchPlaceholder')} maxLength={100} />
              <Button type="submit" variant="outline" size="icon" aria-label={t('common.search')}><Search className="h-4 w-4" aria-hidden /></Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="social-type">{t('common.type')}</Label>
            <select id="social-type" value={filters.type} onChange={(e) => set({ type: e.target.value })} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">{t('common.all')}</option>
              {SOCIAL_ITEM_TYPES.map((ty) => <option key={ty} value={ty}>{td(`social.type.${ty}`, ty)}</option>)}
            </select>
          </div>
          {tab === 'queue' ? (
            <div className="space-y-1">
              <Label htmlFor="social-status">{t('common.status')}</Label>
              <select id="social-status" value={filters.status} onChange={(e) => set({ status: e.target.value as Filters['status'] })} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="not_posted">{t('social.notPosted')}</option>
                <option value="posted">{t('social.posted')}</option>
                <option value="all">{t('common.all')}</option>
              </select>
            </div>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="social-platform">{t('social.platform')}</Label>
            <select id="social-platform" value={filters.platform} onChange={(e) => set({ platform: e.target.value })} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">{t('social.anyPlatform')}</option>
              {SOCIAL_PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-1 lg:grid-cols-1">
            <div className="space-y-1">
              <Label htmlFor="social-from">{t('social.from')}</Label>
              <Input id="social-from" type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="social-to">{t('social.to')}</Label>
              <Input id="social-to" type="date" value={filters.to} onChange={(e) => set({ to: e.target.value })} />
            </div>
          </div>
        </form>
      </Panel>

      <p className="text-sm text-muted-foreground" aria-live="polite">{loading ? t('common.loading') : t('social.count', { count: total })}</p>

      {error ? (
        <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p role="alert" className="text-sm text-destructive">{t('social.err.load')}</p>
          <Button type="button" variant="outline" onClick={() => void load()}>{t('common.tryAgain')}</Button>
        </Panel>
      ) : loading ? (
        <SkeletonList count={4} />
      ) : !items.length ? (
        <EmptyState
          title={tab === 'posted' ? t('social.emptyPosted') : t('social.emptyQueue')}
          description={tab === 'posted' ? t('social.emptyPostedHint') : t('social.emptyQueueHint')}
          actionLabel={tab === 'posted' ? undefined : t('social.checkNew')}
          onAction={tab === 'posted' ? undefined : sync}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((it) => (
            <li key={it.id}>
              <Panel interactive className="flex h-full flex-col gap-3 p-4">
                <div className="overflow-hidden rounded-2xl border border-border bg-muted/40">
                  {/* eslint-disable-next-line @next/next/no-img-element -- generated card, admin only */}
                  <img src={cardUrl(it.id, 'landscape')} alt="" loading="lazy" className="aspect-[1200/627] w-full object-cover" />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">{td(`social.type.${it.type}`, it.type)}</Badge>
                  <span>{it.source}</span>
                  <span aria-hidden>·</span>
                  <time dateTime={it.published_at}>{fmt.relative(it.published_at)}</time>
                </div>
                <h2 className="line-clamp-3 font-semibold leading-snug text-foreground">{it.title}</h2>
                {SOCIAL_PLATFORMS.some((p) => it.posts?.[p]) ? (
                  <ul className="flex flex-wrap gap-1.5" aria-label={t('social.postedOn')}>
                    {SOCIAL_PLATFORMS.filter((p) => it.posts?.[p]).map((p) => (
                      <li key={p}>
                        <Badge variant="outline" className="gap-1 border-green-600/40 text-green-700 dark:text-green-400" title={fmt.dateTime(it.posts[p]!.at)}>
                          <Check className="h-3 w-3" aria-hidden />{PLATFORM_LABELS[p]}{tab === 'posted' ? ` · ${fmt.date(it.posts[p]!.at)}` : ''}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  <Button type="button" className="min-h-11 flex-1" onClick={() => setOpenId(it.id)}>
                    <Share2 className="mr-2 h-4 w-4" aria-hidden />{t('social.compose')}
                  </Button>
                  <Button asChild variant="outline" size="icon" className="h-11 w-11">
                    <a href={it.url} target="_blank" rel="noopener noreferrer" aria-label={t('social.openItem')}><ExternalLink className="h-4 w-4" aria-hidden /></a>
                  </Button>
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <nav className="flex items-center justify-between gap-2" aria-label={t('social.pagination')}>
          <Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t('common.previous')}</Button>
          <span className="text-sm tabular-nums text-muted-foreground">{t('social.pageOf', { page, pages })}</span>
          <Button type="button" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>{t('common.next')}</Button>
        </nav>
      ) : null}
    </div>
  )

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title={t('social.title')}
        description={t('social.description')}
        icon={<Share2 />}
        actions={
          <Button type="button" variant="outline" onClick={sync} disabled={syncing} className="min-h-11">
            {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <RefreshCw className="mr-2 h-4 w-4" aria-hidden />}
            {t('social.checkNew')}
          </Button>
        }
      />
      <Tabs value={tab} onValueChange={(v) => { setTab(v); setPage(1) }}>
        <TabsList className="mb-4 flex w-full justify-start overflow-x-auto">
          <TabsTrigger value="queue">{t('social.tab.queue')}</TabsTrigger>
          <TabsTrigger value="pack">{t('social.tab.pack')}</TabsTrigger>
          <TabsTrigger value="posted">{t('social.tab.posted')}</TabsTrigger>
          <TabsTrigger value="roundup">{t('social.tab.roundup')}</TabsTrigger>
          <TabsTrigger value="stats">{t('social.tab.stats')}</TabsTrigger>
        </TabsList>
        <TabsContent value="queue">{tab === 'queue' ? list : null}</TabsContent>
        <TabsContent value="posted">{tab === 'posted' ? list : null}</TabsContent>
        <TabsContent value="pack">{tab === 'pack' ? <SocialPack onOpen={setOpenId} /> : null}</TabsContent>
        <TabsContent value="roundup">{tab === 'roundup' ? <SocialRoundup onOpen={setOpenId} /> : null}</TabsContent>
        <TabsContent value="stats">{tab === 'stats' ? <SocialStats /> : null}</TabsContent>
      </Tabs>
      <SocialComposer id={openId} onClose={() => setOpenId(null)} onChanged={onChanged} />
    </div>
  )
}
