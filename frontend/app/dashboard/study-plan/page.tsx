'use client'

/**
 * Personalised study plan: setup (target + hours), today, this week, weak areas, streak,
 * reminders. The plan comes from the learner's own results; it adapts every week.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { BookOpen, CalendarCheck, CheckCircle2, Circle, Flame, ListChecks, RefreshCw, Target, Timer } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { BentoGrid, PageHeader, Panel, StatCard } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ITEM_LABELS, type PlanItem } from '@/lib/study-plan/types'
import type { PlanView } from '@/lib/study-plan/service'

interface Targets { patterns: { id: string; label: string; company: string }[]; domains: { id: string; label: string }[] }

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await csrfFetch(path, { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined, body: body !== undefined ? JSON.stringify(body) : undefined })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((j as { error?: string }).error || `Request failed (${r.status})`)
  return j as T
}

const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

export default function StudyPlanPage() {
  const gate = usePageGuard('user')
  const addToast = useToast()
  const [view, setView] = useState<PlanView | null | undefined>(undefined)
  const [targets, setTargets] = useState<Targets | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [daily, setDaily] = useState<string | null>(null)

  const load = useCallback(() => {
    call<{ view: PlanView | null; targets: Targets }>('/api/study-plan').then((r) => { setView(r.view); setTargets(r.targets) }).catch((e) => setErr(e.message))
    fetch('/api/daily-challenge', { cache: 'no-store' }).then((r) => r.json()).then((j) => setDaily(j?.problem?.slug ? `/dashboard/problems/${j.problem.slug}` : null)).catch(() => undefined)
  }, [])
  useEffect(() => { if (gate.ready) load() }, [gate.ready, load])

  const toggle = async (it: PlanItem) => {
    setBusy(it.id)
    try {
      await call(`/api/study-plan/items/${it.id}`, 'POST', { done: !it.done_at })
      setView((v) => v && { ...v, plan: { ...v.plan, week: { ...v.plan.week, items: v.plan.week.items.map((x) => (x.id === it.id ? { ...x, done_at: it.done_at ? null : new Date().toISOString() } : x)) } }, today_items: v.today_items.map((x) => (x.id === it.id ? { ...x, done_at: it.done_at ? null : new Date().toISOString() } : x)) })
      if (!it.done_at) load()
    } catch (e) { addToast({ type: 'error', title: (e as Error).message }) } finally { setBusy(null) }
  }

  const byDay = useMemo(() => {
    const m = new Map<string, PlanItem[]>()
    for (const it of view?.plan.week.items || []) m.set(it.day, [...(m.get(it.day) || []), it])
    return [...m.entries()]
  }, [view])

  if (!gate.ready) return null
  if (err) return <EmptyState illustration="error" title="We could not load your study plan" description={err} actionLabel="Try again" onAction={() => { setErr(null); load() }} />
  if (view === undefined || !targets) return <div className="mx-auto max-w-5xl space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-3xl bg-muted motion-reduce:animate-none" />)}</div>

  if (!view || editing) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <PageHeader title="Study plan" icon={<CalendarCheck />} description="Tell us your goal and how much time you have. We build each week from your own test results and adjust it as you go." />
        <SetupForm targets={targets} initial={view?.plan} onCancel={view ? () => setEditing(false) : undefined} onDone={(v) => { setView(v); setEditing(false) }} />
      </div>
    )
  }

  const p = view.plan
  const pct = view.progress.minutes_total ? Math.round((view.progress.minutes_done / view.progress.minutes_total) * 100) : 0
  const href = (it: PlanItem) => (it.kind === 'daily_challenge' && daily ? daily : it.href)
  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title="Study plan" icon={<CalendarCheck />} description={`${p.target.label} · week ${p.week.week_no} · ${view.days_left} day${view.days_left === 1 ? '' : 's'} left`}
        actions={<div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-full" disabled={busy === 'regen'} onClick={async () => {
            setBusy('regen')
            try { const r = await call<{ view: PlanView }>('/api/study-plan/regenerate', 'POST', {}); setView(r.view); addToast({ type: 'success', title: 'Plan updated from your latest results' }) } catch (e) { addToast({ type: 'error', title: (e as Error).message }) } finally { setBusy(null) }
          }}><RefreshCw className="mr-1.5 h-4 w-4" />Refresh plan</Button>
          <Button variant="outline" className="rounded-full" onClick={() => setEditing(true)}><Target className="mr-1.5 h-4 w-4" />Change goal</Button>
        </div>} />
      {p.status === 'finished' && <Panel className="mb-5 p-4 text-sm text-foreground">Your plan has ended. Well done — set a new goal to keep going.</Panel>}
      <BentoGrid className="mb-6">
        <StatCard label="This week" value={`${pct}%`} hint={`${view.progress.done} of ${view.progress.total} items`} icon={<ListChecks />} />
        <StatCard label="Streak" value={`${view.streak.current} day${view.streak.current === 1 ? '' : 's'}`} hint={`Longest ${view.streak.longest}`} icon={<Flame />} />
        <StatCard label="Time planned" value={`${Math.round(view.progress.minutes_total / 6) / 10} h`} hint={`${p.target.hours_per_week} h/week goal`} icon={<Timer />} />
        <StatCard label="Days left" value={String(view.days_left)} hint={`of ${p.target.days}`} icon={<Target />} />
      </BentoGrid>
      {p.week.note && <Panel className="mb-6 p-4 text-sm leading-relaxed text-foreground"><span className="font-semibold">Coach note: </span>{p.week.note}</Panel>}

      <section aria-labelledby="today" className="mb-8">
        <h2 id="today" className="mb-3 text-lg font-semibold text-foreground">Today</h2>
        {view.today_items.length === 0 ? <EmptyState title="Nothing planned for today" description="Take a break, or get ahead with tomorrow's items below." /> : (
          <ul className="space-y-2">{view.today_items.map((it) => <ItemRow key={it.id} it={it} href={href(it)} busy={busy === it.id} onToggle={() => toggle(it)} />)}</ul>
        )}
      </section>

      <section aria-labelledby="week" className="mb-8">
        <h2 id="week" className="mb-3 text-lg font-semibold text-foreground">This week</h2>
        <div className="space-y-5">
          {byDay.map(([day, items]) => (
            <div key={day}>
              <h3 className={`mb-2 text-sm font-medium ${day === view.today ? 'text-primary' : 'text-muted-foreground'}`}>{dayLabel(day)}{day === view.today ? ' · today' : ''}</h3>
              <ul className="space-y-2">{items.map((it) => <ItemRow key={it.id} it={it} href={href(it)} busy={busy === it.id} onToggle={() => toggle(it)} />)}</ul>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <Panel className="p-5">
          <h2 className="mb-3 text-lg font-semibold text-foreground">Where to focus</h2>
          {p.weak_areas.length === 0 ? <p className="text-sm text-muted-foreground">Take a test or a practice set and your weak areas show up here.</p> : (
            <ul className="space-y-3">
              {p.weak_areas.slice(0, 6).map((a) => (
                <li key={a.key}>
                  <div className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate text-foreground">{a.label}</span><span className="shrink-0 tabular-nums text-muted-foreground">{a.evidence > 0 ? `${Math.round(a.mastery * 100)}% right` : 'not tested yet'}</span></div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" aria-hidden><div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(a.mastery * 100)}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Reminders view={view} onSaved={(r) => setView({ ...view, plan: { ...view.plan, reminders: r } })} />
      </div>
      {p.history.length > 0 && (
        <Panel className="mt-5 p-5">
          <h2 className="mb-3 text-lg font-semibold text-foreground">Past weeks</h2>
          <ul className="grid gap-2 sm:grid-cols-2">{p.history.slice(-6).reverse().map((h) => <li key={h.week_no} className="flex justify-between text-sm"><span className="text-foreground">Week {h.week_no}</span><span className="tabular-nums text-muted-foreground">{h.done}/{h.planned} items · {Math.round(h.minutes_done / 6) / 10} h</span></li>)}</ul>
        </Panel>
      )}
    </div>
  )
}

function ItemRow({ it, href, busy, onToggle }: { it: PlanItem; href: string; busy: boolean; onToggle: () => void }) {
  const done = !!it.done_at
  return (
    <li>
      <Panel className="flex items-center gap-3 p-3 sm:p-4">
        <button type="button" onClick={onToggle} disabled={busy} aria-pressed={done} aria-label={done ? `Mark "${it.title}" as not done` : `Mark "${it.title}" as done`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
          {done ? <CheckCircle2 className="h-6 w-6" /> : <Circle className="h-6 w-6 text-muted-foreground" />}
        </button>
        <div className="min-w-0 flex-1">
          <Link href={href} className={`block truncate font-medium hover:underline ${done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{it.title}</Link>
          <p className="truncate text-xs text-muted-foreground">{ITEM_LABELS[it.kind]} · <span className="tabular-nums">{it.minutes}</span> min · {it.reason}</p>
        </div>
        {it.kind === 'learn' && <BookOpen className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" aria-hidden />}
      </Panel>
    </li>
  )
}

function SetupForm({ targets, initial, onDone, onCancel }: { targets: Targets; initial?: PlanView['plan']; onDone: (v: PlanView) => void; onCancel?: () => void }) {
  const addToast = useToast()
  const [kind, setKind] = useState<'company' | 'skills'>(initial?.target.kind ?? (targets.patterns.length ? 'company' : 'skills'))
  const [pattern, setPattern] = useState(initial?.target.pattern_id ?? targets.patterns[0]?.id ?? '')
  const [domains, setDomains] = useState<string[]>(initial?.target.domains ?? [])
  const [days, setDays] = useState(String(initial?.target.days ?? 30))
  const [hours, setHours] = useState(String(initial?.target.hours_per_week ?? 8))
  const [email, setEmail] = useState(initial?.reminders.email ?? true)
  const [wa, setWa] = useState(initial?.reminders.whatsapp ?? false)
  const [busy, setBusy] = useState(false)
  const sel = 'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const r = await call<{ view: PlanView }>('/api/study-plan', 'POST', {
        kind, pattern_id: kind === 'company' ? pattern : null, domains, days: Number(days), hours_per_week: Number(hours),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, reminders: { email, whatsapp: wa },
      })
      addToast({ type: 'success', title: 'Your plan is ready' })
      onDone(r.view)
    } catch (x) { addToast({ type: 'error', title: 'Could not build the plan', message: (x as Error).message }) } finally { setBusy(false) }
  }
  return (
    <Panel className="p-5 sm:p-6">
      <form onSubmit={submit} className="space-y-5">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-foreground">What are you preparing for?</legend>
          <div className="flex flex-wrap gap-2">
            {(['company', 'skills'] as const).map((k) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`min-h-[44px] rounded-full border px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${kind === k ? 'border-primary bg-primary/10 font-semibold text-primary' : 'border-border text-foreground'}`}>{k === 'company' ? 'A company test' : 'Skills I choose'}</button>)}
          </div>
        </fieldset>
        {kind === 'company' ? (
          <div><Label htmlFor="sp-pattern">Company test</Label>
            <select id="sp-pattern" className={sel} value={pattern} onChange={(e) => setPattern(e.target.value)}>{targets.patterns.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
          </div>
        ) : null}
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-foreground">{kind === 'company' ? 'Extra subjects (optional)' : 'Subjects to focus on'}</legend>
          <div className="flex flex-wrap gap-2">
            {targets.domains.map((d) => {
              const on = domains.includes(d.id)
              return <button key={d.id} type="button" aria-pressed={on} onClick={() => setDomains(on ? domains.filter((x) => x !== d.id) : domains.length < 6 ? [...domains, d.id] : domains)} className={`min-h-[40px] rounded-full border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground'}`}>{d.label}</button>
            })}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="sp-days">How long?</Label><select id="sp-days" className={sel} value={days} onChange={(e) => setDays(e.target.value)}>{[14, 30, 45, 60, 90].map((d) => <option key={d} value={d}>{d} days</option>)}</select></div>
          <div><Label htmlFor="sp-hours">Hours per week</Label><select id="sp-hours" className={sel} value={hours} onChange={(e) => setHours(e.target.value)}>{[3, 5, 8, 10, 15, 20].map((h) => <option key={h} value={h}>{h} hours</option>)}</select></div>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">Daily reminders</legend>
          <label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" className="h-4 w-4 accent-primary" checked={email} onChange={(e) => setEmail(e.target.checked)} />E-mail</label>
          <label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" className="h-4 w-4 accent-primary" checked={wa} onChange={(e) => setWa(e.target.checked)} />WhatsApp (only if you agreed to WhatsApp messages in your notification settings)</label>
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy || (kind === 'company' ? !pattern : !domains.length)} className="min-h-[44px] rounded-full">{busy ? 'Building your plan…' : 'Build my plan'}</Button>
          {onCancel && <Button type="button" variant="outline" className="min-h-[44px] rounded-full" onClick={onCancel}>Cancel</Button>}
        </div>
      </form>
    </Panel>
  )
}

function Reminders({ view, onSaved }: { view: PlanView; onSaved: (r: PlanView['plan']['reminders']) => void }) {
  const addToast = useToast()
  const r = view.plan.reminders
  const save = async (patch: Partial<typeof r>) => {
    try { const j = await call<{ reminders: typeof r }>('/api/study-plan', 'PATCH', patch); onSaved(j.reminders) } catch (e) { addToast({ type: 'error', title: (e as Error).message }) }
  }
  return (
    <Panel className="space-y-3 p-5">
      <h2 className="text-lg font-semibold text-foreground">Reminders</h2>
      <label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" className="h-4 w-4 accent-primary" checked={r.email} onChange={(e) => save({ email: e.target.checked })} />E-mail me on study days</label>
      <label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" className="h-4 w-4 accent-primary" checked={r.whatsapp} onChange={(e) => save({ whatsapp: e.target.checked })} />WhatsApp (needs your WhatsApp consent)</label>
      <div className="max-w-[12rem]"><Label htmlFor="sp-hour">At</Label>
        <select id="sp-hour" className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={r.hour} onChange={(e) => save({ hour: Number(e.target.value) })}>
          {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
        </select>
      </div>
      <p className="text-xs text-muted-foreground">Times are in {r.timezone}. You can unsubscribe from any reminder e-mail. <Link className="text-primary hover:underline" href="/dashboard/notifications/preferences">Notification settings</Link></p>
    </Panel>
  )
}
