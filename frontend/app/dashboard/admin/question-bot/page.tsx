'use client'

/**
 * /dashboard/admin/question-bot — the question bank bot: domains, gap
 * targets per type × level with current counts, coverage bars, caps and the
 * nightly switch, "Run now", and the last runs. Drafts it writes are reviewed
 * on Admin → SME review → Question drafts.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Bot, CalendarClock, CircleDollarSign, ClipboardCheck, Loader2, Play, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useDateFormat } from '@/lib/use-platform-timezone'
import { PageHeader, Panel, Section, StatCard } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SkeletonList } from '@/components/ui/skeleton-boneyard'
import { BANK_DIFFICULTIES, BOT_QUESTION_TYPES, type BankDifficulty, type BotQuestionType, type QuestionDomain } from '@/lib/question-bot/domains'
import type { QuestionBotSettings } from '@/lib/question-bot/settings'
import { useAdminT } from '@/lib/i18n/admin'

interface Cell { type: BotQuestionType; difficulty: BankDifficulty; target: number; current: number; approved: number }
type DomainRow = QuestionDomain & { coverage: { target: number; current: number; percent: number }; cells: Cell[] }
interface RunRow {
  id: string; trigger: string; status: string; started_at: string; inserted: number; dropped: number; cost_usd: number; message?: string
  results: Array<{ domain: string; type: string; difficulty: string; asked: number; inserted: number; skipped: number; dropped: number; reasons: string[]; error?: string }>
}
interface Overview {
  settings: QuestionBotSettings
  usage: { writtenToday: number; spentThisMonth: number }
  running: boolean
  budget: { questions: number; blocked?: string }
  thinMin: number
  domains: DomainRow[]
  runs: RunRow[]
}

const TYPE_LABEL: Record<BotQuestionType, string> = { mcq: 'Multiple choice', coding: 'Coding' }
const STATUS_VARIANT: Record<string, string> = {
  ok: 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400',
  partial: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  failed: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400',
  running: 'border-primary/30 bg-primary/10 text-primary',
  skipped: 'border-border bg-muted text-muted-foreground',
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await csrfFetch(url, { headers: { 'Content-Type': 'application/json' }, credentials: 'include', ...init })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((d as { error?: string; message?: string }).error || (d as { message?: string }).message || 'Request failed')
  return d as T
}

// ─── Settings ───────────────────────────────────────────────────────────────

function SettingsPanel({ settings, onSaved }: { settings: QuestionBotSettings; onSaved: () => void }) {
  const { t: tx } = useAdminT()
  const addToast = useToast()
  const [form, setForm] = useState(settings)
  const [saving, setSaving] = useState(false)
  useEffect(() => { setForm(settings) }, [settings])
  const num = (k: keyof QuestionBotSettings) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value === '' ? ('' as never) : Number(e.target.value) }))

  const save = async (patch: Partial<QuestionBotSettings>) => {
    setSaving(true)
    try {
      await api('/api/admin/question-bot', { method: 'PATCH', body: JSON.stringify(patch) })
      addToast({ type: 'success', title: tx('qbot.settingsSaved') })
      onSaved()
    } catch (e) {
      addToast({ type: 'error', title: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  const fields: Array<{ k: keyof QuestionBotSettings; label: string; hint: string; step?: string }> = [
    { k: 'daily_question_cap', label: 'Questions per day', hint: 'All runs together' },
    { k: 'per_run_cap', label: 'Questions per run', hint: 'One nightly or manual run' },
    { k: 'per_cell_cap', label: 'Questions per batch', hint: 'One domain, type and level' },
    { k: 'monthly_cost_cap_usd', label: 'Monthly AI cap (USD)', hint: 'Estimated from tokens', step: '0.5' },
    { k: 'run_hour_utc', label: 'Nightly run hour (UTC)', hint: '0–23' },
  ]
  return (
    <Panel className="space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-semibold text-foreground">{tx('qbot.nightlyRun')}</p>
          <p className="text-sm text-muted-foreground">{tx('qbot.whenOnTheBotFills')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="bot-enabled" checked={form.enabled} disabled={saving} onCheckedChange={(v) => { setForm((f) => ({ ...f, enabled: v })); void save({ enabled: v }) }} />
          <Label htmlFor="bot-enabled">{form.enabled ? 'On' : 'Off'}</Label>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {fields.map((f) => (
          <div key={f.k}>
            <Label htmlFor={`s-${f.k}`} className="text-xs">{f.label}</Label>
            <Input id={`s-${f.k}`} type="number" inputMode="decimal" min={0} step={f.step ?? '1'} value={String(form[f.k] ?? '')} onChange={num(f.k)} className="mt-1 tabular-nums" />
            <p className="mt-1 text-xs text-muted-foreground">{f.hint}</p>
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Button onClick={() => void save({ daily_question_cap: form.daily_question_cap, per_run_cap: form.per_run_cap, per_cell_cap: form.per_cell_cap, monthly_cost_cap_usd: form.monthly_cost_cap_usd, run_hour_utc: form.run_hour_utc })} disabled={saving}>
          {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <Save className="mr-1.5 h-4 w-4" aria-hidden />}
          {tx('qbot.saveCaps')}
        </Button>
      </div>
    </Panel>
  )
}

// ─── Domains ────────────────────────────────────────────────────────────────

function DomainCard({ d, thinMin, onChanged }: { d: DomainRow; thinMin: number; onChanged: () => void }) {
  const { t: tx } = useAdminT()
  const addToast = useToast()
  const [targets, setTargets] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const keyOf = (c: Pick<Cell, 'type' | 'difficulty'>) => `${c.type}|${c.difficulty}`
  useEffect(() => { setTargets(Object.fromEntries(d.cells.map((c) => [keyOf(c), String(c.target)]))) }, [d])
  const dirty = d.cells.some((c) => targets[keyOf(c)] !== undefined && targets[keyOf(c)] !== String(c.target))

  const patch = async (body: Record<string, unknown>, ok: string) => {
    setSaving(true)
    try {
      await api(`/api/admin/question-bot/domains?id=${encodeURIComponent(d.id)}`, { method: 'PATCH', body: JSON.stringify(body) })
      addToast({ type: 'success', title: ok })
      onChanged()
    } catch (e) {
      addToast({ type: 'error', title: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }
  const saveTargets = () => {
    const t: Record<string, Record<string, number>> = {}
    for (const c of d.cells) {
      const n = Math.max(0, Math.floor(Number(targets[keyOf(c)]) || 0))
      ;(t[c.type] ||= {})[c.difficulty] = n
    }
    void patch({ targets: t }, `Targets saved for ${d.label}`)
  }
  const remove = async () => {
    setConfirmDelete(false)
    try {
      await api(`/api/admin/question-bot/domains?id=${encodeURIComponent(d.id)}`, { method: 'DELETE' })
      addToast({ type: 'success', title: `${d.label} removed. Its questions stay in the bank.` })
      onChanged()
    } catch (e) {
      addToast({ type: 'error', title: (e as Error).message })
    }
  }

  const thin = BANK_DIFFICULTIES.filter((lv) => d.cells.filter((c) => c.difficulty === lv).reduce((n, c) => n + c.approved, 0) < thinMin)
  return (
    <Panel className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-foreground">{d.label}</h3>
            <Badge variant="outline" className="capitalize">{d.kind}</Badge>
            {d.language ? <Badge variant="outline">{d.language}</Badge> : null}
            {!d.active ? <Badge variant="outline" className="text-muted-foreground">{tx('qbot.paused')}</Badge> : null}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground"><span className="font-mono">{d.id}</span>{d.topics.length ? <> · {d.topics.slice(0, 4).join(', ')}{d.topics.length > 4 ? '…' : ''}</> : null}</p>
        </div>
        <div className="flex items-center gap-2">
          <Switch id={`active-${d.id}`} checked={d.active} disabled={saving} onCheckedChange={(v) => void patch({ active: v }, v ? `${d.label} is back in the plan` : `${d.label} paused`)} />
          <Label htmlFor={`active-${d.id}`} className="text-sm">{tx('qbot.active')}</Label>
          <Button variant="ghost" size="icon" aria-label={`Remove ${d.label}`} onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4" aria-hidden /></Button>
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">{tx('qbot.coverage')}</span>
          <span className="tabular-nums text-foreground">{d.coverage.current} / {d.coverage.target} · {d.coverage.percent}%</span>
        </div>
        <Progress value={d.coverage.percent} aria-label={`${d.label} coverage ${d.coverage.percent}%`} />
        {thin.length ? (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
            Fewer than {thinMin} approved questions at {thin.join(', ')} — adaptive tests on this domain will fall back to other levels.
          </p>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-sm">
          <caption className="sr-only">Targets and current counts for {d.label}</caption>
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col" className="py-1 pr-3 font-medium">{tx('common.type')}</th>
              {BANK_DIFFICULTIES.map((lv) => <th key={lv} scope="col" className="px-2 py-1 font-medium">{lv}</th>)}
            </tr>
          </thead>
          <tbody>
            {BOT_QUESTION_TYPES.map((type) => (
              <tr key={type} className="border-t border-border/60">
                <th scope="row" className="py-2 pr-3 text-left font-medium text-foreground">{TYPE_LABEL[type]}</th>
                {BANK_DIFFICULTIES.map((lv) => {
                  const c = d.cells.find((x) => x.type === type && x.difficulty === lv)!
                  const met = c.target > 0 && c.current >= c.target
                  return (
                    <td key={lv} className="px-2 py-2 align-top">
                      <Input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={targets[keyOf(c)] ?? ''}
                        onChange={(e) => setTargets((t) => ({ ...t, [keyOf(c)]: e.target.value }))}
                        aria-label={`${TYPE_LABEL[type]} ${lv} target`}
                        className="h-9 w-24 tabular-nums"
                      />
                      <p className={`mt-1 text-xs tabular-nums ${met ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}`}>
                        {c.current} now · {c.approved} approved
                      </p>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dirty ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={saveTargets} disabled={saving}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <Save className="mr-1.5 h-4 w-4" aria-hidden />}
            {tx('qbot.saveTargets')}
          </Button>
        </div>
      ) : null}
      <ConfirmDialog open={confirmDelete} title={`Remove ${d.label}?`} message="The bot stops writing for this domain. Questions already in the bank stay there." confirmLabel="Remove" onConfirm={() => void remove()} onCancel={() => setConfirmDelete(false)} />
    </Panel>
  )
}

function AddDomain({ onAdded }: { onAdded: () => void }) {
  const { t: tx } = useAdminT()
  const addToast = useToast()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ id: '', label: '', topics: '', language: '', coding: false })
  const [saving, setSaving] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api('/api/admin/question-bot/domains', {
        method: 'POST',
        body: JSON.stringify({
          id: form.id,
          label: form.label,
          kind: 'skill',
          topics: form.topics.split(',').map((t) => t.trim()).filter(Boolean),
          ...(form.language ? { language: form.language } : {}),
          targets: { mcq: { Easy: 200, Medium: 150, Hard: 100 }, ...(form.coding ? { coding: { Easy: 30, Medium: 40, Hard: 50 } } : {}) },
        }),
      })
      addToast({ type: 'success', title: `${form.label} added` })
      setForm({ id: '', label: '', topics: '', language: '', coding: false })
      setOpen(false)
      onAdded()
    } catch (err) {
      addToast({ type: 'error', title: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }
  if (!open) return <Button variant="outline" onClick={() => setOpen(true)}><Plus className="mr-1.5 h-4 w-4" aria-hidden />{tx('qbot.addDomain')}</Button>
  return (
    <Panel className="w-full p-5">
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="nd-label">{tx('common.name')}</Label>
          <Input id="nd-label" required value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value, id: f.id || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) }))} placeholder="Go" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="nd-id">Id</Label>
          <Input id="nd-id" required pattern="[a-z0-9_]{2,40}" value={form.id} onChange={(e) => setForm((f) => ({ ...f, id: e.target.value.toLowerCase() }))} placeholder="golang" className="mt-1 font-mono" />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="nd-topics">{tx('qbot.topicsCommaSeparated')}</Label>
          <Input id="nd-topics" value={form.topics} onChange={(e) => setForm((f) => ({ ...f, topics: e.target.value }))} placeholder="Goroutines, Channels, Interfaces" className="mt-1" />
        </div>
        <div className="flex items-center gap-2">
          <Switch id="nd-coding" checked={form.coding} onCheckedChange={(v) => setForm((f) => ({ ...f, coding: v, language: v ? f.language || 'python' : '' }))} />
          <Label htmlFor="nd-coding">{tx('qbot.codingQuestionsToo')}</Label>
        </div>
        {form.coding ? (
          <div>
            <Label htmlFor="nd-lang">{tx('qbot.referenceSolutionLanguage')}</Label>
            <select id="nd-lang" value={form.language} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {['python', 'javascript', 'java', 'cpp', 'c'].map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        ) : null}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{tx('common.cancel')}</Button>
          <Button type="submit" disabled={saving}>{saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : null}Add domain</Button>
        </div>
      </form>
    </Panel>
  )
}

// ─── Runs ───────────────────────────────────────────────────────────────────

function RunsList({ runs }: { runs: RunRow[] }) {
  const { t: tx } = useAdminT()
  const { dateTime } = useDateFormat()
  if (!runs.length) return <EmptyState compact illustration="ai" title={tx('qbot.noRunsYet')} description={tx('qbot.useRunNowOrSwitch')} />
  return (
    <ul className="space-y-3">
      {runs.map((r) => (
        <li key={r.id}>
          <details className="group rounded-2xl border border-border/70 bg-card p-4">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 rounded-lg text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Badge variant="outline" className={`capitalize ${STATUS_VARIANT[r.status] ?? ''}`}>{r.status}</Badge>
              <span className="text-foreground">{dateTime(r.started_at)}</span>
              <span className="text-muted-foreground capitalize">· {r.trigger === 'cron' ? 'nightly' : r.trigger}</span>
              <span className="ml-auto tabular-nums text-muted-foreground">{r.inserted} written · {r.dropped} dropped · ${r.cost_usd.toFixed(3)}</span>
            </summary>
            {r.message ? <p className="mt-2 text-sm text-muted-foreground">{r.message}</p> : null}
            {r.results.length ? (
              <ul className="mt-3 space-y-1 text-sm">
                {r.results.map((c, i) => (
                  <li key={i} className="flex flex-wrap gap-x-2 text-muted-foreground">
                    <span className="text-foreground">{c.domain} · {c.type} · {c.difficulty}</span>
                    <span className="tabular-nums">{c.inserted}/{c.asked} saved{c.skipped ? `, ${c.skipped} duplicates` : ''}{c.dropped ? `, ${c.dropped} failed checks` : ''}</span>
                    {c.error ? <span className="text-red-700 dark:text-red-400">{c.error}</span> : null}
                    {c.reasons.length ? <span>({c.reasons.join('; ')})</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </details>
        </li>
      ))}
    </ul>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function QuestionBotPage() {
  const { t: tx } = useAdminT()
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState(false)
  const [running, setRunning] = useState(false)
  const [drafts, setDrafts] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      const [d, q] = await Promise.all([
        api<Overview>('/api/admin/question-bot'),
        api<{ total: number }>('/api/admin/question-bot/drafts').catch(() => null),
      ])
      setData(d)
      setDrafts(q ? q.total : null)
      setError(false)
    } catch {
      setError(true)
    }
  }, [])
  useEffect(() => { if (gate.ready) void load() }, [gate.ready, load])

  const runNow = async () => {
    setRunning(true)
    try {
      const r = await api<{ message: string; inserted: number }>('/api/admin/question-bot/run', { method: 'POST', body: '{}' })
      addToast({ type: r.inserted > 0 ? 'success' : 'info', title: r.message })
    } catch (e) {
      addToast({ type: 'error', title: (e as Error).message })
    } finally {
      setRunning(false)
      void load()
    }
  }

  if (!gate.ready) return null
  const s = data?.settings
  return (
    <div className="space-y-8">
      <PageHeader
        title={tx('qbot.questionBot')}
        description={tx('qbot.writesDraftQuestionsWhereThe')}
        icon={<Bot />}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void load()} className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" aria-hidden />{tx('common.refresh')}</Button>
            <Button onClick={() => void runNow()} disabled={running || !data || data.running || data.budget.questions === 0} className="gap-1.5">
              {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
              {running ? 'Running… (a few minutes)' : 'Run now'}
            </Button>
          </>
        }
      />

      {error && !data ? (
        <EmptyState illustration="error" title={tx('qbot.couldnTLoadTheQuestion')} description={tx('common.checkConnection')} actionLabel={tx('common.tryAgain')} onAction={() => void load()} />
      ) : !data || !s ? (
        <SkeletonList />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={tx('qbot.writtenToday')} value={<>{data.usage.writtenToday}<span className="text-base font-medium text-muted-foreground"> / {s.daily_question_cap}</span></>} icon={<CalendarClock />} hint={data.budget.blocked ?? `${data.budget.questions} left for the next run`} />
            <StatCard label={tx('qbot.aiSpendThisMonth')} value={`$${data.usage.spentThisMonth.toFixed(2)}`} hint={`Cap $${s.monthly_cost_cap_usd.toFixed(2)}`} icon={<CircleDollarSign />} />
            <StatCard label={tx('qbot.draftsWaiting')} value={drafts ?? '—'} hint={<Link href="/dashboard/admin/sme-review?tab=drafts" className="text-primary hover:underline">{tx('qbot.reviewDrafts')}</Link>} icon={<ClipboardCheck />} />
            <StatCard label={tx('qbot.nightlyRun')} value={s.enabled ? 'On' : 'Off'} hint={data.running ? 'A run is in progress' : s.enabled ? `From ${String(s.run_hour_utc).padStart(2, '0')}:00 UTC` : 'Switch on below'} icon={<Bot />} />
          </div>

          <SettingsPanel settings={s} onSaved={() => void load()} />

          <Section title={tx('qbot.domainsAndTargets')} description={tx('qbot.targetsCountApprovedQuestionsPlus')} actions={<AddDomain onAdded={() => void load()} />}>
            {data.domains.length === 0 ? (
              <EmptyState compact illustration="inbox" title={tx('qbot.noDomains')} description={tx('qbot.addADomainToTell')} />
            ) : (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {[...data.domains].sort((a, b) => Number(b.active) - Number(a.active) || a.coverage.percent - b.coverage.percent).map((d) => (
                  <DomainCard key={d.id} d={d} thinMin={data.thinMin} onChanged={() => void load()} />
                ))}
              </div>
            )}
          </Section>

          <Section title={tx('qbot.lastRuns')}>
            <RunsList runs={data.runs} />
          </Section>
        </>
      )}
    </div>
  )
}
