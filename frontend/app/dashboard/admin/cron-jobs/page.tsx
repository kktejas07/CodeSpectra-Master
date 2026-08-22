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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'

type LoopRow = {
  id: string
  name: string
  what: string
  recommend: string
  status: 'running' | 'disabled'
}

type HttpJob = {
  id: string
  path: string
  name: string
  what: string
  recommend: string
  cronHint: string
  auth: string
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

function StatusPill({ ok, okLabel, badLabel }: { ok: boolean; okLabel: string; badLabel: string }) {
  return ok ? (
    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">{okLabel}</Badge>
  ) : (
    <Badge className="bg-amber-500/15 text-amber-800 dark:text-amber-300">{badLabel}</Badge>
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
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Timer className="h-6 w-6 text-teal-600" /> Cron jobs
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            What is configured, what is running, and what your external cron provider should call.
            The secret stays on the server — use <strong>Run now</strong> here to test.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading || !!busy}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => void runAction('run-tick')} disabled={!!busy}>
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
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : null}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Scheduler loop
              </p>
              <div className="mt-2 flex items-center gap-2">
                {data.scheduler.inProcessLoop ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-amber-600" />
                )}
                <span className="text-sm font-semibold">
                  {data.scheduler.inProcessLoop ? 'Running' : 'Disabled'}
                </span>
              </div>
              {data.scheduler.disabledEnv ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  NEXT_PUBLIC_DISABLE_SCHEDULER={data.scheduler.disabledEnv}
                </p>
              ) : null}
            </Card>

            <Card className="p-4">
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

            <Card className="p-4">
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
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {data.scheduler.redis.mode}
                  {data.scheduler.redis.latencyMs != null
                    ? ` · ${data.scheduler.redis.latencyMs}ms`
                    : ''}
                </p>
              ) : null}
            </Card>

            <Card className="p-4">
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

          <Card className="overflow-hidden">
            <div className="border-b border-border/60 px-5 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Activity className="h-4 w-4" /> Built-in loops
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Run inside the app process when the server is alive.
              </p>
            </div>
            <div className="divide-y divide-border/60">
              {data.loops.map((loop) => (
                <div
                  key={loop.id}
                  className="flex flex-wrap items-start justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{loop.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{loop.what}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Suggested: {loop.recommend}
                    </p>
                  </div>
                  <StatusPill
                    ok={loop.status === 'running'}
                    okLabel="Running"
                    badLabel="Disabled"
                  />
                </div>
              ))}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-border/60 px-5 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Zap className="h-4 w-4" /> HTTP cron endpoints
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Point Dokploy / cron-job.org / GitHub Actions at these URLs with{' '}
                <code className="rounded bg-muted px-1">?secret=CRON_SECRET</code>.
              </p>
            </div>
            <div className="divide-y divide-border/60">
              {data.httpJobs.map((job) => (
                <div
                  key={job.id}
                  className="flex flex-wrap items-start justify-between gap-3 px-5 py-4"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{job.name}</p>
                      <StatusPill
                        ok={job.status === 'ready'}
                        okLabel="Ready"
                        badLabel="Needs CRON_SECRET"
                      />
                      {job.id === 'signals-ingest' ? (
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <Radio className="h-3 w-3" /> Signals
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">{job.what}</p>
                    <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                      <code className="rounded bg-muted px-1.5 py-0.5">{job.path}</code>
                      <span className="text-muted-foreground">Schedule: {job.recommend}</span>
                      <code className="rounded bg-muted/70 px-1.5 py-0.5 text-muted-foreground">
                        {job.cronHint}
                      </code>
                    </div>
                    {job.id === 'signals-ingest' ? (
                      <p className="text-[11px] text-muted-foreground">
                        Drafts land in{' '}
                        <Link href="/dashboard/admin/signals" className="text-teal-600 hover:underline">
                          Signals
                        </Link>{' '}
                        for human approve → Newsroom.
                      </p>
                    ) : null}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
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

          <Card className="overflow-hidden">
            <div className="border-b border-border/60 px-5 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Clock className="h-4 w-4" /> Scheduled workflows ({data.scheduledWorkflows.length})
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Automation workflows with a schedule trigger — fired by the tick above.
              </p>
            </div>
            {data.scheduledWorkflows.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                No schedule workflows yet. Create one in Workflows with trigger = schedule.
              </p>
            ) : (
              <div className="divide-y divide-border/60">
                {data.scheduledWorkflows.map((w) => (
                  <div
                    key={w.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{w.name}</p>
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                        {w.description || '—'}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <code className="rounded bg-muted px-1.5 py-0.5">{w.cron || 'no cron'}</code>
                        <span>
                          {w.nodes} nodes · {new Date(w.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {w.is_active ? (
                        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
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

          <Card className="overflow-hidden">
            <div className="border-b border-border/60 px-5 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Database className="h-4 w-4" /> Recent workflow runs
              </h2>
            </div>
            {data.recentRuns.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                No runs recorded yet.
              </p>
            ) : (
              <div className="divide-y divide-border/60">
                {data.recentRuns.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.workflow_id}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(r.started_at).toLocaleString()}
                        {r.duration_ms != null ? ` · ${r.duration_ms}ms` : ''}
                      </p>
                    </div>
                    {r.status === 'success' ? (
                      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                        Success
                      </Badge>
                    ) : r.status === 'partial' ? (
                      <Badge className="bg-amber-500/15 text-amber-800 dark:text-amber-300">
                        Partial
                      </Badge>
                    ) : (
                      <Badge className="bg-red-500/15 text-red-700 dark:text-red-300">Failed</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
