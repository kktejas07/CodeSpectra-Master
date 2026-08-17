'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, Play, Power, Activity, Clock, Database, Zap, AlertTriangle, Loader2 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'

interface ScheduledWorkflow {
  id: string
  name: string
  description: string
  cron: string
  is_active: boolean
  nodes: number
  created_at: string
}

interface RunRow {
  id: string
  workflow_id: string
  status: 'success' | 'failed' | 'partial'
  started_at: string
  finished_at: string
  duration_ms: number
}

interface SchedulerInfo {
  inProcessLoop: boolean
  disabledEnv: string | null
  cronSecretSet: boolean
  redis: { configured: boolean; connected: boolean; mode: string | null; latencyMs: number | null; error: string | null }
}

interface ResponseShape {
  ok: boolean
  scheduler: SchedulerInfo
  endpoints: { path: string; what: string }[]
  trialExpiryLoop: { enabledByDefault: boolean; intervalHours: number }
  scheduledWorkflows: ScheduledWorkflow[]
  recentRuns: RunRow[]
  queue: { pending: number; total: number }
  error?: string
}

export default function CronJobsPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [data, setData] = useState<ResponseShape | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/cron-jobs', { credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error || `HTTP ${res.status}`)
      setData(json as ResponseShape)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!gate.ready) return
    void load()
  }, [gate.ready, load])

  const act = useCallback(async (action: string, workflowId?: string) => {
    setBusy(action)
    try {
      const wfId = typeof workflowId === 'string' && workflowId.length ? workflowId : undefined
      const res = await csrfFetch('/api/admin/cron-jobs', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(wfId ? { action, workflowId: wfId } : { action }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error || `HTTP ${res.status}`)
      addToast({
        type: 'success',
        title: action === 'run-tick' ? 'Scheduler tick complete' : action === 'run-workflow' ? 'Workflow run started' : 'Workflow updated',
        message: JSON.stringify(json).slice(0, 300),
      })
      await load()
    } catch (e) {
      addToast({ type: 'error', title: 'Action failed', message: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(null)
    }
  }, [addToast, load])

  if (!gate.ready) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
  }

  const statusBadge = (ok: boolean, labelOk: string, labelBad: string) =>
    ok ? <Badge className="bg-emerald-500/15 text-emerald-300">{labelOk}</Badge> : <Badge className="bg-red-500/15 text-red-300">{labelBad}</Badge>

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cron Jobs</h1>
          <p className="text-sm text-muted-foreground">Scheduler loop, workflow schedules, cron endpoints and recent runs.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button onClick={() => void act('run-tick')} disabled={busy !== null}>
            {busy === 'run-tick' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            Run tick now
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      {data && (
        <>
          {/* Scheduler health */}
          <section className="rounded-lg border border-border/60 bg-card/40 p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Activity className="h-4 w-4" /> Scheduler engine</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md border border-border/60 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">In-process loop (60s)</p>
                <div className="mt-1">{statusBadge(data.scheduler.inProcessLoop, 'Running', 'Disabled')}
                  {data.scheduler.disabledEnv && <p className="mt-1 text-[10px] text-muted-foreground">NEXT_PUBLIC_DISABLE_SCHEDULER={data.scheduler.disabledEnv}</p>}
                </div>
              </div>
              <div className="rounded-md border border-border/60 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">CRON_SECRET set</p>
                <div className="mt-1">{statusBadge(data.scheduler.cronSecretSet, 'Yes', 'Not set')}</div>
              </div>
              <div className="rounded-md border border-border/60 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Redis (distributed lock)</p>
                <div className="mt-1">{statusBadge(data.scheduler.redis.connected, data.scheduler.redis.configured ? 'Connected' : 'Configured', data.scheduler.redis.configured ? 'Disconnected' : 'Not configured')}
                  {data.scheduler.redis.mode && <p className="mt-1 text-[10px] text-muted-foreground">{data.scheduler.redis.mode}{data.scheduler.redis.latencyMs != null ? ` · ${data.scheduler.redis.latencyMs}ms` : ''}</p>}
                  {data.scheduler.redis.error && <p className="mt-1 break-all text-[10px] text-red-400">{data.scheduler.redis.error}</p>}
                </div>
              </div>
              <div className="rounded-md border border-border/60 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">GitHub scan queue</p>
                <div className="mt-1"><Badge className="bg-primary/15 text-primary">{data.queue.pending} pending</Badge> <span className="text-xs text-muted-foreground">/ {data.queue.total} total</span></div>
              </div>
            </div>
            <div className="mt-3 rounded-md border border-border/60 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Trial expiry loop (24h)</p>
              <div className="mt-1">{statusBadge(data.trialExpiryLoop.enabledByDefault, `Enabled every ${data.trialExpiryLoop.intervalHours}h`, 'Disabled')}</div>
            </div>
          </section>

          {/* HTTP cron endpoints */}
          <section className="rounded-lg border border-border/60 bg-card/40 p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Zap className="h-4 w-4" /> HTTP cron endpoints</h2>
            <div className="divide-y divide-border/60">
              {data.endpoints.map((e) => (
                <div key={e.path} className="flex items-center justify-between py-2.5">
                  <div>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{e.path}</code>
                    <p className="mt-0.5 text-xs text-muted-foreground">{e.what}</p>
                  </div>
                  <Badge variant="outline">External</Badge>
                </div>
              ))}
            </div>
          </section>

          {/* Scheduled workflows */}
          <section className="rounded-lg border border-border/60 bg-card/40 p-5">
            <h2 className="mb-3 flex items-center justify-between text-sm font-semibold">
              <span className="flex items-center gap-2"><Clock className="h-4 w-4" /> Scheduled workflows ({data.scheduledWorkflows.length})</span>
            </h2>
            {data.scheduledWorkflows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No schedule-trigger workflows configured. Create one in the Workflows builder.</p>
            ) : (
              <div className="divide-y divide-border/60">
                {data.scheduledWorkflows.map((w) => (
                  <div key={w.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{w.name}</p>
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{w.description || '—'}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{w.cron}</code>
                        <span className="text-[11px] text-muted-foreground">{w.nodes} nodes · created {new Date(w.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {w.is_active ? <Badge className="bg-emerald-500/15 text-emerald-300">Active</Badge> : <Badge className="bg-slate-500/15 text-slate-300">Paused</Badge>}
                      <Button size="sm" variant="outline" onClick={() => void act('run-workflow', w.id)} disabled={busy !== null}>
                        {busy === 'run-workflow' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Run
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void act('toggle-workflow', w.id)} disabled={busy !== null}>
                        <Power className="h-3.5 w-3.5" /> {w.is_active ? 'Pause' : 'Activate'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Recent runs */}
          <section className="rounded-lg border border-border/60 bg-card/40 p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Database className="h-4 w-4" /> Recent runs</h2>
            {data.recentRuns.length === 0 ? (
              <p className="text-sm text-muted-foreground">No workflow runs recorded yet.</p>
            ) : (
              <div className="divide-y divide-border/60">
                {data.recentRuns.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{r.workflow_id}</p>
                      <p className="text-[11px] text-muted-foreground">{new Date(r.started_at).toLocaleString()}{r.duration_ms ? ` · ${r.duration_ms}ms` : ''}</p>
                    </div>
                    {r.status === 'success' ? <Badge className="bg-emerald-500/15 text-emerald-300">Success</Badge>
                      : r.status === 'partial' ? <Badge className="bg-amber-500/15 text-amber-300">Partial</Badge>
                        : <Badge className="bg-red-500/15 text-red-300">Failed</Badge>}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>
      )}
    </div>
  )
}