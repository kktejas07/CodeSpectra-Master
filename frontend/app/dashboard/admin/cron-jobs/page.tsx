'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  RefreshCw,
  Play,
  Power,
  Activity,
  Clock,
  Database,
  Zap,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  XCircle,
  Timer,
  Radio,
  KeyRound,
  ExternalLink,
} from 'lucide-react'
import { SkeletonCard, SkeletonStats } from '@/components/ui/skeleton-boneyard'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'

type RunMeta = {
  lastRunAt: string | null
  lastStatus: 'ok' | 'error' | null
  lastDurationMs: number | null
  lastError?: string | null
  runs: number
  failures: number
}

type LoopRow = RunMeta & {
  id: string
  name: string
  what: string
  recommend: string
  status: 'running' | 'disabled'
}

type HttpJob = RunMeta & {
  id: string
  path: string
  name: string
  what: string
  recommend: string
  cronHint: string
  auth: string
  intervalMinutes: number
  configured: boolean
  status: 'ready' | 'needs_secret'
}

type WorkflowRow = {
  id: string
  name: string
  description: string
  cron: string
  is_active: boolean
  nodes: number
  created_at: string
}

type RunRow = {
  id: string
  workflow_id: string
  status: string
  started_at: string
  finished_at?: string
  duration_ms?: number
}

type CronPayload = {
  error?: string
  scheduler: {
    inProcessLoop: boolean
    disabledEnv: string | null
    cronSecretSet: boolean
    redis: {
      configured: boolean
      connected: boolean
      mode: string | null
      latencyMs: number | null
      error: string | null
    }
  }
  loops: LoopRow[]
  httpJobs: HttpJob[]
  scheduledWorkflows: WorkflowRow[]
  recentRuns: RunRow[]
  queue: { pending: number; total: number }
}

const SECRET_MISSING = (job: { configured: boolean }) => !job.configured

/** "3m ago" / "2d ago" / "never". */
function ago(iso: string | null): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return 'never'
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

type JobState = { label: string; tone: 'ok' | 'warn' | 'bad'; hint: string }

/**
 * Evidence-based state. "Secret is set" only means the endpoint CAN run —
 * lastRun proves it DID. Stale = no run within 2.5× its intended interval.
 */
function httpState(job: HttpJob): JobState {
  if (SECRET_MISSING(job)) {
    return { label: 'Needs CRON_SECRET', tone: 'warn', hint: 'Set the secret so your external cron can call it.' }
  }
  if (!job.lastRunAt) {
    return { label: 'Never run', tone: 'warn', hint: 'No call recorded — point your external cron at this URL.' }
  }
  if (job.lastStatus === 'error') {
    return { label: 'Last run failed', tone: 'bad', hint: job.lastError || 'The last invocation returned an error.' }
  }
  const ageMs = Date.now() - new Date(job.lastRunAt).getTime()
  if (ageMs > job.intervalMinutes * 2.5 * 60_000) {
    return { label: 'Stale', tone: 'warn', hint: `No run within ${Math.round(job.intervalMinutes * 2.5)}m (expected every ${job.intervalMinutes}m).` }
  }
  return { label: 'Running', tone: 'ok', hint: 'Ran recently.' }
}

function loopState(loop: LoopRow): JobState {
  if (loop.status === 'disabled') {
    return { label: 'Disabled', tone: 'warn', hint: 'NEXT_PUBLIC_DISABLE_SCHEDULER=1' }
  }
  if (!loop.lastRunAt) {
    return { label: 'Waiting', tone: 'warn', hint: 'Loop started but has not ticked yet.' }
  }
  if (loop.lastStatus === 'error') {
    return { label: 'Last tick failed', tone: 'bad', hint: loop.lastError || 'Last tick errored.' }
  }
  const ageMs = Date.now() - new Date(loop.lastRunAt).getTime()
  const staleAfter = loop.id === 'trial-expiry' ? 27 * 60 * 60_000 : 3 * 60_000
  if (ageMs > staleAfter) {
    return { label: 'Stale', tone: 'warn', hint: `Last tick ${ago(loop.lastRunAt)}.` }
  }
  return { label: 'Running', tone: 'ok', hint: 'Ticking normally.' }
}

function StatePill({ state }: { state: JobState }) {
  const cls =
    state.tone === 'ok'
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
      : state.tone === 'bad'
        ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
        : 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
  return (
    <Badge variant="outline" className={`shrink-0 border-transparent ${cls}`} title={state.hint}>
      {state.label}
    </Badge>
  )
}

