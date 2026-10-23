'use client'

/**
 * Today's pack: the social pack loop's daily pick of the best items, with
 * captions per network and language, share cards and a suggested posting
 * time per network. "Post" opens the composer, where the owner uses the
 * existing share buttons and marks each network as posted. Approving the pack
 * only records the sign-off — nothing is posted automatically.
 */
import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, CheckCircle2, Download, Loader2, RefreshCw, Share2 } from 'lucide-react'
import { Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonList } from '@/components/ui/skeleton-boneyard'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { useAdminT } from '@/lib/i18n/admin'
import { PLATFORM_LABELS, SOCIAL_PLATFORMS } from '@/lib/social/types'
import type { SocialPackDoc } from '@/lib/social/pack'
import { cardUrl } from './composer'

type PackResponse = { day: string; pack: SocialPackDoc | null; loop: { enabled: boolean; run_hour_utc: number; langs: string[]; use_ai: boolean } }

export function SocialPack({ onOpen }: { onOpen: (id: string) => void }) {
  const { t, td, fmt } = useAdminT()
  const addToast = useToast()
  const [data, setData] = useState<PackResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState<'build' | 'approve' | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const r = await fetch('/api/admin/social/pack', { cache: 'no-store' })
      const d = await r.json().catch(() => null)
      if (!r.ok || !d) throw new Error('load')
      setData(d)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const act = async (action: 'build' | 'approve') => {
    setBusy(action)
    try {
      const r = await csrfFetch('/api/admin/social/pack', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action === 'build' ? { action } : { action, day: data?.day }) })
      const d = await r.json().catch(() => null)
      if (!r.ok) throw new Error('act')
      setData((x) => (x ? { ...x, pack: d?.pack ?? x.pack } : x))
      addToast({ type: 'success', title: action === 'build' ? t('social.pack.built', { count: d?.pack?.items?.length ?? 0 }) : t('social.pack.approvedToast') })
    } catch {
      addToast({ type: 'error', title: action === 'build' ? t('social.pack.err.build') : t('social.pack.err.approve') })
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <SkeletonList count={3} />
  if (error || !data) {
    return (
      <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p role="alert" className="text-sm text-destructive">{t('social.pack.err.load')}</p>
        <Button type="button" variant="outline" onClick={() => void load()}>{t('common.tryAgain')}</Button>
      </Panel>
    )
  }
  const pack = data.pack
  const time = (iso: string) => fmt.date(iso, { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })

  return (
    <div className="space-y-4">
      <Panel className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="font-medium text-foreground">{t('social.pack.heading', { date: fmt.date(`${data.day}T12:00:00Z`, { dateStyle: 'medium' }) })}</p>
          <p className="text-sm text-muted-foreground">{t('social.pack.noAutoPost')}</p>
          <p className="text-sm text-muted-foreground">{data.loop.enabled ? t('social.pack.loopOn', { hour: data.loop.run_hour_utc }) : t('social.pack.loopOff')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="min-h-11" disabled={!!busy || pack?.status === 'approved'} onClick={() => void act('build')}>
            {busy === 'build' ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <RefreshCw className="mr-2 h-4 w-4" aria-hidden />}
            {pack ? t('social.pack.rebuild') : t('social.pack.build')}
          </Button>
          {pack?.items.length ? (
            pack.status === 'approved' ? (
              <Badge variant="outline" className="min-h-11 gap-1 border-green-600/40 px-3 text-green-700 dark:text-green-400"><CheckCircle2 className="h-4 w-4" aria-hidden />{t('social.pack.approved')}</Badge>
            ) : (
              <Button type="button" className="min-h-11" disabled={!!busy} onClick={() => void act('approve')}>
                {busy === 'approve' ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden />}
                {t('social.pack.approve')}
              </Button>
            )
          ) : null}
        </div>
      </Panel>

      {!pack || !pack.items.length ? (
        <EmptyState title={t('social.pack.empty')} description={t('social.pack.emptyHint')} actionLabel={t('social.pack.build')} onAction={() => void act('build')} />
      ) : (
        <ol className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {pack.items.map((it, i) => (
            <li key={it.queue_id}>
              <Panel className="flex h-full flex-col gap-3 p-4">
                <div className="overflow-hidden rounded-2xl border border-border bg-muted/40">
                  {/* eslint-disable-next-line @next/next/no-img-element -- generated card, admin only */}
                  <img src={cardUrl(it.queue_id, 'landscape')} alt="" loading="lazy" className="aspect-[1200/627] w-full object-cover" />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="tabular-nums">{t('social.pack.rank', { n: i + 1 })}</span>
                  <Badge variant="secondary">{td(`social.type.${it.type}`, it.type)}</Badge>
                  {it.langs_ready.map((l) => <Badge key={l} variant="outline">{td(`agentLoops.lang.${l}`, l)}</Badge>)}
                </div>
                <h3 className="line-clamp-3 font-semibold leading-snug text-foreground">{it.title}</h3>
                <div>
                  <p className="mb-1 flex items-center gap-1 text-sm font-medium text-foreground"><CalendarClock className="h-4 w-4" aria-hidden />{t('social.pack.when')}</p>
                  <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                    {SOCIAL_PLATFORMS.map((p) => (
                      <li key={p} className="flex justify-between gap-2">
                        <span className="text-muted-foreground">{PLATFORM_LABELS[p]}</span>
                        <time className="tabular-nums text-foreground" dateTime={it.times[p]}>{time(it.times[p])}</time>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  <Button type="button" className="min-h-11 flex-1" onClick={() => onOpen(it.queue_id)}>
                    <Share2 className="mr-2 h-4 w-4" aria-hidden />{t('social.pack.post')}
                  </Button>
                  <Button asChild variant="outline" size="icon" className="h-11 w-11">
                    <a href={cardUrl(it.queue_id, 'square', true)} aria-label={t('social.pack.downloadCard')}><Download className="h-4 w-4" aria-hidden /></a>
                  </Button>
                </div>
              </Panel>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
