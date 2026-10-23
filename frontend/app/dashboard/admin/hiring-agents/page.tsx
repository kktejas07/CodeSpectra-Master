'use client'

/**
 * /dashboard/admin/hiring-agents — the organisation's hiring agents
 * (lib/agent/hiring-loops): on/off and auto-send per step, caps and params,
 * "Run now", proposals waiting for confirmation (confirmed through the
 * copilot's action endpoints), the integrity review queue, the JD → test
 * queue and the run log. Organisation admins; a superadmin picks an organisation.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Bot, CalendarClock, Check, ChevronDown, ClipboardList, Loader2, Play, RefreshCw, Save, ShieldAlert, UserSearch, X } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useAdminT } from '@/lib/i18n/admin'
import { PageHeader, Panel, Section } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { SkeletonList } from '@/components/ui/skeleton-boneyard'
import { hlt, type HlKey } from '@/lib/agent/hiring-loops/i18n'
import type { LoopId, LoopSettings } from '@/lib/agent/hiring-loops/types'

interface RunRow {
  id: string; loop: LoopId; trigger: 'cron' | 'manual'; status: string; started_at: string; item_count: number; cost_usd: number; message?: string; ai_off?: string | null
  items: Array<{ kind: string; ref: string; title: string; action_id?: string | null; auto_sent?: boolean; result?: string | null; note?: string | null }>
}
interface AgentRow {
  loop: LoopId; settings: LoopSettings; steps: string[]; default_enabled: boolean; owner_name: string | null; owner_is_you: boolean; has_owner: boolean
  usage: { items_today: number; spent_month_usd: number }; last_run: RunRow | null
}
interface PendingRow { id: string; tool: string; title: string; preview: Record<string, unknown>; created_at: string; expires_at: string; conversationId: string }
interface CaseRow { id: string; target_kind: string; target_id: string; target_title: string; name: string; priority: number; recommendation: 'hold' | 'release_hold' | 'none'; summary: string; held: boolean; action_id?: string | null }
interface RequestRow { id: string; status: string; title: string | null; job_id: string | null; message?: string | null; created_at: string }
interface Overview { tenant_id: string; agents: AgentRow[]; pending: PendingRow[]; runs: RunRow[]; cases: CaseRow[]; requests: RequestRow[] }

const ICON: Record<LoopId, React.ReactNode> = { sourcer: <UserSearch />, scheduler: <CalendarClock />, author: <ClipboardList />, integrity: <ShieldAlert /> }
const PARAM_KEYS: Record<LoopId, string[]> = {
  sourcer: ['min_match', 'invites_per_job', 'stall_days', 'max_jobs'],
  scheduler: ['stale_hours', 'max_offers', 'followup_hours', 'slots_offered'],
  author: ['target_questions', 'min_coverage_pct', 'max_rounds', 'dry_run_ai_grades'],
  integrity: ['hold_threshold', 'max_cases'],
}
const STATUS_TONE: Record<string, string> = {
  ok: 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400',
  partial: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  failed: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400',
  blocked: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400',
  running: 'border-primary/30 bg-primary/10 text-primary',
  skipped: 'border-border bg-muted text-muted-foreground',
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await csrfFetch(url, { headers: { 'Content-Type': 'application/json' }, credentials: 'include', ...init })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((d as { error?: string }).error || 'Request failed')
  return d as T
}

function useL() {
  const { locale, fmt } = useAdminT()
  return useMemo(() => ({ L: (k: HlKey | string, p?: Record<string, string | number | null | undefined>) => hlt(locale, k, p), fmt }), [locale, fmt])
}

function AgentCard({ a, q, onChanged }: { a: AgentRow; q: string; onChanged: () => void }) {
  const { L, fmt } = useL()
  const addToast = useToast()
  const [form, setForm] = useState(a.settings)
  const [busy, setBusy] = useState<'save' | 'run' | null>(null)
  useEffect(() => { setForm(a.settings) }, [a.settings])
  const save = async (patch: Record<string, unknown>) => {
    setBusy('save')
    try {
      await api(`/api/admin/hiring-agents${q}`, { method: 'PATCH', body: JSON.stringify({ loop: a.loop, patch }) })
      addToast({ type: 'success', title: L('saved') })
      onChanged()
    } catch (e) {
      addToast({ type: 'error', title: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }
  const run = async () => {
    setBusy('run')
    try {
      const r = await api<{ message: string; items: number }>(`/api/admin/hiring-agents/run${q}`, { method: 'POST', body: JSON.stringify({ loop: a.loop }) })
      addToast({ type: r.items > 0 ? 'success' : 'info', title: L('runDone', { message: r.message }) })
    } catch (e) {
      addToast({ type: 'error', title: (e as Error).message })
    } finally {
      setBusy(null)
      onChanged()
    }
  }
  const params = form.params as unknown as Record<string, number | boolean>
  const setNum = (k: string, v: string) => setForm((f) => ({ ...f, params: { ...(f.params as object), [k]: v === '' ? ('' as never) : Number(v) } as never }))
  const id = (k: string) => `ha-${a.loop}-${k}`
  return (
    <Panel className="space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary [&_svg]:h-5 [&_svg]:w-5" aria-hidden>{ICON[a.loop]}</span>
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground">{L(`loop.${a.loop}.name`)}</h3>
            <p className="mt-0.5 max-w-[65ch] text-sm text-muted-foreground">{L(`loop.${a.loop}.desc`)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {a.default_enabled ? L('defaultOn') : L('defaultOff')} · {a.has_owner && a.owner_name ? L('ownerNote', { name: a.owner_is_you ? '✓ ' + a.owner_name : a.owner_name }) : L('ownerNone')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch id={id('on')} checked={form.enabled} disabled={busy !== null} onCheckedChange={(v) => { setForm((f) => ({ ...f, enabled: v })); void save({ enabled: v }) }} />
          <Label htmlFor={id('on')}>{form.enabled ? L('on') : L('off')}</Label>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>{L('usedToday', { count: a.usage.items_today, cap: form.daily_item_cap })}</span>
        <span>{L('spentMonth', { amount: a.usage.spent_month_usd.toFixed(2) })}</span>
        <span>{L('lastRun')}: {a.last_run ? `${fmt.relative(a.last_run.started_at)} · ${L(`status.${a.last_run.status}`)}` : L('never')}</span>
        {a.last_run?.ai_off && <span className="text-amber-700 dark:text-amber-300">{L(`ai.${a.last_run.ai_off}`)}</span>}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">{L('autoSend')}</legend>
        <p className="text-xs text-muted-foreground">{L('autoSendHint')}</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {a.steps.map((st) => (
            <div key={st} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <Label htmlFor={id(`auto-${st}`)} className="text-sm font-normal">{L(`step.${st}`)}</Label>
              <Switch id={id(`auto-${st}`)} checked={form.auto_send[st] === true} disabled={busy !== null} onCheckedChange={(v) => { setForm((f) => ({ ...f, auto_send: { ...f.auto_send, [st]: v } })); void save({ auto_send: { [st]: v } }) }} />
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-foreground">{L('caps')}</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label htmlFor={id('daily')} className="text-xs">{L('dailyItems')}</Label>
            <Input id={id('daily')} type="number" inputMode="numeric" min={0} value={String(form.daily_item_cap ?? '')} onChange={(e) => setForm((f) => ({ ...f, daily_item_cap: e.target.value === '' ? ('' as never) : Number(e.target.value) }))} className="mt-1 tabular-nums" />
          </div>
          <div>
            <Label htmlFor={id('cost')} className="text-xs">{L('monthlyCap')}</Label>
            <Input id={id('cost')} type="number" inputMode="decimal" min={0} step="0.5" value={String(form.monthly_cost_cap_usd ?? '')} onChange={(e) => setForm((f) => ({ ...f, monthly_cost_cap_usd: e.target.value === '' ? ('' as never) : Number(e.target.value) }))} className="mt-1 tabular-nums" />
          </div>
          {a.loop === 'sourcer' && (
            <div>
              <Label htmlFor={id('hour')} className="text-xs">{L('runHour')}</Label>
              <Input id={id('hour')} type="number" inputMode="numeric" min={0} max={23} value={String(form.run_hour_utc ?? '')} onChange={(e) => setForm((f) => ({ ...f, run_hour_utc: e.target.value === '' ? ('' as never) : Number(e.target.value) }))} className="mt-1 tabular-nums" />
            </div>
          )}
          {PARAM_KEYS[a.loop].map((k) => (
            <div key={k}>
              <Label htmlFor={id(k)} className="text-xs">{L(`param.${k}`)}</Label>
              <Input id={id(k)} type="number" inputMode="numeric" min={0} value={String(params[k] ?? '')} onChange={(e) => setNum(k, e.target.value)} className="mt-1 tabular-nums" />
            </div>
          ))}
          {a.loop === 'integrity' && (
            <div className="flex items-end gap-2 pb-2">
              <Switch id={id('aisum')} checked={params.ai_summaries === true} onCheckedChange={(v) => setForm((f) => ({ ...f, params: { ...(f.params as object), ai_summaries: v } as never }))} />
              <Label htmlFor={id('aisum')} className="text-sm font-normal">{L('param.ai_summaries')}</Label>
            </div>
          )}
        </div>
      </fieldset>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => void run()} disabled={busy !== null} className="gap-1.5">
          {busy === 'run' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}{L('runNow')}
        </Button>
        <Button onClick={() => void save({ daily_item_cap: form.daily_item_cap, monthly_cost_cap_usd: form.monthly_cost_cap_usd, run_hour_utc: form.run_hour_utc, params: form.params })} disabled={busy !== null} className="gap-1.5">
          {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}{L('save')}
        </Button>
      </div>
    </Panel>
  )
}

function PendingList({ rows, onChanged }: { rows: PendingRow[]; onChanged: () => void }) {
  const { L, fmt } = useL()
  const addToast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const act = async (id: string, what: 'confirm' | 'cancel') => {
    setBusy(id)
    try {
      const r = await api<{ result?: { ok: boolean; message: string } }>(`/api/admin/agent/actions/${encodeURIComponent(id)}/${what}`, { method: 'POST', body: '{}' })
      addToast({ type: what === 'cancel' || r.result?.ok ? 'success' : 'error', title: what === 'cancel' ? L('cancelled') : r.result?.message || L('confirmed') })
    } catch (e) {
      addToast({ type: 'error', title: (e as Error).message })
    } finally {
      setBusy(null)
      onChanged()
    }
  }
  if (!rows.length) return <EmptyState compact illustration="inbox" title={L('pending.empty')} description={L('pending.emptyHint')} />
  return (
    <ul className="space-y-2">
      {rows.map((p) => (
        <li key={p.id}>
          <Panel className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium text-foreground wrap-break-word">{p.title}</p>
              <p className="text-xs text-muted-foreground">{p.tool} · {fmt.relative(p.created_at)} · <Link href={`/dashboard/admin/agent?conversation=${encodeURIComponent(p.conversationId)}`} className="text-primary hover:underline">{L('open')}</Link></p>
              {typeof p.preview.effect === 'string' && <p className="mt-1 text-xs text-muted-foreground">{p.preview.effect}</p>}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => void act(p.id, 'cancel')} className="gap-1"><X className="h-3.5 w-3.5" aria-hidden />{L('cancel')}</Button>
              <Button size="sm" disabled={busy === p.id} onClick={() => void act(p.id, 'confirm')} className="gap-1">
                {busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}{L('confirm')}
              </Button>
            </div>
          </Panel>
        </li>
      ))}
    </ul>
  )
}

function CasesList({ rows, q, onChanged }: { rows: CaseRow[]; q: string; onChanged: () => void }) {
  const { L } = useL()
  const addToast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const draft = async (id: string) => {
    setBusy(id)
    try {
      await api(`/api/admin/hiring-agents/cases${q}`, { method: 'POST', body: JSON.stringify({ id }) })
      addToast({ type: 'success', title: L('integrity.drafted') })
    } catch (e) {
      addToast({ type: 'error', title: (e as Error).message })
    } finally {
      setBusy(null)
      onChanged()
    }
  }
  if (!rows.length) return <EmptyState compact illustration="inbox" title={L('integrity.empty')} description={L('integrity.emptyHint')} />
  return (
    <ul className="space-y-2">
      {rows.map((c) => (
        <li key={c.id}>
          <Panel className="space-y-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 font-medium text-foreground wrap-break-word">{c.name} · <span className="text-muted-foreground">{c.target_title}</span></p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="tabular-nums">{L('integrity.priority', { value: c.priority })}</Badge>
                <Badge variant="outline">{L(`integrity.rec.${c.recommendation}`)}</Badge>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{c.summary}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="outline" asChild><Link href={c.target_kind === 'exam' ? `/dashboard/admin/assessments/${encodeURIComponent(c.target_id)}/integrity` : `/dashboard/admin/contests/${encodeURIComponent(c.target_id)}/integrity`}>{L('open')}</Link></Button>
              {c.target_kind === 'exam' && c.recommendation !== 'none' && (
                <Button size="sm" disabled={busy === c.id} onClick={() => void draft(c.id)}>{busy === c.id && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />}{L('integrity.draft')}</Button>
              )}
            </div>
          </Panel>
        </li>
      ))}
    </ul>
  )
}

function AuthorForm({ q, requests, onChanged }: { q: string; requests: RequestRow[]; onChanged: () => void }) {
  const { L, fmt } = useL()
  const addToast = useToast()
  const [jobId, setJobId] = useState('')
  const [jd, setJd] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api(`/api/admin/hiring-agents/author${q}`, { method: 'POST', body: JSON.stringify({ ...(jobId.trim() ? { job_id: jobId.trim() } : { job_description: jd.trim() }), ...(title.trim() ? { title: title.trim() } : {}) }) })
      addToast({ type: 'success', title: L('author.queued') })
      setJobId(''); setJd(''); setTitle('')
      onChanged()
    } catch (err) {
      addToast({ type: 'error', title: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel className="p-5">
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-muted-foreground">{L('author.hint')}</p>
          <div>
            <Label htmlFor="ha-jobid" className="text-xs">{L('author.jobId')}</Label>
            <Input id="ha-jobid" value={jobId} onChange={(e) => setJobId(e.target.value)} disabled={!!jd.trim()} className="mt-1" autoComplete="off" />
          </div>
          <div>
            <Label htmlFor="ha-jd" className="text-xs">{L('author.jd')}</Label>
            <Textarea id="ha-jd" value={jd} onChange={(e) => setJd(e.target.value)} disabled={!!jobId.trim()} rows={5} maxLength={20000} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="ha-title" className="text-xs">{L('author.titleField')}</Label>
            <Input id="ha-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="mt-1" />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={busy || (!jobId.trim() && jd.trim().length < 40)} className="gap-1.5">{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{L('author.queue')}</Button>
          </div>
        </form>
      </Panel>
      <div>
        {requests.length === 0 ? <EmptyState compact illustration="inbox" title={L('author.empty')} /> : (
          <ul className="space-y-2">
            {requests.map((r) => (
              <li key={r.id}>
                <Panel className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground wrap-break-word">{r.title || r.job_id || r.id.slice(0, 8)}</p>
                    <p className="text-xs text-muted-foreground">{fmt.relative(r.created_at)}{r.message ? ` · ${r.message}` : ''}</p>
                  </div>
                  <Badge variant="outline" className="shrink-0">{L(`req.${r.status}`)}</Badge>
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function RunsLog({ runs }: { runs: RunRow[] }) {
  const { L, fmt } = useL()
  const [open, setOpen] = useState<string | null>(null)
  if (!runs.length) return <EmptyState compact illustration="inbox" title={L('runs.empty')} description={L('runs.emptyHint')} />
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {runs.map((r) => (
        <li key={r.id}>
          <button type="button" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left text-sm hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring">
            <span className="font-medium text-foreground">{L(`loop.${r.loop}.name`)}</span>
            <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_TONE[r.status] ?? STATUS_TONE.skipped}`}>{L(`status.${r.status}`)}</span>
            <span className="text-muted-foreground">{L(`trigger.${r.trigger}`)} · {fmt.dateTime(r.started_at)}</span>
            <span className="tabular-nums text-muted-foreground">{L('runs.items')}: {r.item_count}</span>
            <span className="tabular-nums text-muted-foreground">{L('runs.cost')}: ${r.cost_usd.toFixed(3)}</span>
            <ChevronDown className={`ml-auto h-4 w-4 text-muted-foreground transition-transform ${open === r.id ? 'rotate-180' : ''}`} aria-hidden />
          </button>
          {open === r.id && (
            <div className="space-y-1 px-4 pb-4 text-xs text-muted-foreground">
              {r.message && <p>{r.message}</p>}
              {r.items.length === 0 ? <p>—</p> : r.items.map((it, i) => (
                <p key={`${it.ref}-${i}`} className="wrap-break-word">
                  <span className="font-medium text-foreground">{it.kind}</span> · {it.title}{it.auto_sent ? ` · ${L('autoSend')}` : ''}{it.result ? ` · ${it.result}` : ''}{it.note ? ` · ${it.note}` : ''}
                </p>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

export default function HiringAgentsPage() {
  const gate = usePageGuard('tenant_admin')
  const { L } = useL()
  const [tenants, setTenants] = useState<Array<{ id: string; name: string }> | null>(null)
  const [tenant, setTenant] = useState('')
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState(false)
  const isSuper = tenants !== null
  const q = isSuper ? `?tenant=${encodeURIComponent(tenant)}` : ''

  useEffect(() => {
    if (!gate.ready) return
    // Only superadmins may list organisations; a 403 means "my own organisation".
    void api<{ tenants: Array<{ id: string; name: string }> }>('/api/admin/agent/tenants').then((r) => setTenants(r.tenants)).catch(() => setTenants(null))
  }, [gate.ready])

  const load = useCallback(async () => {
    if (isSuper && !tenant) { setData(null); return }
    try {
      setData(await api<Overview>(`/api/admin/hiring-agents${q}`))
      setError(false)
    } catch {
      setError(true)
    }
  }, [isSuper, tenant, q])
  useEffect(() => { if (gate.ready) void load() }, [gate.ready, load])

  if (!gate.ready) return null
  return (
    <div className="space-y-8">
      <PageHeader
        title={L('title')}
        description={L('subtitle')}
        icon={<Bot />}
        actions={<Button variant="outline" size="sm" onClick={() => void load()} className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" aria-hidden />{L('retry')}</Button>}
      />
      {isSuper && (
        <div className="max-w-sm">
          <Label htmlFor="ha-tenant" className="text-xs">{L('orgLabel')}</Label>
          <select id="ha-tenant" value={tenant} onChange={(e) => setTenant(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring">
            <option value="">{L('orgPick')}</option>
            {tenants!.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}
      {isSuper && !tenant ? (
        <EmptyState compact illustration="inbox" title={L('orgPick')} />
      ) : error && !data ? (
        <EmptyState illustration="error" title={L('loadError')} actionLabel={L('retry')} onAction={() => void load()} />
      ) : !data ? (
        <SkeletonList />
      ) : (
        <>
          <Section title={L('pending.title')}>
            <PendingList rows={data.pending} onChanged={() => void load()} />
          </Section>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {data.agents.map((a) => <AgentCard key={a.loop} a={a} q={q} onChanged={() => void load()} />)}
          </div>
          <Section title={L('integrity.title')}>
            <CasesList rows={data.cases} q={q} onChanged={() => void load()} />
          </Section>
          <Section title={L('author.title')}>
            <AuthorForm q={q} requests={data.requests} onChanged={() => void load()} />
          </Section>
          <Section title={L('runs.title')}>
            <RunsLog runs={data.runs} />
          </Section>
        </>
      )}
    </div>
  )
}
