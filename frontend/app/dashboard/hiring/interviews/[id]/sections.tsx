'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Copy, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Panel } from '@/components/app/page-kit'
import { Field, InlineError, NativeSelect } from '@/components/hiring/ui'
import { atsGet, atsSend } from '@/components/hiring/lib/api'
import { PROVIDER_LABELS } from '@/components/hiring/lib/labels'
import { useToast } from '@/lib/toast-context'
import { useConfirm } from '@/lib/confirm-context'
import { formatDateTime } from '@/lib/format-datetime'
import { fromZonedDatetimeString, toZonedDatetimeString } from '@/lib/datetime-local'
import { cn } from '@/lib/utils'
import type { MeetingProvider } from '@/lib/ats/contract'
import { REC_LABELS, type InterviewDetail, type IntegrationsInfo, type Scorecard } from './types'

const PROVIDERS: MeetingProvider[] = ['livekit', 'zoom', 'google_meet', 'teams', 'manual']

// ─── Scheduling ──────────────────────────────────────────────────────────────

export function SchedulePanel({ d, onChanged }: { d: InterviewDetail; onChanged: () => void }) {
  const iv = d.interview
  const addToast = useToast()
  const confirm = useConfirm()
  const tz = iv.timezone || 'UTC'
  const [slots, setSlots] = useState<{ start: string }[] | null>(null)
  const [integrations, setIntegrations] = useState<IntegrationsInfo | null>(null)
  const initialStart = iv.scheduled_at || iv.requested_slot || null
  const [when, setWhen] = useState(initialStart ? toZonedDatetimeString(new Date(initialStart), tz) : '')
  const [duration, setDuration] = useState(String(iv.duration_min))
  const [provider, setProvider] = useState<MeetingProvider>(iv.provider || 'livekit')
  const [manualUrl, setManualUrl] = useState(iv.provider === 'manual' ? iv.join_url || '' : '')
  const [loc, setLoc] = useState({
    address: iv.location_details?.address || iv.location || '',
    room: iv.location_details?.room || '',
    map_url: iv.location_details?.map_url || '',
    instructions: iv.location_details?.instructions || '',
  })
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const scheduled = iv.status === 'scheduled'
  const open = iv.status === 'awaiting_schedule' || iv.status === 'scheduled' || iv.status === 'no_show' || iv.status === 'cancelled'

  useEffect(() => {
    if (!open) return
    atsGet<{ slots: { start: string }[] }>(`/api/ats/interviews/slots?interview=${encodeURIComponent(iv.id)}`).then((r) => setSlots(r.slots.slice(0, 12))).catch(() => setSlots([]))
    if (iv.mode === 'virtual') atsGet<IntegrationsInfo>('/api/ats/integrations/meetings').then(setIntegrations).catch(() => setIntegrations(null))
  }, [iv.id, iv.mode, open])

  const status = (p: MeetingProvider): string => {
    if (p === 'manual') return 'ready'
    if (p === 'livekit') return integrations && !integrations.livekit_configured ? 'not set up' : 'ready'
    const row = integrations?.providers.find((x) => x.provider === p)
    return row?.status === 'connected' ? 'connected' : row?.status === 'error' ? 'needs reconnecting' : 'not connected'
  }

  async function run(action: string, body: Record<string, unknown>, ok: string) {
    setBusy(action); setErr(null)
    try {
      await atsSend(`/api/ats/interviews/${encodeURIComponent(iv.id)}`, 'PATCH', { action, ...body })
      addToast({ type: 'success', title: ok })
      onChanged()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  function submit() {
    if (!when) { setErr('Pick a date and time.'); return }
    const body: Record<string, unknown> = { scheduled_at: fromZonedDatetimeString(when, tz), duration_min: Number(duration) || iv.duration_min }
    if (iv.mode === 'virtual') {
      body.provider = provider
      if (provider === 'manual') body.manual_url = manualUrl.trim()
    } else {
      body.location = loc
    }
    void run(scheduled ? 'reschedule' : 'schedule', body, scheduled ? 'Interview moved — everyone has been told' : 'Interview booked — invites sent')
  }

  async function copyLink() {
    if (!d.self_schedule_link) return
    try { await navigator.clipboard.writeText(d.self_schedule_link); addToast({ type: 'success', title: 'Link copied' }) } catch { /* ignore */ }
  }

  if (!open) return null
  return (
    <Panel className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{scheduled ? 'Reschedule' : 'Book a time'}</h2>
        <p className="text-sm text-muted-foreground">Times are in {tz}. Everyone gets an email with a calendar invite.</p>
      </div>

      {iv.requested_slot && !scheduled && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          The candidate asked for {formatDateTime(iv.requested_slot, tz)}. It&apos;s filled in below — check the meeting type and book it.
        </p>
      )}
      {d.self_schedule_link && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <span>The candidate can pick a time themselves.</span>
          <Button size="sm" variant="outline" onClick={() => void copyLink()} className="h-8"><Copy className="h-3.5 w-3.5" aria-hidden /> Copy their link</Button>
        </div>
      )}

      {slots && slots.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-foreground">Panel is free at</p>
          <div className="flex flex-wrap gap-2">
            {slots.map((s) => {
              const v = toZonedDatetimeString(new Date(s.start), tz)
              return (
                <button key={s.start} type="button" onClick={() => setWhen(v)} aria-pressed={when === v}
                  className={cn('min-h-9 rounded-lg border px-2.5 text-xs tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    when === v ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
                  {formatDateTime(s.start, tz)}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date and time" htmlFor="iv-when">
          <Input id="iv-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
        <Field label="Length (minutes)" htmlFor="iv-dur">
          <Input id="iv-dur" type="number" min={10} max={480} step={5} value={duration} onChange={(e) => setDuration(e.target.value)} />
        </Field>
      </div>

      {iv.mode === 'virtual' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Meeting type" htmlFor="iv-provider" hint={status(provider) === 'not connected' || status(provider) === 'needs reconnecting' ? 'An admin can connect it in Hiring settings → Integrations.' : undefined}>
            <NativeSelect id="iv-provider" value={provider} onChange={(v) => setProvider(v as MeetingProvider)}
              options={PROVIDERS.map((p) => ({ value: p, label: `${PROVIDER_LABELS[p]}${status(p) === 'ready' || status(p) === 'connected' ? '' : ` (${status(p)})`}` }))} />
          </Field>
          {provider === 'manual' && (
            <Field label="Meeting link" htmlFor="iv-url">
              <Input id="iv-url" type="url" inputMode="url" placeholder="https://…" value={manualUrl} onChange={(e) => setManualUrl(e.target.value)} />
            </Field>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Address" htmlFor="iv-addr" className="sm:col-span-2">
            <Input id="iv-addr" value={loc.address} onChange={(e) => setLoc({ ...loc, address: e.target.value })} placeholder="Building, street, city" />
          </Field>
          <Field label="Room" htmlFor="iv-room"><Input id="iv-room" value={loc.room} onChange={(e) => setLoc({ ...loc, room: e.target.value })} /></Field>
          <Field label="Map link" htmlFor="iv-map"><Input id="iv-map" type="url" placeholder="https://maps…" value={loc.map_url} onChange={(e) => setLoc({ ...loc, map_url: e.target.value })} /></Field>
          <Field label="Instructions for the candidate" htmlFor="iv-instr" className="sm:col-span-2">
            <Textarea id="iv-instr" rows={2} value={loc.instructions} onChange={(e) => setLoc({ ...loc, instructions: e.target.value })} placeholder="Bring a photo ID, ask for … at reception" />
          </Field>
        </div>
      )}

      <InlineError message={err} />
      <div className="flex flex-wrap gap-2">
        <Button className="min-h-11 rounded-full px-5" disabled={!!busy} onClick={submit}>
          {busy === 'schedule' || busy === 'reschedule' ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
          {scheduled ? 'Move interview' : 'Book interview'}
        </Button>
        {scheduled && (
          <>
            <Button variant="outline" className="min-h-11" disabled={!!busy} onClick={() => void run('complete', {}, 'Marked as completed')}>Mark completed</Button>
            <Button variant="outline" className="min-h-11" disabled={!!busy} onClick={() => void run('no_show', {}, 'Marked as no-show')}>Candidate didn&apos;t show</Button>
          </>
        )}
        {(scheduled || iv.status === 'awaiting_schedule') && (
          <Button variant="ghost" className="min-h-11 text-destructive hover:text-destructive" disabled={!!busy}
            onClick={async () => {
              const ok = await confirm({ title: 'Cancel this interview?', description: scheduled ? 'The candidate and panel will be told, and the meeting is removed.' : 'It will no longer be offered to the candidate.', confirmText: 'Cancel interview', cancelText: 'Keep it', destructive: true })
              if (ok) void run('cancel', {}, 'Interview cancelled')
            }}>
            Cancel interview
          </Button>
        )}
      </div>
    </Panel>
  )
}

// ─── Panel members ───────────────────────────────────────────────────────────

export function PanelEditor({ d, onChanged }: { d: InterviewDetail; onChanged: () => void }) {
  const iv = d.interview
  const addToast = useToast()
  const [members, setMembers] = useState<{ user_id: string | null; email: string; name?: string; role: string; status: string }[] | null>(null)
  const [picked, setPicked] = useState<string[]>(iv.panel.map((p) => p.user_id))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const editable = iv.status !== 'completed' && iv.status !== 'cancelled'

  useEffect(() => {
    atsGet<{ members: { user_id: string | null; email: string; name?: string; role: string; status: string }[] }>('/api/ats/team')
      .then((r) => setMembers(r.members.filter((m) => m.status === 'active' && m.user_id && m.role !== 'client')))
      .catch(() => setMembers([]))
  }, [])

  const options = useMemo(() => {
    const list = [...(members || [])]
    for (const p of iv.panel) if (!list.some((m) => m.user_id === p.user_id)) list.push({ user_id: p.user_id, email: p.email, name: p.name, role: 'admin', status: 'active' })
    return list
  }, [members, iv.panel])

  const changed = picked.length !== iv.panel.length || picked.some((id) => !iv.panel.some((p) => p.user_id === id))

  async function save() {
    setBusy(true); setErr(null)
    try {
      await atsSend(`/api/ats/interviews/${encodeURIComponent(iv.id)}`, 'PATCH', { action: 'panel', user_ids: picked })
      addToast({ type: 'success', title: 'Panel updated' })
      onChanged()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!editable) return null
  return (
    <Panel className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Interview panel</h2>
        <p className="text-sm text-muted-foreground">Only people on the panel can submit a scorecard. New members get the invite.</p>
      </div>
      {members === null ? <p className="text-sm text-muted-foreground">Loading the team…</p> : !options.length ? (
        <p className="text-sm text-muted-foreground">No active team members yet. <Link className="text-primary hover:underline" href="/dashboard/hiring/team">Invite interviewers</Link>.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {options.map((m) => (
            <li key={m.user_id!}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2 text-sm hover:bg-muted/40">
                <Checkbox checked={picked.includes(m.user_id!)} onCheckedChange={(v) => setPicked((p) => (v ? [...p, m.user_id!] : p.filter((x) => x !== m.user_id)))} />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">{m.name || m.email}</span>
                  <span className="block truncate text-xs text-muted-foreground">{m.email}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <InlineError message={err} />
      <Button variant="outline" className="min-h-11" disabled={!changed || !picked.length || busy} onClick={() => void save()}>
        {busy && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />} Save panel
      </Button>
    </Panel>
  )
}

// ─── Scorecards ──────────────────────────────────────────────────────────────

const RECS: Scorecard['recommendation'][] = ['strong_yes', 'yes', 'no', 'strong_no']

export function ScorecardForm({ d, onChanged }: { d: InterviewDetail; onChanged: () => void }) {
  const iv = d.interview
  const addToast = useToast()
  const mine = iv.scorecards.find((c) => c.interviewer_id === d.me.user_id)
  const [ratings, setRatings] = useState<Record<string, number>>(mine?.ratings || {})
  const [rec, setRec] = useState<Scorecard['recommendation'] | ''>(mine?.recommendation || '')
  const [notes, setNotes] = useState(mine?.notes || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const started = !!iv.scheduled_at && Date.parse(iv.scheduled_at) <= Date.now()
  const open = !iv.result_recorded && (iv.status === 'completed' || (iv.status === 'scheduled' && started))

  async function submit() {
    setBusy(true); setErr(null)
    try {
      await atsSend(`/api/ats/interviews/${encodeURIComponent(iv.id)}/scorecard`, 'POST', { ratings, recommendation: rec, notes })
      addToast({ type: 'success', title: mine ? 'Scorecard updated' : 'Scorecard submitted' })
      onChanged()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{mine ? 'Your scorecard' : 'Submit your scorecard'}</h2>
        <p className="text-sm text-muted-foreground">
          {iv.result_recorded ? 'The panel decision is recorded; scorecards are closed.'
            : !open ? 'You can fill this in once the interview has started.'
            : 'Rate each area from 1 (weak) to 5 (excellent). Other interviewers’ scores show after you submit.'}
        </p>
      </div>
      <fieldset disabled={!open || busy} className="space-y-4">
        {iv.scorecard_template.criteria.map((c) => (
          <div key={c.id} role="radiogroup" aria-label={c.label}>
            <p className="text-sm font-medium text-foreground">{c.label}</p>
            {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
            <div className="mt-2 flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={ratings[c.id] === n} aria-label={`${n} of 5`}
                  onClick={() => setRatings((r) => ({ ...r, [c.id]: n }))}
                  className={cn('h-11 w-11 rounded-xl border text-sm font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
                    ratings[c.id] === n ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground hover:border-primary/50')}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div role="radiogroup" aria-label="Recommendation">
          <p className="text-sm font-medium text-foreground">Recommendation</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {RECS.map((r) => (
              <button key={r} type="button" role="radio" aria-checked={rec === r} onClick={() => setRec(r)}
                className={cn('min-h-11 rounded-xl border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
                  rec === r
                    ? r.includes('yes') ? 'border-green-600 bg-green-500/15 text-green-800 dark:text-green-300' : 'border-red-600 bg-red-500/15 text-red-800 dark:text-red-300'
                    : 'border-border text-foreground hover:bg-muted/40')}>
                {REC_LABELS[r]}
              </button>
            ))}
          </div>
        </div>
        <Field label="Notes" htmlFor="sc-notes" hint="Evidence for your ratings. The candidate never sees this.">
          <Textarea id="sc-notes" rows={4} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </fieldset>
      <InlineError message={err} />
      {open && (
        <Button className="min-h-11 rounded-full px-6" disabled={busy || !rec || iv.scorecard_template.criteria.some((c) => !ratings[c.id])} onClick={() => void submit()}>
          {busy && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />} {mine ? 'Update scorecard' : 'Submit scorecard'}
        </Button>
      )}
    </Panel>
  )
}

export function ScorecardList({ d }: { d: InterviewDetail }) {
  const iv = d.interview
  const label = (id: string) => iv.scorecard_template.criteria.find((c) => c.id === id)?.label || id
  const others = d.me.sees_all_scorecards ? iv.scorecards : []
  const waiting = iv.panel.filter((p) => !iv.scorecards.some((c) => c.interviewer_id === p.user_id))
  if (!d.me.sees_all_scorecards) {
    return d.me.on_panel ? null : (
      <Panel><p className="text-sm text-muted-foreground">Scorecards are visible to the hiring team.</p></Panel>
    )
  }
  return (
    <Panel className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Panel feedback</h2>
        <p className="text-sm text-muted-foreground">
          Decision rule: {iv.pass_rule === 'all_yes' ? 'everyone says yes' : iv.pass_rule === 'majority_yes' ? 'most say yes' : `average rating of at least ${iv.pass_score ?? 3.5}`}.
          {waiting.length > 0 && !iv.result_recorded && ` Waiting for ${waiting.map((p) => p.name || p.email).join(', ')}.`}
          {iv.result_recorded && ' The result has been recorded on the application.'}
        </p>
      </div>
      {iv.ai_summary && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm">
          <p className="mb-1 flex items-center gap-1.5 font-medium text-foreground"><Sparkles className="h-4 w-4 text-primary" aria-hidden /> Summary of notes (AI)</p>
          <p className="text-muted-foreground">{iv.ai_summary}</p>
        </div>
      )}
      {!others.length ? <p className="text-sm text-muted-foreground">No scorecards yet.</p> : (
        <ul className="space-y-3">
          {others.map((c) => (
            <li key={c.interviewer_id} className="rounded-2xl border border-border p-4">
              <p className="flex flex-wrap items-center justify-between gap-2 font-medium text-foreground">
                <span>{c.interviewer_name || 'Interviewer'}</span>
                <span className={c.recommendation.includes('yes') ? 'text-sm text-green-700 dark:text-green-400' : 'text-sm text-red-700 dark:text-red-400'}>{REC_LABELS[c.recommendation]}</span>
              </p>
              <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {Object.entries(c.ratings).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2"><dt className="truncate text-muted-foreground">{label(k)}</dt><dd className="tabular-nums text-foreground">{v}/5</dd></div>
                ))}
              </dl>
              {c.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{c.notes}</p>}
              <p className="mt-2 text-xs text-muted-foreground">Submitted {formatDateTime(c.submitted_at)}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
