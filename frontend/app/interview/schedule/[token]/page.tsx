'use client'

/**
 * Candidate self-schedule page (public, signed link from the invite email).
 * Shows the open slots computed from the panel's calendars and books one.
 * Times are shown in the visitor's own time zone.
 */
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { CalendarCheck, Clock, Loader2, MapPin, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/app/page-kit'
import { Illustration, SoftGlow } from '@/components/visuals'
import { csrfFetch } from '@/lib/csrf-fetch'
import { cn } from '@/lib/utils'

interface View {
  status: 'awaiting_schedule' | 'scheduled' | 'completed' | 'no_show' | 'cancelled'
  job_title: string
  stage_name: string | null
  candidate_name: string | null
  mode: 'virtual' | 'f2f'
  duration_min: number
  scheduled_at: string | null
  requested_slot: string | null
  location: { address: string; room?: string | null; map_url?: string | null; instructions?: string | null } | null
}
interface Data { interview: View; slots: { start: string; end: string }[]; can_pick: boolean; timezone: string }

const localTz = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return 'your time zone' }
}
const dayKey = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
const full = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

export default function SelfSchedulePage() {
  const { token = '' } = useParams<{ token: string }>()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [day, setDay] = useState<string | null>(null)
  const [pick, setPick] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  async function load() {
    setLoading(true)
    try {
      const r = await fetch(`/api/ats/interviews/self-schedule?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error || 'This link is not valid.'); setData(null) }
      else { setData(j); setError(null) }
    } catch {
      setError('Could not load your interview. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  const byDay = useMemo(() => {
    const m = new Map<string, { start: string; end: string }[]>()
    for (const s of data?.slots || []) {
      const k = dayKey(s.start)
      m.set(k, [...(m.get(k) || []), s])
    }
    return m
  }, [data?.slots])
  const days = [...byDay.keys()]
  const activeDay = day && byDay.has(day) ? day : days[0] ?? null

  async function book() {
    if (!pick) return
    setBusy(true); setNotice(null)
    try {
      const r = await csrfFetch('/api/ats/interviews/self-schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, start: pick }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setNotice({ ok: false, text: j.error || 'Could not book that time.' })
        if (r.status === 409) { setPick(null); void load() }
      } else if (j.booked) {
        setNotice({ ok: true, text: "You're booked. We've emailed you the details and a calendar invite." })
        setData((d) => (d ? { ...d, interview: j.interview, can_pick: false, slots: [] } : d))
      } else {
        setNotice({ ok: true, text: "Thanks — we've sent your choice to the hiring team. They'll confirm by email shortly." })
        setData((d) => (d ? { ...d, interview: j.interview, can_pick: false, slots: [] } : d))
      }
    } catch {
      setNotice({ ok: false, text: 'Could not book that time. Check your connection and try again.' })
    } finally {
      setBusy(false)
    }
  }

  const shell = (children: React.ReactNode) => (
    <main className="relative isolate flex min-h-[85vh] items-start justify-center bg-background px-4 py-10 sm:items-center">
      <SoftGlow />
      <Panel className="w-full max-w-2xl p-6 sm:p-8">{children}</Panel>
    </main>
  )

  if (loading && !data) {
    return <div className="flex min-h-[70vh] items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="Loading your interview" /></div>
  }
  if (error || !data) {
    return shell(
      <div className="text-center">
        <Illustration name="calendar" className="mx-auto w-36" />
        <h1 className="mt-3 text-lg font-semibold text-foreground">This link doesn't work any more</h1>
        <p className="mt-1 text-sm text-muted-foreground">{error || 'Ask the recruiter to send you a new link.'}</p>
      </div>,
    )
  }

  const iv = data.interview
  const header = (
    <div className="flex items-start gap-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
        {iv.mode === 'f2f' ? <MapPin className="h-5 w-5" aria-hidden /> : <Video className="h-5 w-5" aria-hidden />}
      </span>
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-foreground">{iv.job_title}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {iv.stage_name ? `${iv.stage_name} · ` : ''}{iv.duration_min} minutes · {iv.mode === 'f2f' ? 'in person' : 'video call'}
        </p>
        {iv.mode === 'f2f' && iv.location?.address && <p className="mt-1 text-sm text-muted-foreground">{iv.location.address}{iv.location.room ? ` · ${iv.location.room}` : ''}</p>}
      </div>
    </div>
  )

  if (iv.status === 'scheduled' && iv.scheduled_at) {
    return shell(
      <>
        {header}
        <div className="mt-6 rounded-2xl border border-green-600/30 bg-green-500/10 p-4" role="status">
          <p className="flex items-center gap-2 font-medium text-foreground"><CalendarCheck className="h-4 w-4 text-green-700 dark:text-green-400" aria-hidden /> You're booked</p>
          <p className="mt-1 text-sm text-muted-foreground">{full(iv.scheduled_at)} ({localTz()}). The join link and calendar invite are in your email.</p>
        </div>
        {notice && <p className="mt-4 text-sm text-muted-foreground" role="status">{notice.text}</p>}
      </>,
    )
  }
  if (!data.can_pick) {
    return shell(
      <>
        {header}
        <div className="mt-6 text-center">
          <Illustration name={iv.requested_slot ? 'success' : 'calendar'} className="mx-auto w-32" />
          <p className="mt-2 text-sm text-muted-foreground" role="status">
            {notice?.text || (iv.requested_slot
              ? `You asked for ${full(iv.requested_slot)}. The hiring team will confirm by email.`
              : iv.status === 'cancelled' ? 'This interview was cancelled. The hiring team will contact you.' : 'The hiring team will schedule this interview with you directly.')}
          </p>
        </div>
      </>,
    )
  }

  return shell(
    <>
      {header}
      <h2 className="mt-6 text-base font-semibold text-foreground">{iv.candidate_name ? `Hi ${iv.candidate_name.split(' ')[0]}, pick a time` : 'Pick a time'}</h2>
      <p className="text-sm text-muted-foreground">Times are shown in {localTz()}.</p>

      {!days.length ? (
        <div className="mt-6 text-center">
          <Illustration name="calendar" className="mx-auto w-32" />
          <p className="mt-2 text-sm text-muted-foreground">No open times right now. The hiring team has been told and will reach out with options.</p>
        </div>
      ) : (
        <>
          <div className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Days">
            {days.map((d) => (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={d === activeDay}
                onClick={() => { setDay(d); setPick(null) }}
                className={cn(
                  'min-h-11 shrink-0 rounded-xl border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  d === activeDay ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {d}
              </button>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Start times">
            {(activeDay ? byDay.get(activeDay) || [] : []).map((s) => (
              <button
                key={s.start}
                type="button"
                role="radio"
                aria-checked={pick === s.start}
                onClick={() => setPick(s.start)}
                className={cn(
                  'flex min-h-11 items-center justify-center gap-1.5 rounded-xl border text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  pick === s.start ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground hover:border-primary/50 hover:bg-primary/5',
                )}
              >
                <Clock className="h-3.5 w-3.5" aria-hidden /> {timeOf(s.start)}
              </button>
            ))}
          </div>
          {notice && <p className={cn('mt-4 text-sm', notice.ok ? 'text-muted-foreground' : 'text-destructive')} role="alert">{notice.text}</p>}
          <div className="mt-6 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">{pick ? `Selected: ${full(pick)}` : 'Select a time to continue.'}</p>
            <Button className="min-h-11 rounded-full px-6" disabled={!pick || busy} onClick={() => void book()}>
              {busy ? <><Loader2 className="mr-1 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> Booking…</> : 'Confirm time'}
            </Button>
          </div>
        </>
      )}
    </>,
  )
}