function RunLine({ meta, errorLabel }: { meta: RunMeta; errorLabel?: string }) {
  return (
    <p className="mt-1 wrap-break-word text-[11px] text-muted-foreground">
      Last run: {ago(meta.lastRunAt)}
      {meta.lastDurationMs != null ? ` · ${meta.lastDurationMs}ms` : ''}
      {meta.runs > 0 ? ` · ${meta.runs} run${meta.runs === 1 ? '' : 's'}` : ''}
      {meta.failures > 0 ? ` · ${meta.failures} failed` : ''}
      {errorLabel ? ` · ${errorLabel}` : ''}
    </p>
  )
}

function StatusPill({
  ok,
  okLabel,
  badLabel,
}: {
  ok: boolean
  okLabel: string
  badLabel: string
}) {
  return ok ? (
    <Badge variant="success" className="shrink-0">
      {okLabel}
    </Badge>
  ) : (
    <Badge variant="warning" className="max-w-full shrink-0 whitespace-normal wrap-break-word text-left">
      {badLabel}
    </Badge>
  )
}

export default function CronJobsPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [data, setData] = useState<CronPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/cron-jobs', { credentials: 'include', cache: 'no-store' })
      const json = (await res.json().catch(() => ({}))) as CronPayload
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (gate.ready) void load()
  }, [gate.ready, load])

  const runAction = useCallback(
    async (action: string, extra?: { workflowId?: string; path?: string }) => {
      const key = action + (extra?.path || extra?.workflowId || '')
      setBusy(key)
      try {
        const res = await csrfFetch('/api/admin/cron-jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ...extra }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`)
        addToast({
          type: 'success',
          title:
            action === 'run-tick'
              ? 'Scheduler tick ran'
              : action === 'run-endpoint'
                ? `Ran ${extra?.path}`
                : action === 'run-workflow'
                  ? 'Workflow started'
                  : 'Workflow updated',
        })
        await load()
      } catch (e) {
        addToast({
          type: 'error',
          title: 'Action failed',
          message: e instanceof Error ? e.message : String(e),
        })
      } finally {
        setBusy(null)
      }
    },
    [addToast, load],
  )

  if (!gate.ready) {
    return (
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6">
        <SkeletonStats />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  const secretMissing = Boolean(data && !data.scheduler.cronSecretSet)
  const httpStates = data ? data.httpJobs.map(httpState) : []
  const runningJobs = httpStates.filter((s) => s.tone === 'ok').length
  const attentionJobs = httpStates.filter((s) => s.tone !== 'ok').length

  return (
    <div className="w-full min-w-0 space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Timer className="h-6 w-6 shrink-0 text-teal-600" /> Cron jobs
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What is configured, what is running, and what your external cron provider should call.
            The secret stays on the server — use <strong>Run now</strong> here to test.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading || !!busy}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => void runAction('run-tick')} disabled={!!busy} className="text-white font-bold">
            {busy === 'run-tick' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Run tick now
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0 wrap-break-word">{error}</span>
        </div>
      )}

      {secretMissing && (
        <Card className="border-amber-500/40 bg-amber-500/5 p-4 sm:p-5">
          <div className="flex gap-3">
            <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="min-w-0 space-y-2 text-sm">
              <p className="font-semibold text-amber-900 dark:text-amber-200">
                Set <code className="rounded bg-muted px-1">CRON_SECRET</code> so external cron can
                call these URLs
              </p>
              <ol className="list-decimal space-y-1.5 pl-4 text-muted-foreground">
                <li>
                  Generate a secret:{' '}
                  <code className="break-all rounded bg-muted px-1 text-[11px]">
                    openssl rand -hex 32
                  </code>
                </li>
                <li>
                  In <strong>Dokploy → frontend service → Environment</strong>, add{' '}
                  <code className="break-all rounded bg-muted px-1 text-[11px]">
                    CRON_SECRET=&lt;paste value&gt;
                  </code>{' '}
                  and redeploy / restart.
                </li>
                <li>
                  Point cron at e.g.{' '}
                  <code className="break-all rounded bg-muted px-1 text-[11px]">
                    https://your-domain/api/cron/tick?secret=YOUR_SECRET
                  </code>{' '}
                  (or header{' '}
                  <code className="break-all rounded bg-muted px-1 text-[11px]">
                    Authorization: Bearer YOUR_SECRET
                  </code>
                  ).
                </li>
              </ol>
              <p className="text-xs text-muted-foreground">
                In-process loops still run without this. Only HTTP cron endpoints need the secret.
                Locally: put it in <code className="rounded bg-muted px-1">.env.local</code> (see{' '}
                <code className="rounded bg-muted px-1">.env.example</code>).
              </p>
            </div>
          </div>
        </Card>
      )}

      {loading && !data ? (
        <div className="space-y-4">
          <SkeletonStats />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : null}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="min-w-0 p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Scheduler loop
              </p>
              <div className="mt-2 flex items-center gap-2">
                {data.scheduler.inProcessLoop ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0 text-amber-600" />
                )}
                <span className="text-sm font-semibold">
                  {data.scheduler.inProcessLoop ? 'Running' : 'Disabled'}
                </span>
              </div>
              {data.scheduler.disabledEnv ? (
                <p className="mt-1 break-all text-[11px] text-muted-foreground">
                  NEXT_PUBLIC_DISABLE_SCHEDULER={data.scheduler.disabledEnv}
                </p>
              ) : null}
            </Card>

            <Card className="min-w-0 p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                CRON_SECRET
              </p>
              <div className="mt-2">
                <StatusPill
                  ok={data.scheduler.cronSecretSet}
                  okLabel="Set"
                  badLabel="Missing — external cron will fail"
                />
              </div>
            </Card>

            <Card className="min-w-0 p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Redis lock
              </p>
              <div className="mt-2">
                <StatusPill
                  ok={data.scheduler.redis.connected}
                  okLabel={data.scheduler.redis.configured ? 'Connected' : 'Configured'}
                  badLabel={data.scheduler.redis.configured ? 'Disconnected' : 'Not configured'}
                />
              </div>
              {data.scheduler.redis.mode ? (
                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                  {data.scheduler.redis.mode}
                  {data.scheduler.redis.latencyMs != null
                    ? ` · ${data.scheduler.redis.latencyMs}ms`
                    : ''}
                </p>
              ) : null}
            </Card>

            <Card className="min-w-0 p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                GitHub scan queue
              </p>
              <p className="mt-2 text-sm font-semibold">
                {data.queue.pending}{' '}
                <span className="font-normal text-muted-foreground">
                  pending / {data.queue.total}
                </span>
              </p>
            </Card>
          </div>

          <Card className="min-w-0 overflow-hidden">
            <div className="border-b border-border/60 px-4 py-3 sm:px-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Activity className="h-4 w-4 shrink-0" /> Built-in loops
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Run inside the app process when the server is alive.
              </p>
            </div>
            <div className="divide-y divide-border/60">
              {data.loops.map((loop) => (
                <div
                  key={loop.id}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{loop.name}</p>
                    <p className="mt-0.5 wrap-break-word text-xs text-muted-foreground">{loop.what}</p>
                    <p className="mt-1 wrap-break-word text-[11px] text-muted-foreground">
                      Suggested: {loop.recommend}
                    </p>
                    <RunLine meta={loop} />
                  </div>
                  <StatePill state={loopState(loop)} />
                </div>
              ))}
            </div>
          </Card>

          <Card className="min-w-0 overflow-hidden">
            <div className="border-b border-border/60 px-4 py-3 sm:px-5">
              <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                <Zap className="h-4 w-4 shrink-0" /> HTTP cron endpoints
                <Badge variant="success" className="text-[10px]">{runningJobs} running</Badge>
                {attentionJobs > 0 ? (
                  <Badge variant="warning" className="text-[10px]">{attentionJobs} need attention</Badge>
                ) : null}
              </h2>
              <p className="mt-0.5 wrap-break-word text-xs text-muted-foreground">
                Point Dokploy / cron-job.org / GitHub Actions at these URLs with{' '}
                <code className="rounded bg-muted px-1">?secret=CRON_SECRET</code>. Status is based on
                the last recorded call, not just the secret being set.
              </p>
            </div>
            <div className="divide-y divide-border/60">
              {data.httpJobs.map((job) => (
                <div
                  key={job.id}
                  className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{job.name}</p>
                      <StatePill state={httpState(job)} />
                      {job.id === 'signals-ingest' ? (
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <Radio className="h-3 w-3" /> Signals
                        </Badge>
                      ) : null}
                    </div>
                    <p className="wrap-break-word text-xs text-muted-foreground">{job.what}</p>
                    <RunLine meta={job} errorLabel={job.lastStatus === 'error' && job.lastError ? job.lastError : undefined} />
                    <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                      <code className="max-w-full break-all rounded bg-muted px-1.5 py-0.5">
                        {job.path}
                      </code>
                      <span className="wrap-break-word text-muted-foreground">
                        Schedule: {job.recommend}
                      </span>
                      <code className="rounded bg-muted/70 px-1.5 py-0.5 text-muted-foreground">
                        {job.cronHint}
                      </code>
                    </div>
                    {job.id === 'signals-ingest' ? (
                      <p className="wrap-break-word text-[11px] text-muted-foreground">
                        Drafts land in{' '}
                        <Link
                          href="/dashboard/admin/signals"
                          className="text-teal-600 hover:underline"
                        >
                          Signals
                        </Link>{' '}
                        for human approve →{' '}
                        <Link href="/dashboard/admin/blog" className="text-teal-600 hover:underline">
                          Newsroom
                        </Link>
                        .
                      </p>
                    ) : null}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 self-start text-foreground"
                    disabled={!!busy}
                    onClick={() => void runAction('run-endpoint', { path: job.path })}
                  >
                    {busy === `run-endpoint${job.path}` ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="mr-1 h-3.5 w-3.5" />
                    )}
                    Run now
                  </Button>
                </div>
              ))}
            </div>
          </Card>

          <Card className="min-w-0 overflow-hidden">
            <div className="border-b border-border/60 px-4 py-3 sm:px-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Clock className="h-4 w-4 shrink-0" /> Scheduled workflows (
                {data.scheduledWorkflows.length})
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Automation workflows with a schedule trigger — fired by the tick above.
              </p>
            </div>
            {data.scheduledWorkflows.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-5">
                No schedule workflows yet. Create one in Workflows with trigger = schedule.
              </p>
            ) : (
              <div className="divide-y divide-border/60">
                {data.scheduledWorkflows.map((w) => (
                  <div
                    key={w.id}
                    className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{w.name}</p>
                      <p className="mt-0.5 line-clamp-2 wrap-break-word text-xs text-muted-foreground">
                        {w.description || '—'}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <code className="break-all rounded bg-muted px-1.5 py-0.5">
                          {w.cron || 'no cron'}
                        </code>
                        <span>
                          {w.nodes} nodes · {new Date(w.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {w.is_active ? (
                        <Badge variant="success" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline">Paused</Badge>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!busy}
                        onClick={() => void runAction('run-workflow', { workflowId: w.id })}
                      >
                        {busy === `run-workflow${w.id}` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!busy}
                        className="text-foreground"
                        onClick={() => void runAction('toggle-workflow', { workflowId: w.id })}
                      >
                        <Power className="mr-1 h-3.5 w-3.5" />
                        {w.is_active ? 'Pause' : 'Activate'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="min-w-0 overflow-hidden">
            <div className="border-b border-border/60 px-4 py-3 sm:px-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Database className="h-4 w-4 shrink-0" /> Recent workflow runs
              </h2>
            </div>
            {data.recentRuns.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-5">
                No runs recorded yet.
              </p>
            ) : (
              <div className="divide-y divide-border/60">
                {data.recentRuns.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.workflow_id}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(r.started_at).toLocaleString()}
                        {r.duration_ms != null ? ` · ${r.duration_ms}ms` : ''}
                      </p>
                    </div>
                    {r.status === 'success' ? (
<Badge variant="success" className="shrink-0">
                        Success
                      </Badge>
                    ) : r.status === 'partial' ? (
                      <Badge variant="warning" className="shrink-0">
                        Partial
                      </Badge>
                    ) : (
                      <Badge variant="danger" className="shrink-0">
                        Failed
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <ExternalLink className="h-3 w-3" />
              Public blog:{' '}
              <Link href="/blog" className="text-teal-600 hover:underline" target="_blank">
                /blog
              </Link>
            </span>
            <span>
              Admin Newsroom:{' '}
              <Link href="/dashboard/admin/blog" className="text-teal-600 hover:underline">
                /dashboard/admin/blog
              </Link>
            </span>
            <span>
              Signals queue:{' '}
              <Link href="/dashboard/admin/signals" className="text-teal-600 hover:underline">
                /dashboard/admin/signals
              </Link>
            </span>
          </p>
        </>
      )}
    </div>
  )
}
