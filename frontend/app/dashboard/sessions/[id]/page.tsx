'use client'

/**
 * One mentoring session for its learner or mentor: time, join (built-in video or the external
 * link), code-review attachment, reschedule (learner, within the mentor's policy) and dispute.
 * Cancel / refund / review stay on the marketplace order page.
 */
import { formatDate } from '@/lib/i18n/format'
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
import { useT, activeLocale } from '@/lib/i18n/client'

const fmt = (iso: string) => formatDate(activeLocale(), iso, { dateStyle: 'full', timeStyle: 'short' })

export default function SessionPage() {
  const { t } = useT()
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
  if (err) return <EmptyState illustration="error" title={t('career.weCouldNotOpenThisSession')} description={err} actionLabel={t('career.backToOrders')} actionHref="/dashboard/orders" />
  if (!s) return <div className="h-48 animate-pulse rounded-3xl bg-muted motion-reduce:animate-none" />
  if (inRoom) return <LiveRoom getToken={getToken} title={s.title} onLeave={() => { setInRoom(false); router.refresh() }} />

  const started = Date.now() >= Date.parse(s.start)
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <PageHeader title={s.title} icon={<Video />} description={s.role === 'buyer' ? t('career.withName', { name: s.mentor.name }) : t('career.yourMentoringSession')}
        actions={s.role === 'buyer' ? <Button asChild variant="outline" className="rounded-full"><Link href={`/dashboard/orders/${s.order_id}`}>{t('career.orderCancelOrReview')}</Link></Button> : <Button asChild variant="outline" className="rounded-full"><Link href="/dashboard/seller?tab=bookings">{t('career.markDoneOrCancel')}</Link></Button>} />
      <Panel className="space-y-4 p-5 sm:p-6">
        <p className="flex items-center gap-2 text-foreground"><CalendarClock className="h-5 w-5 text-primary" aria-hidden /><span className="tabular-nums">{fmt(s.start)}</span></p>
        <p className="text-sm text-muted-foreground">{t('career.status2')}{' '}{s.status === 'booked' ? t('career.booked') : s.status === 'completed' ? t('career.completed') : s.status === 'cancelled' ? t('career.cancelled') : s.status}{s.dispute_open ? t('career.disputeOpen2') : ''}</p>
        {s.status === 'booked' && (s.built_in_video ? (
          <Button className="min-h-[44px] rounded-full" disabled={!s.can_join} onClick={() => setInRoom(true)}><Video className="mr-1.5 h-4 w-4" />{s.can_join ? t('career.joinTheSession') : t('career.opens15MinutesBeforeTheStart')}</Button>
        ) : s.join_url ? (
          <Button asChild className="min-h-[44px] rounded-full"><a href={s.join_url} target="_blank" rel="noopener noreferrer">{t('career.openMeetingLink')}</a></Button>
        ) : <p className="text-sm text-muted-foreground">{t('career.theMentorWillShareTheMeetingd95')}</p>)}
      </Panel>
      {s.offering_type === 'code_review' && <Attachment s={s} onChange={setS} />}
      {s.role === 'buyer' && s.status === 'booked' && !started && <Reschedule s={s} onChange={setS} />}
      {s.role === 'buyer' && started && (s.status === 'booked' || s.status === 'completed') && !s.dispute_open && <Dispute s={s} onChange={setS} />}
    </div>
  )
}

function Attachment({ s, onChange }: { s: SessionView; onChange: (v: SessionView) => void }) {
  const { t } = useT()
  const addToast = useToast()
  const [subs, setSubs] = useState<{ id: string; title: string; language: string; created_at: string }[] | null>(null)
  const [pick, setPick] = useState('')
  const [url, setUrl] = useState('')
  const [code, setCode] = useState<{ language: string | null; problem_title: string | null; source_code: string } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (s.role === 'buyer' && s.status === 'booked') api<{ submissions: typeof subs }>('/api/mentors/submissions').then((r) => setSubs(r.submissions)).catch(() => setSubs([])) }, [s.role, s.status])
  const attach = async (body: Record<string, string>) => {
    setBusy(true)
    try { onChange((await api<{ session: SessionView }>(`/api/mentors/sessions/${s.id}/attachment`, { body })).session); addToast({ type: 'success', title: t('career.attachedForYourMentor') }) } catch (x) { addToast({ type: 'error', title: (x as Error).message }) } finally { setBusy(false) }
  }
  const a = s.attachment
  return (
    <Panel className="space-y-4 p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground"><Code2 className="h-5 w-5 text-primary" aria-hidden />{t('career.codeForReview')}</h2>
      {a ? (
        <div className="space-y-2 text-sm">
          {a.kind === 'link' ? <p>{t('career.repository')}{' '}<a className="text-primary underline-offset-2 hover:underline" href={a.url} target="_blank" rel="noopener noreferrer nofollow">{a.url}</a></p>
            : <p>{t('career.submission')}{' '}<span className="font-medium text-foreground">{a.problem_title || t('career.practiceSubmission')}</span>{a.language ? ` (${a.language})` : ''}</p>}
          {a.kind === 'submission' && (code ? (
            <pre className="max-h-[480px] overflow-auto rounded-2xl bg-slate-950 p-4 font-mono text-xs text-slate-100"><code>{code.source_code}</code></pre>
          ) : <Button size="sm" variant="outline" className="rounded-full" onClick={() => api<{ attachment: typeof code }>(`/api/mentors/sessions/${s.id}/attachment`).then((r) => setCode(r.attachment)).catch((x) => addToast({ type: 'error', title: (x as Error).message }))}>{t('career.showTheCode')}</Button>)}
        </div>
      ) : s.role === 'mentor' ? <p className="text-sm text-muted-foreground">{t('career.theLearnerHasNotAttachedAnything71d')}</p> : null}
      {s.role === 'buyer' && s.status === 'booked' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="att-sub">{t('career.oneOfYourSubmissions')}</Label>
            <select id="att-sub" className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">{subs === null ? t('common.loading') : subs.length ? t('career.chooseASubmission') : t('career.noSubmissionsYet')}</option>
              {(subs || []).map((x) => <option key={x.id} value={x.id}>{x.title} · {x.language} · {formatDate(activeLocale(), x.created_at)}</option>)}
            </select>
            <Button size="sm" className="rounded-full" disabled={!pick || busy} onClick={() => attach({ submission_id: pick })}>{t('career.attachSubmission')}</Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="att-url">{t('career.orARepositoryLink')}</Label>
            <Input id="att-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/you/project" />
            <Button size="sm" variant="outline" className="rounded-full" disabled={!url || busy} onClick={() => attach({ url })}>{t('career.attachLink')}</Button>
          </div>
        </div>
      )}
    </Panel>
  )
}

