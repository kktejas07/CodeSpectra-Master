'use client'

import { useMemo, useState } from 'react'
import { Calendar, Download, ExternalLink, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { buildIcs, downloadIcs, googleCalendarUrl, type CalendarEvent } from '@/lib/calendar/ics'
import { cn } from '@/lib/utils'

type Props = {
  courseTitle: string
  courseUrl: string
  /** Optional ISO dates the learner can tick (Unstop-style). */
  dates?: Array<{ id: string; label: string; at: string; description?: string }>
  className?: string
  /** Match course hero icon buttons */
  variant?: 'hero' | 'outline'
}

/**
 * Unstop-style “Add to calendar”: pick dates → download .ics and/or open Google Calendar.
 */
export function AddToCalendarButton({
  courseTitle,
  courseUrl,
  dates,
  className,
  variant = 'hero',
}: Props) {
  const [open, setOpen] = useState(false)

  const options = useMemo(() => {
    if (dates?.length) return dates
    const start = new Date()
    start.setMinutes(0, 0, 0)
    start.setHours(start.getHours() + 1)
    const week = new Date(start)
    week.setDate(week.getDate() + 7)
    return [
      {
        id: 'start',
        label: 'Start learning',
        at: start.toISOString(),
        description: `Begin ${courseTitle} on CodeSpectra`,
      },
      {
        id: 'checkin',
        label: 'Weekly check-in',
        at: week.toISOString(),
        description: `Continue ${courseTitle} — review progress`,
      },
    ]
  }, [dates, courseTitle])

  const [selected, setSelected] = useState<Set<string>>(() => new Set(options.map(o => o.id)))

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedEvents = (): CalendarEvent[] =>
    options
      .filter(o => selected.has(o.id))
      .map(o => ({
        title: `${courseTitle} — ${o.label}`,
        description: `${o.description || o.label}\n${courseUrl}`,
        start: o.at,
        url: courseUrl,
        location: 'CodeSpectra',
      }))

  const handleDownload = () => {
    const events = selectedEvents()
    if (!events.length) return
    downloadIcs(`${courseTitle.replace(/\s+/g, '-').toLowerCase()}.ics`, buildIcs(events, courseTitle))
    setOpen(false)
  }

  const handleGoogle = () => {
    const events = selectedEvents()
    if (!events.length) return
    // Google only accepts one event per template URL — open the first; still offer ICS for all.
    window.open(googleCalendarUrl(events[0]), '_blank', 'noopener,noreferrer')
  }

  const btnClass =
    variant === 'hero'
      ? cn(
          'h-12 w-12 rounded-xl border border-white/20 bg-white/5 flex items-center justify-center text-white/60 hover:border-white/40 hover:text-white transition-all',
          className,
        )
      : cn('h-9 w-9 rounded-full border', className)

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" aria-label="Add to calendar" onClick={() => setOpen(true)} className={btnClass}>
            <Calendar className="h-5 w-5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Add to calendar</p>
        </TooltipContent>
      </Tooltip>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-base">Select dates to add</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Save on CodeSpectra (recommended), or optionally export .ics / Google.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-800 dark:text-sky-200 text-xs p-3">
              You can select the dates you want as calendar events.
            </div>

            <ul className="space-y-3 max-h-60 overflow-y-auto">
              {options.map((o, i) => (
                <li key={o.id} className="flex items-start gap-3 text-sm">
                  <span className="text-xs font-bold text-muted-foreground w-4 pt-0.5">{i + 1}.</span>
                  <label className="flex-1 flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selected.has(o.id)}
                      onChange={() => toggle(o.id)}
                    />
                    <span>
                      <span className="font-semibold block">{o.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(o.at).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-2 pt-1">
              <Button
                className="w-full"
                disabled={selected.size === 0}
                onClick={async () => {
                  const events = selectedEvents()
                  if (!events.length) return
                  const payload = {
                    events: events.map((e) => ({
                      title: e.title,
                      description: e.description,
                      start: typeof e.start === 'string' ? e.start : new Date(e.start as any).toISOString(),
                      url: e.url || courseUrl,
                      source: 'course',
                    })),
                  }
                  try {
                    const { csrfFetch } = await import('@/lib/csrf-fetch')
                    const res = await csrfFetch('/api/user/calendar', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload),
                    })
                    if (!res.ok) throw new Error('Failed to save')
                    setOpen(false)
                    window.location.href = '/dashboard/calendar'
                  } catch {
                    // keep dialog open; user can still use .ics
                  }
                }}
              >
                <Calendar className="h-4 w-4 mr-2" /> Save to CodeSpectra Calendar
              </Button>
              <Button variant="outline" className="w-full" disabled={selected.size === 0} onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" /> Download .ics (optional)
              </Button>
              <Button variant="ghost" className="w-full" disabled={selected.size === 0} onClick={handleGoogle}>
                <ExternalLink className="h-4 w-4 mr-2" /> Open in Google Calendar
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
