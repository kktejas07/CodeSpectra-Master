'use client'
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

type CalEvent = {
  id: string
  title: string
  description?: string
  start: string
  end?: string | null
  url?: string | null
  source?: string
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
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
  const { startTour, setTourSeen } = useTour()

  useEffect(() => {
    if (gate.ready) {
      const calendarTour: TourStep[] = [
        {
          target: '[data-tour="calendar-header"]',
          title: 'Personal Study Calendar Hub',
          description: 'Manage study sessions, deadlines, and course events in one place for your prep.',
          position: 'bottom',
        },
        {
          target: '[data-tour="calendar-grid"]',
          title: 'Browse Events by Month',
          description: 'Browse days with the arrow buttons to spot sessions and deadlines across months.',
          position: 'right',
        },
        {
          target: '[data-tour="calendar-add"]',
          title: 'Save Study Session Fast',
          description: 'Where next: enter a title and date, Save on CodeSpectra, then track it in Upcoming.',
          position: 'left',
        },
      ]
      autoPlayPageTour('calendar', calendarTour)}
  }, [gate.ready, startTour, setTourSeen])

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/user/calendar', { cache: 'no-store' })
      const json = await res.json()
      setItems(Array.isArray(json.items) ? json.items : [])
    } catch {
      addToast({ type: 'error', title: 'Could not load calendar' })
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void load()
  }, [load])

  const byDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>()
    for (const ev of items) {
      const key = new Date(ev.start).toISOString().slice(0, 10)
      const list = map.get(key) || []
      list.push(ev)
      map.set(key, list)
    }
    return map
  }, [items])

  const cells = useMemo(() => {
    const first = startOfMonth(cursor)
    const pad = first.getDay()
    const total = daysInMonth(cursor)
    const out: Array<{ date: Date | null; key: string }> = []
    for (let i = 0; i < pad; i++) out.push({ date: null, key: `pad-${i}` })
    for (let d = 1; d <= total; d++) {
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), d)
      out.push({ date, key: date.toISOString().slice(0, 10) })
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
      <div className="flex flex-wrap items-center justify-between gap-3" data-tour="calendar-header">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <CalendarDays className="h-7 w-7 text-primary" /> Calendar
        </h1>
        <p className="text-sm text-muted-foreground max-w-md">
          Stay on CodeSpectra — events live here. Optional .ics / Google export remains available from courses if you want external sync.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="p-4 space-y-4" data-tour="calendar-grid">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <p className="font-semibold">{monthLabel}</p>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase text-muted-foreground">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          {loading ? (
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="min-h-18 rounded-md border border-border bg-card/50 p-1 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {cells.map((c) => {
                const dayEvents = c.date ? byDay.get(c.key) || [] : []
                return (
                  <div
                    key={c.key}
                    className={`min-h-18 rounded-md border p-1 text-left ${
                      c.date ? 'border-border bg-card' : 'border-transparent'
                    }`}
                  >
                    {c.date && (
                      <>
                        <p className="text-[11px] font-medium px-0.5">{c.date.getDate()}</p>
                        <div className="mt-0.5 space-y-0.5">
                          {dayEvents.slice(0, 2).map((ev) => (
                            <p key={ev.id} className="truncate rounded bg-primary/15 px-1 text-[10px] text-primary">
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
          <Card className="space-y-3 p-4" data-tour="calendar-add">
            <h2 className="flex items-center gap-2 font-semibold">
              <Plus className="h-4 w-4" /> Add event
            </h2>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Study session / deadline" />
            </div>
            <div className="space-y-2">
              <Label>When</Label>
              <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            </div>
            <Button onClick={addEvent} disabled={busy} className="w-full">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save on CodeSpectra
            </Button>
          </Card>

          <Card className="space-y-3 p-4">
            <h2 className="font-semibold">Upcoming</h2>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No events yet. Add one here, or use “Add to calendar” on a course.
              </p>
            ) : (
              <ul className="max-h-80 space-y-2 overflow-y-auto">
                {items
                  .slice()
                  .sort((a, b) => +new Date(a.start) - +new Date(b.start))
                  .map((ev) => (
                    <li key={ev.id} className="flex gap-2 rounded-lg border border-border p-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{ev.title}</p>
                        <p className="text-[11px] text-muted-foreground">{formatDateTime(ev.start)}</p>
                        {ev.url && (
                          <Link href={ev.url} className="text-[11px] text-primary hover:underline">
                            Open →
                          </Link>
                        )}
                      </div>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => void remove(ev.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
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