function Reschedule({ s, onChange }: { s: SessionView; onChange: (v: SessionView) => void }) {
  const { t: tr } = useT()
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
    for (const t of slots || []) { const k = formatDate(activeLocale(), t, { weekday: 'short', day: 'numeric', month: 'short' }); m.set(k, [...(m.get(k) || []), t]) }
    return [...m.entries()]
  }, [slots])
  if (left <= 0 || Date.now() > cutoff) return <Panel className="p-5 text-sm text-muted-foreground sm:p-6">{tr('career.reschedulingIsClosedForThisSession')}{s.policy.max_reschedules === 0 ? tr('career.thisMentorDoesNotAllowIt') : left <= 0 ? tr('career.alreadyRescheduled') : tr('career.allowedUpToRescheduleHoursHourse6f', { reschedule_hours: s.policy.reschedule_hours })}{tr('career.youCanStillCancelFromYour416')}</Panel>
  return (
    <Panel className="space-y-3 p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-foreground">{tr('career.needADifferentTime')}</h2>
      <p className="text-sm text-muted-foreground">{tr('career.youCanMoveThisSessionUp134', { count: left, reschedule_hours: s.policy.reschedule_hours })}</p>
      {!open ? <Button variant="outline" className="min-h-[44px] rounded-full" onClick={() => setOpen(true)}>{tr('career.pickANewTime')}</Button> : slots === null ? <div className="h-16 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" /> : slots.length === 0 ? <p className="text-sm text-muted-foreground">{tr('career.noFreeTimesInTheNextf86')}</p> : (
        <div className="space-y-3">
          {byDay.map(([day, ts]) => (
            <fieldset key={day}><legend className="mb-1 text-sm font-medium text-foreground">{day}</legend>
              <div className="flex flex-wrap gap-2">{ts.map((t) => <button key={t} type="button" aria-pressed={pick === t} onClick={() => setPick(t)} className={`min-h-[40px] rounded-full border px-3 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${pick === t ? 'border-primary bg-primary/10 font-semibold text-primary' : 'border-border text-foreground'}`}>{formatDate(activeLocale(), t, { hour: '2-digit', minute: '2-digit' })}</button>)}</div>
            </fieldset>
          ))}
          <Button className="min-h-[44px] rounded-full" disabled={!pick || busy} onClick={async () => {
            setBusy(true)
            try { onChange((await api<{ session: SessionView }>(`/api/mentors/sessions/${s.id}/reschedule`, { body: { start: pick } })).session); addToast({ type: 'success', title: tr('career.sessionMoved'), message: tr('career.youAndYourMentorGetAn4c2') }); setOpen(false) } catch (x) { addToast({ type: 'error', title: (x as Error).message }) } finally { setBusy(false) }
          }}>{tr('career.moveToThisTime')}</Button>
        </div>
      )}
    </Panel>
  )
}

function Dispute({ s, onChange }: { s: SessionView; onChange: (v: SessionView) => void }) {
  const { t } = useT()
  const addToast = useToast()
  const [reason, setReason] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <Panel className="space-y-3 p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground"><Flag className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden />{t('career.somethingWentWrong')}</h2>
      {!open ? <Button variant="outline" className="min-h-[44px] rounded-full" onClick={() => setOpen(true)}>{t('career.reportAProblem')}</Button> : (
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          try { onChange((await api<{ session: SessionView }>(`/api/mentors/sessions/${s.id}/dispute`, { body: { reason } })).session); addToast({ type: 'success', title: t('career.disputeSent'), message: t('career.ourTeamReviewsItAndDecides334') }) } catch (x) { addToast({ type: 'error', title: (x as Error).message }) } finally { setBusy(false) }
        }}>
          <Label htmlFor="d-reason">{t('career.whatHappened')}</Label>
          <Textarea id="d-reason" rows={4} minLength={20} maxLength={1000} required value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('career.forExampleTheMentorDidNot1fa')} />
          <Button type="submit" disabled={busy} className="min-h-[44px] rounded-full">{busy ? t('career.sending') : t('career.sendToTheCodespectraTeam')}</Button>
        </form>
      )}
    </Panel>
  )
}
