'use client'

/**
 * Weekly roundup: pick the week's top N events / news (suggested by
 * pickRoundup, editable), create this week's roundup item, then caption it in
 * the composer. Carousel images = the roundup cover + each item's square card.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Loader2, Newspaper } from 'lucide-react'
import { Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonList } from '@/components/ui/skeleton-boneyard'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { useAdminT } from '@/lib/i18n/admin'
import { pickRoundup, ROUNDUP_TYPES } from '@/lib/social/queue'
import type { SocialQueueDoc } from '@/lib/social/types'
import { cardUrl } from './composer'

type Row = Omit<SocialQueueDoc, 'captions'>

export function SocialRoundup({ onOpen }: { onOpen: (id: string) => void }) {
  const { t, td, fmt } = useAdminT()
  const addToast = useToast()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [n, setN] = useState(5)
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const from = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)
      const all: Row[] = []
      for (const page of [1, 2, 3]) {
        const r = await fetch(`/api/admin/social?status=all&from=${from}&page=${page}`, { cache: 'no-store' })
        const d = await r.json().catch(() => null)
        if (!r.ok || !d) throw new Error('load')
        all.push(...(d.items || []))
        if (page >= (d.pages || 1)) break
      }
      const week = all.filter((x) => ROUNDUP_TYPES.includes(x.type))
      setRows(week)
      setPicked(pickRoundup(week, 5, new Date()).map((x) => x.id))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const suggest = (count: number) => {
    setN(count)
    setPicked(pickRoundup(rows, count, new Date()).map((x) => x.id))
  }
  const toggle = (id: string, on: boolean) => setPicked((p) => (on ? (p.includes(id) || p.length >= 10 ? p : [...p, id]) : p.filter((x) => x !== id)))
  const ordered = useMemo(() => picked.map((id) => rows.find((r) => r.id === id)).filter((r): r is Row => !!r), [picked, rows])

  const create = async () => {
    setBusy(true)
    try {
      const r = await csrfFetch('/api/admin/social', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'roundup', ids: picked }) })
      const d = await r.json().catch(() => null)
      if (!r.ok || !d?.id) throw new Error('roundup')
      setCreated(d.id)
      onOpen(d.id)
    } catch {
      addToast({ type: 'error', title: t('social.err.action') })
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <SkeletonList count={4} />
  if (error) {
    return (
      <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p role="alert" className="text-sm text-destructive">{t('social.err.load')}</p>
        <Button type="button" variant="outline" onClick={() => void load()}>{t('common.tryAgain')}</Button>
      </Panel>
    )
  }
  if (!rows.length) return <EmptyState title={t('social.roundupEmpty')} description={t('social.roundupEmptyHint')} />

  return (
    <div className="space-y-4">
      <Panel className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t('social.roundupTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('social.roundupHint')}</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="roundup-n">{t('social.roundupTopN')}</Label>
            <select id="roundup-n" value={n} onChange={(e) => suggest(Number(e.target.value))} className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {[3, 4, 5, 6, 7, 8, 10].map((v) => <option key={v} value={v}>{fmt.number(v)}</option>)}
            </select>
          </div>
        </div>
        <ul className="divide-y divide-border">
          {rows.map((r) => {
            const on = picked.includes(r.id)
            return (
              <li key={r.id} className="flex items-start gap-3 py-3">
                <Checkbox id={`ru-${r.id}`} checked={on} onCheckedChange={(v) => toggle(r.id, v === true)} className="mt-1" />
                <label htmlFor={`ru-${r.id}`} className="min-w-0 flex-1 cursor-pointer">
                  <span className="block font-medium leading-snug">{r.title}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary">{td(`social.type.${r.type}`, r.type)}</Badge>
                    <span>{r.source}</span>
                    <time dateTime={r.published_at}>{fmt.date(r.published_at)}</time>
                    {on ? <span className="tabular-nums">#{picked.indexOf(r.id) + 1}</span> : null}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
        <Button type="button" onClick={create} disabled={busy || !picked.length} className="min-h-11 w-full sm:w-auto">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Newspaper className="mr-2 h-4 w-4" aria-hidden />}
          {t('social.roundupCreate', { count: picked.length })}
        </Button>
      </Panel>

      {created ? (
        <Panel className="space-y-3 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{t('social.carousel')}</h2>
            <Button type="button" variant="outline" onClick={() => onOpen(created)}>{t('social.compose')}</Button>
          </div>
          <p className="text-sm text-muted-foreground">{t('social.carouselHint')}</p>
          <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[{ id: created, title: t('social.roundupCover') }, ...ordered].map((r, i) => (
              <li key={r.id} className="flex flex-col gap-2">
                <div className="overflow-hidden rounded-2xl border border-border bg-muted/40">
                  {/* eslint-disable-next-line @next/next/no-img-element -- generated card, admin only */}
                  <img src={cardUrl(r.id, 'square')} alt={t('social.slideAlt', { n: i + 1, title: r.title })} loading="lazy" className="aspect-square w-full object-cover" />
                </div>
                <Button asChild variant="outline" size="sm" className="min-h-10">
                  <a href={cardUrl(r.id, 'square', true)} download><Download className="mr-1.5 h-4 w-4" aria-hidden />{t('social.slide', { n: i + 1 })}</a>
                </Button>
              </li>
            ))}
          </ol>
        </Panel>
      ) : null}
    </div>
  )
}
