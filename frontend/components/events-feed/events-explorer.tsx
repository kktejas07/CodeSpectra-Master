'use client'

/**
 * Public events explorer: filters (kind, online / in person, region, country,
 * theme, prize, student-friendly, deadline soon, dates), list / calendar toggle, event cards and the
 * "Notify me" box. Filtering is client-side over the server-rendered list.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, ChevronLeft, ChevronRight, LayoutGrid, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/ui/empty-state'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { countryName, filterEvents, KIND_LABELS, MODE_LABELS, REGION_LABELS, REGIONS, regionOf, type Region, type UiFilters } from '@/lib/events-feed/public'
import { EVENT_KINDS, EVENT_MODES, type PublicFeedEvent } from '@/lib/events-feed/types'
import { cn } from '@/lib/utils'
import { EventCard } from './event-card'
import { NotifyBox } from './notify-box'

const chip = (on: boolean) =>
  cn('min-h-9 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    on ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground')

function MonthCalendar({ events }: { events: PublicFeedEvent[] }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const first = new Date(year, month, 1)
  const daysIn = new Date(year, month + 1, 0).getDate()
  const lead = (first.getDay() + 6) % 7 // Monday-first
  const byDay = useMemo(() => {
    const m = new Map<number, PublicFeedEvent[]>()
    for (const e of events) {
      if (!e.starts_at) continue
      const s = new Date(e.starts_at)
      const end = e.ends_at ? new Date(e.ends_at) : s
      for (let d = 1; d <= daysIn; d++) {
        const dayStart = new Date(year, month, d).getTime()
        const dayEnd = dayStart + 86_400_000 - 1
        if (s.getTime() <= dayEnd && end.getTime() >= dayStart) m.set(d, [...(m.get(d) || []), e])
      }
    }
    return m
  }, [events, year, month, daysIn])
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)]
  const today = new Date()
  return (
    <div className="rounded-3xl border border-border/70 bg-card p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
        <div className="flex gap-2">
          <Button size="icon" variant="outline" aria-label="Previous month" onClick={() => setCursor(new Date(year, month - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="icon" variant="outline" aria-label="Next month" onClick={() => setCursor(new Date(year, month + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground" aria-hidden>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          const list = d ? byDay.get(d) || [] : []
          const isToday = d && today.getFullYear() === year && today.getMonth() === month && today.getDate() === d
          return (
            <div key={i} className={cn('min-h-20 rounded-xl border p-1.5 text-left sm:min-h-24', d ? 'border-border/60' : 'border-transparent', isToday && 'border-primary/50 bg-primary/5')}>
              {d && <div className={cn('text-xs tabular-nums', isToday ? 'font-bold text-primary' : 'text-muted-foreground')}>{d}</div>}
              <ul className="mt-1 space-y-0.5">
                {list.slice(0, 3).map((e) => (
                  <li key={e.id}>
                    <Link href={`/events/${e.id}`} className={cn('block truncate rounded px-1 py-0.5 text-[11px] leading-tight hover:underline', e.featured ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary')} title={e.title}>{e.title}</Link>
                  </li>
                ))}
                {list.length > 3 && <li className="px-1 text-[11px] text-muted-foreground">+{list.length - 3} more</li>}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function EventsExplorer({ events, origin }: { events: PublicFeedEvent[]; origin: string }) {
  const addToast = useToast()
  const [f, setF] = useState<UiFilters>({})
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [saved, setSaved] = useState<string[]>([])

  useEffect(() => {
    let off = false
    fetch('/api/events-feed/save', { cache: 'no-store' }).then((r) => r.json()).then((d) => { if (!off && Array.isArray(d.saved_events)) setSaved(d.saved_events) }).catch(() => undefined)
    return () => { off = true }
  }, [])

  const countries = useMemo(() => [...new Set(events.map((e) => e.country).filter((c): c is string => Boolean(c)))].sort((a, b) => countryName(a).localeCompare(countryName(b))), [events])
  const themes = useMemo(() => {
    const n = new Map<string, number>()
    for (const e of events) for (const t of e.themes) n.set(t, (n.get(t) || 0) + 1)
    return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([t]) => t)
  }, [events])
  const regions = useMemo(() => { const have = new Set(events.map((e) => regionOf(e.country)).filter(Boolean)); return REGIONS.filter((r) => have.has(r)) }, [events])
  const shown = useMemo(() => filterEvents(events, f), [events, f])
  const active = Object.values(f).some((v) => (Array.isArray(v) ? v.length : Boolean(v)))

  const toggleIn = <K extends 'kinds' | 'modes' | 'countries' | 'themes' | 'regions'>(k: K, v: string) =>
    setF((p) => { const cur = (p[k] as string[] | undefined) || []; return { ...p, [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] } })

  const toggleSave = useCallback(async (id: string, save: boolean) => {
    const res = await csrfFetch('/api/events-feed/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: id, save }) })
    if (res.status === 401) {
      addToast({ type: 'info', title: 'Sign in to get reminders', message: 'We email you 48 hours before registration closes.' })
      return
    }
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { addToast({ type: 'error', title: d.error || 'Couldn’t save this event' }); return }
    setSaved(d.saved_events || [])
    addToast({ type: 'success', title: save ? 'We’ll remind you 48 hours before registration closes' : 'Reminder removed' })
  }, [addToast])

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-6">
        <section aria-label="Filters" className="space-y-4 rounded-3xl border border-border/70 bg-card p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={f.q || ''} onChange={(e) => setF((p) => ({ ...p, q: e.target.value }))} placeholder="Search events, organisers, cities" className="h-11 pl-9" aria-label="Search events" />
            </div>
            <div className="flex rounded-xl border border-border p-1" role="group" aria-label="View">
              <button type="button" onClick={() => setView('list')} aria-pressed={view === 'list'} className={cn('flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm', view === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}><LayoutGrid className="h-4 w-4" /> List</button>
              <button type="button" onClick={() => setView('calendar')} aria-pressed={view === 'calendar'} className={cn('flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm', view === 'calendar' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}><CalendarDays className="h-4 w-4" /> Calendar</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Kind">
            {EVENT_KINDS.map((k) => <button key={k} type="button" className={chip(Boolean(f.kinds?.includes(k)))} aria-pressed={Boolean(f.kinds?.includes(k))} onClick={() => toggleIn('kinds', k)}>{KIND_LABELS[k]}</button>)}
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Format">
            {EVENT_MODES.map((m) => <button key={m} type="button" className={chip(Boolean(f.modes?.includes(m)))} aria-pressed={Boolean(f.modes?.includes(m))} onClick={() => toggleIn('modes', m)}>{MODE_LABELS[m]}</button>)}
            <button type="button" className={chip(Boolean(f.prize))} aria-pressed={Boolean(f.prize)} onClick={() => setF((p) => ({ ...p, prize: !p.prize }))}>Has cash prize</button>
            <button type="button" className={chip(Boolean(f.deadline_soon))} aria-pressed={Boolean(f.deadline_soon)} onClick={() => setF((p) => ({ ...p, deadline_soon: !p.deadline_soon }))}>Closing this week</button>
            <button type="button" className={chip(Boolean(f.student))} aria-pressed={Boolean(f.student)} onClick={() => setF((p) => ({ ...p, student: !p.student }))}>Student-friendly</button>
          </div>
          {regions.length > 0 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Region (in-person and hybrid events)">
              {regions.map((r: Region) => <button key={r} type="button" className={chip(Boolean(f.regions?.includes(r)))} aria-pressed={Boolean(f.regions?.includes(r))} onClick={() => toggleIn('regions', r)}>{REGION_LABELS[r]}</button>)}
            </div>
          )}
          {countries.length > 0 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Country">
              {countries.map((c) => <button key={c} type="button" className={chip(Boolean(f.countries?.includes(c)))} aria-pressed={Boolean(f.countries?.includes(c))} onClick={() => toggleIn('countries', c)}>{countryName(c)}</button>)}
            </div>
          )}
          {themes.length > 0 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Theme">
              {themes.map((t) => <button key={t} type="button" className={chip(Boolean(f.themes?.includes(t)))} aria-pressed={Boolean(f.themes?.includes(t))} onClick={() => toggleIn('themes', t)}>{t.replace(/-/g, ' ')}</button>)}
            </div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="ev-from" className="text-xs text-muted-foreground">From</Label>
              <Input id="ev-from" type="date" value={f.from || ''} onChange={(e) => setF((p) => ({ ...p, from: e.target.value || null }))} className="h-10 w-40" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ev-to" className="text-xs text-muted-foreground">To</Label>
              <Input id="ev-to" type="date" value={f.to || ''} onChange={(e) => setF((p) => ({ ...p, to: e.target.value || null }))} className="h-10 w-40" />
            </div>
            {active && <Button variant="ghost" onClick={() => setF({})} className="h-10"><X className="h-4 w-4" /> Clear filters</Button>}
          </div>
        </section>

        <p className="text-sm text-muted-foreground" aria-live="polite"><span className="tabular-nums">{shown.length}</span> {shown.length === 1 ? 'event' : 'events'}</p>

        {shown.length === 0 ? (
          <EmptyState illustration="calendar" title={events.length ? 'No events match these filters' : 'No upcoming events yet'}
            description={events.length ? 'Try fewer filters, or turn on “Notify me” and we’ll tell you when a matching event is announced.' : 'New hackathons and contests appear here as soon as they’re announced. Turn on “Notify me” to hear first.'}
            actionLabel={active ? 'Clear filters' : undefined} onAction={active ? () => setF({}) : undefined} />
        ) : view === 'calendar' ? (
          <MonthCalendar events={shown} />
        ) : (
          <div className="cs-stagger grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((e) => <EventCard key={e.id} ev={e} origin={origin} saved={saved.includes(e.id)} onToggleSave={toggleSave} />)}
          </div>
        )}
      </div>
      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <NotifyBox />
        <p className="px-2 text-xs leading-relaxed text-muted-foreground">
          Listings come from organisers’ public feeds and official APIs and link to the organiser to register. Dates are shown in your time zone.
        </p>
      </aside>
    </div>
  )
}
