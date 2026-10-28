'use client'

/**
 * /dashboard/admin/assistants (superadmin) — the five wave-15 assistants
 * (lib/assistants): on/off and messaging switches, AI caps, "Run now" for the
 * scheduled ones, and the run log. Loop proposals land in the AI copilot.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Bot, Loader2, Play, RefreshCw, Save } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { useAdminT } from '@/lib/i18n/admin'
import type { AssistantId, AssistantMeta, AssistantRunRow, AssistantSettings } from '@/lib/assistants/registry'

interface Row extends AssistantMeta {
  settings: AssistantSettings
  defaults: AssistantSettings
  stats: { runs: number; failed: number; last_at: string | null; user_turns?: number }
  ai_today: { calls: number; spent_usd: number | null } | null
}
interface Overview { assistants: Row[]; runs: AssistantRunRow[] }

const BOOL_FIELDS = ['enabled', 'ai_enabled', 'messaging_enabled'] as const
type BoolField = (typeof BOOL_FIELDS)[number]
const isBool = (k: string): k is BoolField => (BOOL_FIELDS as readonly string[]).includes(k)

const STATUS: Record<string, string> = {
  ok: 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400',
  partial: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  failed: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400',
  skipped: 'border-border bg-muted text-muted-foreground',
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await csrfFetch(url, { headers: { 'Content-Type': 'application/json' }, credentials: 'include', ...init })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((d as { error?: string }).error || 'Request failed')
  return d as T
}

function AssistantCard({ row, onSaved }: { row: Row; onSaved: () => void }) {
  const { t, td, fmt } = useAdminT()
  const addToast = useToast()
  const [form, setForm] = useState<AssistantSettings>(row.settings)
  const [busy, setBusy] = useState<'save' | 'run' | null>(null)
  useEffect(() => { setForm(row.settings) }, [row.settings])
  const numbers = row.fields.filter((f) => !isBool(f))

  const save = async (patch: Partial<AssistantSettings>) => {
    setBusy('save')
    try {
      await api('/api/admin/assistants', { method: 'PATCH', body: JSON.stringify({ id: row.id, patch }) })
      addToast({ type: 'success', title: t('assistants.saved') })
      onSaved()
    } catch (e) {
      addToast({ type: 'error', title: (e as Error).message })
      setForm(row.settings)
    } finally { setBusy(null) }
  }
  const runNow = async () => {
    setBusy('run')
    try {
      const r = await api<{ run: AssistantRunRow | null }>(`/api/admin/assistants/${row.id}/run`, { method: 'POST' })
      addToast({ type: 'success', title: t('assistants.ranNow'), message: r.run?.message })
      onSaved()
    } catch (e) {
      addToast({ type: 'error', title: (e as Error).message })
    } finally { setBusy(null) }
  }

  return (
    <Panel className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-foreground">{td(`assistants.name_${row.id}`, row.id)}</h2>
            <Badge variant="outline" className="text-xs">{td(`assistants.kind_${row.kind}`, row.kind)}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{td(`assistants.desc_${row.id}`, '')}</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {row.fields.filter(isBool).map((f) => (
          <div key={f} className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 px-3 py-2">
            <div className="min-w-0">
              <Label htmlFor={`${row.id}-${f}`} className="text-sm">{td(`assistants.field_${f}`, f)}</Label>
              <p className="text-xs text-muted-foreground">{td(`assistants.hint_${row.id}_${f}`, td(`assistants.hint_${f}`, ''))}</p>
            </div>
            <Switch id={`${row.id}-${f}`} checked={!!form[f]} disabled={busy !== null} onCheckedChange={(v) => { setForm((x) => ({ ...x, [f]: v })); void save({ [f]: v }) }} />
          </div>
        ))}
      </div>
      {numbers.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {numbers.map((f) => (
            <div key={f}>
              <Label htmlFor={`${row.id}-${f}`} className="text-xs">{td(`assistants.field_${f}`, f)}</Label>
              <Input id={`${row.id}-${f}`} type="number" inputMode="decimal" min={0} step={f === 'monthly_cost_cap_usd' ? '0.5' : '1'} value={String(form[f] ?? '')} onChange={(e) => setForm((x) => ({ ...x, [f]: e.target.value === '' ? ('' as never) : Number(e.target.value) }))} className="mt-1 tabular-nums" />
              <p className="mt-1 text-xs text-muted-foreground">{t('assistants.defaultValue', { value: String(row.defaults[f] ?? '') })}</p>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
        <span>
          {t('assistants.stats', { runs: row.stats.runs, failed: row.stats.failed })}
          {row.stats.user_turns ? ` · ${t('assistants.userTurns', { n: row.stats.user_turns })}` : ''}
          {row.stats.last_at ? ` · ${t('assistants.lastRun', { when: fmt.relative(row.stats.last_at) })}` : ''}
          {row.ai_today ? ` · ${t('assistants.aiToday', { calls: row.ai_today.calls, spent: row.ai_today.spent_usd === null ? '—' : `$${row.ai_today.spent_usd.toFixed(2)}` })}` : ''}
        </span>
        <div className="flex flex-wrap gap-2">
          {row.job_id && (
            <Button variant="outline" size="sm" disabled={busy !== null} onClick={runNow}>
              {busy === 'run' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Play className="mr-1.5 h-4 w-4" aria-hidden />}{t('assistants.runNow')}
            </Button>
          )}
          {numbers.length > 0 && (
            <Button size="sm" disabled={busy !== null} onClick={() => void save(Object.fromEntries(numbers.map((f) => [f, form[f]])) as Partial<AssistantSettings>)}>
              {busy === 'save' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Save className="mr-1.5 h-4 w-4" aria-hidden />}{t('assistants.save')}
            </Button>
          )}
        </div>
      </div>
    </Panel>
  )
}

function RunLog({ runs, filter, setFilter, ids }: { runs: AssistantRunRow[]; filter: AssistantId | 'all'; setFilter: (v: AssistantId | 'all') => void; ids: AssistantId[] }) {
  const { t, td, fmt } = useAdminT()
  return (
    <Panel className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">{t('assistants.runLog')}</h2>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('assistants.filter')}>
          {(['all', ...ids] as const).map((id) => (
            <Button key={id} size="sm" variant={filter === id ? 'default' : 'outline'} className="rounded-full" aria-pressed={filter === id} onClick={() => setFilter(id)}>
              {id === 'all' ? t('assistants.all') : td(`assistants.name_${id}`, id)}
            </Button>
          ))}
        </div>
      </div>
      {runs.length === 0 ? <EmptyState compact title={t('assistants.noRuns')} description={t('assistants.noRunsDesc')} /> : (
        <ul className="divide-y divide-border/60">
          {runs.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-3">
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="outline" className={STATUS[r.status] ?? STATUS.skipped}>{td(`assistants.status_${r.status}`, r.status)}</Badge>
                <span className="text-xs text-muted-foreground">{td(`assistants.name_${r.assistant}`, r.assistant)} · {td(`assistants.trigger_${r.trigger}`, r.trigger)}</span>
              </div>
              <p className="min-w-0 flex-1 text-sm text-foreground">{r.message}</p>
              <time className="shrink-0 text-xs tabular-nums text-muted-foreground" dateTime={r.started_at}>{fmt.dateTime(r.started_at)}</time>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

export default function AssistantsAdminPage() {
  const gate = usePageGuard('/dashboard/admin/assistants')
  const { t } = useAdminT()
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<AssistantId | 'all'>('all')

  const load = useCallback(async () => {
    setError(null)
    try { setData(await api<Overview>(`/api/admin/assistants${filter === 'all' ? '' : `?assistant=${filter}`}`)) } catch (e) { setError((e as Error).message) }
  }, [filter])
  useEffect(() => { if (gate.ready) void load() }, [gate.ready, load])

  if (!gate.ready) return null
  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <PageHeader
        title={t('assistants.title')} description={t('assistants.description')} icon={<Bot />}
        actions={<div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild><Link href="/dashboard/admin/agent">{t('assistants.openCopilot')}</Link></Button>
          <Button variant="outline" onClick={() => void load()}><RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />{t('assistants.refresh')}</Button>
        </div>}
      />
      {error ? <EmptyState illustration="error" title={t('assistants.loadFailed')} description={error} actionLabel={t('assistants.retry')} onAction={() => void load()} />
        : !data ? <div className="grid gap-4 lg:grid-cols-2" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="h-56 animate-pulse rounded-3xl bg-muted motion-reduce:animate-none" />)}</div>
        : (
          <>
            <div className="grid gap-4 lg:grid-cols-2">{data.assistants.map((a) => <AssistantCard key={a.id} row={a} onSaved={() => void load()} />)}</div>
            <RunLog runs={data.runs} filter={filter} setFilter={setFilter} ids={data.assistants.map((a) => a.id)} />
          </>
        )}
    </div>
  )
}
