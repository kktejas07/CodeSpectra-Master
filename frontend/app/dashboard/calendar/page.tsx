'use client'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDateTime } from '@/lib/format-datetime'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { usePageGuard } from '@/lib/use-page-guard'
import { SkeletonCard } from '@/components/ui/skeleton-boneyard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { PageHeader } from '@/components/app/page-kit'

type CalEvent = {
  id: string
  title: string
  description?: string
  start: string
  end?: string | null
  url?: string | null
  source?: string
  /** Derived from a hackathon/codeathon registration — not deletable here. */
  readOnly?: boolean
}

type Filter = 'all' | 'personal' | 'hackathon' | 'codeathon' | 'interview' | 'assessment' | 'booking' | 'event'
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'personal', label: 'My entries' },
  { id: 'interview', label: 'Interviews' },
  { id: 'assessment', label: 'Test deadlines' },
  { id: 'booking', label: 'Bookings' },
  { id: 'event', label: 'Saved events' },
  { id: 'hackathon', label: 'Hackathons' },
  { id: 'codeathon', label: 'Codeathons' },
]
const DERIVED = new Set(['hackathon', 'codeathon', 'assessment', 'booking', 'event'])

function matchesFilter(ev: CalEvent, f: Filter): boolean {
  if (f === 'all') return true
  // Interviews pinned at booking are personal entries with source 'interview' — they count as interviews.
  if (f === 'personal') return !DERIVED.has(String(ev.source)) && ev.source !== 'interview'
  return ev.source === f
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function localKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysInMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

export default function CalendarPage() {
  const gate = usePageGuard('user')
  const addToast = useToast()
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()))
  const [items, setItems] = useState<CalEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [when, setWhen] = useState('')
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const { startTour, setTourSeen } = useTour()

  useEffect(() => {
    if (gate.ready) {
      const calendarTour: TourStep[] = [
        {
          target: '[data-tour="calendar-header"]',
          title: 'Personal study calendar hub',
          description: 'Manage study sessions, deadlines, and course events in one place for your prep.',
          position: 'bottom',
        },
        {
          target: '[data-tour="calendar-grid"]',
          title: 'Browse events by month',
          description: 'Browse days with the arrow buttons to spot sessions and deadlines across months.',
          position: 'right',
        },
        {
          target: '[data-tour="calendar-add"]',
          title: 'Save study session fast',
          description: 'Where next: enter a title and date, Save on CodeSpectra, then track it in Upcoming.',
          position: 'left',
        },
      ]
      autoPlayPageTour('calendar', calendarTour)}
  }, [gate.ready, startTour, setTourSeen])

  const [loadError, setLoadError] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/user/calendar', { cache: 'no-store' })
      if (!res.ok) throw new Error(`Failed to load calendar (${res.status})`)
      const json = await res.json()
      setItems(Array.isArray(json.items) ? json.items : [])
      setLoadError(false)
    } catch {
      setLoadError(true)
      addToast({ type: 'error', title: 'Could not load calendar' })
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(() => items.filter((ev) => matchesFilter(ev, filter)), [items, filter])

  // Keyed by local date, matching the grid cells below.
  const byDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>()
    for (const ev of visible) {
      const d = new Date(ev.start)
      if (!Number.isFinite(d.getTime())) continue
      const key = localKey(d)
      const list = map.get(key) || []
      list.push(ev)
      map.set(key, list)
    }
    return map
  }, [visible])

  const cells = useMemo(() => {
    const first = startOfMonth(cursor)
    const pad = first.getDay()
    const total = daysInMonth(cursor)
    const out: Array<{ date: Date | null; key: string }> = []
    for (let i = 0; i < pad; i++) out.push({ date: null, key: `pad-${i}` })
    for (let d = 1; d <= total; d++) {
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), d)
      out.push({ date, key: localKey(date) })
    }
    return out
  }, [cursor])

  const addEvent = async () => {
    if (!title.trim() || !when) {
      addToast({ type: 'error', title: 'Title and date/time are required' })
      return
    }
    setBusy(true)
    try {
      const res = await csrfFetch('/api/user/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          start: new Date(when).toISOString(),
          source: 'manual',
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      setTitle('')
      setWhen('')
      await load()
      addToast({ type: 'success', title: 'Saved to CodeSpectra calendar' })
    } catch (e: any) {
      addToast({ type: 'error', title: e?.message || 'Could not add event' })
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    await csrfFetch(`/api/user/calendar?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    setItems((prev) => prev.filter((e) => e.id !== id))
  }

  if (!gate.ready) return null

  const monthLabel = cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-6">
      <div data-tour="calendar-header">
        <PageHeader
          illustration="calendar"
          className="mb-0"
          icon={<CalendarDays aria-hidden />}
          title="Calendar"
          description="Your study sessions, interviews, test deadlines, booked sessions, saved events and the hackathons and codeathons you've joined. Event pages also offer an .ics / Google Calendar export."
        />
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter calendar">
        {FILTERS.map((f) => (
          <Button
            key={f.id}
            size="sm"
            variant={filter === f.id ? 'default' : 'outline'}
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="rounded-3xl border-border/70 p-4 space-y-4 sm:p-5" data-tour="calendar-grid">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <p className="font-semibold text-foreground">{monthLabel}</p>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          {loading ? (
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="min-h-18 rounded-lg border border-border bg-card/50 p-1 animate-pulse motion-reduce:animate-none" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {cells.map((c) => {
                const dayEvents = c.date ? byDay.get(c.key) || [] : []
                return (
                  <div
                    key={c.key}
                    className={`min-h-18 rounded-lg border p-1 text-left ${
                      c.date ? 'border-border/70 bg-card' : 'border-transparent'
                    }`}
                  >
                    {c.date && (
                      <>
                        <p className="text-[11px] font-medium tabular-nums text-foreground px-0.5">{c.date.getDate()}</p>
                        <div className="mt-0.5 space-y-0.5">
                          {dayEvents.slice(0, 2).map((ev) => (
                            <p
                              key={ev.id}
                              title={ev.title}
                              className={`truncate rounded px-1 text-[10px] ${
                                ev.readOnly ? 'bg-cs-accent/15 text-cs-accent-text' : 'bg-primary/15 text-primary'
                              }`}
                            >
                              {ev.title}
                            </p>
                          ))}
                          {dayEvents.length > 2 && (
                            <p className="px-1 text-[10px] text-muted-foreground">+{dayEvents.length - 2}</p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="space-y-3 rounded-3xl border-border/70 p-5" data-tour="calendar-add">
            <h2 className="text-lg flex items-center gap-2 font-semibold text-foreground">
              <Plus className="h-4 w-4 text-primary" aria-hidden /> Add event
            </h2>
            <div className="space-y-2">
              <Label htmlFor="cal-title">Title</Label>
              <Input id="cal-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Study session / deadline" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cal-when">When</Label>
              <Input id="cal-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            </div>
            <Button onClick={addEvent} disabled={busy} className="w-full">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save event
            </Button>
          </Card>

          <Card className="space-y-3 rounded-3xl border-border/70 p-5">
            <h2 className="text-lg font-semibold text-foreground">Upcoming</h2>
            {loadError && items.length === 0 ? (
              <EmptyState
                compact
                illustration="error"
                title="Couldn't load your calendar"
                description="Check your connection and try again."
                actionLabel="Try again"
                onAction={() => void load()}
              />
            ) : visible.length === 0 ? (
              <EmptyState
                compact
                illustration="calendar"
                title={filter === 'all' ? 'Nothing scheduled yet' : 'Nothing here for this filter'}
                description={
                  filter === 'all'
                    ? 'Add an entry here, join a hackathon or codeathon, or use “Add to calendar” on a course.'
                    : 'Try another filter, or join an event to see its dates here.'
                }
                actionLabel={filter === 'all' ? 'Browse events' : undefined}
                actionHref={filter === 'all' ? '/dashboard/events' : undefined}
              />
            ) : (
              <ul className="max-h-80 space-y-2 overflow-y-auto">
                {visible
                  .slice()
                  .sort((a, b) => +new Date(a.start) - +new Date(b.start))
                  .map((ev) => (
                    <li key={ev.id} className="flex gap-2 rounded-xl border border-border/70 p-2.5 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground">{ev.title}</p>
                        <p className="text-[11px] tabular-nums text-muted-foreground">{formatDateTime(ev.start)}</p>
                        {ev.url && (
                          <Link href={ev.url} className="text-[11px] text-primary hover:underline">
                            Open →
                          </Link>
                        )}
                      </div>
                      {ev.readOnly ? (
                        <span className="self-start rounded-full border border-border px-2 py-0.5 text-[10px] capitalize text-muted-foreground">
                          {ev.source}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="rounded-md p-1 text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-2 focus-visible:outline-primary"
                          onClick={() => void remove(ev.id)}
                          aria-label={`Delete ${ev.title}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
