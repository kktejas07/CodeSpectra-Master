'use client'

/**
 * One mentoring session for its learner or mentor: time, join (built-in video or the external
 * link), code-review attachment, reschedule (learner, within the mentor's policy) and dispute.
 * Cancel / refund / review stay on the marketplace order page.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { CalendarClock, Code2, Flag, Video } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/components/marketplace/seller/shared'
import { LiveRoom } from '@/app/interview/_components/live-room'
import type { SessionView } from '@/lib/mentors/sessions'

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })

export default function SessionPage() {
  const gate = usePageGuard('user')
  const { id = '' } = useParams<{ id: string }>()
  const router = useRouter()
  const [s, setS] = useState<SessionView | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [inRoom, setInRoom] = useState(false)
  const load = useCallback(() => { api<{ session: SessionView }>(`/api/mentors/sessions/${encodeURIComponent(id)}`).then((r) => setS(r.session)).catch((e) => setErr(e.message)) }, [id])
  useEffect(() => { if (gate.ready) load() }, [gate.ready, load])
  const getToken = useCallback(async () => {
    const r = await api<{ token: string; url: string }>(`/api/mentors/sessions/${encodeURIComponent(id)}/token`, { body: {} })
    return { token: r.token, url: r.url }
  }, [id])

  if (!gate.ready) return null
  if (err) return <EmptyState illustration="error" title="We could not open this session" description={err} actionLabel="Back to orders" actionHref="/dashboard/orders" />
  if (!s) return <div className="h-48 animate-pulse rounded-3xl bg-muted motion-reduce:animate-none" />
  if (inRoom) return <LiveRoom getToken={getToken} title={s.title} onLeave={() => { setInRoom(false); router.refresh() }} />

  const started = Date.now() >= Date.parse(s.start)
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <PageHeader title={s.title} icon={<Video />} description={s.role === 'buyer' ? `With ${s.mentor.name}` : 'Your mentoring session'}
        actions={s.role === 'buyer' ? <Button asChild variant="outline" className="rounded-full"><Link href={`/dashboard/orders/${s.order_id}`}>Order, cancel or review</Link></Button> : <Button asChild variant="outline" className="rounded-full"><Link href="/dashboard/seller?tab=bookings">Mark done or cancel</Link></Button>} />
      <Panel className="space-y-4 p-5 sm:p-6">
        <p className="flex items-center gap-2 text-foreground"><CalendarClock className="h-5 w-5 text-primary" aria-hidden /><span className="tabular-nums">{fmt(s.start)}</span></p>
        <p className="text-sm text-muted-foreground">Status: {s.status === 'booked' ? 'Booked' : s.status === 'completed' ? 'Completed' : s.status === 'cancelled' ? 'Cancelled' : s.status}{s.dispute_open ? ' · dispute open' : ''}</p>
        {s.status === 'booked' && (s.built_in_video ? (
          <Button className="min-h-[44px] rounded-full" disabled={!s.can_join} onClick={() => setInRoom(true)}><Video className="mr-1.5 h-4 w-4" />{s.can_join ? 'Join the session' : 'Opens 15 minutes before the start'}</Button>
        ) : s.join_url ? (
          <Button asChild className="min-h-[44px] rounded-full"><a href={s.join_url} target="_blank" rel="noopener noreferrer">Open meeting link</a></Button>
        ) : <p className="text-sm text-muted-foreground">The mentor will share the meeting link here and by e-mail before the session.</p>)}
      </Panel>
      {s.offering_type === 'code_review' && <Attachment s={s} onChange={setS} />}
      {s.role === 'buyer' && s.status === 'booked' && !started && <Reschedule s={s} onChange={setS} />}
      {s.role === 'buyer' && started && (s.status === 'booked' || s.status === 'completed') && !s.dispute_open && <Dispute s={s} onChange={setS} />}
    </div>
  )
}

function Attachment({ s, onChange }: { s: SessionView; onChange: (v: SessionView) => void }) {
  const addToast = useToast()
  const [subs, setSubs] = useState<{ id: string; title: string; language: string; created_at: string }[] | null>(null)
  const [pick, setPick] = useState('')
  const [url, setUrl] = useState('')
  const [code, setCode] = useState<{ language: string | null; problem_title: string | null; source_code: string } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (s.role === 'buyer' && s.status === 'booked') api<{ submissions: typeof subs }>('/api/mentors/submissions').then((r) => setSubs(r.submissions)).catch(() => setSubs([])) }, [s.role, s.status])
  const attach = async (body: Record<string, string>) => {
    setBusy(true)
    try { onChange((await api<{ session: SessionView }>(`/api/mentors/sessions/${s.id}/attachment`, { body })).session); addToast({ type: 'success', title: 'Attached for your mentor' }) } catch (x) { addToast({ type: 'error', title: (x as Error).message }) } finally { setBusy(false) }
  }
  const a = s.attachment
  return (
    <Panel className="space-y-4 p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground"><Code2 className="h-5 w-5 text-primary" aria-hidden />Code for review</h2>
      {a ? (
        <div className="space-y-2 text-sm">
          {a.kind === 'link' ? <p>Repository: <a className="text-primary underline-offset-2 hover:underline" href={a.url} target="_blank" rel="noopener noreferrer nofollow">{a.url}</a></p>
            : <p>Submission: <span className="font-medium text-foreground">{a.problem_title || 'Practice submission'}</span>{a.language ? ` (${a.language})` : ''}</p>}
          {a.kind === 'submission' && (code ? (
            <pre className="max-h-[480px] overflow-auto rounded-2xl bg-slate-950 p-4 font-mono text-xs text-slate-100"><code>{code.source_code}</code></pre>
          ) : <Button size="sm" variant="outline" className="rounded-full" onClick={() => api<{ attachment: typeof code }>(`/api/mentors/sessions/${s.id}/attachment`).then((r) => setCode(r.attachment)).catch((x) => addToast({ type: 'error', title: (x as Error).message }))}>Show the code</Button>)}
        </div>
      ) : s.role === 'mentor' ? <p className="text-sm text-muted-foreground">The learner has not attached anything yet.</p> : null}
      {s.role === 'buyer' && s.status === 'booked' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="att-sub">One of your submissions</Label>
            <select id="att-sub" className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">{subs === null ? 'Loading…' : subs.length ? 'Choose a submission' : 'No submissions yet'}</option>
              {(subs || []).map((x) => <option key={x.id} value={x.id}>{x.title} · {x.language} · {new Date(x.created_at).toLocaleDateString()}</option>)}
            </select>
            <Button size="sm" className="rounded-full" disabled={!pick || busy} onClick={() => attach({ submission_id: pick })}>Attach submission</Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="att-url">Or a repository link</Label>
            <Input id="att-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/you/project" />
            <Button size="sm" variant="outline" className="rounded-full" disabled={!url || busy} onClick={() => attach({ url })}>Attach link</Button>
          </div>
        </div>
      )}
    </Panel>
  )
}

function Reschedule({ s, onChange }: { s: SessionView; onChange: (v: SessionView) => void }) {
  const addToast = useToast()
  const [open, setOpen] = useState(false)
  const [slots, setSlots] = useState<string[] | null>(null)
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)
  const left = s.policy.max_reschedules - s.reschedules_used
  const cutoff = Date.parse(s.start) - s.policy.reschedule_hours * 3_600_000
  useEffect(() => { if (open) api<{ slots: string[] }>(`/api/mentors/sessions/${s.id}/slots`).then((r) => setSlots(r.slots)).catch(() => setSlots([])) }, [open, s.id])
  const byDay = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const t of slots || []) { const k = new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); m.set(k, [...(m.get(k) || []), t]) }
    return [...m.entries()]
  }, [slots])
  if (left <= 0 || Date.now() > cutoff) return <Panel className="p-5 text-sm text-muted-foreground sm:p-6">Rescheduling is closed for this session ({s.policy.max_reschedules === 0 ? 'this mentor does not allow it' : left <= 0 ? 'already rescheduled' : `allowed up to ${s.policy.reschedule_hours} hours before`}). You can still cancel from your order within the cancellation window.</Panel>
  return (
    <Panel className="space-y-3 p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-foreground">Need a different time?</h2>
      <p className="text-sm text-muted-foreground">You can move this session up to {s.policy.reschedule_hours} hours before it starts ({left} change{left === 1 ? '' : 's'} left).</p>
      {!open ? <Button variant="outline" className="min-h-[44px] rounded-full" onClick={() => setOpen(true)}>Pick a new time</Button> : slots === null ? <div className="h-16 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" /> : slots.length === 0 ? <p className="text-sm text-muted-foreground">No free times in the next two weeks.</p> : (
        <div className="space-y-3">
          {byDay.map(([day, ts]) => (
            <fieldset key={day}><legend className="mb-1 text-sm font-medium text-foreground">{day}</legend>
              <div className="flex flex-wrap gap-2">{ts.map((t) => <button key={t} type="button" aria-pressed={pick === t} onClick={() => setPick(t)} className={`min-h-[40px] rounded-full border px-3 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${pick === t ? 'border-primary bg-primary/10 font-semibold text-primary' : 'border-border text-foreground'}`}>{new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</button>)}</div>
            </fieldset>
          ))}
          <Button className="min-h-[44px] rounded-full" disabled={!pick || busy} onClick={async () => {
            setBusy(true)
            try { onChange((await api<{ session: SessionView }>(`/api/mentors/sessions/${s.id}/reschedule`, { body: { start: pick } })).session); addToast({ type: 'success', title: 'Session moved', message: 'You and your mentor get an updated calendar invite.' }); setOpen(false) } catch (x) { addToast({ type: 'error', title: (x as Error).message }) } finally { setBusy(false) }
          }}>Move to this time</Button>
        </div>
      )}
    </Panel>
  )
}

function Dispute({ s, onChange }: { s: SessionView; onChange: (v: SessionView) => void }) {
  const addToast = useToast()
  const [reason, setReason] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <Panel className="space-y-3 p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground"><Flag className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden />Something went wrong?</h2>
      {!open ? <Button variant="outline" className="min-h-[44px] rounded-full" onClick={() => setOpen(true)}>Report a problem</Button> : (
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          try { onChange((await api<{ session: SessionView }>(`/api/mentors/sessions/${s.id}/dispute`, { body: { reason } })).session); addToast({ type: 'success', title: 'Dispute sent', message: 'Our team reviews it and decides on a refund. The mentor is paid only after that.' }) } catch (x) { addToast({ type: 'error', title: (x as Error).message }) } finally { setBusy(false) }
        }}>
          <Label htmlFor="d-reason">What happened?</Label>
          <Textarea id="d-reason" rows={4} minLength={20} maxLength={1000} required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: the mentor did not join, or the session ended after 10 minutes." />
          <Button type="submit" disabled={busy} className="min-h-[44px] rounded-full">{busy ? 'Sending…' : 'Send to the CodeSpectra team'}</Button>
        </form>
      )}
    </Panel>
  )
}
